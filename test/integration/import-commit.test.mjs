/*
import-commit.test.mjs — core/import-commit（对齐落库唯一实现）+ scheduler.docItemsFilter 回归测试

背景：split.ts / import.ts 曾各自实现"alignCards 三路写库 + 文档页落位"，细节漂移；
docItemFilter 曾把 ITEM_FILTER 拼出第二个 run（并集），把全库 item 混进"复习本书"。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPlugin } from "../helpers/tw-boot.mjs";

const { wiki, mod, reset } = bootPlugin({ prefix: "tidme-commit-" });
let pipeline, commitMod, sched;
test.before(() => {
	pipeline = mod("import/pipeline.js");
	commitMod = mod("core/import-commit.js");
	sched = mod("core/scheduler.js");
});

test.beforeEach(reset);

function sectionTitles(docId) {
	return wiki.filterTiddlers(`[tidme.doc[${docId}]tidme.kind[topic]!tidme.subkind[extract]nsort[tidme.order]]`);
}

test("import-commit: 首次导入全量写库；rewriteDocPage 把卡 docpage 统一改写为最终文档页 title", async () => {
	const r = await pipeline.runSplit({ text: "# 一\n\n内容一。\n\n# 二\n\n内容二。", title: "落库书", type: "text/markdown", minChars: 0 });
	const [doc, ...cards] = r.tiddlers;
	const res = await commitMod.commitImportToWiki(wiki, {
		docId: r.docId,
		docTiddler: { ...doc, title: "覆盖后的文档页" },
		docTitle: "覆盖后的文档页",
		cards,
		rewriteDocPage: true
	});
	assert.equal(res.aligned, false);
	assert.equal(res.created, 2, "两张节卡全量写");
	for (const t of sectionTitles(r.docId)) {
		assert.equal(wiki.getTiddler(t).fields["tidme.docpage"], "覆盖后的文档页", "docpage 已改写为最终 title");
	}
	assert.ok(wiki.getTiddler("覆盖后的文档页"), "文档页以 docTitle 落库");
});

test("import-commit: 重导入对齐——未变节保 SRS 进度、内容变重挂接、消失节归档", async () => {
	const r1 = await pipeline.runSplit({ text: "# 甲\n\n内容甲。\n\n# 乙\n\n内容乙。", title: "对齐书", type: "text/markdown", minChars: 0 });
	for (const t of r1.tiddlers) wiki.addTiddler(t);
	const sec1 = sectionTitles(r1.docId);
	// 模拟复习进度：第一节已评分（state=2, reps=1）
	wiki.addTiddler({ ...wiki.getTiddler(sec1[0]).fields, state: "2", reps: "1" });
	const oldFields = wiki.getTiddler(sec1[0]).fields;

	// 重切：甲内容变、乙消失、新增丙
	const r2 = await pipeline.runSplit({ text: "# 甲\n\n内容甲（修订）。\n\n# 丙\n\n内容丙。", title: "对齐书", type: "text/markdown", minChars: 0 });
	const [doc2, ...cards2] = r2.tiddlers;
	const res = await commitMod.commitImportToWiki(wiki, { docId: r2.docId, docTiddler: doc2, docTitle: doc2.title, cards: cards2 });

	assert.equal(res.aligned, true);
	assert.equal(res.archived, 1, "乙消失 → 归档 1 张");
	const archived = sec1.map((t) => wiki.getTiddler(t)).find((f) => f.fields.caption === "乙");
	assert.equal(archived.fields["tidme.done"], "yes", "归档卡置 done 出队");
	assert.equal(archived.fields["tidme.obsolete"], "yes");

	assert.equal(wiki.getTiddler(sec1[0]).fields.state, "2", "甲重挂接后 SRS 进度保留");
	assert.equal(wiki.getTiddler(sec1[0]).fields.reps, "1");
	assert.ok(String(wiki.getTiddler(sec1[0]).fields.text).includes("修订"), "甲内容已更新");

	const nowTitles = sectionTitles(r2.docId);
	assert.ok(nowTitles.includes(sec1[1]) === false || wiki.getTiddler(sec1[1]).fields["tidme.done"] === "yes");
	assert.equal(res.created >= 1, true, "丙为新增节");
	assert.ok(nowTitles.some((t) => wiki.getTiddler(t).fields.caption === "丙"));
});

test("import-commit: 对齐模式下同 key 换 ID 的新卡不重复写（ordinal 漂移防御）", async () => {
	// 旧卡：key = "漂移书 › 章"（title 带旧 ID）
	const oldTitle = "Tidme/Books/漂移书/旧s000";
	wiki.addTiddler({
		title: oldTitle, caption: "章", text: "旧内容", "tidme.doc": "ddrift", "tidme.id": "s000",
		"tidme.kind": "topic", "tidme.subkind": "section", "tidme.breadcrumb": "漂移书 › 章",
		"tidme.order": "000000", "tidme.docpage": "Tidme/Books/漂移书"
	});
	// 新产物：同 trail key 但 ID 漂移 → 新 title；另有 1 张 keyless 卡（应防御性补写）
	const newSameKey = {
		title: "Tidme/Books/漂移书/新s111", caption: "章", text: "新内容", "tidme.doc": "ddrift",
		"tidme.kind": "topic", "tidme.subkind": "section", "tidme.breadcrumb": "漂移书 › 章", "tidme.order": "000001"
	};
	const keyless = {
		title: "Tidme/Books/漂移书/manual-手记", caption: "手记", text: "手写", "tidme.doc": "ddrift",
		"tidme.kind": "topic", "tidme.subkind": "section"
	};
	const doc = { title: "Tidme/Books/漂移书", tags: ["tidme-import-doc"], "tidme.doc": "ddrift", text: "" };
	const res = await commitMod.commitImportToWiki(wiki, {
		docId: "ddrift", docTiddler: doc, docTitle: doc.title, cards: [newSameKey, keyless]
	});
	assert.equal(res.aligned, true);
	assert.ok(wiki.getTiddler(oldTitle), "同 key 旧卡保留（SRS 进度载体）");
	assert.ok(!wiki.getTiddler(newSameKey.title), "同 key 换 ID 的新卡不得写出（防重复节）");
	assert.ok(wiki.getTiddler(keyless.title), "keyless 漏网新卡防御性补写");
	assert.equal(wiki.getTiddler(oldTitle).fields.text, "新内容", "同 key 旧卡内容重挂接为新内容");
});

test("scheduler.docItemsFilter: 只匹配本书在队 item（回归：拼接并集曾把全库 item 混入复习本书）", () => {
	wiki.addTiddler({ title: "a1", "tidme.doc": "docA", "tidme.kind": "item", "tidme.subkind": "qa" });
	wiki.addTiddler({ title: "a2", "tidme.doc": "docA", "tidme.kind": "item", "tidme.subkind": "cloze", "tidme.done": "yes" });
	wiki.addTiddler({ title: "a3", "tidme.doc": "docA", "tidme.kind": "item", "tidme.subkind": "qa", "tidme.suspended": "yes" });
	wiki.addTiddler({ title: "b1", "tidme.doc": "docB", "tidme.kind": "item", "tidme.subkind": "qa" });
	wiki.addTiddler({ title: "t1", "tidme.doc": "docA", "tidme.kind": "topic", "tidme.subkind": "section" });
	assert.deepEqual([...wiki.filterTiddlers(sched.docItemsFilter("docA"))], ["a1"],
		"仅本书、未 done/ignored/suspended 的 item；他书卡与 topic 不入");
	// 阅读队列过滤器常量同样唯一产地
	assert.equal(wiki.filterTiddlers(sched.TOPIC_QUEUE_FILTER).includes("t1"), true);
	assert.equal(wiki.filterTiddlers(sched.TOPIC_QUEUE_FILTER).includes("a1"), false, "item 不进阅读队列");
});
