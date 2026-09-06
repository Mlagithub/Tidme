/*
autopostpone.test.mjs — 自动顺延调度器（startup 模块）端到端测试（node:test）

覆盖：
- 配置 enable=true 时，启动即自动顺延低优先级逾期卡（浏览器/Node 通用）
- 默认配置 enable=false（影子 tiddler）时不自动改数据
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPlugin } from "../helpers/tw-boot.mjs";
import { twDate, T } from "../helpers/tw-date.mjs";

/** 造一张逾期低优先级卡（item，priority 90） */
function overdueCard() {
	const now = new Date();
	return {
		title: "逾期低优卡",
		"tidme.kind": "item",
		"tidme.subkind": "qa",
		"tidme.priority": "90",
		"tidme.doc": "dauto",
		state: "2",
		due: T(-120),
		reps: "1", lapses: "0", stability: "1", difficulty: "5",
		elapsed_days: "5", scheduled_days: "5", last_review: twDate(now),
		caption: "逾期低优卡", text: "内容"
	};
}

/** 校验 17 位 TW 日期串是否在未来/过去 */
function isFuture(due) {
	return new Date(Date.UTC(
		Number(String(due).slice(0, 4)), Number(String(due).slice(4, 6)) - 1, Number(String(due).slice(6, 8)),
		Number(String(due).slice(8, 10)), Number(String(due).slice(10, 12)), Number(String(due).slice(12, 14))
	)).getTime() > Date.now();
}

test("auto-postpone：enable=true 时启动自动顺延低优先级逾期卡", () => {
	const { wiki } = bootPlugin({
		prefix: "tidme-ap-",
		preload: [
			overdueCard(),
			{ title: "$:/config/Tidme/AutoPostpone", text: JSON.stringify({ enable: true, maxPriority: 60, postponeDays: 7, keepTop: 0 }) }
		]
	});
	const f = wiki.getTiddler("逾期低优卡").fields;
	assert.ok(/^\d{17}$/.test(String(f.due)), "due 应为 17 位 TW 日期串");
	assert.ok(isFuture(f.due), `启动自动顺延生效（due=${f.due}）`);
});

test("auto-postpone：默认 enable=false 不自动改数据", () => {
	const { wiki } = bootPlugin({ prefix: "tidme-ap-", preload: [overdueCard()] });
	const f = wiki.getTiddler("逾期低优卡").fields;
	// 影子配置 enable=false → due 保持 5 天前的逾期
	assert.ok(!isFuture(f.due), "默认关闭时不自动顺延（due 保持逾期）");
});
