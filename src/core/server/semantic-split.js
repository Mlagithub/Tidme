/*\
module-type: commonjs
Tidme 语义切分（M6-T2 / roadmap X1）：服务端 LLM 断点建议

定位：仅用于「无标题结构的长篇散文」且只作叶内回退——有标题/大纲的文档绝不调用
（结构驱动是主策略；LLM 非确定性对 SRS 是反模式）。
流程：解码文本 → 判断无结构 → 提取段落 → LLM 返回「新主题起始段落号」→
在断点段落前插入虚拟标题（## 段首句）→ 交给普通切分器（虚拟标题成为切分边界）。
密钥仅存服务端配置 tiddler（$:/config/Tidme/SemanticSplit），不暴露给浏览器。

配置：{"enable": true, "apiKey": "sk-...", "baseUrl": "https://api.openai.com/v1",
       "model": "gpt-4o-mini", "maxParas": 200}
LLM 失败/超时 → 静默回退机械切分（不阻塞导入）。
纯函数部分（isUnstructured / extractParagraphs / parseBreaksResponse /
insertVirtualHeadings / buildPrompt）导出供单元测试；网络层可注入 httpFn。
\*/

(function () {
	"use strict";

	function getHttps() {
		try {
			var proc = typeof process !== "undefined" ? process : undefined;
			if (proc && typeof proc.getBuiltinModule === "function") {
				return proc.getBuiltinModule("node:https");
			}
		} catch (e) { /* ignore */ }
		return null;
	}

	function getUrl() {
		try {
			var proc = typeof process !== "undefined" ? process : undefined;
			if (proc && typeof proc.getBuiltinModule === "function") {
				return proc.getBuiltinModule("node:url");
			}
		} catch (e) { /* ignore */ }
		return null;
	}

	/** 是否无结构散文（无 md ATX/setext、wikitext !、HTML h1-h6 标题） */
	function isUnstructured(text) {
		var lines = String(text || "").split("\n");
		for (var i = 0; i < lines.length; i++) {
			var line = lines[i].trim();
			if (!line) continue;
			if (/^#{1,6}\s+/.test(line)) return false;            // markdown ATX
			if (/^!\s*/.test(line)) return false;                  // wikitext 标题
			if (/^<h[1-6][\s>]/i.test(line)) return false;         // HTML 标题
			if (i + 1 < lines.length && /^[-=]{3,}\s*$/.test(lines[i + 1].trim()) && !/^\s*([-*+]|\d+\.)\s/.test(line)) {
				return false;                                       // markdown setext
			}
		}
		return true;
	}

	/** 文本 → 段落（空行分隔），返回 [{index, start, text}]（start/end 为原文字符偏移） */
	function extractParagraphs(text) {
		var out = [];
		var m = String(text || "").split(/\n\s*\n/);
		var offset = 0;
		for (var i = 0; i < m.length; i++) {
			var seg = m[i].trim();
			if (!seg) { offset += m[i].length + 2; continue; }
			// 定位该段在原文的起点（从 offset 向后找首个非空白）
			var start = String(text).indexOf(seg, offset);
			if (start < 0) start = offset;
			out.push({ index: out.length, start: start, text: seg });
			offset = start + seg.length;
		}
		return out;
	}

	/** 解析 LLM 响应（容忍 ```json 包裹与前后文字）→ 去重排序的段落索引数组 */
	function parseBreaksResponse(raw, paraCount) {
		if (!raw) return [];
		var s = String(raw).replace(/```(?:json)?/gi, "").trim();
		var m = s.match(/\[[\s\S]*\]/);
		if (!m) return [];
		var arr;
		try { arr = JSON.parse(m[0]); } catch (e) { return []; }
		if (!Array.isArray(arr)) return [];
		var seen = {};
		var out = [];
		for (var i = 0; i < arr.length; i++) {
			var n = Number(arr[i]);
			if (Number.isInteger(n) && n >= 0 && n < paraCount && !seen[n]) {
				seen[n] = true;
				out.push(n);
			}
		}
		return out.sort(function (a, b) { return a - b; });
	}

	/** 构造 LLM prompt（段落列表 → 新主题起始段号） */
	function buildPrompt(paras) {
		var list = [];
		for (var i = 0; i < paras.length; i++) {
			list.push(i + ": " + paras[i].text.slice(0, 80));
		}
		return "以下是无标题的散文/笔记，按空行分为 " + paras.length + " 段（编号 0.." + (paras.length - 1) + "）。\n\n" +
			list.join("\n") +
			"\n\n请判断哪些段落是新主题（新章节/新小节）的开头。只返回这些段落的编号，格式为 JSON 数组，如 [3, 9]。如果全文是一个主题，返回 []。要求：不要遗漏明显的主题切换；相邻编号不要连选（除非确实密集切换）。";
	}

	/** 在断点段落前插入虚拟标题（从后往前避免偏移漂移），返回 { text, virtual } */
	function insertVirtualHeadings(text, paras, breaks, max) {
		var virtual = 0;
		var out = String(text);
		var list = breaks.filter(function (b) { return b < max; }).slice().sort(function (a, b) { return b - a; });
		for (var i = 0; i < list.length; i++) {
			var para = paras[list[i]];
			if (!para) continue;
			var title = para.text.replace(/\s+/g, " ").trim().slice(0, 14).replace(/[。．.!！?？;；,，]$/, "");
			var heading = "\n\n## " + (title || "片段") + "\n\n";
			out = out.slice(0, para.start) + heading + out.slice(para.start);
			virtual++;
		}
		return { text: out, virtual: virtual };
	}

	/** 调 LLM（OpenAI 兼容 chat/completions；httpFn 可注入 mock） */
	function callLLM(cfg, prompt, httpFn) {
		var doPost = httpFn;
		if (!doPost) {
			doPost = function (url, body, headers) {
				return new Promise(function (resolve, reject) {
					var https = getHttps();
					var URLClass = getUrl() && getUrl().URL;
					if (!https || !URLClass) { reject(new Error("服务端缺 node:https / node:url")); return; }
					var u;
					try { u = new URLClass(url); } catch (e) { reject(e); return; }
					var req = https.request(u, { method: "POST", headers: headers }, function (res) {
						var data = "";
						res.on("data", function (c) { data += c; });
						res.on("end", function () { resolve({ status: res.statusCode, data: data }); });
					});
					req.on("error", reject);
					req.write(body);
					req.end();
				});
			};
		}
		var base = String(cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
		var url = base + "/chat/completions";
		var body = JSON.stringify({
			model: cfg.model || "gpt-4o-mini",
			messages: [{ role: "user", content: prompt }],
			temperature: 0
		});
		return doPost(url, body, {
			"Content-Type": "application/json",
			Authorization: "Bearer " + String(cfg.apiKey || "")
		}).then(function (r) {
			if (r.status !== 200) throw new Error("LLM HTTP " + r.status + ": " + String(r.data).slice(0, 200));
			var j = JSON.parse(r.data);
			return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
		});
	}

	/**
	 * 主入口：若启用且为无结构散文 → LLM 断点 + 虚拟标题；否则原样返回。
	 * @param text 解码后的文本
	 * @param cfg 语义切分配置（{enable, apiKey, baseUrl, model, maxParas}）
	 * @param httpFn 可选网络函数（测试注入）
	 * @returns Promise<{text, usedBreaks, virtual}>
	 */
	exports.prepareText = function (text, cfg, httpFn) {
		if (!cfg || cfg.enable !== true || !cfg.apiKey) {
			return Promise.resolve({ text: text, usedBreaks: 0, virtual: 0 });
		}
		if (!isUnstructured(text)) {
			return Promise.resolve({ text: text, usedBreaks: 0, virtual: 0 });
		}
		var paras = extractParagraphs(text);
		if (paras.length < 3) {
			return Promise.resolve({ text: text, usedBreaks: 0, virtual: 0 });
		}
		var max = Math.min(Number(cfg.maxParas) || 200, paras.length);
		return callLLM(cfg, buildPrompt(paras.slice(0, max)), httpFn)
			.then(function (raw) {
				var breaks = parseBreaksResponse(raw, max);
				var r = insertVirtualHeadings(text, paras, breaks, max);
				return { text: r.text, usedBreaks: breaks.length, virtual: r.virtual };
			})
			.catch(function (e) {
				console.error("[tidme] semantic split failed, fallback to mechanical:", e && e.message || e);
				return { text: text, usedBreaks: 0, virtual: 0 };
			});
	};

	exports.isUnstructured = isUnstructured;
	exports.extractParagraphs = extractParagraphs;
	exports.parseBreaksResponse = parseBreaksResponse;
	exports.buildPrompt = buildPrompt;
	exports.insertVirtualHeadings = insertVirtualHeadings;
})();
