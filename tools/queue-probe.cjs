/* queue-probe.cjs — 在与 startstudy 相同的 $let 环境里输出队列各桶首项 */
const fs = require("fs");
const path = require("path");
const TiddlyWiki = require("tiddlywiki");

const args = process.argv.slice(2);
const importIdx = args.indexOf("--import");
const importFile = importIdx !== -1 ? args[importIdx + 1] : null;
const clean = args.includes("--clean");

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
const DECK = "$:/Deck/default";

if (importFile) for (const t of JSON.parse(fs.readFileSync(importFile, "utf8"))) wiki.addTiddler({ ...t });
if (clean) {
	for (const title of wiki.filterTiddlers("[has[state]]")) {
		const del = {};
		for (const f of ["due", "state", "reps", "lapses", "stability", "difficulty", "elapsed_days", "last_review", "scheduled_days", "review"]) del[f] = undefined;
		wiki.addTiddler({ ...wiki.getTiddler(title).fields, ...del });
	}
}

const backtick = "`";
const probe = `<$let
    deckTiddler="${DECK}"
    filter_learn=${backtick}[subfilter{$(deckTiddler)$!!card}!subfilter{$(deckTiddler)$!!card_exclude}subfilter{$(deckTiddler)$!!state_learn}sort[due]]${backtick}
    filter_new=${backtick}[subfilter{$(deckTiddler)$!!card}!subfilter{$(deckTiddler)$!!card_exclude}subfilter{$(deckTiddler)$!!state_new}subfilter{$(deckTiddler)$!!order_new}]${backtick}
    filter_queue=${backtick}\${ [<deckTiddler>get[order]match[new-due]then<due-new>] ~[<due-new>] }${backtick}
    due-new=${backtick}$(filter_learn)$ $(filter_new)$${backtick}
>
<$action-setfield
    $tiddler="$:/temp/probe-out"
    cardTotal={{{ [subfilter{$(deckTiddler)$!!card}count[]] }}}
    learnFirst={{{ [subfilter<filter_learn>first[]] }}}
    newFirst={{{ [subfilter<filter_new>first[]] }}}
    queueFirst={{{ [subfilter<filter_queue>first[]] }}}
/>
</$let>`;

function fakeElement() {
	return { style: {}, childNodes: [], setAttribute() {}, getAttribute() { return ""; }, appendChild(c) { this.childNodes.push(c); }, insertBefore(c) { this.childNodes.push(c); }, addEventListener() {}, dispatchEvent() {}, textContent: "", classList: { add() {}, remove() {} }, hasAttribute() { return false; }, ownerDocument: null };
}
const fakeDocument = { createElement: () => fakeElement(), body: fakeElement(), title: "fake" };

wiki.addTiddler({ title: "$:/temp/probe-run", text: probe, type: "text/vnd.tiddlywiki" });
const w = wiki.makeWidget("", { variables: {}, document: fakeDocument });
w.render(fakeElement(), null);

const out = wiki.getTiddler("$:/temp/probe-out").fields;
console.log("cardTotal :", out.cardTotal);
console.log("learnFirst:", JSON.stringify(out.learnFirst));
console.log("newFirst  :", JSON.stringify(out.newFirst));
console.log("queueFirst:", JSON.stringify(out.queueFirst));
