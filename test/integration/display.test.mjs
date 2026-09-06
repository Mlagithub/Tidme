/*
display.test.mjs — 展示层纯函数（core/display）行为测试（bin 产物）

字段 → 可读文本的唯一出口；徽章/状态标签的优先级语义（出队 > 学习态 > 到期态）在此锁定。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPlugin } from "../helpers/tw-boot.mjs";
import { PAST, FUTURE } from "../helpers/tw-date.mjs";

const { wiki, mod } = bootPlugin({ prefix: "tidme-display-" });
const display = mod("core/display.js");

test("badgeOf: 出队/学习/到期/新卡的徽章优先级", () => {
	// 返回对象来自 TW vm 沙箱 realm，逐字段断言（勿 deepEqual，见 test/README.md）
	let b = display.badgeOf({ "tidme.suspended": "yes" });
	assert.equal(b.text, "⏸", "搁置最优先");
	assert.equal(b.cls, "tm-badge-suspended");
	b = display.badgeOf({ "tidme.done": "yes" });
	assert.equal(b.text, "✓");
	assert.equal(b.cls, "tm-badge-done");
	assert.equal(display.badgeOf({ state: "1" }).text, "学");
	assert.equal(display.badgeOf({ state: "3" }).text, "学", "Relearning 也算学习态");
	assert.equal(display.badgeOf({ state: "2", due: PAST() }).text, "逾", "state2 已过期 → 逾");
	assert.equal(display.badgeOf({ state: "2", due: FUTURE() }).text, "到", "state2 未到期 → 到");
	assert.equal(display.badgeOf({}).text, "新", "无 state → 新卡");
});

test("stateLabel: 出队语义优先于到期态（done 卡不得显示「到期」）", () => {
	assert.equal(display.stateLabel({ "tidme.done": "yes", state: "2", due: PAST() }), "已读", "回归：曾误显示「已逾期」");
	assert.equal(display.stateLabel({ "tidme.suspended": "yes" }), "搁置");
	assert.equal(display.stateLabel({ state: "2", due: PAST() }), "已逾期");
	assert.equal(display.stateLabel({ state: "2", due: FUTURE() }), "到期");
	assert.equal(display.stateLabel({ state: "1" }), "学习中");
	assert.equal(display.stateLabel({}), "新卡");
});

test("dueLabel/intervalLabel: 非 due 态与缺字段显示 —", () => {
	assert.equal(display.dueLabel({ state: "2", due: "20261231000000000" }), "2026-12-31");
	assert.equal(display.dueLabel({ state: "0" }), "—", "新卡无 due");
	// 注：state=2 且缺 due 时 parseTwDate 兜底为当前时刻（schema.ts fallback），显示今天日期——
	// 实际数据中 state2 必写 due，此边缘不单独断言
	assert.equal(display.intervalLabel({ scheduled_days: "7.4" }), "7天", "四舍五入");
	assert.equal(display.intervalLabel({ scheduled_days: "0" }), "—");
	assert.equal(display.repsLabel({}), "—");
	assert.equal(display.lapsesLabel({ lapses: "2" }), "2");
	assert.equal(display.diffLabel({ difficulty: "0.456" }), "46%");
	assert.equal(display.diffLabel({}), "—");
	assert.equal(display.dateLabel(undefined), "—");
});

test("displayTitle: caption > breadcrumb 末段 > title 末段", () => {
	assert.equal(display.displayTitle({ caption: "自定义名" }, "Tidme/Books/x"), "自定义名");
	assert.equal(
		display.displayTitle({ "tidme.breadcrumb": "书 › 第一章 › 第二节" }, "Tidme/Books/x/s1"),
		"第二节",
		"无 caption 用面包屑末段"
	);
	assert.equal(display.displayTitle({}, "Tidme/Books/书/s99"), "s99", "兜底 title 末段");
	assert.equal(display.displayTitle(null, "T/单段"), "单段");
});

test("displayTitle: 空 caption 回落到下一优先级", () => {
	assert.equal(
		display.displayTitle({ caption: "  ", "tidme.breadcrumb": "书 › 节" }, "Tidme/Books/x"),
		"节",
		"空白 caption 视为缺失"
	);
});
