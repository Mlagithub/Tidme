/*
pipeline.test.mjs — 导入管线单元测试（node:test）

依赖 out-m2/pipeline.cjs（先运行 tools/build-plugins.cjs）与 tools/fixtures/demo.epub（tools/make-fixture.mjs）。
断言：EPUB 解析 → 大纲切分 → 确定性 ID → tiddler 落库的关键性质。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_("jsdom");
const { window } = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = window.DOMParser;
globalThis.XMLSerializer = window.XMLSerializer;
globalThis.Node = window.Node;

const Module = await import("node:module");
const origLoad = Module.default._load;
Module.default._load = function (request, parent, isMain) {
	if (request === "$:/plugins/keepone/tidme/import/jszip") return require_("jszip");
	return origLoad.call(this, request, parent, isMain);
};

const here = path.dirname(fileURLToPath(import.meta.url));
const pipeline = (await import(pathToFileURL(path.join(here, "../out-m2/pipeline.cjs")).href)).default;
const fixturePath = path.join(here, "../tools/fixtures/demo.epub");
const bytes = new Uint8Array(readFileSync(fixturePath));

function stripTime(tiddlers) {
	return tiddlers.map((t) => {
		const { due, last_review, ...rest } = t;
		return rest;
	});
}

test("EPUB 解析产出卡片（kind=topic 与 FSRS 字段）", async () => {
	const r = await pipeline.runImport(bytes, "demo.epub", {});
	assert.ok(r.tiddlers.length > 1, "应有文档页 + 卡片");
	const cards = r.tiddlers.filter((t) => t["tidme.kind"] === "topic");
	assert.ok(cards.length >= 2, `至少 2 张卡，实际 ${cards.length}`);
	for (const c of cards) {
		for (const f of ["due", "state", "reps", "lapses", "stability", "difficulty", "tidme.doc", "tidme.id", "tidme.hash", "tidme.breadcrumb"]) {
			assert.ok(f in c, `卡片缺字段 ${f}: ${c.title}`);
		}
		assert.equal(c["tidme.subkind"], "section", "节卡 subkind=section");
	}
});

test("格式保留：卡片 HTML 含块级标签", async () => {
	const r = await pipeline.runImport(bytes, "demo.epub", {});
	const cards = r.tiddlers.filter((t) => t["tidme.kind"] === "topic");
	for (const c of cards) {
		assert.match(c.text, /<(p|h[1-6]|blockquote|li|pre)[\s>]/i, `无块级标签: ${c.title}`);
	}
});

test("NCX 锚点切分：面包屑包含目录小节标题", async () => {
	const r = await pipeline.runImport(bytes, "demo.epub", {});
	const trails = r.tiddlers.filter((t) => t["tidme.kind"] === "topic").map((t) => String(t["tidme.breadcrumb"] || ""));
	const heads = new Set(trails.map((t) => t.split(" › ").slice(0, 2).join(" › ")));
	assert.ok(heads.size >= 2, `章级面包屑应 ≥2，实际 ${heads.size}`);
	assert.ok(trails.some((t) => t.includes("二、长文压力测试")), "应含 NCX 小节标题");
});

test("确定性：两次运行（剥离时间戳后）产物一致", async () => {
	const r1 = await pipeline.runImport(bytes, "demo.epub", {});
	const r2 = await pipeline.runImport(bytes, "demo.epub", {});
	assert.deepEqual(stripTime(r1.tiddlers), stripTime(r2.tiddlers));
});

test("确定性 ID：同一面包屑与序号派生稳定", async () => {
	const r1 = await pipeline.runImport(bytes, "demo.epub", {});
	const r2 = await pipeline.runImport(bytes, "demo.epub", {});
	const id1 = r1.tiddlers.filter((t) => t["tidme.kind"] === "topic").map((t) => t["tidme.id"]);
	const id2 = r2.tiddlers.filter((t) => t["tidme.kind"] === "topic").map((t) => t["tidme.id"]);
	assert.deepEqual(id1, id2);
	assert.ok(id1.every((x) => typeof x === "string" && x.startsWith("s")));
});

test("SM 优先级：runImport/runSplit 透传 priority（导入时批量设优先级）", async () => {
	const r = await pipeline.runImport(bytes, "demo.epub", { priority: 8 });
	const cards = r.tiddlers.filter((t) => t["tidme.kind"] === "topic");
	assert.ok(cards.length >= 1, "应有节卡");
	for (const c of cards) assert.equal(c["tidme.priority"], "8", "EPUB 导入优先级透传");

	const rs = await pipeline.runSplit({ text: "# 短文\n\n内容。", title: "优先测试", type: "text/markdown", priority: 92 });
	const scards = rs.tiddlers.filter((t) => t["tidme.kind"] === "topic");
	assert.ok(scards.length >= 1, "应有节卡");
	for (const c of scards) assert.equal(c["tidme.priority"], "92", "文本切分优先级透传");
});
