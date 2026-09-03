/* repro-rating-v3.cjs — 正确姿势：渲染 $:/core/ui/ViewTemplate 并复刻 tiddler.tid 的变量环境 */
const fs = require("fs");
const path = require("path");
const TiddlyWiki = require("tiddlywiki");

const pluginDir = path.resolve(__dirname, "../bin");
function boot(withImport) {
	const tw = TiddlyWiki.TiddlyWiki();
	const loads = [];
	for (const n of ["$__plugins_keepone_tidme", "$__tidme_languages_zh-Hans"]) {
		const f = path.join(pluginDir, n + ".json");
		if ((withImport || n.includes("review")) && fs.existsSync(f)) {
			loads.push(JSON.parse(fs.readFileSync(f, "utf8")));
		}
	}
	tw.preloadTiddlerArray(loads);
	tw.boot.argv = [path.resolve(__dirname, "../wiki/manual/index")];
	tw.boot.boot();
	return tw.wiki;
}

function fakeEl() {
	return { style: {}, childNodes: [], setAttribute() {}, getAttribute() { return ""; }, appendChild(c) { this.childNodes.push(c); }, insertBefore(c) { this.childNodes.push(c); }, addEventListener() {}, dispatchEvent() {}, textContent: "", classList: { add() {}, remove() {} }, hasAttribute() { return false }, ownerDocument: null };
}
// 模拟浏览器 window（含 getSelection/document）
function fakeWin(doc) {
	return { document: doc, getSelection: () => ({ isCollapsed: true }), CSS: undefined, setTimeout, addEventListener() {} };
}
function fakeDocumentFor(win) {
	return {
		createElement: () => fakeEl(),
		createTreeWalker: () => ({ nextNode: () => null }),
		createRange: () => ({}),
		querySelector: () => null,
		querySelectorAll: () => [],
		defaultView: win,
		body: fakeEl()
	};
}

const CARD = "书 › 第1章 › 第一节";
const FIELDS = {
	title: CARD, caption: "第一节", text: "<p>正文段落。</p>",
	due: "20260823191859193", state: "0", reps: "0", lapses: "0",
	stability: "0", difficulty: "0", elapsed_days: "0", scheduled_days: "0",
	last_review: "20260823191859193", bag: "default", revision: "0",
	"tidme.doc": "dTEST", "tidme.id": "sTEST1", "tidme.hash": "h1",
	"tidme.order": "000001", "tidme.level": "2", "tidme.kind": "topic", "tidme.subkind": "section",
	"tidme.chars": "100", "tidme.breadcrumb": "书 › 第1章 › 第一节",
	"tidme.source": "书", "tidme.author": "", "tidme.format": "epub", "tidme.file": "x.xhtml"
};

function run(label, withImport) {
	const wiki = boot(withImport);
	wiki.addTiddler({ ...FIELDS });

	const DECK = "$:/Deck/default";
	const deckP = wiki.getTiddler(DECK).fields.p;
	// 复刻 tiddler.tid 的 $let 环境
	const vars = {
		currentTiddler: CARD,
		storyTiddler: CARD,
		studyTiddler: CARD,
		deckTiddler: DECK,
		p: deckP,
		leech_threshold: String(wiki.getTiddler(DECK).fields.leech_threshold || 8),
		filter_learn: `[subfilter{${DECK}!!card}!subfilter{${DECK}!!card_exclude}subfilter{${DECK}!!state_learn}sort[due]]`,
		filter_due: `[subfilter{${DECK}!!card}!subfilter{${DECK}!!card_exclude}subfilter{${DECK}!!state_due}subfilter{${DECK}!!order_due}]`,
		filter_new: `[subfilter{${DECK}!!card}!subfilter{${DECK}!!card_exclude}subfilter{${DECK}!!state_new}subfilter{${DECK}!!order_new}]`,
		filter_unfold: `[subfilter{${DECK}!!card_unfold}]`,
		"folded-state": "$:/state/folded/" + CARD
	};
	const doc = fakeDocumentFor(fakeWin(vars["folded-state"]));
	void doc;
	const html = wiki.renderTiddler("text/html", "$:/core/ui/ViewTemplate", { variables: vars, parentWidget: wiki.makeWidget("", { variables: vars, document: { createElement: () => fakeEl() } }) });

	console.log("== " + label);
	for (const [name, needle] of [
		["评分容器 tmc-repeat-wrapper", "tmc-repeat-wrapper"],
		["Good 按钮", ">Good<"],
		["我的条栏 tm-section-bar", "tm-section-bar"],
		["摘录按钮", ">摘录<"],
		["挖空按钮", ">挖空<"]
	]) console.log((html.includes(needle) ? "  ✓ " : "  ✘ ") + name);
}

run("仅 review（对照组）", false);
run("review + import（复现组）", true);
