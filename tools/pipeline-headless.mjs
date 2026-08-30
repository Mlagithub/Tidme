/*
pipeline-headless.mjs — 浏览器管线无头验证

esbuild 把 src/tidme/import/pipeline/main.ts 打成浏览器等价 CJS（tools/build-plugins.cjs 附带产物），
用 jsdom 提供原生 DOMParser/XMLSerializer，对真实 EPUB 断言：
  1) 格式保留：卡片 HTML 含块级标签
  2) NCX 锚点切分：面包屑出现目录小节标题（而非只有尺寸兜底）
  3) 确定性：两次运行产物一致（剥离时间戳字段——due/last_review 是写入时刻，不在确定性保证内）

用法：
  node tools/build-plugins.cjs        # 产出 out-m2/pipeline.cjs
  node tools/pipeline-headless.mjs <book.epub>
*/
import { createRequire } from "module";
import { readFileSync } from "fs";

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_("jsdom");
const { window } = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = window.DOMParser;
globalThis.XMLSerializer = window.XMLSerializer;
globalThis.Node = window.Node;

// $:/ 库引用重定向到本地 node_modules 的 jszip
const Module = await import("module");
const mod = Module.default;
const origLoad = mod._load;
mod._load = function (request, parent, isMain) {
	if (request === "$:/plugins/keepone/tidme/import/jszip") return require_("jszip");
	return origLoad.call(this, request, parent, isMain);
};

const pipelinePath = new URL("../out-m2/pipeline.cjs", import.meta.url).href;
const pipeline = (await import(pipelinePath)).default;

const epubFile = process.argv[2];
if (!epubFile) {
	console.error("用法: node tools/pipeline-headless.mjs <book.epub>");
	process.exit(1);
}
const bytes = new Uint8Array(readFileSync(epubFile));

const opts = {};
const r1 = await pipeline.runImport(bytes, epubFile.split(/[\\/]/).pop(), opts);
const r2 = await pipeline.runImport(bytes, epubFile.split(/[\\/]/).pop(), opts);
const cards = r1.tiddlers.filter((t) => Array.isArray(t.tags) && t.tags.includes("?"));
let fail = 0;
const check = (name, ok, detail = "") => {
	console.log((ok ? "✓" : "✘"), name, detail);
	if (!ok) fail++;
};

check("解析产出节数", cards.length > 0, `共 ${cards.length} 卡`);

// 1) 格式保留
const noBlock = cards.filter((c) => !/<(p|h[1-6]|blockquote|li|pre)[\s>]/i.test(c.text));
check("格式保留（全部卡片含块级标签）", noBlock.length === 0, noBlock.length ? "反例: " + noBlock.slice(0, 3).map((c) => c.title).join(" / ") : "");
const inlineTotal = cards.reduce((n, c) => n + (c.text.match(/<(em|strong|i|b|a|span)[\s>]/gi) || []).length, 0);
check("内联格式大量存在", inlineTotal > cards.length, `内联标签 ${inlineTotal} 个`);

// 2) NCX 锚点切分：面包屑多样性（章级以上标题数）
const trails = cards.map((c) => String(c["tidme.breadcrumb"] || ""));
const distinctHeads = new Set(trails.map((t) => t.split(" › ").slice(0, 2).join(" › ")));
check("面包屑章级多样", distinctHeads.size >= 2, `${distinctHeads.size} 个不同章头`);
console.log("  面包屑样例:");
for (const t of trails.slice(0, 6)) console.log("   ·", t);

// 3) 确定性（剥离时间戳字段——due/last_review 为写入时刻，不在确定性保证内）
const stripTime = (tiddlers) => tiddlers.map((t) => {
	const { due, last_review, ...rest } = t;
	return rest;
});
check("两次运行确定性一致", JSON.stringify(stripTime(r1.tiddlers)) === JSON.stringify(stripTime(r2.tiddlers)));

console.log(fail ? `\n${fail} 项未通过` : "\n全部通过 ✅");
process.exit(fail ? 1 : 0);
