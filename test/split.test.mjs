/*
split.test.mjs — 通用切分器（runSplit）单元测试（node:test）

覆盖：markdown 围栏/表格/setext、wikitext ! 标题、HTML 标题、格式探测、
docId 稳定性、确定性、自动 deck、EPUB3 nav 目录。
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
	if (request === "$:/plugins/tidme/import/jszip") return require_("jszip");
	return origLoad.call(this, request, parent, isMain);
};

const here = path.dirname(fileURLToPath(import.meta.url));
const pipeline = (await import(pathToFileURL(path.join(here, "../out-m2/pipeline.cjs")).href)).default;

function cardsOf(r) {
	return r.tiddlers.filter((t) => Array.isArray(t.tags) && t.tags.includes("?"));
}
function docOf(r) {
	return r.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes("tidme-import-doc"));
}
function stripTime(tiddlers) {
	return tiddlers.map((t) => {
		const { due, last_review, ...rest } = t;
		return rest;
	});
}

const MD_SAMPLE = `# 标题一

这是第一段，包含 **加粗** 与 *斜体*。

\`\`\`python
def f():
    return "不会被切分的长代码" + "x" * 500
\`\`\`

## 小标题

| 列A | 列B |
| --- | --- |
| 1 | 2 |

- 列表项一
- 列表项二

> 引用内容
`;

test("split: markdown 围栏代码为原子块（不切分、原样保留）", async () => {
	const r = await pipeline.runSplit({ text: MD_SAMPLE, title: "MD测试", type: "text/markdown" });
	const cards = cardsOf(r);
	const pre = cards.map((c) => c.text).filter((t) => t.includes("<pre"));
	assert.ok(pre.length >= 1, "应含代码块卡");
	const codeCard = cards.find((c) => c.text.includes('def f()'));
	assert.ok(codeCard, "代码内容应完整存在");
	assert.ok(codeCard.text.includes('不会被切分的长代码'), "围栏代码未被切碎");
});

test("split: markdown 表格为原子块", async () => {
	const r = await pipeline.runSplit({ text: MD_SAMPLE, title: "MD表格", type: "text/markdown" });
	const cards = cardsOf(r);
	const tableCard = cards.find((c) => c.text.includes("列A"));
	assert.ok(tableCard, "表格应成卡");
	assert.ok(tableCard.text.includes("| 1 | 2 |"), "表格行完整");
});

test("split: markdown setext 标题（===）成层级", async () => {
	// minChars:0 —— 结构测试，禁用短节合并
	const r = await pipeline.runSplit({ text: "大标题\n===\n\n正文内容一段。\n\n小标题\n---\n\n第二段。", title: "setext", type: "text/markdown", minChars: 0 });
	const cards = cardsOf(r);
	const trails = cards.map((c) => c["tidme.path"]);
	assert.ok(trails.some((t) => t.includes("大标题")), `应含 setext h1 面包屑: ${JSON.stringify(trails)}`);
	assert.ok(trails.some((t) => t.includes("小标题")), "应含 setext h2 面包屑");
});

test("split: wikitext `!` 标题建树", async () => {
	const wt = "! 章一\n\n段落甲。\n\n!! 节一\n\n段落乙。\n\n! 章二\n\n段落丙。";
	const r = await pipeline.runSplit({ text: wt, title: "WT测试", type: "text/vnd.tiddlywiki", minChars: 0 });
	const cards = cardsOf(r);
	assert.ok(cards.length >= 3, `应切出多节，实际 ${cards.length}`);
	const trails = cards.map((c) => c["tidme.path"]);
	assert.ok(trails.some((t) => t.includes("章一 › 节一")), `嵌套面包屑: ${JSON.stringify(trails)}`);
});

test("split: HTML h1-h6 建树", async () => {
	const html = "<h1>顶级</h1><p>正文一。</p><h2>次级</h2><p>正文二。</p>";
	const r = await pipeline.runSplit({ text: html, title: "HTML测试", type: "text/html", minChars: 0 });
	const cards = cardsOf(r);
	assert.ok(cards.length >= 2, `应切出多节，实际 ${cards.length}`);
	const trails = cards.map((c) => c["tidme.path"]);
	assert.ok(trails.some((t) => t.includes("顶级 › 次级")), `嵌套面包屑: ${JSON.stringify(trails)}`);
});

test("split: 无 type 自动探测（markdown / wikitext / html）", async () => {
	const md = await pipeline.runSplit({ text: "# 标题\n\n正文。", title: "sniff-md" });
	assert.equal(md.format, "markdown");
	const wt = await pipeline.runSplit({ text: "! 标题\n\n正文。", title: "sniff-wt" });
	assert.equal(wt.format, "wikitext");
	const html = await pipeline.runSplit({ text: "<html><body><h1>标题</h1><p>正文</p></body></html>", title: "sniff-html" });
	assert.equal(html.format, "html");
});

test("split: docId 由标题派生，同一标题+内容重切分稳定", async () => {
	const input = { text: "# 甲\n\n内容。\n\n## 乙\n\n更多内容。", title: "稳定性测试", type: "text/markdown" };
	const r1 = await pipeline.runSplit(input);
	const r2 = await pipeline.runSplit(input);
	assert.equal(r1.docId, r2.docId);
	assert.deepEqual(stripTime(r1.tiddlers), stripTime(r2.tiddlers));
	const ids1 = cardsOf(r1).map((c) => c["tidme.id"]);
	const ids2 = cardsOf(r2).map((c) => c["tidme.id"]);
	assert.deepEqual(ids1, ids2, "重切分卡片 ID 稳定");
});

test("split: 自动 deck 生成（按 tidme.doc 过滤）", async () => {
	const r = await pipeline.runSplit({ text: "# 书名\n\n内容。", title: "自动牌组书", type: "text/markdown" });
	const deck = r.tiddlers.find((t) => t.title === "$:/Deck/read/自动牌组书");
	assert.ok(deck, "应生成自动 deck");
	assert.ok(deck.card.includes(`tidme.doc[${r.docId}]`), `deck.card 应按 docId 过滤: ${deck.card}`);
	assert.ok(deck.tags.includes("$:/tags/TidmeDeck"));
	assert.ok(deck.p, "deck 应含 FSRS 参数");
});

test("split: 溯源字段继承（url/author → Document）", async () => {
	const r = await pipeline.runSplit({
		text: "# 剪藏文章\n\n正文。", title: "剪藏测试",
		type: "text/markdown",
		sourceFields: { url: "https://example.com/a", author: "作者甲", date: "2024-01-01" }
	});
	const doc = docOf(r);
	assert.equal(doc["tidme.url"], "https://example.com/a");
	assert.equal(doc["tidme.author"], "作者甲");
	assert.equal(doc["tidme.date"], "2024-01-01");
});

test("split: EPUB3 nav-only 书籍按 nav 目录切分", async () => {
	const { buildFixtureEpub3 } = await import(pathToFileURL(path.join(here, "../tools/make-fixture.mjs")).href);
	const bytes = new Uint8Array(await buildFixtureEpub3());
	const r = await pipeline.runImport(bytes, "demo3.epub", { minChars: 0 });
	const cards = cardsOf(r);
	assert.ok(cards.length >= 2, `EPUB3 nav 应切出多卡，实际 ${cards.length}`);
	const trails = cards.map((c) => c["tidme.path"]);
	assert.ok(trails.some((t) => t.includes("第一章 起点")), `面包屑应来自 nav: ${JSON.stringify(trails.slice(0, 3))}`);
});
