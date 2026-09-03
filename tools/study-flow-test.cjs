/*
study-flow-test.cjs — 无头验证 FSRS 学习流转（不污染仓库 wiki）

在临时空目录启动 TiddlyWiki，预载 bin 编译插件，合成 ? 卡，
验证 startstudy → grade → 队列推进 的完整循环（FSRS 复习回归测试）。

用法：
  node tools/build-plugins.cjs && node tools/study-flow-test.cjs
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const TiddlyWiki = require("tiddlywiki");

const pluginDir = path.resolve(__dirname, "../bin");
const plugins = ["$__plugins_keepone_tidme", "$__tidme_languages_zh-Hans"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
if (!plugins.length) {
	console.error("缺少 bin 插件产物，先运行: node tools/build-plugins.cjs");
	process.exit(1);
}

// 临时空目录启动（避免 filesystem syncer 写回仓库 wiki）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-study-"));
const tw = TiddlyWiki.TiddlyWiki();
tw.preloadTiddlerArray(plugins);
tw.boot.argv = [tmp];
tw.boot.boot();
const wiki = tw.wiki;

// 合成测试卡（不依赖手册狗粮卡）；kind=item + FSRS 字段 → 默认牌组新卡队列
const NOW_TW = "20260824000000000";
wiki.addTiddler({ title: "测试卡A", "tidme.kind": "item", "tidme.subkind": "qa", caption: "A?", text: "A答案", state: "0", due: NOW_TW, reps: "0", lapses: "0", stability: "0", difficulty: "0", elapsed_days: "0", scheduled_days: "0", last_review: NOW_TW });
wiki.addTiddler({ title: "测试卡B", "tidme.kind": "item", "tidme.subkind": "qa", caption: "B?", text: "B答案", state: "0", due: NOW_TW, reps: "0", lapses: "0", stability: "0", difficulty: "0", elapsed_days: "0", scheduled_days: "0", last_review: NOW_TW });

const DECK = "$:/Deck/default";

function fakeElement(tag = "div") {
	return {
		nodeType: 1, tagName: String(tag).toUpperCase(), childNodes: [], children: [],
		style: {}, attributes: {}, parentNode: null,
		setAttribute(k, v) { this.attributes[k] = v; },
		getAttribute(k) { return this.attributes[k]; },
		appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		insertBefore(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); this.children = this.children.filter((x) => x !== c); return c; },
		addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
		textContent: "", innerHTML: "", classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
		hasAttribute() { return false; }, ownerDocument: null,
		querySelector() { return null; }, querySelectorAll() { return []; },
		setAttributeNS() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
		focus() {}, scrollIntoView() {}, replaceChildren() {}
	};
}
const fakeDocument = {
	createElement: (t) => fakeElement(t),
	createElementNS: (ns, t) => fakeElement(t),
	createTextNode: () => fakeElement("#text"),
	body: fakeElement("body"), title: "fake",
	querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
	createRange: () => ({ setStart() {}, setEnd() {}, surroundContents() {} }),
	defaultView: null
};

/**
 * 创建带变量的 widget 上下文，供 filterTiddlers(filter, widget) 求值。
 * 注：makeWidget 的 variables 选项包装成 let-widget（子节点），root 的 getVariable 看不到；
 * 过滤器求值须用 parent 链（变量设在 parent）。
 */
function makeVarsWidget(variables) {
	const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
	for (const [k, v] of Object.entries(variables)) parent.setVariable(k, v);
	return wiki.makeWidget({ tree: [] }, { parentWidget: parent, document: fakeDocument });
}

/** 渲染 wikitext 动作并触发执行（makeWidget 接收 parser；动作经 invokeActions 触发） */
function runActions(text, variables) {
	const parser = wiki.parseText("text/vnd.tiddlywiki", text, {});
	const widgetNode = wiki.makeWidget(parser, { variables, document: fakeDocument });
	widgetNode.render(fakeElement(), null);
	widgetNode.invokeActions();
}

function startstudy() {
	// 复刻 core deck-engine（src/tidme/core/deck-engine.ts，composeDeckFilters）的过滤器组合。
	// 无头环境不依赖 TW 运行时，故在测试内联等价逻辑；core 本体的组合由 test/core.test.mjs 覆盖。
	const deckFields = wiki.getTiddler(DECK).fields;
	const filter_learn = `[subfilter{${DECK}!!card}!subfilter{${DECK}!!card_exclude}subfilter{${DECK}!!state_learn}sort[due]]`;
	const filter_due = `[subfilter{${DECK}!!card}!subfilter{${DECK}!!card_exclude}subfilter{${DECK}!!state_due}subfilter{${DECK}!!order_due}]`;
	const filter_new = `[subfilter{${DECK}!!card}!subfilter{${DECK}!!card_exclude}subfilter{${DECK}!!state_new}subfilter{${DECK}!!order_new}]`;
	const filter_unfold = `[subfilter{${DECK}!!card_unfold}]`;
	const filter_random = `[subfilter<filter_due>] [subfilter<filter_new>] +[sortrandom[]]`;
	const dueNew = `${filter_learn} ${filter_due} ${filter_new}`;
	const newDue = `${filter_learn} ${filter_new} ${filter_due}`;
	const random = `${filter_learn} [subfilter<filter_random>]`;
	const order = deckFields.order || "due-new";
	const filter_queue = order === "new-due" ? newDue : order === "random" ? random : dueNew;
	runActions(wiki.getTiddlerText("$:/plugins/keepone/tidme/review/buttons/action/startstudy"), {
		deckTiddler: DECK, currentTiddler: DECK, filter_queue, filter_unfold
	});
	return (wiki.getTiddler(DECK + "/study") || { fields: { list: [] } }).fields.list;
}

function grade(studyTiddler, rating) {
	const deckFields = wiki.getTiddler(DECK).fields;
	const varWidget = makeVarsWidget({ studyTiddler, p: deckFields.p });
	const cardsJson = wiki.filterTiddlers("[<studyTiddler>fsrs<p>]", varWidget)[0];
	if (!cardsJson) throw new Error(`fsrs 过滤器无输出: ${studyTiddler}`);
	runActions(wiki.getTiddlerText("$:/plugins/keepone/tidme/review/buttons/action/repeat"), {
		studyTiddler, rating, cards_json: cardsJson, deckTiddler: DECK,
		leech_threshold: String(deckFields.leech_threshold || 8)
	});
	const f = wiki.getTiddler(studyTiddler).fields;
	return { state: f.state, due: f.due };
}

console.log("=== 学习流转测试 ===");
let fail = 0;
const seen = [];
for (let round = 1; round <= 6; round++) {
	const list = startstudy();
	const card = Array.isArray(list) ? list[0] : list;
	if (!card) { console.log(`第${round}轮 队列已空 ✅`); break; }
	try {
		const r = grade(card, "Good");
		const ok = r.state !== undefined && r.state !== "0";
		seen.push({ title: String(card), state: r.state });
		console.log(`第${round}轮 → ${String(card).slice(0, 40)} | state=${r.state} due=${r.due} ${ok ? "✅" : "❌ 评分未写入"}`);
		if (!ok) fail++;
	} catch (e) {
		console.log(`第${round}轮 ${card} 评分异常: ${String(e.message || e)}`);
		fail++;
	}
}
// FSRS 学习中（state 1/3）的卡会在学习步复现一次（新卡 Good → Learning → Review）；
// 正确的不变量：进入复习（state 2）后的卡不应再次出现。
const byTitle = {};
let advanced = true;
for (const e of seen) {
	if (byTitle[e.title] === "2") { advanced = false; break; }
	byTitle[e.title] = e.state;
}
console.log("出现过的卡片:", JSON.stringify(seen.map((e) => e.title)));
console.log(advanced ? "✅ 队列推进正常（学习中卡可复现，复习卡不再重复）" : "⚠ 已进入复习的卡重复出现（队列未推进）");
if (!advanced) fail++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} 项未通过` : "\n全部通过 ✅");
process.exit(fail ? 1 : 0);
