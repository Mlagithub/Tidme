/* rating-intervals.cjs — 新卡各评分档的实际调度间隔 */
const fs = require("fs");
const path = require("path");
const TiddlyWiki = require("tiddlywiki");

const pluginDir = path.resolve(__dirname, "../bin");
const plugins = ["$__plugins_keepone_tidme"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));

const tw = TiddlyWiki.TiddlyWiki();
tw.preloadTiddlerArray(plugins);
tw.boot.argv = [path.resolve(__dirname, "../wiki/manual/index")];
tw.boot.boot();
const wiki = tw.wiki;

function fakeElement() {
	return { style: {}, childNodes: [], setAttribute() {}, getAttribute() { return ""; }, appendChild() {}, insertBefore() {}, addEventListener() {}, dispatchEvent() {}, textContent: "", classList: { add() {}, remove() {} }, hasAttribute() { return false; }, ownerDocument: null };
}
const fakeDocument = { createElement: () => fakeElement(), body: fakeElement(), title: "fake" };

// 全新的测试卡（kind=item，无调度字段按新卡处理）
wiki.addTiddler({ title: "全新测试卡", "tidme.kind": "item", "tidme.subkind": "qa", caption: "?", text: "?" });

const deckP = wiki.getTiddler("$:/Deck/default").fields.p;
const varWidget = wiki.makeWidget("", { variables: { studyTiddler: "全新测试卡", p: deckP }, document: fakeDocument });
const json = wiki.filterTiddlers("[<studyTiddler>fsrs<p>]", varWidget)[0];
const data = JSON.parse(json);

const now = Date.now();
console.log("state(前):", data.Cards["全新测试卡"] ? "(见下)" : "?");
for (const rating of ["Again", "Hard", "Good", "Easy"]) {
	const entry = data.Cards["全新测试卡"];
	if (!entry) continue;
	const c = entry.card;
	// Cards 里每个 rating 的 card 由 filter 输出结构决定；这里输出原始 JSON 片段
	void c;
}
// 直接打印整份 Cards 结构的关键字段
for (const rating of ["Again", "Hard", "Good", "Easy"]) {
	const entry = (data.Cards || {})["全新测试卡"];
	void entry;
}
console.log(JSON.stringify({ Rating: data.Rating, sampleKeys: Object.keys(data.Cards || {}), first: (data.Cards || {})["全新测试卡"] }, null, 1).slice(0, 1600));
