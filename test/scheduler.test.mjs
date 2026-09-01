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
	// 分类重构后：忽略 = 置 tidme.ignored（kind 决定归属，无标签）
	const ignored = sched.ignoreCard({ title: "卡", "tidme.kind": "item", state: "0" });
	assert.equal(ignored["tidme.ignored"], "yes", "忽略置 tidme.ignored");
	assert.ok(sched.isCardDone(ignored), "忽略后 isCardDone 返回 true（出队）");
	assert.equal(ignored["tidme.kind"], "item", "保留 kind");
	const forgotten = sched.forgetCard();
	assert.equal(forgotten.state, "0");
	assert.equal(forgotten.reps, "0");
});

test("A-Factor: afactorForText 启发式（短文快速、长文平缓）", () => {
	assert.equal(sched.afactorForText(100), 2.0);
	assert.equal(sched.afactorForText(799), 2.0);
	assert.equal(sched.afactorForText(1500), 1.6);
	assert.equal(sched.afactorForText(5000), 1.4);
	assert.equal(sched.afactorForText(50000), 1.3);
	assert.equal(sched.afactorForText(0), 1.5);
	assert.equal(sched.normalizeAFactor("2.5"), 2.5);
	assert.equal(sched.normalizeAFactor("abc"), 1.5);
	assert.equal(sched.normalizeAFactor(undefined), 1.5);
	assert.equal(sched.normalizeAFactor(99), 1.5, "越界回默认");
	assert.equal(sched.normalizeAFactor("1.0"), 1.0, "下限 1.0 允许");
});

test("postponeTopicByAFactor: 读取卡片 tidme.afactor（字段优先 → 篇幅启发式 → 默认 1.5）", () => {
	const f1 = { due: PAST(), "tidme.afactor": "2", scheduled_days: "10" };
	assert.equal(Number(sched.postponeTopicByAFactor(f1).scheduled_days), 20, "10 × 2 = 20");
	const f2 = { due: PAST(), "tidme.afactor": "3", scheduled_days: "10" };
	assert.equal(Number(sched.postponeTopicByAFactor(f2).scheduled_days), 30, "10 × 3 = 30");
	const f3 = { due: PAST(), "tidme.chars": "100", scheduled_days: "10" };
	assert.equal(Number(sched.postponeTopicByAFactor(f3).scheduled_days), 20, "短文启发式 2.0");
	const f4 = { due: PAST(), scheduled_days: "10" };
	assert.equal(Number(sched.postponeTopicByAFactor(f4).scheduled_days), 15, "无字段默认 1.5");
	// 显式 aFactor 覆盖字段
	const f5 = { due: PAST(), "tidme.afactor": "2", scheduled_days: "10" };
	assert.equal(Number(sched.postponeTopicByAFactor(f5, 1.5).scheduled_days), 15, "显式参数优先");
	// minDays 兜底
	const f6 = { due: PAST(), "tidme.afactor": "1.1", scheduled_days: "1" };
	assert.equal(Number(sched.postponeTopicByAFactor(f6).scheduled_days), 3, "最小 3 天");
});

test("autoPostpone: 保留 top N 高优先级，顺延其余低优先级逾期卡", () => {
	const mk = (title, priority, due) => ({
		title,
		fields: { "tidme.priority": String(priority), due, "tidme.kind": "item", state: "2" }
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

test("autoPostpone: 搁置/已出队不处理；topic 阅读卡按 A-Factor 顺延（SM: auto-postpone 主要作用于 Topics）", () => {
	const cards = [
		{ title: "搁置", fields: { "tidme.priority": "90", due: PAST(), "tidme.kind": "item", "tidme.suspended": "yes" } },
		{ title: "已读完", fields: { "tidme.priority": "90", due: PAST(), "tidme.kind": "item", "tidme.done": "yes" } },
		{ title: "已忽略", fields: { "tidme.priority": "90", due: PAST(), "tidme.kind": "item", "tidme.ignored": "yes" } },
		{ title: "阅读卡", fields: { "tidme.priority": "90", due: PAST(), "tidme.kind": "topic" } },
		{ title: "可顺延", fields: { "tidme.priority": "90", due: PAST(), "tidme.kind": "item" } }
	];
	const r = sched.autoPostpone(cards, { maxPriority: 60, keepTop: 0 });
	assert.deepEqual(r.patches.map((p) => p.title), ["可顺延", "阅读卡"], "item 加权 -15 排前，topic 阅读卡同样顺延");
	for (const p of r.patches) {
		assert.ok(sched.parseTwDate(p.fields.due).getTime() > Date.now(), `${p.title} 被顺延到未来`);
	}
	const topicPatch = r.patches.find((p) => p.title === "阅读卡");
	assert.ok(topicPatch.fields.scheduled_days, "topic 走 A-Factor 展期（写 scheduled_days）");
});

test("doneCard/restoreCard: Done 语义与可逆恢复（kind 决定归属，无标签）", () => {
	const done = sched.doneCard({ title: "节", "tidme.kind": "topic", state: "0", "tidme.suspended": "yes" });
	assert.equal(done["tidme.done"], "yes", "Done 置 tidme.done");
	assert.equal(done["tidme.kind"], "topic", "保留 kind");
	assert.ok(sched.isCardDone(done), "doneCard 后 isCardDone 应返回 true");
	// 恢复：清除 done/ignored/suspended，kind 决定归属（无需补标签）
	const resumed = sched.restoreCard({ ...done });
	assert.equal(resumed["tidme.done"], undefined, "恢复删除 tidme.done");
	assert.equal(resumed["tidme.ignored"], undefined, "恢复删除 tidme.ignored");
	assert.equal(resumed["tidme.suspended"], undefined, "恢复删除 tidme.suspended");
	assert.equal(resumed["tidme.kind"], "topic", "kind 保留（topic 回阅读流）");
	assert.ok(!sched.isCardDone(resumed), "restoreCard 后 isCardDone 应返回 false");
	// item 恢复同样只清标记
	const resumeCloze = sched.restoreCard({ ...done, "tidme.kind": "item" });
	assert.equal(resumeCloze["tidme.kind"], "item", "item 保留（回复习流）");
	assert.ok(!sched.isCardDone(resumeCloze));
});

test("ITEM_FILTER: 双轨分流（topic 出、item 进）", () => {
	const f = sched.ITEM_FILTER;
	assert.ok(f.includes("[tidme.kind[item]]"), "含 item 大类");
	assert.ok(!f.includes("topic"), "不含 topic（阅读流）");
	assert.ok(!f.includes("section") && !f.includes("extract") && !f.includes("cloze") && !f.includes("qa"), "不按子类型过滤");
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
