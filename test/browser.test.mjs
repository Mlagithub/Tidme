/*
browser.test.mjs — 侧边栏/管理组件冒烟测试（node:test）

boot TW + 插件，造一张文档/卡片数据，渲染 card-browser / queue-ops / stats-panel，
断言树形结构与统计输出（不抛错且包含预期内容）。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TiddlyWiki from "tiddlywiki";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "../out-m2");
const plugins = ["$__plugins_tidme_core", "$__plugins_tidme_fsrs4tw", "$__plugins_tidme_import", "$__plugins_tidme_read", "$__tidme_languages_zh-Hans"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
if (!plugins.length) throw new Error("缺少 out-m2 产物，先运行 node tools/build-plugins.cjs");

function fakeElement(tag = "div") {
	return {
		nodeType: 1, tagName: String(tag).toUpperCase(), childNodes: [], children: [],
		style: {}, attributes: {}, parentNode: null, textContent: "", innerHTML: "",
		setAttribute(k, v) { this.attributes[k] = v; },
		getAttribute(k) { return this.attributes[k]; },
		appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		insertBefore(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); this.children = this.children.filter((x) => x !== c); return c; },
		addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
		classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
		hasAttribute() { return false; }, ownerDocument: null,
		querySelector() { return null; }, querySelectorAll() { return []; },
		setAttributeNS() {}, getBoundingClientRect() { return { top: 0, left: 0 }; },
		focus() {}, scrollIntoView() {}, replaceChildren() {}
	};
}

/** 递归收集 DOM 文本（fake 不自动聚合 textContent） */
function collectText(node) {
	if (!node) return "";
	let out = node.textContent || "";
	for (const c of node.childNodes || []) out += collectText(c);
	return out;
}

const fakeDocument = {
	createElement: (t) => fakeElement(t),
	createElementNS: (ns, t) => fakeElement(t),
	createTextNode: () => fakeElement("#text"),
	body: fakeElement("body"), title: "fake",
	querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
	createRange: () => ({ setStart() {}, setEnd() {}, surroundContents() {} }),
	defaultView: null
};

let wiki, cardBrowser, queueOps, statsPanel, cardManager;
test.before(async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-browser-"));
	const tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray(plugins);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	wiki = tw.wiki;
	// 造数据：一本书 + 2 节 + 1 摘录 + 自动 deck
	const pipeline = tw.modules.execute("$:/plugins/tidme/import/pipeline.js");
	const r = await pipeline.runSplit({ text: "# 书名甲\n\n第一章正文。\n\n## 小节乙\n\n第二节正文。", title: "书名甲", type: "text/markdown", minChars: 0 });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const section = r.tiddlers.find((x) => Array.isArray(x.tags) && x.tags.includes("?"));
	wiki.addTiddler({
		title: "书名甲 › 第一章 › 摘录", tags: ["?"], caption: "摘",
		text: "<blockquote>第一章的摘录</blockquote>",
		"tidme.doc": r.docId, "tidme.parent": section.title, "tidme.kind": "extract",
		"tidme.breadcrumb": `${section["tidme.path"]} › 摘录`, "tidme.source": "书名甲",
		"tidme.format": "markdown", state: "0", due: "20261231000000000"
	});
	cardBrowser = tw.modules.execute("$:/plugins/tidme/import/widgets/card-browser.js");
	queueOps = tw.modules.execute("$:/plugins/tidme/import/widgets/queue-ops.js");
	statsPanel = tw.modules.execute("$:/plugins/tidme/import/widgets/stats-panel.js");
	cardManager = tw.modules.execute("$:/plugins/tidme/import/widgets/card-manager.js");
});

function renderWidget(mod, name) {
	const root = fakeElement("div");
	const w = new mod[name]({}, { wiki, document: fakeDocument, parentWidget: null });
	w.render(root, null);
	return root;
}

test("card-browser: 树形包含牌组/文档/卡片", () => {
	const root = renderWidget(cardBrowser, "card-browser");
	const text = collectText(root);
	assert.ok(text.includes("书名甲"), "应含文档名");
	assert.ok(text.includes("小节乙"), "应含节标题");
	assert.ok(text.includes("摘"), "应含摘录标记");
	assert.ok(text.includes("✕"), "应有删除按钮");
});

test("queue-ops: 每牌组渲染批量操作按钮", () => {
	const root = renderWidget(queueOps, "queue-ops");
	const text = collectText(root);
	assert.ok(text.includes("顺延7d"), "应有顺延按钮");
	assert.ok(text.includes("遗忘"), "应有遗忘按钮");
	assert.ok(text.includes("$:/Deck/read/书名甲"), "应含自动牌组");
});

test("stats-panel: 渲染负载/文档进度/漏斗", () => {
	const root = renderWidget(statsPanel, "stats-panel");
	const text = collectText(root);
	assert.ok(text.includes("牌组负载"), "应有负载区");
	assert.ok(text.includes("书名甲"), "应含文档进度");
	assert.ok(text.includes("漏斗"), "应有漏斗");
	assert.ok(text.includes("保留率"), "应有保留率");
});

test("card-manager: 渲染视图过滤/树/批量工具条", () => {
	const root = renderWidget(cardManager, "card-manager");
	const text = collectText(root);
	assert.ok(text.includes("全部"), "应有视图过滤");
	assert.ok(text.includes("顺延7d"), "应有批量操作");
	assert.ok(text.includes("书名甲"), "应含文档");
	assert.ok(text.includes("小节乙"), "应含节");
});

test("card-manager: Done 语义（去 ? 和 . + tidme.done）与恢复", () => {
	const done = cardManager.doneFields({ title: "节", tags: ["?", "."], state: "0" });
	assert.equal(done.tags.length, 0, "Done 去掉 ? 和 .");
	assert.equal(done["tidme.done"], "yes");
	// 恢复：按 kind 补回标签
	const resumed = cardManager.resumeFields({ ...done, "tidme.kind": "section" });
	assert.ok(resumed.tags.includes("?"), "恢复补回 ?");
	assert.ok(resumed.tags.includes("."), "section 恢复补回 .");
	assert.equal(resumed["tidme.done"], undefined, "恢复删除 tidme.done");
});
