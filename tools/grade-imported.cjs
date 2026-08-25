/* grade-imported.cjs — 闭环验证：导入产物卡片能否被 review（FSRS）正常评分 */
const fs = require("fs");
const path = require("path");
const TiddlyWiki = require("tiddlywiki");

const importFile = process.argv[2];
if (!importFile) { console.error("用法: node grade-imported.cjs <导入.json>"); process.exit(1); }

const tw = TiddlyWiki.TiddlyWiki();
tw.preloadTiddlerArray([JSON.parse(fs.readFileSync(path.resolve(__dirname, "../out-m2/$__plugins_tidme_review.json"), "utf8"))]);
tw.boot.argv = [path.resolve(__dirname, "../wiki/manual/index")];
tw.boot.boot();
const wiki = tw.wiki;
const DECK = "$:/Deck/default";

for (const t of JSON.parse(fs.readFileSync(importFile, "utf8"))) wiki.addTiddler({ ...t });

// 队列第一张【导入卡】（模拟 startstudy；跳过历史遗留的无字段测试卡）
const queue = wiki.filterTiddlers("[subfilter{$:/Deck/default!!card}!subfilter{$:/Deck/default!!card_exclude}subfilter{$:/Deck/default!!state_new}subfilter{$:/Deck/default!!order_new}]")
	.filter((t) => wiki.getTiddler(t).fields["tidme.doc"]);
console.log("new队列总张数:", wiki.filterTiddlers("[subfilter{$:/Deck/default!!card}subfilter{$:/Deck/default!!state_new}]").length);
const card = queue[0];
console.log("首张导入卡:", card);

function fakeElement() {
	return { style: {}, childNodes: [], setAttribute() {}, getAttribute() { return ""; }, appendChild(c) { this.childNodes.push(c); }, insertBefore(c) { this.childNodes.push(c); }, addEventListener() {}, dispatchEvent() {}, textContent: "", classList: { add() {}, remove() {} }, hasAttribute() { return false; }, ownerDocument: null };
}
const fakeDocument = { createElement: () => fakeElement(), body: fakeElement(), title: "fake" };

const deckFields = wiki.getTiddler(DECK).fields;
const varWidget = wiki.makeWidget("", { variables: { studyTiddler: card, p: deckFields.p }, document: fakeDocument });
const cardsJson = wiki.filterTiddlers("[<studyTiddler>fsrs<p>]", varWidget)[0];

const text = wiki.getTiddlerText("$:/plugins/tidme/review/buttons/action/repeat");
const w = wiki.makeWidget(text, {
	variables: { studyTiddler: card, rating: "Good", cards_json: cardsJson, deckTiddler: DECK, leech_threshold: "8" },
	document: fakeDocument
});
w.render(fakeElement(), null);

const f = wiki.getTiddler(card).fields;
const nowStr = wiki.filterTiddlers("<now [UTC]YYYY0MM0DD0hh0mm0ss0XXX>", wiki.makeWidget("", { document: fakeDocument }))[0] || "";
console.log(`评分后 state=${f.state} due=${f.due} (now=${nowStr})`);
const ok = f.state !== undefined && Number(f.state) > 0;
console.log(ok ? "✅ 评分写入成功，队列将正常推进" : "✘ 仍未写入");
process.exit(ok ? 0 : 1);
