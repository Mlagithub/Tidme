/*
review-filters.test.mjs — 复习流三个 filter operator 行为测试（bin 产物）

- fsrs：core/fsrs.repeat 的过滤器包装（对 tiddler 求值出四档 JSON）
- schedulablenext：学习会话推进（M1 死循环修复的收敛点，此前无回归护栏）
- sortrandom：随机排序（有界性：输出必为输入的排列）
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPlugin } from "../helpers/tw-boot.mjs";
import { twDate, PAST, FUTURE } from "../helpers/tw-date.mjs";

const { wiki, mod, reset } = bootPlugin({ prefix: "tidme-filters-" });

function mkCard(title, { due = PAST(), state = "2" } = {}) {
	wiki.addTiddler({
		title, "tidme.kind": "item", "tidme.subkind": "qa", state, due,
		reps: "1", lapses: "0", stability: "1", difficulty: "5",
		elapsed_days: "1", scheduled_days: "1", last_review: twDate()
	});
}

test("fsrs 过滤器: 对 tiddler 求值出四档 JSON（含 Rating/State/P/Cards）", () => {
	reset();
	mkCard("过滤器评分卡");
	const out = wiki.filterTiddlers("[[过滤器评分卡]fsrs[]]");
	assert.equal(out.length, 1);
	const r = JSON.parse(out[0]);
	for (const k of ["Rating", "State", "P", "Cards"]) assert.ok(k in r, `输出含 ${k}`);
	assert.equal(Object.keys(r.Cards).length, 4, "四档");
	assert.ok(/^\d{17}$/.test(r.Cards[3].card.due), "due 为 17 位 TW 串");
});

test("fsrs 过滤器: 非法 p 操作数回退默认参数（P.w=17）", () => {
	reset();
	mkCard("参数回退卡");
	const out = wiki.filterTiddlers("[[参数回退卡]fsrs[not-json]]");
	const r = JSON.parse(out[0]);
	assert.equal(r.P.w.length, 17, "非法 p → 默认参数");
});

test("schedulablenext: 取当前卡之后第一张可调度卡（跳过已出队与未到期）", () => {
	reset();
	mkCard("会话卡A", { due: PAST() });
	mkCard("会话卡B", { due: FUTURE() }); // 未到期 → 不可调度
	mkCard("会话卡C", { due: PAST() });
	mkCard("会话卡D", { due: PAST() });
	wiki.addTiddler({ title: "会话卡B", "tidme.done": "yes" }); // 出队 → 不可调度
	wiki.addTiddler({ title: "会话卡D", "tidme.ignored": "yes" });

	// 输入 = 学习会话候选列表；参数 = 当前卡
	// 注意：filterTiddlers 结果来自 TW vm 沙箱 realm，先展开再比较（test/README.md §断言偏好）
	const next = wiki.filterTiddlers("[[会话卡A]][[会话卡B]][[会话卡C]][[会话卡D]] +[schedulablenext[会话卡A]]");
	assert.deepEqual([...next], ["会话卡C"], "A 之后跳过未到期的 B 与已忽略的 D → C");
});

test("schedulablenext: 当前卡不在列表 → 从头找第一张可调度卡", () => {
	reset();
	mkCard("会话卡A", { due: PAST() });
	mkCard("会话卡B", { due: PAST() });
	const next = wiki.filterTiddlers("[[会话卡A]][[会话卡B]] +[schedulablenext[不在列表的卡]]");
	assert.deepEqual([...next], ["会话卡A"], "cur 不在序列 → 从头找");
});

test("schedulablenext: 其后无可调度卡 → 空结果", () => {
	reset();
	mkCard("会话卡A", { due: PAST() });
	mkCard("会话卡B", { due: FUTURE() });
	const next = wiki.filterTiddlers("[[会话卡A]][[会话卡B]] +[schedulablenext[会话卡A]]");
	assert.deepEqual([...next], [], "A 之后全部不可调度 → 空");
});

test("sortrandom: 输出是输入的随机排列（有界、不增删）", () => {
	const out = wiki.filterTiddlers("[[甲]][[乙]][[丙]][[丁]] +[sortrandom[]]");
	assert.equal(out.length, 4, "数量不变");
	assert.deepEqual([...out].sort(), ["甲", "乙", "丙", "丁"].sort(), "成员不变");
});

test("sortrandom: 空输入 → 空输出", () => {
	const out = wiki.filterTiddlers("+[sortrandom[]]");
	assert.deepEqual([...out], []);
});
