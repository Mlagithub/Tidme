/* grade-compare.cjs — 遗留字段卡 vs 全新卡的评分写入对比 */
const fs = require("fs");
const path = require("path");
const TiddlyWiki = require("tiddlywiki");

const tw = TiddlyWiki.TiddlyWiki();
tw.preloadTiddlerArray([JSON.parse(fs.readFileSync(path.resolve(__dirname, "../out-m2/$__plugins_keepone_tidme.json"), "utf8"))]);
tw.boot.argv = [path.resolve(__dirname, "../wiki/manual/index")];
tw.boot.boot();
const wiki = tw.wiki;
const DECK = "$:/Deck/default";

// 卡1：模拟遗留卡（带完整 FSRS 字段）
wiki.addTiddler({
	title: "遗留卡", tags: ["?"], text: "?",
	due: "20220623073158410", state: "2", reps: "3", lapses: "1",
	stability: "5.8", difficulty: "4.9", elapsed_days: "0",
	last_review: "20220622073158410", scheduled_days: "6"
});
// 卡2：全新卡（与导入产物一致，只有 ? 标签）
wiki.addTiddler({ title: "全新卡", tags: ["?"], text: "?" });

function fakeElement() {
	return { style: {}, childNodes: [], setAttribute() {}, getAttribute() { return ""; }, appendChild(c) { this.childNodes.push(c); }, insertBefore(c) { this.childNodes.push(c); }, addEventListener() {}, dispatchEvent() {}, textContent: "", classList: { add() {}, remove() {} }, hasAttribute() { return false; }, ownerDocument: null };
}
const fakeDocument = { createElement: () => fakeElement(), body: fakeElement(), title: "fake" };

function cardsJsonOf(title) {
	const deckFields = wiki.getTiddler(DECK).fields;
	const varWidget = wiki.makeWidget("", { variables: { studyTiddler: title, p: deckFields.p }, document: fakeDocument });
	const j = wiki.filterTiddlers("[<studyTiddler>fsrs<p>]", varWidget)[0] || "";
	let d = {}; try { d = JSON.parse(j); } catch (e) { console.log("  parse错误:", e.message); }
	return d;
}

function grade(title) {
	const d = cardsJsonOf(title);
	console.log(`【${title}】Cards键=[${Object.keys(d.Cards || {})}]`);
	if (!d.Cards) { console.log("  无 Cards → 无法评分"); return; }
	const text = wiki.getTiddlerText("$:/plugins/keepone/tidme/review/buttons/action/repeat");
	for (const rating of ["Good"]) {
		const widgetNode = wiki.makeWidget(text, {
			variables: { studyTiddler: title, rating, cards_json: JSON.stringify(d), deckTiddler: DECK, leech_threshold: "8" },
			document: fakeDocument
		});
		widgetNode.render(fakeElement(), null);
		const f = wiki.getTiddler(title).fields;
		console.log(`  评分${rating} → state=${f.state ?? "未写入"} due=${f.due ?? "未写入"} stability=${f.stability ?? "未写入"}`);
	}
}

grade("遗留卡");
grade("全新卡");
