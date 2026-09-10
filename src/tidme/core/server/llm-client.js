/*\
module-type: commonjs
Tidme LLM 网络层（唯一实现）：OpenAI 兼容 chat/completions 调用

- 只负责"把 prompt 发出去、把 content 取回来"：URL/请求体/响应解析/超时/有界重试都在这里
- 传输优先 fetch（浏览器与 Node 通用），回退 node:https（TW 沙箱无 fetch 时）
- 超时是硬要求：LLM 挂起时请求/socket 会无限堆积、导入任务永不结束（曾无任何超时）
- 有界重试：默认 1 次、上限 3 次；再失败就交给调用方（语义切分回退机械切分）
- 浏览器安全：node:https / node:url 只在真正需要时用 process.getBuiltinModule 取，
  不做顶层 require（否则浏览器包会拖入服务端模块）
\*/

(function() {
  'use strict';

  function getBuiltin(win, name) {
    try {
      var proc = typeof process !== 'undefined' ? process : undefined;
      if (proc && typeof proc.getBuiltinModule === 'function') return proc.getBuiltinModule(name);
    } catch (e) { /* ignore */ }
    return null;
  }

  /** 默认网络超时（毫秒） */
  var DEFAULT_TIMEOUT_MS = 30000;
  /** 默认重试次数（有界：再失败就交给调用方回退，不无限重试） */
  var DEFAULT_RETRIES = 1;
  var MAX_RETRIES = 3;

  function timeoutOf(cfg) {
    var ms = Number(cfg && cfg.timeoutMs);
    return ms > 0 ? ms : DEFAULT_TIMEOUT_MS;
  }

  function retriesOf(cfg) {
    var n = Number(cfg && cfg.retries);
    if (!isFinite(n) || n < 0) return DEFAULT_RETRIES;
    return Math.min(Math.floor(n), MAX_RETRIES);
  }

  /** 给任意 promise 加超时（"永不 resolve 的 httpFn" 若不加超时会把导入任务永久挂住） */
  function withTimeout(promise, ms, label) {
    return new Promise(function(resolve, reject) {
      var settled = false;
      var timer = setTimeout(function() {
        if (settled) return;
        settled = true;
        reject(new Error(label + ' 超时（' + ms + 'ms）'));
      }, ms);
      if (timer && typeof timer.unref === 'function') timer.unref();
      promise.then(function(v) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      }, function(e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  /** 响应 JSON → content（结构缺失返回空串，由调用方判断） */
  function contentOf(text) {
    var j;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error('LLM 响应非合法 JSON: ' + String(text).slice(0, 100));
    }
    if (j && j.error) throw new Error('LLM 返回错误: ' + (j.error.message || JSON.stringify(j.error)));
    return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }

  /** 单次调用（不加重试）：httpFn 注入优先（测试用），否则 fetch，再否则 node:https */
  function callOnce(cfg, prompt, httpFn) {
    var rawBase = String(cfg.baseUrl || 'https://api.openai.com/v1').trim();
    var base = rawBase.replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
    var url = base + '/chat/completions';
    var body = JSON.stringify({
      model: cfg.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });
    var headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + String(cfg.apiKey || ''),
    };

    if (httpFn) {
      return httpFn(url, body, headers).then(function(r) {
        if (r.status !== 200) throw new Error('LLM HTTP ' + r.status + ': ' + String(r.data).slice(0, 200));
        return contentOf(r.data);
      });
    }

    if (url.indexOf('openrouter.ai') >= 0) {
      headers['HTTP-Referer'] = 'https://tidme.app';
      headers['X-Title'] = 'Tidme';
    }

    if (typeof fetch === 'function') {
      return fetch(url, { method: 'POST', headers: headers, body: body }).then(function(res) {
        if (!res.ok) throw new Error('LLM 接口返回 HTTP ' + res.status);
        return res.text();
      }).then(contentOf).catch(function(err) {
        var msg = (err && err.message) || String(err);
        if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0) {
          throw new Error('网络/跨域连接失败(Failed to fetch)。请检查：1.网络/代理环境是否允许直连 API；2.BaseURL 网址是否可达；3.API Key 额度是否有效。');
        }
        throw err;
      });
    }

    var https = getBuiltin('node:https');
    var URLClass = getBuiltin('node:url') && getBuiltin('node:url').URL;
    if (!https || !URLClass) return Promise.reject(new Error('服务端/浏览器缺少 fetch 或 node:https'));

    return new Promise(function(resolve, reject) {
      var u;
      try {
        u = new URLClass(url);
      } catch (e) {
        reject(e);
        return;
      }
      var req = https.request(u, { method: 'POST', headers: headers }, function(res) {
        var data = '';
        res.on('data', function(c) {
          data += c;
        });
        res.on('end', function() {
          if (res.statusCode !== 200) {
            reject(new Error('LLM HTTP ' + res.statusCode + ': ' + data.slice(0, 200)));
            return;
          }
          try {
            resolve(contentOf(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /** 单次调用 + 超时 */
  function callLLMOnce(cfg, prompt, httpFn) {
    return withTimeout(callOnce(cfg, prompt, httpFn), timeoutOf(cfg), 'LLM 调用');
  }

  /**
   * 调 LLM（带超时与有界重试）：返回 content 字符串；失败抛错，由调用方决定回退策略。
   * @param cfg {baseUrl, model, apiKey, timeoutMs?, retries?}
   * @param httpFn 可选注入的网络函数（测试用）：(url, body, headers) => Promise<{status, data}>
   */
  exports.callLLM = function(cfg, prompt, httpFn) {
    var left = retriesOf(cfg);
    var attempt = function() {
      return callLLMOnce(cfg, prompt, httpFn).catch(function(err) {
        if (left <= 0) throw err;
        left--;
        console.warn('[tidme] LLM 调用失败，重试:', (err && err.message) || err);
        return new Promise(function(r) {
          var timer = setTimeout(r, 300);
          if (timer && typeof timer.unref === 'function') timer.unref();
        }).then(attempt);
      });
    };
    return attempt();
  };

  exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
  exports.DEFAULT_RETRIES = DEFAULT_RETRIES;
  exports.MAX_RETRIES = MAX_RETRIES;
})();
