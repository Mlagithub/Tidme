/*
fsrs.test.mjs — FSRS 复习服务（core/fsrs）四档评分语义矩阵

此前仅靠 study-flow 全流程兜底，无粒度断言。本文件显式锁定：
- 新卡/复习卡两条分支的触发条件（缺任一 Card 字段 → 按新卡）
- 四档评分的间隔序与状态迁移（Again→Relearning、Good→Review）
- p 参数校验回退（与原始 fsrs4tw 过滤器行为一致）
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPlugin } from "../helpers/tw-boot.mjs";
import { parseTwDate } from "../helpers/tw-date.mjs";

const { mod } = bootPlugin({ prefix: "tidme-fsrs-" });
const fsrs = mod("core/fsrs.js");
const NOW = new Date("2026-09-06T08:00:00Z");

/** 已复习卡（state=Review，36 天前到期，reps=2）——含全部 9 个 Card 字段以触发复习分支 */
function reviewedCard(extra = {}) {
	return {
		due: "20260801080000000", stability: "2.5", difficulty: "5",
		elapsed_days: "3", scheduled_days: "3", reps: "2", lapses: "0",
		state: "2", last_review: "20260801080000000",
		...extra
	};
}

const parse = (r) => JSON.parse(fsrs.repeat(r, { now: NOW }));
const isTwDate = (s) => /^\d{17}$/.test(String(s));

test("repeat: 新卡四档都产出合法结果（17 位 due、reps=1）", () => {
	const r = parse({});
	for (const g of [1, 2, 3, 4]) {
		const card = r.Cards[g].card;
		assert.ok(isTwDate(card.due), `评分 ${g} due 应为 17 位 TW 串`);
		assert.equal(card.reps, 1, `评分 ${g} reps 从 0 → 1`);
		assert.equal(card.lapses, 0);
	}
});

test("repeat: 新卡 Again/Hard/Good 进入 Learning，Easy 直接毕业 Review", () => {
	const r = parse({});
	assert.equal(r.Cards[1].card.state, 1, "Again → Learning");
	assert.equal(r.Cards[2].card.state, 1, "Hard → Learning");
	assert.equal(r.Cards[3].card.state, 1, "Good → Learning");
	assert.equal(r.Cards[4].card.state, 2, "Easy → 直接毕业 Review");
});

test("repeat: 新卡到期时间随评分递增（Again ≤ Hard ≤ Good ≤ Easy）", () => {
	const { Cards } = parse({});
	const dueOf = (g) => Number(Cards[g].card.due);
	assert.ok(dueOf(1) <= dueOf(2) && dueOf(2) < dueOf(3) && dueOf(3) < dueOf(4), "四档 due 应单调递增");
	assert.ok(dueOf(4) - dueOf(1) > 24 * 3600 * 1000, "Easy 与 Again 差距应明显（天级）");
});

test("repeat: 遗忘（Again）→ Relearning 态、lapses 递增、重学间隔分钟级", () => {
	const r = parse(reviewedCard());
	assert.equal(r.Cards[1].card.state, 3, "复习卡 Again → Relearning");
	assert.equal(r.Cards[1].card.lapses, 1, "lapses 0 → 1");
	const due = parseTwDate(r.Cards[1].card.due);
	assert.ok(due.getTime() <= NOW.getTime() + 3600 * 1000, "重学间隔很短（分钟级）");
});

test("repeat: 及格（Good）→ Review 态、stability 增长、due 推进到未来", () => {
	const r = parse(reviewedCard());
	const card = r.Cards[3].card;
	assert.equal(card.state, 2, "复习卡 Good → Review");
	assert.equal(card.reps, 3, "reps 2 → 3");
	assert.equal(card.lapses, 0, "及格不增 lapses");
	assert.ok(card.stability > 2.5, "stability 增长");
	assert.ok(parseTwDate(card.due).getTime() > NOW.getTime(), "due 推进到未来");
});

test("repeat: 缺任一 FSRS 字段的卡按新卡处理（与原始过滤器一致）", () => {
	const fresh = parse({});
	const partial = parse({ due: "20260801080000000", stability: "2.5" }); // 缺 reps/state 等
	assert.deepEqual(partial.Cards[3].card, fresh.Cards[3].card, "字段不全 → 视为新卡");
});

test("repeat: p 参数校验——w 长度不符或缺 key 回退默认参数", () => {
	const rBadW = JSON.parse(fsrs.repeat({}, { now: NOW, p: JSON.stringify({ w: [1, 2, 3], request_retention: 0.9, maximum_interval: 365 }) }));
	assert.equal(rBadW.P.w.length, 17, "w 长度不符 → 回退默认 17 项");
	const rMissing = JSON.parse(fsrs.repeat({}, { now: NOW, p: JSON.stringify({ w: new Array(17).fill(0.5) }) }));
	assert.equal(rMissing.P.w.length, 17, "缺 request_retention/maximum_interval → 整体忽略");
	const rOk = JSON.parse(fsrs.repeat({}, { now: NOW, p: JSON.stringify({ w: new Array(17).fill(0.5), request_retention: 0.9, maximum_interval: 365 }) }));
	assert.deepEqual(rOk.P.w, new Array(17).fill(0.5), "合法参数生效");
	assert.equal(rOk.P.request_retention, 0.9);
});

test("defaultParams: 返回库默认（w 17 项 + request_retention + maximum_interval）", () => {
	const p = fsrs.defaultParams();
	assert.equal(p.w.length, 17);
	assert.ok(p.request_retention > 0 && p.request_retention <= 1);
	assert.ok(p.maximum_interval >= 365);
});
