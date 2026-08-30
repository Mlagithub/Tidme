/*
scheduler.test.mjs — core 调度体系单元测试（node:test）

覆盖：优先级归一化/三档随机、批量操作补丁、autoPostpone 语义（保留 top N、顺延低优先级逾期）、
子集队列构造。
*/
import { test } from "node:test";
import assert from "node:assert/strict";

const sched = await import("../src/tidme/core/scheduler.ts");

const T = (offsetHours) => {
	const d = new Date(Date.now() + offsetHours * 3600000);
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
};
const PAST = () => T(-48); // 48 小时前（逾期）
const FUTURE = () => T(48);

test("normalizePriority: 边界与非法值", () => {
	assert.equal(sched.normalizePriority(0), 0);
	assert.equal(sched.normalizePriority(100), 100);
	assert.equal(sched.normalizePriority(150), 100);
	assert.equal(sched.normalizePriority(-5), 0);
	assert.equal(sched.normalizePriority("30"), 30);
	assert.equal(sched.normalizePriority(undefined), 50);
	assert.equal(sched.normalizePriority("abc"), 50);
});

test("tierRandom: 三档落在合理区间", () => {
	for (let i = 0; i < 50; i++) {
		const h = sched.tierRandom("high", 8);
		const l = sched.tierRandom("low", 8);
		assert.ok(h >= 0 && h <= 25, `high 应在 0-25，实际 ${h}`);
		assert.ok(l >= 75 && l <= 100, `low 应在 75-100，实际 ${l}`);
	}
});

test("G1 priorityDeltaForRating: 评分 → 优先级调整量（SM: pass grades 降优先）", () => {
	assert.equal(sched.priorityDeltaForRating("Again"), 0, "Again 不动优先级（遗忘靠间隔重学）");
	assert.equal(sched.priorityDeltaForRating("Hard"), 0, "Hard 不动优先级");
	assert.equal(sched.priorityDeltaForRating("Good"), 5, "Good 及格降优先");
	assert.equal(sched.priorityDeltaForRating("Easy"), 10, "Easy 及格降更多");
	assert.equal(sched.priorityDeltaForRating("3"), 5, "数字 rating 兼容");
	assert.equal(sched.priorityDeltaForRating("X"), 0, "未知 rating 不动");
	assert.equal(sched.priorityDeltaForRating("Again", { enable: false }), 0, "enable:false 关闭");
	assert.equal(sched.priorityDeltaForRating("Again", { again: -20 }), -20, "配置可覆盖（自定义升优先）");
});

test("G1 adjustPriority / G2 shiftPriority: clamp 0-100", () => {
	assert.equal(sched.adjustPriority(50, -10), "40", "升优先");
	assert.equal(sched.adjustPriority(5, -10), "0", "下限 clamp");
	assert.equal(sched.adjustPriority(95, 10), "100", "上限 clamp");
	assert.equal(sched.adjustPriority(undefined, 5), "55", "缺省按 50");
	assert.equal(sched.shiftPriority("50", -5), "45");
	assert.equal(sched.shiftPriority("50", 5), "55");
});

test("postponeCard / advanceCard / ignoreCard / forgetCard", () => {
	const due = PAST();
	const postponed = sched.postponeCard({ due }, 7);
	assert.ok(sched.parseTwDate(postponed.due).getTime() > Date.now(), "顺延 7 天后应在未来");
	const advanced = sched.advanceCard();
	assert.ok(sched.parseTwDate(advanced.due).getTime() <= Date.now() + 60000, "advance 到期时间≈现在");
	assert.deepEqual(sched.ignoreCard({ tags: ["?", "."] }).tags, ["."], "无 kind 按 item：去 ?");
	// W1 双轨：topic（section/extract）忽略去 .（出阅读流）；item（cloze）忽略去 ?（出复习流）
	assert.deepEqual(sched.ignoreCard({ tags: ["?", "."], "tidme.kind": "section" }).tags, ["?"], "section 忽略去 .");
	assert.deepEqual(sched.ignoreCard({ tags: ["."], "tidme.kind": "extract" }).tags, [], "extract 忽略去 .");
	assert.deepEqual(sched.ignoreCard({ tags: ["?"], "tidme.kind": "cloze" }).tags, [], "cloze 忽略去 ?");
	const forgotten = sched.forgetCard();
	assert.equal(forgotten.state, "0");
	assert.equal(forgotten.reps, "0");
});

test("autoPostpone: 保留 top N 高优先级，顺延其余低优先级逾期卡", () => {
	const mk = (title, priority, due) => ({
		title,
		fields: { "tidme.priority": String(priority), due, tags: ["?"], state: "2" }
	});
	const cards = [
		mk("高优A", 5, PAST()),
		mk("高优B", 10, PAST()),
		mk("低优C", 90, PAST()),
		mk("低优D", 80, PAST()),
		mk("未到期E", 90, FUTURE()) // 不应被处理
	];
	const r = sched.autoPostpone(cards, { maxPriority: 60, postponeDays: 7, keepTop: 2 });
	assert.equal(r.stats.overdue, 4, "4 张逾期（E 未到期排除）");
	assert.equal(r.stats.postponed, 2, "保留 top2（A/B），顺延 C/D");
	assert.deepEqual(r.patches.map((p) => p.title).sort(), ["低优C", "低优D"]);
	for (const p of r.patches) {
		assert.ok(sched.parseTwDate(p.fields.due).getTime() > Date.now(), `${p.title} 被顺延到未来`);
	}
});

test("autoPostpone: 搁置/已出队卡不处理", () => {
	const cards = [
		{ title: "搁置", fields: { "tidme.priority": "90", due: PAST(), tags: ["?"], "tidme.suspended": "yes" } },
		{ title: "已读完", fields: { "tidme.priority": "90", due: PAST(), tags: ["."] } },
		{ title: "可顺延", fields: { "tidme.priority": "90", due: PAST(), tags: ["?"] } }
	];
	const r = sched.autoPostpone(cards, { maxPriority: 60, keepTop: 0 });
	assert.deepEqual(r.patches.map((p) => p.title), ["可顺延"]);
});

test("doneCard/restoreCard: Done 语义与可逆恢复", () => {
	const done = sched.doneCard({ title: "节", tags: ["?", "."], state: "0", "tidme.suspended": "yes" });
	assert.equal(done.tags.length, 0, "Done 去掉 ? 和 .");
	assert.equal(done["tidme.done"], "yes");
	assert.ok(sched.isCardDone(done), "doneCard 后 isCardDone 应返回 true");
	// section 恢复 = topic 回到阅读态：补 . 不补 ?（W1 双轨，节卡不进主动复习流）
	const resumed = sched.restoreCard({ ...done, "tidme.kind": "section" });
	assert.ok(resumed.tags.includes("."), "section 恢复补回 .（阅读态）");
	assert.ok(!resumed.tags.includes("?"), "section 恢复不补 ?（topic 不进复习流）");
	assert.equal(resumed["tidme.done"], undefined);
	assert.equal(resumed["tidme.suspended"], undefined);
	assert.ok(!sched.isCardDone(resumed), "restoreCard 后 isCardDone 应返回 false");
	// 摘录卡恢复 = topic 回到阅读态：补 . 不补 ?（W1 双轨，摘录不进主动复习流）
	const resumeExtract = sched.restoreCard({ ...done, "tidme.kind": "extract" });
	assert.ok(resumeExtract.tags.includes("."), "extract 恢复补回 .（阅读态）");
	assert.ok(!resumeExtract.tags.includes("?"), "extract 恢复不补 ?（topic 不进复习流）");
	// item 类（cloze/qa/无 kind）恢复补回 ?，进复习流
	const resumeCloze = sched.restoreCard({ ...done, "tidme.kind": "cloze" });
	assert.ok(resumeCloze.tags.includes("?"), "cloze 恢复补回 ?（item 进复习流）");
	assert.ok(!resumeCloze.tags.includes("."), "cloze 恢复不补 .");
	const resumePlain = sched.restoreCard({ ...done });
	assert.ok(resumePlain.tags.includes("?"), "无 kind 卡恢复补回 ?（按 item 处理）");
});

test("ITEM_FILTER: 双轨分流（topic 出、item 进）", () => {
	const f = sched.ITEM_FILTER;
	assert.ok(f.includes("[tidme.kind[cloze]]"), "含 cloze");
	assert.ok(f.includes("[tidme.kind[qa]]"), "含 qa");
	assert.ok(f.includes("[!has[tidme.kind]]"), "含无 kind 手动卡");
	assert.ok(!f.includes("section"), "不含 section（topic）");
	assert.ok(!f.includes("extract"), "不含 extract（topic）");
});

test("subsetQueue / subsetByDoc / subsetByTag", () => {
	const queue = sched.subsetQueue("[tag[?]]", sched.subsetByDoc("d123"), (f) => f);
	assert.ok(queue.includes("tidme.doc[d123]"), "子集按 doc");
	const byTag = sched.subsetByTag("数学");
	assert.equal(byTag, "[tag[数学]]");
});

test("parseTwDate: 17 位 TW 日期串（UTC 语义，与 $tw.utils.parseDate 一致）", () => {
	const d = sched.parseTwDate("20260824201518283");
	assert.equal(d.getUTCFullYear(), 2026);
	assert.equal(d.getUTCMonth(), 7); // 8 月（0-based）
	assert.equal(d.getUTCDate(), 24);
	assert.equal(d.getUTCHours(), 20);
	assert.equal(d.getUTCMinutes(), 15);
	assert.equal(d.getUTCSeconds(), 18);
});
