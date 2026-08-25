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

(function () {
	"use strict";

	/*jslint node: true, browser: true */
	/*global $tw: false */

	exports.name = "tidme-server-importer";
	exports.platforms = ["node"];
	exports.after = ["load-modules"];

	var CONCURRENCY = 2;

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
		return new Promise(function (resolve) {
			// 沙箱无 setImmediate，用 setTimeout(0) 分片，避免阻塞服务事件循环
			setTimeout(function () {
				try {
					var t = $tw.wiki.getTiddler(title);
					if (!t) return resolve();
					if (String(t.fields["tidme.pending"]) !== "yes") return resolve();

					var fileName = String(t.fields["tidme.file-name"] || "import");
					var raw = String(t.fields.text || "");
					var bytes;
					try {
						var bin = $tw.utils.base64DecodeToUint8Array
							? $tw.utils.base64DecodeToUint8Array(raw)
							: new Uint8Array(Buffer.from(raw, "base64"));
						bytes = bin;
					} catch (e) {
						$tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
							"tidme.pending": undefined,
							"tidme.import-error": "base64 解码失败: " + String(e.message || e)
						}));
						return resolve();
					}

					var pipeline = require("$:/plugins/tidme/import/pipeline.js");
					var lower = fileName.toLowerCase();
					var needsDom = lower.endsWith(".epub") || /\.html?$/.test(lower);
					// 仅 epub/html 需要 DOMParser（TW 沙箱默认无；可经 __tidmeDomShim 预置）
					if (needsDom && !ensureDom()) {
						$tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
							"tidme.pending": undefined,
							"tidme.import-error": "服务端缺少 DOMParser（epub/html 需要，可预置 globalThis.__tidmeDomShim）"
						}));
						return resolve();
					}
					var result;
					if (lower.endsWith(".epub") || /\.(md|markdown|txt|html?)$/.test(lower)) {
						// 落库执行器（runImport → 写库 → 标记 done/error）
						var doImport = function (importBytes) {
							pipeline.runImport(importBytes, fileName, { bag: $tw.wiki.getTiddlerText("$:/temp/tidme-import/bag", "") || "default" })
								.then(function (r) {
									for (var i = 0; i < r.tiddlers.length; i++) $tw.wiki.addTiddler(r.tiddlers[i]);
									$tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
										"tidme.pending": undefined,
										"tidme.import-done": new Date().toISOString(),
										"tidme.import-docId": r.docId,
										text: String(t.fields.text || "")
									}));
									console.log("[tidme] import done:", fileName, r.sectionCount, "sections");
									resolve();
								})
								.catch(function (err) {
									$tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
										"tidme.pending": undefined,
										"tidme.import-error": String(err && err.message || err)
									}));
									console.error("[tidme] import failed:", fileName, err);
									resolve();
								});
						};
						// 语义切分（M6-T2）：仅 md/txt 无结构散文，LLM 断点插虚拟标题；失败静默回退
						if (/\.(md|markdown|txt)$/.test(lower)) {
							var semCfg = {};
							try {
								semCfg = JSON.parse($tw.wiki.getTiddlerText("$:/config/Tidme/SemanticSplit", "{}") || "{}");
							} catch (e) { /* 忽略非法配置 */ }
							if (semCfg && semCfg.enable === true) {
								var semantic = require("$:/plugins/tidme/core/server/semantic-split.js");
								var decoded = Buffer.from(bytes).toString("utf8");
								semantic.prepareText(decoded, semCfg)
									.then(function (r) {
										if (r.usedBreaks > 0) {
											console.log("[tidme] semantic split:", r.virtual, "virtual headings");
											doImport(new Uint8Array(Buffer.from(r.text, "utf8")));
										} else {
											doImport(bytes);
										}
									})
									.catch(function (err) {
										console.error("[tidme] semantic split error, fallback:", err && err.message || err);
										doImport(bytes);
									});
								return; // 异步分支已接管
							}
						}
						doImport(bytes);
					} else {
						$tw.wiki.addTiddler($tw.utils.extend({}, t.fields, {
							"tidme.pending": undefined,
							"tidme.import-error": "不支持的文件类型: " + fileName
						}));
						resolve();
					}
				} catch (e) {
					console.error("[tidme] importer error:", e);
					resolve();
				}
			});
		});
	}

	exports.startup = function () {
		// 启动时处理存量 + 定时扫描新增
		var scan = function () {
			try {
				var pending = $tw.wiki.filterTiddlers("[tag[tidme-pending-import]tidme.pending[yes]]");
				var batch = pending.slice(0, CONCURRENCY);
				batch.forEach(processOne);
			} catch (e) {
				console.error("[tidme] importer scan error:", e);
			}
		};
		scan();
		var timer = setInterval(scan, 15000);
		if (timer && typeof timer.unref === "function") timer.unref();
		// 暴露扫描入口：测试 / 手动触发（如 pending 上传后立即处理）
		exports.scan = scan;
	};
})();
