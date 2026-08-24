/*
core.test.mjs — tidme/core 单元测试（node:test）

直接 import src/core/*.ts（Node 24 类型剥离）。覆盖：
- ids：docId/sectionId 确定性、指纹
- schema：FSRS 初始字段、缺失检测、严格校验
- deck-engine：过滤器组合与队列顺序
fsrs 服务经 study-flow-test（全 TW 环境）回归验证。
*/
import { test } from "node:test";
import assert from "node:assert/strict";

const ids = await import("../src/core/ids.ts");
const schema = await import("../src/core/schema.ts");
const deckEngine = await import("../src/core/deck-engine.ts");

test("ids: docId 只由元数据派生且确定", async () => {
	const meta = { title: "书A", creator: "作者", language: "zh" };
	const a = await ids.makeDocId(meta);
	const b = await ids.makeDocId({ ...meta });
	assert.equal(a, b);
	assert.match(a, /^d[0-9a-f]{8}$/);
	// 不含全文：仅 title 变化 → docId 变化
	const c = await ids.makeDocId({ ...meta, title: "书B" });
	assert.notEqual(a, c);
});

test("ids: sectionId 由 docId|面包屑|序号 派生且稳定", async () => {
	const doc = await ids.makeDocId({ title: "书", creator: "", language: "zh" });
	const s1 = await ids.makeSectionId(doc, ["第一章", "第一节"], 3);
	const s2 = await ids.makeSectionId(doc, ["第一章", "第一节"], 3);
	assert.equal(s1, s2);
	assert.match(s1, /^s[0-9a-f]{12}$/);
	const s3 = await ids.makeSectionId(doc, ["第一章", "第二节"], 3);
	assert.notEqual(s1, s3, "面包屑不同则 ID 不同");
	const s4 = await ids.makeSectionId(doc, ["第一章", "第一节"], 4);
	assert.notEqual(s1, s4, "序号不同则 ID 不同");
});

test("ids: contentFingerprint 归一化空白", async () => {
	assert.equal(await ids.contentFingerprint("  a   b\nc "), await ids.contentFingerprint("a b c"));
	assert.equal((await ids.contentFingerprint("hello")).length, 16);
});

test("ids: normalizeText 折叠空白", () => {
	assert.equal(ids.normalizeText("  多   个 空格 \n 换行 "), "多 个 空格 换行");
	assert.equal(ids.normalizeText(null), "");
});

test("schema: FSRS 初始字段齐全且 state=0", () => {
	const f = schema.initialFsrsFields(new Date());
	for (const key of schema.FSRS_FIELDS) assert.ok(key in f, `缺 ${key}`);
	assert.equal(f.state, "0");
	assert.equal(f.reps, "0");
	assert.equal(schema.missingFsrsFields(f).length, 0);
});

test("schema: missingFsrsFields 检出缺失", () => {
	const missing = schema.missingFsrsFields({ due: "20260101" });
	assert.ok(missing.includes("state"));
	assert.ok(missing.includes("stability"));
});

test("schema: assertKind 严格校验", () => {
	const good = {
		"tidme.doc": "d12345678", "tidme.id": "s123456789012", "tidme.parent": "书",
		"tidme.path": "书 › 章", "tidme.order": "000001", "tidme.kind": "section",
		"tidme.hash": "h1234567890123456", "tidme.format": "epub", caption: "章", text: "<p>x</p>",
		tags: ["?"], ...schema.initialFsrsFields(new Date())
	};
	assert.doesNotThrow(() => schema.assertKind(good, "section"));
	assert.throws(() => schema.assertKind({ ...good, caption: undefined }, "section"), /caption/);
	assert.throws(() => schema.assertKind({ ...good, state: undefined }, "section"), /FSRS/);
});

test("schema: inferKind 宽容推断", () => {
	assert.equal(schema.inferKind({ "tidme.kind": "extract" }), "extract");
	assert.equal(schema.inferKind({ "tidme.order": "000001" }), "section");
	assert.equal(schema.inferKind({}), null);
});

test("deck-engine: 组合过滤器与队列顺序（due-new）", () => {
	const fields = {
		card: "[tag[?]]",
		card_exclude: "[tag[!]]",
		state_learn: "[state[1]]",
		state_due: "[state[2]]",
		state_new: "[state[0]]",
		order: "due-new"
	};
	const f = deckEngine.composeDeckFilters("$:/Deck/default", fields);
	assert.ok(f.learn.includes("!!card"), "learn 应引用 card 字段");
	assert.ok(f.learn.includes("state_learn"), "learn 应含 state_learn");
	assert.ok(f.queue.startsWith(f.learn), "due-new: learn 在前");
	assert.ok(f.queue.includes(f.due) && f.queue.includes(f.newly), "queue 含 due+new");
	assert.ok(f.unfold.length > 0);
	// new-due 顺序
	const f2 = deckEngine.composeDeckFilters("$:/Deck/default", { ...fields, order: "new-due" });
	assert.ok(f2.queue.startsWith(f2.learn + " " + f2.newly), "new-due: learn+new 在前");
});

test("deck-engine: deckQueue 用自定义求值器", () => {
	const fields = {
		card: "[tag[?]]", card_exclude: "", state_learn: "", state_due: "",
		state_new: "", order: "due-new"
	};
	const queue = deckEngine.deckQueue("$:/Deck/default", () => ["卡A", "卡B"], fields);
	assert.deepEqual(queue, ["卡A", "卡B"]);
});
