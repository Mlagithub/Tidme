/*
browser.test.mjs — 侧边栏/管理组件冒烟测试（node:test）

boot TW + 插件，造一张文档/卡片数据，渲染 card-browser / queue-ops / stats-panel，
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
const pluginDir = path.resolve(here, "../out-m2");
const plugins = ["$__plugins_tidme_core", "$__plugins_tidme_review", "$__plugins_tidme_import", "$__plugins_tidme_manager", "$__plugins_tidme_read", "$__tidme_languages_zh-Hans"]
	.map((n) => path.join(pluginDir, n + ".json"))
	.filter((f) => fs.existsSync(f))
	.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
if (!plugins.length) throw new Error("缺少 out-m2 产物，先运行 node tools/build-plugins.cjs");

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

let wiki, tw, cardBrowser, queueOps, statsPanel, cardManager, sectionBar, splitTool, importFile;
test.before(async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-browser-"));
	tw = TiddlyWiki.TiddlyWiki();
	tw.preloadTiddlerArray(plugins);
	tw.boot.argv = [tmp];
	tw.boot.boot();
	wiki = tw.wiki;
	// 造数据：一本书 + 2 节 + 1 摘录 + 1 挖空 + 自动 deck
	const pipeline = tw.modules.execute("$:/plugins/tidme/import/pipeline.js");
	const r = await pipeline.runSplit({ text: "# 书名甲\n\n第一章正文。\n\n## 小节乙\n\n第二节正文。", title: "书名甲", type: "text/markdown", minChars: 0 });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	const section = r.tiddlers.find((x) => Array.isArray(x.tags) && x.tags.includes("?"));
	wiki.addTiddler({
		title: "书名甲 › 第一章 › 摘录", tags: ["."], caption: "摘",
		text: "<blockquote>第一章的摘录</blockquote>",
		"tidme.doc": r.docId, "tidme.parent": section.title, "tidme.kind": "extract",
		"tidme.breadcrumb": `${section["tidme.path"]} › 摘录`, "tidme.source": "书名甲",
		"tidme.format": "markdown", state: "0", due: "20261231000000000"
	});
	// W1 双轨：挖空卡（item）带 ? 进主动复习流；摘录卡（topic）带 . 不进
	wiki.addTiddler({
		title: "书名甲 › 第一章 › 挖空", tags: ["?"], caption: "首都",
		text: "",
		"tidme.doc": r.docId, "tidme.parent": section.title, "tidme.kind": "cloze",
		"tidme.breadcrumb": `${section["tidme.path"]} › 挖空`, "tidme.source": "书名甲",
		"tidme.format": "markdown", state: "0", due: "20261231000000000"
	});
	cardBrowser = tw.modules.execute("$:/plugins/tidme/manager/widgets/card-browser.js");
	queueOps = tw.modules.execute("$:/plugins/tidme/manager/widgets/queue-ops.js");
	statsPanel = tw.modules.execute("$:/plugins/tidme/import/widgets/stats-panel.js");
	cardManager = tw.modules.execute("$:/plugins/tidme/manager/widgets/card-manager.js");
	sectionBar = tw.modules.execute("$:/plugins/tidme/import/widgets/section.js");
	splitTool = tw.modules.execute("$:/plugins/tidme/import/widgets/split.js");
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

test("card-browser: 树形包含牌组/文档/卡片", () => {
	const root = renderWidget(cardBrowser, "card-browser");
	const text = collectText(root);
	assert.ok(text.includes("书名甲"), "应含文档名");
	assert.ok(text.includes("小节乙"), "应含节标题");
	assert.ok(text.includes("摘"), "应含摘录标记");
	assert.ok(text.includes("✕"), "应有删除按钮");
});

test("queue-ops: 每牌组渲染批量操作按钮", () => {
	const root = renderWidget(queueOps, "queue-ops");
	const text = collectText(root);
	assert.ok(text.includes("顺延7d"), "应有顺延按钮");
	assert.ok(text.includes("遗忘"), "应有遗忘按钮");
	assert.ok(text.includes("书名甲"), "应含牌组 caption");
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
	assert.ok(text.includes("优先↑") && text.includes("设高"), "G3 批量优先级操作");
	assert.ok(text.includes("书名甲"), "应含文档");
	assert.ok(text.includes("小节乙"), "应含节");
});

test("card-manager: Done 语义（去 ? 和 . + tidme.done）与恢复", () => {
	const done = cardManager.doneFields({ title: "节", tags: ["?", "."], state: "0" });
	assert.equal(done.tags.length, 0, "Done 去掉 ? 和 .");
	assert.equal(done["tidme.done"], "yes");
	// 恢复：topic（section/extract）回阅读态补 .，item（cloze/qa/无 kind）补 ?
	const resumed = cardManager.resumeFields({ ...done, "tidme.kind": "section" });
	assert.ok(resumed.tags.includes("."), "section 恢复补回 .（阅读态）");
	assert.ok(!resumed.tags.includes("?"), "section 恢复不补 ?（topic 不进复习流）");
	assert.equal(resumed["tidme.done"], undefined, "恢复删除 tidme.done");
	// item（挖空卡）恢复补回 ?
	const resumeCloze = cardManager.resumeFields({ ...done, "tidme.kind": "cloze" });
	assert.ok(resumeCloze.tags.includes("?"), "cloze 恢复补回 ?（item 进复习流）");
});

test("card-manager: 全部卡片可见（含已读卡与手动散卡）", () => {
	// 手动散卡：无 tidme.*，仅带 ? 学习标签（模拟用户手动建卡）
	wiki.addTiddler({ title: "手动散卡甲", tags: ["?"], state: "0", due: "20261231000000000" });
	// 已读一张节卡（模拟其他入口的 Done）
	const secTitle = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[section]]")[0];
	wiki.addTiddler({ ...wiki.getTiddler(secTitle).fields, tags: [], "tidme.done": "yes" });

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
	const title = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[section]tag[?]]")[0];
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
	const title = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[section]tag[?]]")[0];
	const { root, w } = renderWidgetEx(sectionBar, "section-bar", { variables: { currentTiddler: title } });
	// 初始未读：有「✔ 已读」按钮，无「✓ 已读」状态
	assert.ok(collectText(root).includes("✔ 已读"), "初始为未读状态");
	// 外部把本卡标为已读（模拟文档页/管理器入口）
	const f = wiki.getTiddler(title).fields;
	wiki.addTiddler({ ...f, tags: [], "tidme.done": "yes" });
	assert.equal(w.refresh({ [title]: { modified: true } }), true, "refresh 处理了变化");
	const text2 = collectText(root);
	assert.ok(text2.includes("✓ 已读"), "重建后显示已读状态");
	assert.ok(text2.includes("↩ 重新加入"), "重建后显示重新加入按钮");
	assert.ok(!text2.includes("✔ 已读"), "已读按钮消失");
});

test("事件总线: 队列变化通知 → 监听组件重建（stats-panel 数字更新）", async () => {
	const events = tw.modules.execute("$:/plugins/tidme/core/events.js");
	// 先渲染统计面板（注册事件监听）
	const root = renderWidget(statsPanel, "stats-panel");
	// 新导入第二本书（直接写库，模拟切分/导入落库）
	const pipeline2 = tw.modules.execute("$:/plugins/tidme/import/pipeline.js");
	const r = await pipeline2.runSplit({ text: "# 第二本书\n\n第二章正文。", title: "第二本书", type: "text/markdown", minChars: 0 });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	// 直接进程内通知（等价于 tm-tidme-* 消息经 rootWidget 桥接到达）
	events.notifyTidme(events.EVENTS.IMPORT_DONE);
	events.notifyTidme(events.EVENTS.QUEUE_CHANGED);
	const text = collectText(root);
	assert.ok(text.includes("第二本书"), "事件后统计面板重建，出现新书进度");
});

test("split-tool: 预览干预按钮（并入上一节 / 从此拆分）", async () => {
	// 场景 1：短节全合并 → 容器显示「从此拆分」（无并入按钮）
	wiki.addTiddler({ title: "干预源", type: "text/markdown", text: "# 章A\n\n内容一。\n\n## 节A1\n\n内容二。\n\n# 章B\n\n内容三。" });
	wiki.addTiddler({ title: "$:/temp/tidme/split/source", text: "干预源" });
	const root = renderWidget(splitTool, "split-tool");
	await new Promise((r) => setTimeout(r, 120)); // 等待异步 runSplit 预览
	let text = collectText(root);
	assert.ok(text.includes("⇊"), "合并容器显示「从此拆分」");
	assert.ok(!text.includes("⇈"), "单节场景无并入按钮");
	// 场景 2：长文本两节独立 → 第二节显示「并入上一节」
	const longA = "第一段内容。".repeat(200); // ~1200 字（> minChars 600，独立）
	const longB = "第三段内容。".repeat(200);
	wiki.addTiddler({ title: "干预源2", type: "text/markdown", text: `# 章甲\n\n${longA}\n\n# 章乙\n\n${longB}` });
	wiki.addTiddler({ title: "$:/temp/tidme/split/source", text: "干预源2" });
	const root2 = renderWidget(splitTool, "split-tool");
	await new Promise((r) => setTimeout(r, 120));
	text = collectText(root2);
	assert.ok(text.includes("⇈"), "独立节显示「并入上一节」按钮");
});

test("doc-resume: 子集复习按钮（复习本书）", () => {
	// 文档页渲染（书名甲有在队卡 → 显示「复习本书」）
	const root = renderWidget(sectionBar, "doc-resume", { variables: { currentTiddler: "书名甲" } });
	const text = collectText(root);
	assert.ok(text.includes("继续阅读"), "继续阅读按钮");
	assert.ok(text.includes("复习本书"), "子集复习按钮（G7）");
	assert.ok(text.includes("已读"), "进度文案");
});

test("import-file: 服务端后台处理选项（G10）", () => {
	// 需要 importFile 模块
	if (!importFile) importFile = tw.modules.execute("$:/plugins/tidme/import/widgets/import.js");
	const root = renderWidget(importFile, "import-file");
	const text = collectText(root);
	assert.ok(text.includes("服务端后台处理"), "服务端处理选项（G10）");
});

test("align: 重复导入（A）——同内容再导入不覆盖 SRS 进度", async () => {
	const pipeline2 = tw.modules.execute("$:/plugins/tidme/import/pipeline.js");
	const align = tw.modules.execute("$:/plugins/tidme/core/align.js");
	// 首次切分并写库（minChars=0 保持两节独立）
	const r1 = await pipeline2.runSplit({ text: "# 重导书\n\n甲内容。\n\n## 乙\n\n乙内容。", title: "重导书", type: "text/markdown", minChars: 0 });
	for (const t of r1.tiddlers) wiki.addTiddler(t);
	// 给「甲」节设 SRS 进度（第一节：面包屑 = 文档标题 › H1 标题）
	const jia = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[section]tidme.breadcrumb[重导书 › 重导书]]`)[0]
		|| wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[section]]`)[0];
	assert.ok(jia, "找到甲节");
	wiki.addTiddler({ ...wiki.getTiddler(jia).fields, state: "2", reps: "5", due: "20261231000000000" });
	// 再次导入同一内容（模拟重复导入/剪藏更新）
	const r2 = await pipeline2.runSplit({ text: "# 重导书\n\n甲内容。\n\n## 乙\n\n乙内容。", title: "重导书", type: "text/markdown", minChars: 0 });
	const oldCards = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[section]!is[draft]]`)
		.map((t) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
	const sectionCards = r2.tiddlers.filter((x) => Array.isArray(x.tags) && x.tags.includes("?"));
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
	const root = renderWidget(sectionBar, "doc-resume", { variables: { currentTiddler: "书名甲" } });
	const text = collectText(root);
	assert.ok(text.includes("摘录/挖空"), "摘录聚合区标题");
	assert.ok(text.includes("摘"), "摘录 kind 标记");
	assert.ok(text.includes("待提炼"), "无子挖空的摘录显示待提炼（W3）");
	assert.ok(text.includes("回原文"), "回原文操作");
	// 给摘录卡加一个子挖空 → 已加工
	const extractTitle = wiki.filterTiddlers("[tidme.kind[extract]]")[0];
	const extFields = wiki.getTiddler(extractTitle).fields;
	wiki.addTiddler({
		title: extractTitle + " › 挖空", tags: ["?"], state: "0",
		"tidme.doc": extFields["tidme.doc"], "tidme.parent": extractTitle, "tidme.kind": "cloze",
		"tidme.breadcrumb": `${extFields["tidme.breadcrumb"]} › 挖空`
	});
	const root2 = renderWidget(sectionBar, "doc-resume", { variables: { currentTiddler: "书名甲" } });
	assert.ok(collectText(root2).includes("已加工"), "有子挖空的摘录显示已加工（W3）");
});

test("section-bar: 摘录卡加工按钮（✂ 挖空）", () => {
	const extractTitle = wiki.filterTiddlers("[tidme.kind[extract]]")[0];
	assert.ok(extractTitle, "测试数据应有摘录卡");
	const root = renderWidget(sectionBar, "section-bar", { variables: { currentTiddler: extractTitle } });
	const text = collectText(root);
	assert.ok(text.includes("✂ 挖空"), "摘录卡显示挖空加工按钮（G4）");
	assert.ok(text.includes("源自"), "来源链接");
});

test("section-bar: 忽略按钮（G3）", () => {
	const title = wiki.filterTiddlers("[has[tidme.kind]tidme.kind[section]tag[?]]")[0];
	const root = renderWidget(sectionBar, "section-bar", { variables: { currentTiddler: title } });
	const text = collectText(root);
	assert.ok(text.includes("忽略"), "未读节显示忽略按钮");
});

test("W1 双轨: 默认牌组只装 item（含挖空，不含节卡/摘录）", () => {
	const deck = wiki.getTiddler("$:/Deck/default");
	assert.ok(deck, "默认牌组存在");
	const queue = wiki.filterTiddlers(String(deck.fields.card));
	assert.ok(queue.includes("书名甲 › 第一章 › 挖空"), "挖空卡（item）进复习流");
	assert.ok(!queue.includes("书名甲 › 第一章 › 摘录"), "摘录卡（topic）不进复习流");
	assert.ok(!queue.some((t) => wiki.getTiddler(t)?.fields?.["tidme.kind"] === "section"), "节卡（topic）不进复习流");
	assert.ok(queue.includes("手动散卡甲"), "无 kind 手动卡按 item 进复习流");
	// 自动牌组 = 本书 topic 阅读牌组（tag[.]）
	const autoDeck = wiki.getTiddler("$:/Deck/read/书名甲");
	assert.ok(autoDeck, "自动阅读牌组存在");
	const readQueue = wiki.filterTiddlers(String(autoDeck.fields.card));
	// 前面测试已把两节都标为已读，这里补一张未读节卡验证"未读节卡进阅读牌组"
	const docId = wiki.getTiddler("书名甲 › 第一章 › 摘录").fields["tidme.doc"];
	wiki.addTiddler({ title: "书名甲 › 新节", tags: ["?", "."], "tidme.doc": docId, "tidme.kind": "section", state: "0" });
	const readQueue2 = wiki.filterTiddlers(String(autoDeck.fields.card));
	assert.ok(readQueue2.includes("书名甲 › 新节"), "未读节卡在阅读牌组");
	assert.ok(readQueue.includes("书名甲 › 第一章 › 摘录"), "摘录卡在阅读牌组");
	assert.ok(!readQueue.includes("书名甲 › 第一章 › 挖空"), "挖空卡不在阅读牌组");
	assert.ok(!readQueue.includes("书名甲 › 书名甲"), "已读节卡（done）不在阅读牌组");
});

test("reading-list: 渲染 topic 队列（按文档分组 + 进度 + 继续阅读）", () => {
	const rl = tw.modules.execute("$:/plugins/tidme/import/widgets/reading-list.js");
	// 纯函数：收集 + 分组（W2）
	const cards = rl.collectTopicCards(wiki);
	const groups = rl.groupByDoc(cards);
	const jia = groups.find((g) => g.cards[0].breadcrumb.startsWith("书名甲"));
	assert.ok(jia, "书名甲分组存在");
	assert.ok(jia.cards.some((c) => c.kind === "extract"), "摘录卡（topic）在阅读列表");
	assert.ok(!jia.cards.some((c) => c.kind === "cloze"), "挖空卡（item）不在阅读列表");
	// 排序：高优先级在前
	const docId2 = wiki.getTiddler("书名甲 › 第一章 › 摘录").fields["tidme.doc"];
	wiki.addTiddler({ title: "书名甲 › 高优摘录", tags: ["."], "tidme.doc": docId2, "tidme.kind": "extract", "tidme.priority": "5", "tidme.breadcrumb": "书名甲 › 高优摘录", state: "0" });
	const sorted = rl.sortTopicCards(rl.collectTopicCards(wiki).filter((c) => c.breadcrumb.startsWith("书名甲")));
	assert.equal(sorted[0].title, "书名甲 › 高优摘录", "优先级 5 排在优先级 50 前");
	// 渲染 widget
	const root = renderWidget(rl, "reading-list");
	const text = collectText(root);
	assert.ok(text.includes("阅读列表"), "标题");
	assert.ok(text.includes("待读"), "计数");
	assert.ok(text.includes("书名甲"), "文档名");
	assert.ok(text.includes("摘"), "摘录卡标记");
	assert.ok(text.includes("继续阅读"), "继续按钮");
	assert.ok(text.includes("已读"), "进度文案");
});
