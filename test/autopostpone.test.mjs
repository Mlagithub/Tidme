/*
autopostpone.test.mjs — 自动顺延调度器（startup 模块）端到端测试（node:test）

覆盖：
- 配置 enable=true 时，启动即自动顺延低优先级逾期卡（浏览器/Node 通用）
- 默认配置 enable=false（影子 tiddler）时不自动改数据
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

function twDate(d) {
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
}

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
		due: twDate(new Date(Date.now() - 86400000 * 5)),
		reps: "1", lapses: "0", stability: "1", difficulty: "5",
		elapsed_days: "5", scheduled_days: "5", last_review: twDate(now),
		caption: "逾期低优卡", text: "内容"
	};
}

test("auto-postpone：enable=true 时启动自动顺延低优先级逾期卡", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-ap-"));
	const tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray([
		...plugins,
		overdueCard(),
		{ title: "$:/config/Tidme/AutoPostpone", text: JSON.stringify({ enable: true, maxPriority: 60, postponeDays: 7, keepTop: 0 }) }
	]);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	const wiki = tw.wiki;
	const f = wiki.getTiddler("逾期低优卡").fields;
	assert.ok(new Date(String(f.due)).getTime() > Date.now() || /^\d{17}$/.test(String(f.due)), "启动后 due 应被顺延到未来");
	// TW 17 位 UTC 串手工校验
	const due = new Date(Date.UTC(
		Number(String(f.due).slice(0, 4)), Number(String(f.due).slice(4, 6)) - 1, Number(String(f.due).slice(6, 8)),
		Number(String(f.due).slice(8, 10)), Number(String(f.due).slice(10, 12)), Number(String(f.due).slice(12, 14))
	));
	assert.ok(due.getTime() > Date.now(), `启动自动顺延生效（due=${f.due}）`);
});

test("auto-postpone：默认 enable=false 不自动改数据", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-ap-"));
	const tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray([...plugins, overdueCard()]);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	const wiki = tw.wiki;
	const f = wiki.getTiddler("逾期低优卡").fields;
	// 影子配置 enable=false → due 保持 5 天前的逾期
	const due = new Date(Date.UTC(
		Number(String(f.due).slice(0, 4)), Number(String(f.due).slice(4, 6)) - 1, Number(String(f.due).slice(6, 8)),
		Number(String(f.due).slice(8, 10)), Number(String(f.due).slice(10, 12)), Number(String(f.due).slice(12, 14))
	));
	assert.ok(due.getTime() < Date.now(), "默认关闭时不自动顺延（due 保持逾期）");
});
