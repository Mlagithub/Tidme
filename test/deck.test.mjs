/*
deck.test.mjs — 牌组子系统（core/deck）单元测试（M2，node:test）

覆盖：创建/重复/读取/更新/成员求值（strict/loose/exclude）/subset 标记与
完整标题/删除语义（默认保留卡 vs 连卡）/default 保护/configToFields 低层字段。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TiddlyWiki from "tiddlywiki";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "../bin");
const plugins = ["$__plugins_keepone_tidme", "$__tidme_languages_zh-Hans"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
if (!plugins.length) throw new Error("缺少 bin 产物，先运行 node tools/build-plugins.cjs");

let wiki, deckMod;
test.before(() => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-deck-"));
	const tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray(plugins);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	wiki = tw.wiki;
	deckMod = tw.modules.execute("$:/plugins/keepone/tidme/core/deck.js");
});

function twDate(d = new Date()) {
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
}
function mkItem(title) {
	wiki.addTiddler({ title, "tidme.kind": "item", state: "0", due: twDate(), caption: title, text: "x" });
}

test("deck: 创建/读取/枚举；重复创建抛错", () => {
	const t = deckMod.createDeck(wiki, { name: "词书A", caption: "词汇A", card: "[all[]match[itemX]]" });
	assert.equal(t, "$:/Deck/词书A");
	const d = deckMod.getDeck(wiki, "词书A");
	assert.ok(d, "可按名读取");
	assert.equal(d.fields.caption, "词汇A");
	assert.ok(deckMod.listDecks(wiki).includes("$:/Deck/词书A"), "可枚举");
	// 低层 fsrs4tw 字段由 configToFields 生成（不缺失）
	for (const k of ["state_learn", "state_due", "state_new", "order", "p", "leech_threshold", "card_exclude", "exclude_action"]) {
		assert.ok(d.fields[k] !== undefined && d.fields[k] !== "", `configToFields 生成 ${k}`);
	}
	assert.throws(() => deckMod.createDeck(wiki, { name: "词书A" }), "重名抛错");
});

test("deck: 成员求值（strict 排除 card_exclude；loose 含）", () => {
	mkItem("deckItemIn");
	mkItem("deckItemOut");
	wiki.addTiddler({ title: "deckItemOut", "tidme.ignored": "yes" });
	const t = deckMod.createDeck(wiki, { name: "成员组", card: "[all[]match[deckItemIn]] [all[]match[deckItemOut]]" });
	const strict = deckMod.deckCards(wiki, t);
	assert.ok(strict.includes("deckItemIn"), "strict 含在队卡");
	assert.ok(!strict.includes("deckItemOut"), "strict 排除（card_exclude=ignored）");
	const loose = deckMod.deckCards(wiki, t, { strict: false });
	assert.ok(loose.includes("deckItemOut"), "loose 含全部 card 命中");
	assert.ok(deckMod.deckHasCard(wiki, t, "deckItemIn"));
	assert.ok(!deckMod.deckHasCard(wiki, t, "deckItemOut"));
});

test("deck: 更新字段（含 configToFields 重生成）", () => {
	deckMod.updateDeck(wiki, "词书A", deckMod.configToFields(wiki, { name: "词书A", caption: "新名", card: "[all[]match[other]]" }));
	const d = deckMod.getDeck(wiki, "词书A");
	assert.equal(d.fields.caption, "新名");
	assert.equal(d.fields.card, "[all[]match[other]]");
	assert.ok(d.fields.state_new, "低层字段仍在");
});

test("deck: subset（完整镜像标题）标记与 titleOf", () => {
	assert.equal(deckMod.titleOf("Tidme/Decks/书X/复习本书"), "Tidme/Decks/书X/复习本书", "合法完整标题原样");
	assert.equal(deckMod.titleOf("a/b"), "$:/Deck/a-b", "非法 / 被 slug 化");
	const t = deckMod.createDeck(wiki, { name: "Tidme/Decks/书X/复习本书", kind: "subset", sourceDoc: "doc1", card: "[all[]match[z]]" });
	const d = deckMod.getDeck(wiki, t);
	assert.ok(deckMod.isSubset(d), "subset 标记");
	assert.equal(d.fields["tidme.subset-doc"], "doc1");
	assert.ok(deckMod.listDecks(wiki).includes(t), "subset 也可枚举");
});

test("deck: 删除语义 —— 默认仅删容器（卡保留）；alsoCards 连卡删；default 不可删", () => {
	mkItem("keepCard1");
	const t = deckMod.createDeck(wiki, { name: "临时组", card: "[all[]match[keepCard1]]" });
	const n = deckMod.deleteDeck(wiki, t);
	assert.equal(n, 0, "默认不删卡");
	assert.equal(deckMod.getDeck(wiki, t), null, "容器已删");
	assert.ok(wiki.getTiddler("keepCard1"), "卡保留");
	// alsoCards
	mkItem("doomCard");
	const t2 = deckMod.createDeck(wiki, { name: "连卡组", card: "[all[]match[doomCard]]" });
	const n2 = deckMod.deleteDeck(wiki, t2, { alsoCards: true });
	assert.equal(n2, 1, "连卡删除 1 张");
	assert.equal(wiki.getTiddler("doomCard"), undefined, "卡已删");
	// default 保护
	assert.throws(() => deckMod.deleteDeck(wiki, "$:/Deck/default"), "default 不可删");
});
