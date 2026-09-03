/*
queue.test.mjs — 全局学习队列（deck-engine composeGlobalLearningQueue）单元测试（node:test）

覆盖：
- 默认（无 opts）：纯知识卡队列 —— 阅读材料（topic）不混入学习流（修复：待读阅读卡
  全部"逾期"混入 → 每 4 张词卡打断一次；阅读走阅读列表/文档页）
- topics:true + interleaved：item 队列与 topic 阅读流 4:1 交错
- topics:true + strict：宏观三段式 —— 到期 Items → 到期/逾期 Topics → 新 Pending
- 逾期 topic 不再被漏掉（修复：旧过滤仅 days:due[0] 匹配当天，逾期积压不入队）
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

let wiki;
let deckEngine;
test.before(() => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-queue-"));
	const tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray(plugins);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	wiki = tw.wiki;
	deckEngine = tw.modules.execute("$:/plugins/keepone/tidme/core/deck-engine.js");
});

function twDate(d) {
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
}

function mkCard(title, opts = {}) {
	const now = new Date();
	wiki.addTiddler({
		title,
		"tidme.kind": opts.kind || "item",
		"tidme.subkind": opts.subkind || (opts.kind === "topic" ? "section" : "qa"),
		"tidme.priority": String(opts.priority ?? 50),
		"tidme.doc": opts.doc || "dtest",
		state: opts.state ?? "0",
		...(opts.due !== undefined ? { due: twDate(opts.due) } : {}),
		reps: "0", lapses: "0", stability: "0", difficulty: "0",
		elapsed_days: "0", scheduled_days: "0", last_review: twDate(now),
		caption: title, text: "内容"
	});
}

test.beforeEach(() => {
	// 清空非系统 tiddler（保留插件与默认牌组）
	const all = wiki.filterTiddlers("[!is[system]]");
	for (const t of all) wiki.deleteTiddler(t);
});

test("默认（无 opts）：纯知识卡队列 —— topic 阅读材料不入队", () => {
	mkCard("item到期", { kind: "item", state: "2", due: new Date(Date.now() - 3600000) });
	mkCard("item新", { kind: "item" });
	mkCard("topic逾期", { kind: "topic", due: new Date(Date.now() - 86400000 * 3) });
	mkCard("topic无due", { kind: "topic", due: undefined });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f));
	assert.ok(q.includes("item到期"), "到期 item 入队");
	assert.ok(q.includes("item新"), "新 item 入队");
	assert.ok(!q.includes("topic逾期"), "topic 默认不入队（纯知识卡复习流）");
	assert.ok(!q.includes("topic无due"), "无 due topic 默认不入队");
});

test("topics:true + interleaved：item 与 topic 阅读流 4:1 交错，逾期 topic 也入队", () => {
	mkCard("item到期", { kind: "item", state: "2", due: new Date(Date.now() - 3600000) });
	mkCard("item新", { kind: "item" });
	mkCard("topic逾期", { kind: "topic", due: new Date(Date.now() - 86400000 * 3) });
	mkCard("topic无due", { kind: "topic", due: undefined });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), { topics: true });
	assert.ok(q.includes("topic逾期"), "逾期 topic 应入队（修复漏排）");
	assert.ok(q.includes("topic无due"), "无 due topic 应入队（Pending）");
	// 4:1 交错：2 item 在前，随后交替出现 topic
	const firstTwo = q.slice(0, 2);
	assert.deepStrictEqual([...firstTwo].sort(), ["item到期", "item新"], "前两卡为 item");
	const topicIdx = q.map((t, i) => [t, i]).filter(([t]) => String(t).startsWith("topic")).map(([, i]) => i);
	assert.ok(topicIdx.length === 2 && topicIdx[0] < topicIdx[1], "topic 穿插出现");
});

test("strict：宏观三段式（到期 Items → 到期 Topics → 新 Pending）", () => {
	mkCard("item到期", { kind: "item", state: "2", due: new Date(Date.now() - 3600000) });
	mkCard("item新", { kind: "item" });
	mkCard("topic到期", { kind: "topic", due: new Date(Date.now() - 7200000) });
	mkCard("topic无due", { kind: "topic", due: undefined });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), { mode: "strict", topics: true });
	// 注：deck-engine 经 TW vm 执行返回跨 realm 数组，deepStrictEqual 校验原型会失败 → 展开到主 realm 再比
	assert.deepStrictEqual([...q], ["item到期", "topic到期", "item新", "topic无due"], "三段式顺序：到期卡 → 到期阅读 → 新 Pending");
});

test("strict：新 item（state 0）落在 Pending 段（到期卡之后）", () => {
	mkCard("item新", { kind: "item" });
	mkCard("item到期", { kind: "item", state: "2", due: new Date(Date.now() - 3600000) });
	mkCard("topic到期", { kind: "topic", due: new Date(Date.now() - 7200000) });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), { mode: "strict", topics: true });
	assert.equal(q[0], "item到期", "到期卡优先");
	assert.ok(q.indexOf("item新") > q.indexOf("item到期"), "新卡在到期卡之后");
	assert.ok(q.indexOf("item新") > q.indexOf("topic到期"), "新卡在到期阅读之后");
});

test("调度: 评分/顺延后未来排期（+5天）的卡不提前重放（修复：<now> 格式错误导致 due<now 恒真）", () => {
	// 昨天评分 Good → due=+5 天的 item（state 2）与 topic
	mkCard("item5天后", { kind: "item", state: "2", due: new Date(Date.now() + 5 * 86400000) });
	mkCard("topic5天后", { kind: "topic", due: new Date(Date.now() + 5 * 86400000) });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f));
	assert.ok(!q.includes("item5天后"), "未来排期的 item 不得出现在全局队列");
	assert.ok(!q.includes("topic5天后"), "未来排期的 topic 不得出现在全局队列（顺延/评分后不被提前重放）");

	// strict 模式同样排除
	const qs = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), { mode: "strict" });
	assert.ok(!qs.includes("item5天后"), "strict: 未来排期 item 不入队");
	assert.ok(!qs.includes("topic5天后"), "strict: 未来排期 topic 不入队");
});

test("调度: 学习步（state 1/3）due 未到不入 learn 队列", () => {
	mkCard("学习未到期", { kind: "item", state: "1", due: new Date(Date.now() + 3600000) });
	mkCard("学习已到期", { kind: "item", state: "1", due: new Date(Date.now() - 3600000) });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f));
	assert.ok(!q.includes("学习未到期"), "学习步间隔未到不得入队（compare:date 依赖正确 UTC 格式）");
	assert.ok(q.includes("学习已到期"), "学习步已到期入队");
});

test("调度: deck-engine 过滤器不包含损坏的 <now> 格式（回归防护）", () => {
	const src = fs.readFileSync(path.resolve(here, "../src/tidme/core/deck-engine.ts"), "utf8");
	assert.ok(!src.includes("[UTC]YYYY0MMDD0hh0mm0ss0XXX"), "不得使用损坏的日期格式（被 parse 为未来日期）");
	assert.ok(src.includes("[UTC]YYYY0MM0DD0hh0mm0ssXXX"), "使用 TW 核心 UTC 格式");
});
