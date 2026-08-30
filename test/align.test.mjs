/*
align.test.mjs — 重切分对齐（G2）单元测试（node:test）

覆盖：cardKey 前缀剥离、内容未变保 ID（含顺序同步）、内容修改重挂接（保留 SRS 字段）、
新增节保留新卡、消失节归档。
*/
import { test } from "node:test";
import assert from "node:assert/strict";

const align = await import("../src/tidme/core/align.ts");

const DOC = "对齐书";

function oldCard(title, text, extra = {}) {
	return {
		title,
		fields: {
			"tidme.breadcrumb": `${DOC} › ${title}`,
			text,
			"tidme.order": "000001",
			"tidme.hash": "old-hash",
			"tidme.chars": "10",
			caption: title,
			state: "2",
			reps: "5",
			due: "20261231000000000",
			"tidme.kind": "topic",
			"tidme.subkind": "section",
			...extra
		}
	};
}

function newCard(title, text, order = "000001") {
	return {
		title: `${DOC} › ${title}`,
		fields: {
			"tidme.breadcrumb": `${DOC} › ${title}`,
			text,
			"tidme.order": order,
			"tidme.hash": "new-hash",
			"tidme.chars": "10",
			caption: title,
			"tidme.kind": "topic",
			"tidme.subkind": "section"
		}
	};
}

test("cardKey: 剥离文档标题前缀", () => {
	assert.equal(align.cardKey("对齐书 › 第一章", "对齐书"), "第一章");
	assert.equal(align.cardKey("对齐书 › 第一章 › 小节", "对齐书"), "第一章 › 小节");
	assert.equal(align.cardKey("对齐书 ~2 › 第一章", "对齐书"), "第一章", "文档唯一化后缀前缀匹配");
	assert.equal(align.cardKey("其他书 › 第一章", "对齐书"), "其他书 › 第一章", "非本文档不剥离");
});

test("alignCards: 未变保 ID / 修改重挂接 / 新增保留 / 消失归档", async () => {
	const oldCards = [
		oldCard("甲", "内容甲"),
		oldCard("乙", "内容乙"),
		oldCard("丙", "内容丙")
	];
	const newCards = [
		newCard("甲", "内容甲"),            // 未变
		newCard("乙", "内容乙（改）"),      // 修改
		newCard("丁", "内容丁")             // 新增
	];
	const r = await align.alignCards(oldCards, DOC, newCards);
	assert.equal(r.unchanged, 1, "甲未变");
	assert.deepEqual(r.archives, ["丙"], "丙消失归档");
	assert.equal(r.keep.length, 1, "丁新增保留");
	assert.equal(r.keep[0].title, "对齐书 › 丁");
	// 乙：内容变 → patch 更新内容字段，但补丁里不含 SRS 字段（保留进度）
	const patch = r.patches.find((p) => p.title === "乙");
	assert.ok(patch, "乙有更新补丁");
	assert.equal(patch.fields.text, "内容乙（改）");
	assert.equal(patch.fields.caption, "乙");
	assert.match(patch.fields["tidme.hash"], /^[0-9a-f]{16}$/, "hash 重新计算为新内容指纹");
	assert.equal(patch.fields.state, undefined, "SRS 字段不动（进度保留）");
	assert.equal(patch.fields.reps, undefined);
});

test("alignCards: 内容未变但顺序变化 → 仅同步 order", async () => {
	const oldCards = [oldCard("甲", "内容甲", { "tidme.order": "000002" })];
	const newCards = [newCard("甲", "内容甲", "000003")];
	const r = await align.alignCards(oldCards, DOC, newCards);
	assert.equal(r.unchanged, 1);
	assert.equal(r.patches.length, 1);
	assert.deepEqual(r.patches[0].fields, { "tidme.order": "000003" }, "只同步 order");
	assert.equal(r.archives.length, 0);
	assert.equal(r.keep.length, 0);
});

test("alignCards: 空新结果 / 空旧卡", async () => {
	const empty = await align.alignCards([], DOC, [newCard("甲", "内容甲")]);
	assert.equal(empty.keep.length, 1, "无旧卡全新建");
	const none = await align.alignCards([oldCard("甲", "内容甲")], DOC, []);
	assert.equal(none.keep.length, 0);
	assert.deepEqual(none.archives, [], "新结果为空不归档（防御）");
});
