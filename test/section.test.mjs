/*
section.test.mjs — 阅读闭环字段构建器单元测试（node:test）

在临时 TW 环境加载 import 插件的 widgets/section.js，验证：
- buildExtract/buildCloze：parent 链、anchor 记录、嵌套摘录（parent = 摘录卡）
- parseAnchor：round-trip
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
const plugins = ["$__plugins_tidme_core", "$__plugins_tidme_review", "$__plugins_tidme_import", "$__plugins_tidme_read", "$__tidme_languages_zh-Hans"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
if (!plugins.length) throw new Error("缺少 out-m2 产物，先运行 node tools/build-plugins.cjs");

let wiki;
let sectionMod;
test.before(() => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-section-"));
	const tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray(plugins);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	wiki = tw.wiki;
	sectionMod = tw.modules.execute("$:/plugins/tidme/import/widgets/section.js");
});

test("buildExtract: parent 链 + anchor 记录", () => {
	wiki.addTiddler({ title: "书 › 第一章", "tidme.doc": "d12345678", "tidme.breadcrumb": "书 › 第一章", "tidme.source": "书", "tidme.format": "epub", "tidme.priority": "30", text: "正文" });
	const card = sectionMod.buildExtract(wiki, "书 › 第一章", "这是一段被选中的文字，用于摘录。");
	assert.equal(card["tidme.parent"], "书 › 第一章");
	assert.equal(card["tidme.kind"], "extract");
	assert.equal(card["tidme.doc"], "d12345678");
	assert.equal(card["tidme.priority"], "30", "G4 继承父卡优先级");
	const anchor = sectionMod.parseAnchor(card["tidme.anchor"]);
	assert.equal(anchor.section, "书 › 第一章");
	assert.ok(anchor.snippet.includes("被选中"), "anchor 记录片段");
	assert.ok(card.state === "0", "FSRS 初始字段");
	// W1 双轨：摘录 = topic（阅读态 .，不带 ?，不进主动复习流）
	assert.ok(card.tags.includes("."), "摘录卡带 .（阅读态）");
	assert.ok(!card.tags.includes("?"), "摘录卡不带 ?（topic 不进复习流）");
});

test("buildExtract: 嵌套摘录（parent = 摘录卡）", () => {
	wiki.addTiddler({ title: "书 › 第一章 › 摘录", "tidme.doc": "d12345678", "tidme.breadcrumb": "书 › 第一章 › 摘录", "tidme.parent": "书 › 第一章", "tidme.kind": "extract", text: "引文" });
	const card = sectionMod.buildExtract(wiki, "书 › 第一章 › 摘录", "更细的一层摘录。");
	assert.equal(card["tidme.parent"], "书 › 第一章 › 摘录", "嵌套 parent");
	assert.ok(card["tidme.breadcrumb"].endsWith("摘录 › 摘录"), "面包屑继续追加");
});

test("buildCloze: anchor + parent", () => {
	wiki.addTiddler({ title: "书 › 第一章", "tidme.doc": "d12345678", "tidme.breadcrumb": "书 › 第一章", "tidme.priority": "70", text: "正文" });
	const card = sectionMod.buildCloze(wiki, "书 › 第一章", "Sierra Leone 的首都是 Freetown。", "Freetown");
	assert.equal(card["tidme.kind"], "cloze");
	assert.equal(card["tidme.parent"], "书 › 第一章");
	assert.equal(card["tidme.priority"], "70", "G4 继承父卡优先级");
	assert.ok(card.caption.includes("<<C"), "挖空宏");
	const anchor = sectionMod.parseAnchor(card["tidme.anchor"]);
	assert.equal(anchor.snippet, "Freetown");
	// W1 双轨：挖空 = item（带 ?，进主动复习流）
	assert.ok(card.tags.includes("?"), "挖空卡带 ?（item 进复习流）");
	assert.ok(!card.tags.includes("."), "挖空卡不带 .");
});

test("parseAnchor: 容错", () => {
	assert.equal(sectionMod.parseAnchor(null), null);
	assert.equal(sectionMod.parseAnchor("非法 json"), null);
	const a = sectionMod.parseAnchor('{"section":"甲","snippet":"乙"}');
	assert.equal(a.section, "甲");
	assert.equal(a.snippet, "乙");
});
