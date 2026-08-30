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

	/** 调 LLM（OpenAI 兼容 chat/completions；优先使用浏览器/Node 通用 fetch，回退 node:https；httpFn 可注入 mock） */
	function callLLM(cfg, prompt, httpFn) {
		var rawBase = String(cfg.baseUrl || "https://api.openai.com/v1").trim();
		var base = rawBase.replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
		var url = base + "/chat/completions";
		var body = JSON.stringify({
			model: cfg.model || "gpt-4o-mini",
			messages: [{ role: "user", content: prompt }],
			temperature: 0
		});
		var headers = {
			"Content-Type": "application/json",
			Authorization: "Bearer " + String(cfg.apiKey || "")
		};

		if (httpFn) {
			return httpFn(url, body, headers).then(function (r) {
				if (r.status !== 200) throw new Error("LLM HTTP " + r.status + ": " + String(r.data).slice(0, 200));
				var j = JSON.parse(r.data);
				return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
			});
		}

		if (url.indexOf("openrouter.ai") >= 0) {
			headers["HTTP-Referer"] = "https://tidme.app";
			headers["X-Title"] = "Tidme";
		}

		if (typeof fetch === "function") {
			return fetch(url, { method: "POST", headers: headers, body: body }).then(function (res) {
				if (!res.ok) throw new Error("LLM 接口返回 HTTP " + res.status);
				return res.text();
			}).then(function (data) {
				var j;
				try { j = JSON.parse(data); } catch (e) { throw new Error("LLM 响应非合法 JSON: " + String(data).slice(0, 100)); }
				if (j.error) throw new Error("LLM 返回错误: " + (j.error.message || JSON.stringify(j.error)));
				return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
			}).catch(function (err) {
				var msg = (err && err.message) || String(err);
				if (msg.indexOf("Failed to fetch") >= 0 || msg.indexOf("NetworkError") >= 0) {
					throw new Error("网络/跨域连接失败(Failed to fetch)。请检查：1.网络/代理环境是否允许直连 API；2.BaseURL 网址是否可达；3.API Key 额度是否有效。");
				}
				throw err;
			});
		}

		var https = getHttps();
		var URLClass = getUrl() && getUrl().URL;
		if (!https || !URLClass) return Promise.reject(new Error("服务端/浏览器缺少 fetch 或 node:https"));

		return new Promise(function (resolve, reject) {
			var u;
			try { u = new URLClass(url); } catch (e) { reject(e); return; }
			var req = https.request(u, { method: "POST", headers: headers }, function (res) {
				var data = "";
				res.on("data", function (c) { data += c; });
				res.on("end", function () {
					if (res.statusCode !== 200) { reject(new Error("LLM HTTP " + res.statusCode + ": " + data.slice(0, 200))); return; }
					try {
						var j = JSON.parse(data);
						resolve((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "");
					} catch (e) { reject(e); }
				});
			});
			req.on("error", reject);
			req.write(body);
			req.end();
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
		if (!cfg || !cfg.apiKey) {
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

	/**
	 * 针对单个长章节正文的 LLM 语义二次切分
	 * 结合 LLM 主题断点与原文字符偏移物理切片，确保字数 100% 一致（0 字损耗）。
	 * @returns Promise<Array<{ title: string; text: string; chars: number }>>
	 */
	exports.splitSectionText = function (text, cfg, httpFn) {
		var rawText = String(text || "").trim();
		if (!rawText) return Promise.resolve([]);
		var paras = extractParagraphs(rawText);
		if (paras.length <= 1) {
			return Promise.resolve([{ title: "正文", text: rawText, chars: rawText.length }]);
		}

		var list = [];
		for (var i = 0; i < Math.min(paras.length, 80); i++) {
			list.push(i + ": " + paras[i].text.slice(0, 70));
		}
		var prompt = "以下是一个长章节正文，共 " + paras.length + " 段（编号 0.." + (paras.length - 1) + "）：\n\n" +
			list.join("\n") +
			"\n\n请分析逻辑主题划分，挑选 2~5 个新主题起始段落编号，并为每个小节起一个精炼小标题（10字以内）。必须包含段落0。\n" +
			"只返回 JSON 数组，格式如：[{\"breakIndex\": 0, \"title\": \"概念解析\"}, {\"breakIndex\": 5, \"title\": \"实验分析\"}]。不要输出多余文本。";

		return callLLM(cfg, prompt, httpFn)
			.then(function (raw) {
				var jsonStr = String(raw).replace(/```(?:json)?/gi, "").trim();
				var m = jsonStr.match(/\[[\s\S]*\]/);
				var items = [];
				if (m) {
					try { items = JSON.parse(m[0]); } catch (e) { items = []; }
				}
				if (!Array.isArray(items) || !items.length) {
					return [{ title: "正文", text: rawText, chars: rawText.length }];
				}

				// 确保升序且包含 0
				items = items.filter(function (x) {
					return x && typeof x.breakIndex === "number" && x.breakIndex >= 0 && x.breakIndex < paras.length;
				}).sort(function (a, b) { return a.breakIndex - b.breakIndex; });

				if (!items.length || items[0].breakIndex !== 0) {
					items.unshift({ breakIndex: 0, title: "第一部分" });
				}

				var subChunks = [];
				for (var k = 0; k < items.length; k++) {
					var curIdx = items[k].breakIndex;
					var nextIdx = (k + 1 < items.length) ? items[k + 1].breakIndex : paras.length;
					var startOffset = paras[curIdx].start;
					var endOffset = (nextIdx < paras.length) ? paras[nextIdx].start : rawText.length;
					var chunkText = rawText.slice(startOffset, endOffset);
					if (chunkText.trim()) {
						subChunks.push({
							title: String(items[k].title || ("第" + (k + 1) + "节")).trim(),
							text: chunkText,
							chars: chunkText.length
						});
					}
				}
				return subChunks.length ? subChunks : [{ title: "正文", text: rawText, chars: rawText.length }];
			})
			.catch(function (err) {
				console.error("[tidme] splitSectionText failed:", err);
				throw err;
			});
	};

	exports.isUnstructured = isUnstructured;
	exports.extractParagraphs = extractParagraphs;
	exports.parseBreaksResponse = parseBreaksResponse;
	exports.buildPrompt = buildPrompt;
	exports.insertVirtualHeadings = insertVirtualHeadings;
})();
