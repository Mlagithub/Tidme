/*\
module-type: startup
Tidme 服务端导入处理器（仅 Node / TiddlyWeb）

契约（待处理导入 tiddler）：
  tags: ["tidme-pending-import"]
  tidme.file-name: "book.epub" / "article.md"
  tidme.pending: "yes"
  text: 文件字节的 base64（或 tidme.data-url）
处理流程：解码 → 调 import 插件的 runImport/runSplit → 写库 → 去 pending 标记
（加 tidme.import-done / 失败时 tidme.import-error）。
DOMParser 来源（可插拔）：优先 globalThis.DOMParser；否则尝试宿主预置的
globalThis.__tidmeDomShim（{DOMParser, XMLSerializer}）；都没有则报错并保留待处理。
用 setImmediate 分片处理，避免阻塞服务事件循环。
\*/

(function() {
  'use strict';

  /*jslint node: true, browser: true */
  /*global $tw: false */

  exports.name = 'tidme-server-importer';
  exports.platforms = ['node'];
  exports.after = ['load-modules'];

  var CONCURRENCY = 2;
  /** 正在处理的 pending title（scan 每 15s 重扫，见 startup 里的在飞保护） */
  var inflight = Object.create(null);

  function ensureDom() {
    if (globalThis.DOMParser && globalThis.XMLSerializer) return true;
    var shim = globalThis.__tidmeDomShim;
    if (shim && shim.DOMParser && shim.XMLSerializer) {
      globalThis.DOMParser = shim.DOMParser;
      globalThis.XMLSerializer = shim.XMLSerializer;
      globalThis.Node = shim.Node || globalThis.Node;
      return true;
    }
    return false;
  }

  function processOne(title) {
    return new Promise(function(resolve) {
      // 沙箱无 setImmediate，用 setTimeout(0) 分片，避免阻塞服务事件循环
      setTimeout(function() {
        try {
          var t = $tw.wiki.getTiddler(title);
          if (!t) return resolve();
          if (String(t.fields['tidme.pending']) !== 'yes') return resolve();

          var fileName = String(t.fields['tidme.file-name'] || 'import');
          var raw = String(t.fields.text || '');
          var bytes;
          try {
            // 解码唯一入口在 core/binary（支持 URL-safe 字母表与 dataURL 前缀，非法字符抛错）
            bytes = require('$:/plugins/keepone/tidme/core/binary.js').base64ToBytes(raw);
          } catch (e) {
            $tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
              'tidme.pending': undefined,
              'tidme.import-error': 'base64 解码失败: ' + String(e.message || e),
            }));
            return resolve();
          }

          var parse = require('$:/plugins/keepone/tidme/import/parse.js');
          var ns = require('$:/plugins/keepone/tidme/core/ns.js');
          // 语义切分：纯逻辑在 core/semantic-split（模块名带 .js，是 TS 产物），
          // 网络层在 core/server/llm-client（server/*.js 无 .meta，模块名不带 .js）。
          // 两者都必须在使用前 require（var 提升会把「先引用后赋值」变成 undefined 而不报错，
          // 曾因此静默关闭整条语义切分路径）。
          var semantic = require('$:/plugins/keepone/tidme/core/semantic-split.js');
          var llm = require('$:/plugins/keepone/tidme/core/server/llm-client');
          var config = require('$:/plugins/keepone/tidme/core/config.js');
          var lower = fileName.toLowerCase();
          var needsDom = lower.endsWith('.epub') || /\.html?$/.test(lower);
          // 仅 epub/html 需要 DOMParser（TW 沙箱默认无；可经 __tidmeDomShim 预置）
          if (needsDom && !ensureDom()) {
            $tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
              'tidme.pending': undefined,
              'tidme.import-error': '服务端缺少 DOMParser（epub/html 需要，可预置 globalThis.__tidmeDomShim）',
            }));
            return resolve();
          }
          var result;
          if (lower.endsWith('.epub') || /\.(md|markdown|txt|html?)$/.test(lower)) {
            // 落库执行器（runImport → core/import-commit 写库 → 标记 done/error）。
            // 写库必须走唯一门面：直接 addTiddler(r.tiddlers) 会绕开对齐/归档/文档页复用，
            // 服务端重导入与浏览器导入结果不一致（旧卡残留、SRS 进度丢、没有 archives）。
            var doImport = function(importBytes) {
              var opts = { bag: $tw.wiki.getTiddlerText(ns.IMPORT_BAG_TITLE, '') || 'default' };
              var pri = t.fields['tidme.priority'];
              if (pri !== undefined && pri !== '') opts.priority = Number(pri);
              parse.runImport(importBytes, fileName, opts)
                .then(function(r) {
                  var valid = r.tiddlers.filter(function(x) {
                    return !x._deleted;
                  });
                  var doc = valid[0] || {};
                  var cards = valid.slice(1);
                  var commit = require('$:/plugins/keepone/tidme/core/import-commit.js');
                  return commit.commitImportToWiki($tw.wiki, {
                    docId: r.docId,
                    docTiddler: $tw.utils.extend({}, doc, { 'tidme.doc': r.docId }),
                    docTitle: doc.title,
                    cards: cards,
                    rewriteDocPage: false,
                  }).then(function(res) {
                    $tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
                      'tidme.pending': undefined,
                      'tidme.import-done': new Date().toISOString(),
                      'tidme.import-docId': r.docId,
                      text: String(t.fields.text || ''),
                    }));
                    console.log(
                      '[tidme] import done:',
                      fileName,
                      r.sectionCount,
                      'sections',
                      '(' + res.created + ' new / ' + res.updated + ' updated / ' + res.archived + ' archived)',
                    );
                    resolve();
                  });
                })
                .catch(function(err) {
                  $tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
                    'tidme.pending': undefined,
                    'tidme.import-error': String(err && err.message || err),
                  }));
                  console.error('[tidme] import failed:', fileName, err);
                  resolve();
                });
            };
            // 语义切分：仅 md/txt 无结构散文，LLM 断点插虚拟标题；失败静默回退。
            // 配置走 core/config.readSemanticSplit（强类型化 enable/数值，勿在此手写 JSON.parse）
            if (/\.(md|markdown|txt)$/.test(lower)) {
              var semCfg = config.readSemanticSplit($tw.wiki);
              if (semCfg && semCfg.enable === true) {
                var decoded = Buffer.from(bytes).toString('utf8');
                semantic.prepareText(decoded, semCfg, llm.callLLM)
                  .then(function(r) {
                    if (r.usedBreaks > 0) {
                      console.log('[tidme] semantic split:', r.virtual, 'virtual headings');
                      doImport(new Uint8Array(Buffer.from(r.text, 'utf8')));
                    } else {
                      doImport(bytes);
                    }
                  })
                  .catch(function(err) {
                    console.error('[tidme] semantic split error, fallback:', err && err.message || err);
                    doImport(bytes);
                  });
                return; // 异步分支已接管
              }
            }
            doImport(bytes);
          } else {
            $tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
              'tidme.pending': undefined,
              'tidme.import-error': '不支持的文件类型: ' + fileName,
            }));
            resolve();
          }
        } catch (e) {
          console.error('[tidme] importer error:', e);
          resolve();
        }
      });
    });
  }

  exports.startup = function() {
    // 启动时处理存量 + 定时扫描新增
    var scan = function() {
      try {
        var pending = $tw.wiki.filterTiddlers('[tag[tidme-pending-import]tidme.pending[yes]]');
        var batch = pending.slice(0, CONCURRENCY);
        batch.forEach(function(title) {
          // 在飞保护：处理大文件可能超过 15s，下次扫描会再次捞到同一个 pending tiddler
          // → 同一任务并发跑两遍（重复切分/重复落库）。进程内 Set 即够：单进程持有 wiki，
          // 而 tiddler 标记会在进程崩溃后留下"处理中"残骸，反而永久堵住任务。
          if (inflight[title]) return;
          inflight[title] = true;
          var done = function() {
            delete inflight[title];
          };
          processOne(title).then(done, done);
        });
      } catch (e) {
        console.error('[tidme] importer scan error:', e);
      }
    };
    scan();
    var timer = setInterval(scan, 15000);
    if (timer && typeof timer.unref === 'function') timer.unref();
    // 暴露扫描入口：测试 / 手动触发（如 pending 上传后立即处理）
    exports.scan = scan;
  };
})();
