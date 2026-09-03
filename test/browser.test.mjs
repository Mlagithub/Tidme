/*
browser.test.mjs — 侧边栏/管理组件冒烟测试（node:test）

boot TW + 插件，造一张文档/卡片数据，渲染 queue-ops / stats-panel / section-bar / card-manager，
断言树形结构与统计输出（不抛错且包含预期内容）。
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

function fakeElement(tag = "div") {
	const e = {
		nodeType: 1, tagName: String(tag).toUpperCase(), childNodes: [], children: [],
		style: {}, attributes: {}, parentNode: null, innerHTML: "", _text: "",
		setAttribute(k, v) { this.attributes[k] = v; },
		getAttribute(k) { return this.attributes[k]; },
		appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		insertBefore(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); this.children = this.children.filter((x) => x !== c); return c; },
		addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
		classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
		hasAttribute() { return false; }, ownerDocument: null,
		querySelector() { return null; }, querySelectorAll() { return []; },
		setAttributeNS() {}, getBoundingClientRect() { return { top: 0, left: 0 }; },
		focus() {}, scrollIntoView() {}, replaceChildren() {}
	};
	// textContent 赋值需像真实 DOM：空串清空子节点（widget rebuild 依赖此行为）
	Object.defineProperty(e, "textContent", {
		get() { return e._text; },
		set(v) {
			e._text = v;
			if (v === "" || v === undefined) { e.childNodes = []; e.children = []; }
		}
	});
	return e;
}

/** 递归收集 DOM 文本（fake 不自动聚合 textContent） */
function collectText(node) {
	if (!node) return "";
	let out = node.textContent || "";
	for (const c of node.childNodes || []) out += collectText(c);
	return out;
}

const fakeDocument = {
	createElement: (t) => fakeElement(t),
	createElementNS: (ns, t) => fakeElement(t),
	createTextNode: (text) => { const e = fakeElement("#text"); e.textContent = String(text); return e; },
	body: fakeElement("body"), title: "fake",
	querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
	createRange: () => ({ setStart() {}, setEnd() {}, surroundContents() {} }),
	defaultView: null
};

let wiki, tw, queueOps, statsPanel, cardManager, sectionBar, importFile;
let docTitle, sectionTitle, extractTitle, clozeTitle; // 命名空间化后的固定 tiddler title 引用
test.before(async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-browser-"));
	tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray(plugins);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	wiki = tw.wiki;
	// 造数据：一本书 + 2 节 + 1 摘录 + 1 挖空 + 自动 deck
	const pipeline = tw.modules.execute("$:/plugins/keepone/tidme/import/pipeline.js");
	const r = await pipeline.runSplit({ text: "# 书名甲\n\n第一章正文。\n\n## 小节乙\n\n第二节正文。", title: "书名甲", type: "text/markdown", minChars: 0 });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const section = r.tiddlers.find((x) => x["tidme.kind"] === "topic");
	// 文档页新 title = "Tidme/Books/书名甲"（命名空间化）；下文引用以保持一致性
	docTitle = r.tiddlers[0].title; // 第一个 tiddler 是文档页
	sectionTitle = section.title; // 第一节卡的新路径（拍平到书目录）
	// 摘录留在书目录（拍平）：<bookRoot>/<sectionId>--extract
	extractTitle = section.title + "--extract";
	// 知识卡进 decks 命名空间：<Tidme/Decks/<书>/<sectionId>--cloze
	clozeTitle = section.title.replace(/^Tidme\/Books\//, "Tidme/Decks/") + "--cloze";
	wiki.addTiddler({
		title: extractTitle, caption: "摘",
		text: "<blockquote>第一章的摘录</blockquote>",
		"tidme.doc": r.docId, "tidme.parent": section.title, "tidme.kind": "topic", "tidme.subkind": "extract",
		"tidme.breadcrumb": `${section["tidme.path"]} › 摘录`, "tidme.source": "书名甲",
		"tidme.format": "markdown", state: "0", due: "20261231000000000"
	});
	// 分类重构：摘录卡（topic）进阅读流；挖空卡（item）进复习流
	wiki.addTiddler({
		title: clozeTitle, caption: "首都",
		text: "",
		"tidme.doc": r.docId, "tidme.parent": section.title, "tidme.kind": "item", "tidme.subkind": "cloze",
		"tidme.breadcrumb": `${section["tidme.path"]} › 挖空`, "tidme.source": "书名甲",
		"tidme.format": "markdown", state: "0", due: "20261231000000000"
	});
	queueOps = tw.modules.execute("$:/plugins/keepone/tidme/manager/widgets/queue-ops.js");
	statsPanel = tw.modules.execute("$:/plugins/keepone/tidme/import/widgets/stats-panel.js");
	cardManager = tw.modules.execute("$:/plugins/keepone/tidme/manager/widgets/card-manager.js");
	sectionBar = tw.modules.execute("$:/plugins/keepone/tidme/import/widgets/section.js");
});

function renderWidgetEx(mod, name, opts = {}) {
	const root = fakeElement("div");
	// TW 的 getVariable 只从 parentWidget.variables 链读取（变量存储格式为 {value,...} 对象）
	const vars = {};
	for (const [k, v] of Object.entries(opts.variables || {})) {
		vars[k] = { value: v, params: [], isMacroDefinition: false, isFunctionDefinition: false, isProcedureDefinition: false, isWidgetDefinition: false, configTrimWhiteSpace: false };
	}
	// 属性需带 type（computeAttribute 只认 string/filtered/indirect/macro/substituted）
	const attrs = {};
	for (const [k, v] of Object.entries(opts.attributes || {})) {
		attrs[k] = typeof v === "object" && v !== null ? v : { type: "string", value: String(v) };
	}
	const parentWidget = {
		variables: vars,
		getAncestorCount: () => 0,
		getVariable: () => ""
	};
	const w = new mod[name]({ attributes: attrs }, {
		wiki, document: fakeDocument, parentWidget, variables: {}
	});
	w.render(root, null);
	return { root, w };
}

function renderWidget(mod, name, opts = {}) {
	return renderWidgetEx(mod, name, opts).root;
}

/** 递归收集 button 元素（fake 不提供 querySelectorAll） */
function collectButtons(node, out = []) {
	if (!node) return out;
	if (String(node.tagName) === "BUTTON") out.push(node);
	for (const c of node.childNodes || []) collectButtons(c, out);
	return out;
}

test("queue-ops: 每牌组渲染批量操作按钮（只剩默认牌组）", () => {
	const decks = wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]]");
	assert.equal(decks.length, 1, "牌组库只剩默认牌组（topic 不进牌组）");
	const root = renderWidget(queueOps, "queue-ops");
	const text = collectText(root);
	assert.ok(text.includes("顺延7d"), "应有顺延按钮");
	assert.ok(text.includes("遗忘"), "应有遗忘按钮");
	assert.ok(text.includes("立即顺延"), "应有手动 auto-postpone 按钮（G8）");
});

test("stats-panel: 渲染负载/文档进度/漏斗", () => {
	const root = renderWidget(statsPanel, "stats-panel");
	const text = collectText(root);
	assert.ok(text.includes("牌组负载"), "应有负载区");
	assert.ok(text.includes("书名甲"), "应含文档进度");
	assert.ok(text.includes("漏斗"), "应有漏斗");
	assert.ok(text.includes("保留率"), "应有保留率");
});

test("card-manager: 渲染视图过滤/树/批量工具条", () => {
	const root = renderWidget(cardManager, "card-manager");
	const text = collectText(root);
	assert.ok(text.includes("全部"), "应有视图过滤");
	assert.ok(text.includes("顺延7d"), "应有批量操作");
	assert.ok(text.includes("顺延过载"), "应有顺延过载按钮");
	assert.ok(text.includes("优先↑") && text.includes("设高"), "G3 批量优先级操作");
	assert.ok(text.includes("书名甲"), "应含文档");
	assert.ok(text.includes("小节乙"), "应含节");
});

test("scheduler: 优先级混合队列排序 sortPriorityMixedQueue", () => {
	const sched = tw.modules.execute("$:/plugins/keepone/tidme/core/scheduler.js");
	const c1 = { title: "高优先远到期", fields: { "tidme.priority": "10", due: "20260101000000000" } };
	const c2 = { title: "低优先近逾期", fields: { "tidme.priority": "80", due: "20260105000000000" } };
	const cards = [c2, c1];

	const pf = sched.sortPriorityMixedQueue(cards, "priority-first");
	assert.equal(pf[0].title, "高优先远到期", "priority-first 应先按优先级");

	const df = sched.sortPriorityMixedQueue(cards, "due-first");
	assert.equal(df[0].title, "高优先远到期", "due-first 按到期时间");

	const hb = sched.sortPriorityMixedQueue(cards, "hybrid");
	assert.ok(hb.length === 2, "hybrid 模式正常排序");
});

test("scheduler: 过载自动顺延 autoPostpone 门槛触发", () => {
	const sched = tw.modules.execute("$:/plugins/keepone/tidme/core/scheduler.js");
	const overdueCards = [
		{ title: "卡1", fields: { due: "20200101000000000", "tidme.kind": "item", "tidme.priority": "80" } },
		{ title: "卡2", fields: { due: "20200101000000000", "tidme.kind": "item", "tidme.priority": "70" } }
	];
	// 当 maxOverdueThreshold = 5 时，未达到 5 张逾期，不触发顺延
	const resUnder = sched.autoPostpone(overdueCards, { maxOverdueThreshold: 5 });
	assert.equal(resUnder.patches.length, 0, "未超阈值不发生顺延");

	// 当 maxOverdueThreshold = 1 时，超过阈值，触发顺延
	const resOver = sched.autoPostpone(overdueCards, { maxOverdueThreshold: 1, keepTop: 1, maxPriority: 60 });
	assert.equal(resOver.patches.length, 1, "超阈值顺延 1 张卡");
});

test("pipeline: 大纲干预编辑器 applyOverrides（改短/删/增）", () => {
	const pipeline = tw.modules.execute("$:/plugins/keepone/tidme/import/pipeline.js");
	const chunker = tw.modules.execute("$:/plugins/keepone/tidme/import/pipeline.js");
	const rawSections = [
		{ level: 1, title: "超级无敌非常长的一个原章节名称用于测试改短", trail: ["超级无敌非常长的一个原章节名称用于测试改短"], html: "<p>1</p>", text: "1", chars: 1, ordinal: 1 },
		{ level: 1, title: "待删除噪音卡", trail: ["待删除噪音卡"], html: "<p>2</p>", text: "2", chars: 1, ordinal: 2 }
	];
	const overrides = {
		titles: { "超级无敌非常长的一个原章节名称用于测试改短": "短标题甲" },
		delete: ["待删除噪音卡"],
		customSections: [{ title: "手动新增卡", text: "手动内容", insertAfterKey: "短标题甲" }]
	};
	const res = pipeline.applyOverrides(rawSections, overrides);
	assert.equal(res.length, 2, "删除1节+新增1节后总节数不变");
	assert.equal(res[0].title, "短标题甲", "标题被成功改短");
	assert.equal(res[1].title, "手动新增卡", "成功插入手动新增卡");
});

test("pipeline: cleanTitle 剔除冗余副标题与括号说明", () => {
	const pipeline = tw.modules.execute("$:/plugins/keepone/tidme/import/pipeline.js");
	const rawTitle = "批判性思维与说服性写作：独立思考者的精进技巧（通过25种思维练习、30项写作训练，让你更具备思辨力和创造性, 实现独立思考和写作精进）";
	const cleaned = pipeline.cleanTitle(rawTitle);
	assert.equal(cleaned, "批判性思维与说服性写作", "成功剥离副标题与括号营销说明");
});

test("server: splitSectionText LLM 二次切片且 100% 保持字数完全相同", async () => {
	const sem = tw.modules.execute("$:/plugins/keepone/tidme/core/server/semantic-split");
	const sampleText = "第一段正文内容用来测试字符偏移定位。\n\n第二段正文分析实验结果。\n\n第三段正文给出分析结论。";
	const mockHttp = async () => ({
		status: 200,
		data: JSON.stringify({
			choices: [{ message: { content: '[{"breakIndex": 0, "title": "概论"}, {"breakIndex": 1, "title": "实验"}, {"breakIndex": 2, "title": "结论"}]' } }]
		})
	});
	const chunks = await sem.splitSectionText(sampleText, { enable: true, apiKey: "test" }, mockHttp);
	assert.equal(chunks.length, 3, "成功切分为 3 个带语义标题子卡");
	const sumChars = chunks.reduce((n, c) => n + c.text.length, 0);
	assert.equal(sumChars, sampleText.length, "切分前后字数 100% 完全一致（0 字损耗）");
});

function collectElementsByClass(node, className, out = []) {
	if (!node) return out;
	if (node.className && String(node.className).includes(className)) out.push(node);
	for (const c of node.childNodes || []) collectElementsByClass(c, className, out);
	return out;
}

test("card-manager: 批量选择交互与全选", () => {
	const root = renderWidget(cardManager, "card-manager");
	const groupCbs = collectElementsByClass(root, "tm-cm-group-cb");
	assert.ok(groupCbs.length > 0, "应渲染分组/全选复选框");

	const text = collectText(root);
	assert.ok(text.includes("已选"), "已选信息应在工具条展示");
});



test("card-manager: Done 语义（置 tidme.done，kind 决定归属）与恢复", () => {
	const sched = tw.modules.execute("$:/plugins/keepone/tidme/core/scheduler.js");
	const done = cardManager.doneFields({ title: "节", "tidme.kind": "topic", state: "0" });
	assert.equal(done["tidme.done"], "yes");
	assert.equal(done["tidme.kind"], "topic", "kind 保留");
	// 恢复：清除 done/ignored/suspended，kind 决定归属（无需补标签）
	const resumed = cardManager.resumeFields({ ...done });
	assert.equal(resumed["tidme.done"], undefined, "恢复删除 tidme.done");
	assert.equal(resumed["tidme.kind"], "topic", "topic 保留（阅读流）");
	assert.ok(!sched.isCardDone(resumed), "恢复后不在完成态");
	// item 恢复同样只清标记
	const resumeCloze = cardManager.resumeFields({ ...done, "tidme.kind": "item" });
	assert.equal(resumeCloze["tidme.kind"], "item", "item 保留（复习流）");
	assert.ok(!sched.isCardDone(resumeCloze));
});

test("card-manager: 全部卡片可见（含已读卡与手动散卡）", () => {
	// 手动散卡：无 kind，仅 FSRS 字段（模拟用户手动建卡，按 item 兜底）
	wiki.addTiddler({ title: "手动散卡甲", state: "0", due: "20261231000000000", reps: "0", lapses: "0", stability: "0", difficulty: "0" });
	// 已读一张节卡（模拟其他入口的 Done）
	const secTitle = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]]")[0];
	wiki.addTiddler({ ...wiki.getTiddler(secTitle).fields, "tidme.done": "yes" });

	const root = renderWidget(cardManager, "card-manager"); // 默认按文档（全量）
	const text = collectText(root);
	assert.ok(text.includes("未分组"), "手动散卡归入未分组（按文档默认）");
	assert.ok(text.includes("手动散卡甲"), "手动散卡可见");
	assert.ok(text.includes("按文档") && text.includes("按牌组") && text.includes("列表"), "组织切换按钮存在");
	const secTail = String(wiki.getTiddler(secTitle).fields["tidme.breadcrumb"] || secTitle).split(" › ").pop();
	assert.ok(text.includes(secTail), "已读节卡仍在树中（按文档组织全量）");
});

test("card-manager: 按牌组组织含「未入组」兜底分支", () => {
	const root = renderWidget(cardManager, "card-manager", { attributes: { org: "deck" } });
	const text = collectText(root);
	assert.ok(text.includes("未入组"), "未入组兜底分支存在");
	assert.ok(text.includes("手动散卡甲"), "散卡在未入组分支");
});

test("card-manager: 列表视图（Browser 式）平铺所有卡", () => {
	const root = renderWidget(cardManager, "card-manager", { attributes: { org: "list" } });
	const text = collectText(root);
	assert.ok(text.includes("标题"), "排序表头-标题");
	assert.ok(text.includes("牌组"), "排序表头-牌组");
	assert.ok(text.includes("到期"), "排序表头-到期");
	assert.ok(text.includes("间隔"), "信息列表头-间隔（Element data）");
	assert.ok(text.includes("重复"), "信息列表头-重复");
	assert.ok(text.includes("难度"), "信息列表头-难度");
	assert.ok(text.includes("手动散卡甲"), "列表包含手动散卡");
	assert.ok(text.includes("书名甲"), "列表包含书内卡");
});

test("card-manager: 信息标签（Element data 显示层）", () => {
	const L = cardManager.labels;
	assert.equal(L.dueLabel({ state: "2", due: "20261231000000000" }), "2026-12-31");
	assert.equal(L.dueLabel({ state: "0" }), "—", "非到期态无日期");
	assert.equal(L.intervalLabel({ scheduled_days: "7" }), "7天");
	assert.equal(L.intervalLabel({}), "—");
	assert.equal(L.repsLabel({ reps: "5" }), "5");
	assert.equal(L.lapsesLabel({ lapses: "2" }), "2");
	assert.equal(L.diffLabel({ difficulty: "0.45" }), "45%");
	assert.equal(L.dateLabel("20261231000000000"), "2026-12-31");
	assert.equal(L.dateLabel(undefined), "—");
});

test("section-bar: 两行布局 + 统一按钮风格", () => {
	const title = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]!has[tidme.done]]")[0];
	const root = renderWidget(sectionBar, "section-bar", { variables: { currentTiddler: title } });
	const bar = (root.children || [])[0];
	assert.ok(bar && String(bar.className || "").includes("tm-section-bar"), "条栏根节点");
	const rows = (bar.children || []).filter((c) => String(c.className || "").includes("tm-section-row"));
	assert.equal(rows.length, 2, "两行：信息 + 按钮");
	assert.ok(String(rows[0].className).includes("tm-section-info"), "第一行=信息（面包屑/位置/剩余）");
	assert.ok(String(rows[1].className).includes("tm-section-btns"), "第二行=按钮");
	assert.ok(collectText(rows[0]).includes("剩"), "信息行含剩余待学");
	assert.ok(collectText(rows[0]).includes("p"), "信息行含优先级（G2）");
	assert.ok(collectText(rows[1]).includes("优先↑") && collectText(rows[1]).includes("优先↓"), "G2 优先级快速调整按钮");
	const btns = collectButtons(rows[1]);
	assert.ok(btns.length >= 6, "按钮行含导航/续读点/生命周期/制卡/帮助按钮");
	for (const b of btns) {
		assert.ok(String(b.className || "").startsWith("tm-sec-btn"), `按钮统一风格: ${b.className}`);
	}
});

test("section-bar: 即时刷新（本文档卡变化 → 重建）", () => {
	const title = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]!has[tidme.done]]")[0];
	const { root, w } = renderWidgetEx(sectionBar, "section-bar", { variables: { currentTiddler: title } });
	// 初始未读：有「✔ 已读」按钮，无「✓ 已读」状态
	assert.ok(collectText(root).includes("✔ 已读"), "初始为未读状态");
	// 外部把本卡标为已读（模拟文档页/管理器入口）
	const f = wiki.getTiddler(title).fields;
	wiki.addTiddler({ ...f, "tidme.done": "yes" });
	assert.equal(w.refresh({ [title]: { modified: true } }), true, "refresh 处理了变化");
	const text2 = collectText(root);
	assert.ok(text2.includes("✓ 已读"), "重建后显示已读状态");
	assert.ok(text2.includes("↩ 重新加入"), "重建后显示重新加入按钮");
	assert.ok(!text2.includes("✔ 已读"), "已读按钮消失");
});

test("事件总线: 队列变化通知 → 监听组件重建（stats-panel 数字更新）", async () => {
	const events = tw.modules.execute("$:/plugins/keepone/tidme/core/events.js");
	// 先渲染统计面板（注册事件监听）
	const root = renderWidget(statsPanel, "stats-panel");
	// 新导入第二本书（直接写库，模拟切分/导入落库）
	const pipeline2 = tw.modules.execute("$:/plugins/keepone/tidme/import/pipeline.js");
	const r = await pipeline2.runSplit({ text: "# 第二本书\n\n第二章正文。", title: "第二本书", type: "text/markdown", minChars: 0 });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	// 直接进程内通知（等价于 tm-tidme-* 消息经 rootWidget 桥接到达）
	events.notifyTidme(events.EVENTS.IMPORT_DONE);
	events.notifyTidme(events.EVENTS.QUEUE_CHANGED);
	const text = collectText(root);
	assert.ok(text.includes("第二本书"), "事件后统计面板重建，出现新书进度");
});

test("doc-resume: 子集复习按钮（复习本书）", () => {
	// 文档页渲染（书名甲有在队卡 → 显示「复习本书」）；currentTiddler 用新命名空间路径
	const root = renderWidget(sectionBar, "doc-resume", { variables: { currentTiddler: docTitle } });
	const text = collectText(root);
	assert.ok(text.includes("继续阅读"), "继续阅读按钮");
	assert.ok(text.includes("复习本书"), "子集复习按钮（G7）");
	assert.ok(text.includes("清理阅读材料"), "清理阅读材料按钮");
	assert.ok(text.includes("已读"), "进度文案");
});

test("import-file: 服务端后台处理选项（G10）", () => {
	// 需要 importFile 模块
	if (!importFile) importFile = tw.modules.execute("$:/plugins/keepone/tidme/import/widgets/import.js");
	const root = renderWidget(importFile, "import-file");
	const text = collectText(root);
	assert.ok(text.includes("服务端后台处理"), "服务端处理选项（G10）");
});

test("align: 重复导入（A）——同内容再导入不覆盖 SRS 进度", async () => {
	const pipeline2 = tw.modules.execute("$:/plugins/keepone/tidme/import/pipeline.js");
	const align = tw.modules.execute("$:/plugins/keepone/tidme/core/align.js");
	// 首次切分并写库（minChars=0 保持两节独立）
	const r1 = await pipeline2.runSplit({ text: "# 重导书\n\n甲内容。\n\n## 乙\n\n乙内容。", title: "重导书", type: "text/markdown", minChars: 0 });
	for (const t of r1.tiddlers) wiki.addTiddler(t);
	// 给「甲」节设 SRS 进度（第一节：面包屑 = 文档标题 › H1 标题）
	const jia = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]tidme.breadcrumb[重导书 › 重导书]]`)[0]
		|| wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]]`)[0];
	assert.ok(jia, "找到甲节");
	wiki.addTiddler({ ...wiki.getTiddler(jia).fields, state: "2", reps: "5", due: "20261231000000000" });
	// 再次导入同一内容（模拟重复导入/剪藏更新）
	const r2 = await pipeline2.runSplit({ text: "# 重导书\n\n甲内容。\n\n## 乙\n\n乙内容。", title: "重导书", type: "text/markdown", minChars: 0 });
	const oldCards = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]!is[draft]]`)
		.map((t) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
	const sectionCards = r2.tiddlers.filter((x) => x["tidme.kind"] === "topic");
	const aligned = await align.alignCards(oldCards, "重导书", sectionCards.map((c) => ({ title: c.title, fields: c })));
	// 内容全同 → 全部 unchanged，不新增/不更新/不归档
	assert.equal(aligned.unchanged, 2, "两节全部未变");
	assert.equal(aligned.keep.length, 0);
	assert.equal(aligned.patches.length, 0);
	assert.equal(aligned.archives.length, 0);
	// SRS 进度保留（旧卡未被覆盖）
	const after = wiki.getTiddler(jia).fields;
	assert.equal(after.state, "2", "SRS state 保留");
	assert.equal(after.reps, "5", "SRS reps 保留");
});

test("doc-resume: 摘录收件箱聚合（G4/W3 加工标注）", () => {
	const root = renderWidget(sectionBar, "doc-resume", { variables: { currentTiddler: docTitle } });
	const text = collectText(root);
	assert.ok(text.includes("摘录/挖空"), "摘录聚合区标题");
	assert.ok(text.includes("摘"), "摘录 kind 标记");
	assert.ok(text.includes("可挖空"), "无子挖空的摘录显示可挖空（W3）");
	assert.ok(text.includes("回原文"), "回原文操作");
	// 给摘录卡加一个子挖空 → 已挖空（命名空间化：进 decks 目录）
	const extExtractTitle = wiki.filterTiddlers("[tidme.subkind[extract]]")[0];
	const extFields = wiki.getTiddler(extExtractTitle).fields;
	const childCloze = extExtractTitle.replace(/^Tidme\/Books\//, "Tidme/Decks/").replace(/--extract$/, "") + "--cloze";
	wiki.addTiddler({
		title: childCloze, state: "0",
		"tidme.doc": extFields["tidme.doc"], "tidme.parent": extExtractTitle, "tidme.kind": "item", "tidme.subkind": "cloze",
		"tidme.breadcrumb": `${extFields["tidme.breadcrumb"]} › 挖空`
	});
	const root2 = renderWidget(sectionBar, "doc-resume", { variables: { currentTiddler: docTitle } });
	assert.ok(collectText(root2).includes("已挖空"), "有子挖空的摘录显示已挖空（W3）");
});

test("section-bar: 摘录卡加工按钮（✂ 挖空）", () => {
	const extractTitle = wiki.filterTiddlers("[tidme.subkind[extract]]")[0];
	assert.ok(extractTitle, "测试数据应有摘录卡");
	const root = renderWidget(sectionBar, "section-bar", { variables: { currentTiddler: extractTitle } });
	const text = collectText(root);
	assert.ok(text.includes("挖空"), "摘录卡显示挖空加工按钮（G4）");
	assert.ok(text.includes("源自"), "来源链接");
});

test("section-bar: 忽略按钮（G3）", () => {
	const title = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]!has[tidme.done]]")[0];
	const root = renderWidget(sectionBar, "section-bar", { variables: { currentTiddler: title } });
	const text = collectText(root);
	assert.ok(text.includes("忽略"), "未读节显示忽略按钮");
});

test("双轨分类: 默认牌组只装 item（含挖空，不含节卡/摘录）；topic 不进任何牌组", () => {
	const deck = wiki.getTiddler("$:/Deck/default");
	assert.ok(deck, "默认牌组存在");
	const queue = wiki.filterTiddlers(String(deck.fields.card));
	assert.ok(queue.includes(clozeTitle), "挖空卡（item）进复习流");
	assert.ok(!queue.includes(extractTitle), "摘录卡（topic）不进复习流");
	assert.ok(!queue.some((t) => wiki.getTiddler(t)?.fields?.["tidme.kind"] === "topic"), "节卡（topic）不进复习流");
	assert.ok(queue.includes("手动散卡甲"), "无 kind 手动卡按 item 进复习流");
	// topic（阅读材料）不进任何 TidmeDeck：不生成自动阅读牌组，也不出现在牌组库
	const autoDeck = wiki.getTiddler("$:/Deck/read/书名甲");
	assert.equal(autoDeck, undefined, "不生成自动阅读牌组（书只出现在阅读列表）");
	const decks = wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]]");
	assert.equal(decks.length, 1, "牌组库只剩默认牌组（item 复习流）");
	assert.equal(decks[0], "$:/Deck/default");
	// 补一张未读节卡：它只在阅读列表（kind[topic]），不进入任何牌组队列
	const docId = wiki.getTiddler(extractTitle).fields["tidme.doc"];
	const newSection = `${docTitle}/新节-${Date.now().toString(36)}`;
	wiki.addTiddler({ title: newSection, "tidme.doc": docId, "tidme.kind": "topic", "tidme.subkind": "section", state: "0" });
	const deckIds = wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]]");
	const anyDeckMatches = deckIds.some((d) => wiki.filterTiddlers(String(wiki.getTiddler(d).fields.card)).includes(newSection));
	assert.equal(anyDeckMatches, false, "未读节卡不在任何牌组");
});

test("视图互斥: 阅读条栏只显示 topic，复习帧只接管 item", () => {
	// section-nav.tid（阅读条栏）只匹配 kind=topic
	const secNav = wiki.getTiddler("$:/plugins/keepone/tidme/import/ui/section-nav").fields.text;
	assert.ok(secNav.includes("tidme.kind[topic]"), "阅读条栏只显示 topic 卡");
	assert.ok(!secNav.includes("has[tidme.doc]!tag[tidme-import-doc]"), "不再按 doc 判定（避免 item 卡混入）");
	// card.tid（复习帧）排除 topic
	const cardFilter = wiki.getTiddler("$:/config/Tidme/StoryTiddlerTemplateFilters/card").fields.text;
	assert.ok(cardFilter.includes("!tidme.kind[topic]"), "复习帧不接管 topic 卡");
	// 视图互斥效果：topic 卡不在默认牌组复习帧、item 卡无阅读条栏
	const topic = wiki.filterTiddlers("[tidme.kind[topic]!has[tidme.done]]")[0];
	const item = wiki.filterTiddlers("[tidme.kind[item]]")[0];
	assert.ok(topic, "存在未读 topic 卡");
	assert.ok(item, "存在 item 卡");
});

test("视图互斥: 复习帧故事级联对 topic 卡落回默认帧（阅读模式无评分条）", () => {
	// 复刻 $:/core/ui/StoryTiddlerTemplate 的真实级联：topic 卡必须得到 $:/core/ui/ViewTemplate
	//（否则复习帧接管 → study.tid 评分条出现在阅读模式）
	const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
	const topic = wiki.filterTiddlers("[tidme.kind[topic]tidme.subkind[section]]")[0];
	assert.ok(topic, "存在节卡");
	parent.setVariable("currentTiddler", topic);
	const w = wiki.makeWidget({ tree: [] }, { parentWidget: parent, document: fakeDocument });
	const cascade = "[<currentTiddler>] :cascade[all[shadows+tiddlers]tag[$:/tags/StoryTiddlerTemplateFilter]!is[draft]get[text]] :and[has[title]else[$:/core/ui/ViewTemplate]]";
	const tpl = wiki.filterTiddlers(cascade, w);
	assert.ok(Array.isArray(tpl) && tpl.length > 0, "级联应有结果");
	assert.equal(tpl[0], "$:/core/ui/ViewTemplate", "topic 卡故事级联 = 默认帧（复习帧不接管）");
});


test("视图互斥: 会话进行中 topic 卡也不得落入复习帧（修复 subfilter 绕过 kind 过滤）", () => {
	// 回归：startGlobalLearning 会把 topic 卡列入 $:/Deck/default/study（list 字段），
	// 旧 card.tid 的 subfilter 重新对 currentTiddler 求值绕过 !tidme.kind[topic] → 阅读卡显示评分条。
	const topic = wiki.filterTiddlers("[tidme.kind[topic]tidme.subkind[section]]")[0];
	assert.ok(topic, "存在节卡");
	// 模拟会话：topic 卡列入默认牌组 study 列表
	wiki.addTiddler({ title: "$:/Deck/default/study", list: [topic] });
	wiki.addTiddler({ title: "$:/state/tidme/learning-session", list: [topic], current_index: "0" });

	const cardFilter = wiki.getTiddler("$:/config/Tidme/StoryTiddlerTemplateFilters/card").fields.text;
	const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
	parent.setVariable("currentTiddler", topic);
	const w = wiki.makeWidget({ tree: [] }, { parentWidget: parent, document: fakeDocument });
	const res = wiki.filterTiddlers(cardFilter, w);
	assert.deepStrictEqual([...res], [], "会话中 topic 卡不得匹配复习帧（阅读模式无评分条）");

	// item 卡在会话中仍应落入复习帧
	const item = wiki.filterTiddlers("[tidme.kind[item]]")[0];
	assert.ok(item, "存在 item 卡");
	const p2 = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
	p2.setVariable("currentTiddler", item);
	const w2 = wiki.makeWidget({ tree: [] }, { parentWidget: p2, document: fakeDocument });
	const res2 = wiki.filterTiddlers(cardFilter, w2);
	assert.deepStrictEqual([...res2], ["$:/plugins/keepone/tidme/review/ui/ViewTemplate/tiddler"], "item 卡仍走复习帧");
});

test("study 视图: 评分条/快捷键/卡片正面均对 topic 卡禁显（!tidme.kind[topic]）", () => {
	for (const t of ["study", "shortcut", "front"]) {
		const text = wiki.getTiddler("$:/plugins/keepone/tidme/review/ui/ViewTemplate/" + t).fields.text;
		assert.ok(text.includes("!is[blank]!tidme.kind[topic]"), t + " 模板必须排除 topic 卡（阅读卡不显示评分/复习界面）");
	}
});

test("调度: 默认牌组 state_learn 使用正确的 UTC 日期格式（修复 <now> 损坏格式）", () => {
	const deck = wiki.getTiddler("$:/Deck/default");
	const stateLearn = String(deck.fields.state_learn);
	assert.ok(!stateLearn.includes("[UTC]YYYY0MMDD0hh0mm0ss0XXX"), "不得使用损坏格式（解析为未来日期 → 未来排期卡提前重放）");
	assert.ok(stateLearn.includes("compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>"), "state_learn 使用 TW 核心 UTC 格式");
});

test("reading-list: 渲染 topic 队列（按文档分组 + 进度 + 继续阅读）", () => {
	const rl = tw.modules.execute("$:/plugins/keepone/tidme/import/widgets/reading-list.js");
	// 纯函数：收集 + 分组（其它测试可能添加第二本书；按 docId 找书名甲）
	const cards = rl.collectTopicCards(wiki);
	const groups = rl.groupByDoc(cards);
	const jia = groups.find((g) => g.cards.some((c) => c.breadcrumb.startsWith("书名甲")));
	assert.ok(jia, "书名甲分组存在");
	assert.ok(jia.cards.some((c) => c.kind === "extract"), "摘录卡（topic）在阅读列表");
	assert.ok(!jia.cards.some((c) => c.kind === "cloze"), "挖空卡（item）不在阅读列表");
	// 排序：高优先级在前（用 sectionTitle 替代内层 const section）
	const docId2 = wiki.getTiddler(extractTitle).fields["tidme.doc"];
	const highExtTitle = sectionTitle + "--extract-high";
	wiki.addTiddler({ title: highExtTitle, "tidme.doc": docId2, "tidme.kind": "topic", "tidme.subkind": "extract", "tidme.priority": "5", "tidme.breadcrumb": "书名甲 › 高优摘录", state: "0" });
	const sorted = rl.sortTopicCards(rl.collectTopicCards(wiki).filter((c) => c.breadcrumb.startsWith("书名甲")));
	assert.equal(sorted[0].title, highExtTitle, "优先级 5 排在优先级 50 前");
	// 渲染 widget
	const root = renderWidget(rl, "reading-list");
	const text = collectText(root);
	assert.ok(text.includes("阅读列表"), "标题");
	assert.ok(text.includes("待读"), "计数");
	assert.ok(text.includes("书名甲"), "文档名");
	assert.ok(text.includes("摘"), "摘录卡标记");
	assert.ok(text.includes("继续阅读"), "继续按钮");
	assert.ok(text.includes("清理阅读"), "清理阅读材料按钮");
	assert.ok(text.includes("已读"), "进度文案");
	// compact 模式（侧边栏）：文档分组折叠 + 不含页头"复习测试卡"与进度条
	const compactRoot = renderWidgetEx(rl, "reading-list", { attributes: { compact: "yes" } }).root;
	const ctext = collectText(compactRoot);
	assert.ok(ctext.includes("张待读"), "compact 计数");
	assert.ok(!ctext.includes("去复习"), "compact 不含去复习按钮");
	assert.ok(ctext.includes("书名甲"), "compact 文档名");
});

test("startstudy: 队列过滤器在按钮 transclude 上下文显式解析（$(deckTiddler)$）", () => {
	// 回归：2658977 曾把视图模板的队列过滤器从显式 {$(deckTiddler)$!!card} 改成隐式 {!!card}，
	// 导致「开始学习」按钮经 <$transclude> 渲染时 currentTiddler=按钮自身，{!!card} 取空 → 永远"无新卡"。
	// 1) 视图模板必须使用显式 $(deckTiddler)$ 引用（不依赖 currentTiddler）
	for (const t of ["deck", "tiddler", "tr"]) {
		const text = wiki.getTiddler(`$:/plugins/keepone/tidme/review/ui/ViewTemplate/${t}`).fields.text;
		assert.ok(text.includes("$(deckTiddler)$!!card"), `${t} 模板用显式 $(deckTiddler)$ 引用`);
		assert.ok(!text.includes("[subfilter{!!card}]"), `${t} 模板不得用隐式 {!!card}`);
	}
	// 2) 模拟 tr 行 let + 按钮上下文：filter_queue 应解析出在队卡（而非空）
	wiki.addTiddler({
		title: "按钮队列测试卡", "tidme.kind": "item", "tidme.subkind": "cloze", caption: "B",
		state: "0", due: "20261231000000000", reps: "0", lapses: "0", stability: "0",
		difficulty: "0", elapsed_days: "0", scheduled_days: "0", last_review: "20261231000000000"
	});
	const sim = `<$let
    deckTiddler="$:/Deck/default"
    filter_learn=\`[subfilter{$(deckTiddler)$!!card}] -[subfilter{$(deckTiddler)$!!card_exclude}] +[subfilter{$(deckTiddler)$!!state_learn}] +[sort[due]]\`
    filter_due=\`[subfilter{$(deckTiddler)$!!card}] -[subfilter{$(deckTiddler)$!!card_exclude}] +[subfilter{$(deckTiddler)$!!state_due}] +[subfilter{$(deckTiddler)$!!order_due}]\`
    filter_new=\`[subfilter{$(deckTiddler)$!!card}] -[subfilter{$(deckTiddler)$!!card_exclude}] +[subfilter{$(deckTiddler)$!!state_new}] +[subfilter{$(deckTiddler)$!!order_new}]\`
    filter_unfold=\`[subfilter{$(deckTiddler)$!!card_unfold}]\`
    due-new=\`$(filter_learn)$ $(filter_due)$ $(filter_new)$\`
    new-due=\`$(filter_learn)$ $(filter_new)$ $(filter_due)$\`
    random=\`$(filter_learn)$ [subfilter<filter_random>]\`
    filter_queue=\`\${ [<deckTiddler>get[order]match[new-due]then<new-due>] [<deckTiddler>get[order]match[random]then<random>] ~[<due-new>] }\$\`
>
NEXT: {{{ [subfilter<filter_queue>first[]] }}}
</$let>`;
	wiki.addTiddler({ title: "StartStudySim", text: sim });
	const out = wiki.renderTiddler("text/html", "StartStudySim");
	assert.ok(out.includes("按钮队列测试卡"), "nextTiddler 在按钮上下文能解析出在队卡");
});

test("study 视图: 评分条始终可见（不随 folded 隐藏）", () => {
	// 回归：startstudy/开始复习对 cloze/qa 卡设 folded=hide（非 unfold），
	// 若评分条被 text="hide" 的 reveal 包裹则评分条消失 → 复习无法评分。
	const study = wiki.getTiddler("$:/plugins/keepone/tidme/review/ui/ViewTemplate/study").fields.text;
	const barIdx = study.indexOf("tmc-study-bar");
	const repeatIdx = study.indexOf("fsrs4tw.repeat");
	assert.ok(barIdx !== -1 && repeatIdx > barIdx, "评分条在 sticky 条栏内");
	assert.ok(!study.includes('text="hide"'), "评分条不再被 hide reveal 包裹（folded=hide 时也可见）");
});

test("workflow: 开始复习 startStudy 直达默认牌组第一张在队卡", () => {
	const wf = tw.modules.execute("$:/plugins/keepone/tidme/review/widgets/workflow.js");
	const deckEngine = tw.modules.execute("$:/plugins/keepone/tidme/core/deck-engine.js");
	// 用与 startStudy 相同的队列组合器计算期望的第一张卡
	const df = wiki.getTiddler("$:/Deck/default").fields;
	const expected = wiki.filterTiddlers(deckEngine.composeDeckFilters("$:/Deck/default", df).queue)[0];
	assert.ok(expected, "默认牌组应有在队卡");

	const events = [];
	const fakeWidget = { dispatchEvent: (e) => events.push(e) };
	wf.startStudy(wiki, fakeWidget);

	const studyList = wiki.getTiddler("$:/Deck/default/study");
	assert.ok(studyList, "学习会话 tiddler 已写入");
	assert.ok(String(studyList.fields.list || "").includes(expected), "study list = 队列第一张卡");
	const nav = events.find((e) => e.type === "tm-navigate");
	assert.ok(nav && nav.navigateTo === expected, "导航到队列第一张卡");
	const folded = wiki.getTiddler("$:/state/folded/" + expected);
	assert.ok(folded && ["show", "hide"].includes(folded.fields.text), "折叠态已设置（show/hide）");

	// 无在队卡 → 恭喜分支（不导航、不写 study list）
	const empty = { filterTiddlers: () => [], getTiddler: () => null };
	const ev2 = [];
	wf.startStudy(empty, { dispatchEvent: (e) => ev2.push(e) });
	assert.ok(!ev2.some((e) => e.type === "tm-navigate"), "空队列不导航");
	assert.ok(ev2.some((e) => e.type === "tm-notify"), "空队列弹恭喜");
});

test("workflow: $:/Decks 工作流中心（全局交错学习流 + 阅读目标）", () => {
	const wf = tw.modules.execute("$:/plugins/keepone/tidme/review/widgets/workflow.js");
	// 渲染：主按钮
	const root = renderWidget(wf, "tidme-workflow");
	const text = collectText(root);
	assert.ok(text.includes("开始学习"), "开始学习按钮");
	// 主色按钮 class 链 + SVG 图标（设计系统生效的 DOM 层验证）
	const btns = collectButtons(root);
	const learnBtn = btns.find((b) => collectText(b).includes("开始学习"));
	assert.ok(learnBtn, "找到开始学习按钮");
	assert.ok(String(learnBtn.className).includes("tm-btn--primary"), "开始学习是主色按钮（tm-btn--primary）");
	const svg = learnBtn.childNodes.find((n) => String(n.tagName) === "SVG");
	assert.ok(svg, "开始学习按钮含 SVG 图标");
	// 开始阅读目标：无全局续读点 → 第一待读节卡
	const target1 = wf.globalReadingTarget(wiki);
	assert.ok(target1 && wiki.getTiddler(target1), "开始阅读跳到一张存在节卡");
	// 有全局续读点 → 用它（用命名空间化的 extract 路径）
	wf && wiki.addTiddler({ title: "$:/state/tidme-import/readpoint/global", text: extractTitle });
	const target2 = wf.globalReadingTarget(wiki);
	assert.equal(target2, extractTitle, "有续读点则跳续读点卡");
	// 全无 → 阅读列表页
	const emptyWiki = { filterTiddlers: () => [], getTiddler: () => null };
	assert.equal(wf.globalReadingTarget(emptyWiki), "$:/plugins/keepone/tidme/import/ui/reading-list", "全无跳阅读列表");
});