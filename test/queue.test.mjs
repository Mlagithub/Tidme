/*
queue.test.mjs — 全局学习队列（deck-engine composeGlobalLearningQueue）单元测试（node:test）

覆盖：
- interleaved（默认）：item 队列与 topic 阅读流 4:1 交错
- strict：宏观三段式 —— 到期 Items → 到期/逾期 Topics → 新 Pending（新 item + 无 due topic）
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
const pluginDir = path.resolve(here, "../out-m2");
const plugins = ["$__plugins_keepone_tidme", "$__tidme_languages_zh-Hans"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
if (!plugins.length) throw new Error("缺少 out-m2 产物，先运行 node tools/build-plugins.cjs");

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

test("interleaved（默认）：item 队列与 topic 阅读流 4:1 交错，逾期 topic 也入队", () => {
	mkCard("item到期", { kind: "item", state: "2", due: new Date(Date.now() - 3600000) });
	mkCard("item新", { kind: "item" });
	mkCard("topic逾期", { kind: "topic", due: new Date(Date.now() - 86400000 * 3) });
	mkCard("topic无due", { kind: "topic", due: undefined });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f));
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

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), { mode: "strict" });
	// 注：deck-engine 经 TW vm 执行返回跨 realm 数组，deepStrictEqual 校验原型会失败 → 展开到主 realm 再比
	assert.deepStrictEqual([...q], ["item到期", "topic到期", "item新", "topic无due"], "三段式顺序：到期卡 → 到期阅读 → 新 Pending");
});

test("strict：新 item（state 0）落在 Pending 段（到期卡之后）", () => {
	mkCard("item新", { kind: "item" });
	mkCard("item到期", { kind: "item", state: "2", due: new Date(Date.now() - 3600000) });
	mkCard("topic到期", { kind: "topic", due: new Date(Date.now() - 7200000) });

	const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), { mode: "strict" });
	assert.equal(q[0], "item到期", "到期卡优先");
	assert.ok(q.indexOf("item新") > q.indexOf("item到期"), "新卡在到期卡之后");
	assert.ok(q.indexOf("item新") > q.indexOf("topic到期"), "新卡在到期阅读之后");
});
