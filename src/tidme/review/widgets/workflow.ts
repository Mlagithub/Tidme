/*
widgets/workflow.ts — $:/Decks 工作流中心：开始阅读 / 开始复习 双按钮

双轨一键直达：
- 开始阅读：跳到全局续读点（最近读过的节卡）→ 无则第一张待读节卡 → 无则阅读列表页
- 开始复习：进入默认牌组（测试卡复习流）
按钮用 Tidme tm-btn 风格，点击触发 tm-navigate（与 section-bar 一致的导航约定）。
*/

declare function require(module: string): any;
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const GLOBAL_READPOINT = "$:/state/tidme-import/readpoint/global";
const DEFAULT_DECK = "$:/Deck/default";
const READING_LIST = "$:/plugins/keepone/tidme/import/ui/reading-list";

// 共享 DOM 工具（实现收敛于 core/ui-utils）
const el = uiUtils.el;

/** 线性 SVG 图标（stroke 跟随文字色；viewBox 24，path 为清晰易辨的书/卡片轮廓） */
const ICON_PATHS: Record<string, string> = {
	read: "M6 3h9a2 2 0 0 1 2 2v16l-6.5-3L6 21V4a1 1 0 0 1 1-1z M6 8h11",
	study: "M12 4l9 5-9 5-9-5 9-5z M6 14l6 3.5L18 14 M6 17l6 3.5L18 17"
};

function svgElement(doc: Document, name: keyof typeof ICON_PATHS): any {
	const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("class", "tm-btn-icon");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	for (const d of ICON_PATHS[name].split(" M")) {
		const sub = (d.startsWith("M") ? "" : "M") + d;
		if (!sub.trim()) continue;
		const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", sub.trim());
		svg.appendChild(path);
	}
	return svg;
}

function iconButton(doc: Document, cls: string, name: keyof typeof ICON_PATHS, label: string): HTMLButtonElement {
	const b = el(doc, "button", cls, "");
	b.appendChild(svgElement(doc, name));
	b.appendChild(el(doc, "span", "", label));
	return b;
}

const SESSION_STATE = "$:/state/tidme/learning-session";
const QUEUE_MODE_TIDDLER = "$:/config/Tidme/QueueMode";

/** 队列模式：$:/config/Tidme/QueueMode = "strict"（宏观三段式）| 其他（interleaved 交错，默认） */
function queueMode(wiki: any): "interleaved" | "strict" {
	const m = String(wiki?.getTiddlerText?.(QUEUE_MODE_TIDDLER, "interleaved") || "").trim();
	return m === "strict" ? "strict" : "interleaved";
}

function makeWorkflow(): any {
	class WorkflowWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const root = el(doc, "div", "tm-decks-actions");
			this.domNodes.push(root);

			const learnBtn = iconButton(doc, "tm-btn tm-btn--primary tm-workflow-btn-hero", "study", "🚀 开始学习");
			learnBtn.title = "进入 SuperMemo 全局动态学习流（自动交错复习到期卡片与阅读优先文章/摘录）";
			learnBtn.addEventListener("click", () => startGlobalLearning(wiki, this));
			root.appendChild(learnBtn);

			// SM 对齐：宏观队列模式切换（strict = 到期卡片 → 到期阅读 → 新导入；默认交错）
			const modeRow = el(doc, "div", "tm-decks-mode");
			const modeCheck = doc.createElement("input");
			modeCheck.type = "checkbox";
			modeCheck.checked = queueMode(wiki) === "strict";
			modeCheck.title = "严格队列：到期卡片 → 到期阅读 → 新导入（宏观三段式）；默认 4:1 交错学习";
			modeRow.appendChild(modeCheck);
			const modeLabel = el(doc, "span", "tm-import-muted",
				"严格队列（到期卡片 → 到期阅读 → 新导入）；默认交错学习");
			modeLabel.title = modeCheck.title;
			modeRow.appendChild(modeLabel);
			modeCheck.addEventListener("change", () => {
				wiki.addTiddler({ title: QUEUE_MODE_TIDDLER, text: modeCheck.checked ? "strict" : "interleaved" });
			});
			root.appendChild(modeRow);

			parent.insertBefore(root, nextSibling);
		}
	}
	return WorkflowWidget as any;
}

/**
 * 全局 SuperMemo 动态交错学习流启动器：
 * 1. 组合到期 Item 与 Priority 排序 Topic 生成动态交错队列
 * 2. 写入全局学习会话 $:/state/tidme/learning-session
 * 3. 导航到首张学习卡（或在无到期任务时发射庆祝粒子）
 */
function startGlobalLearning(wiki: any, widget: any): void {
	const deckEngine = require("$:/plugins/keepone/tidme/core/deck-engine.js");
	const mode = queueMode(wiki);
	const queue = deckEngine.composeGlobalLearningQueue((filter: string) => wiki.filterTiddlers(filter), { mode });

	if (!queue || queue.length === 0) {
		widget.dispatchEvent({ type: "tm-confetti-launch" });
		widget.dispatchEvent({ type: "tm-confetti-launch", originY: 0.6, spread: 70, delay: 300 });
		widget.dispatchEvent({ type: "tm-confetti-launch", originY: 0.55, spread: 30, delay: 600 });
		widget.dispatchEvent({ type: "tm-notify", param: "$:/plugins/keepone/tidme/review/notify/congratulation" });
		return;
	}

	const first = queue[0];
	wiki.addTiddler({
		title: SESSION_STATE,
		list: queue,
		current_index: "0",
		mode: mode === "strict" ? "global-strict" : "global-interleaved"
	});

	const f = deckEngine.composeDeckFilters(DEFAULT_DECK, wiki.getTiddler(DEFAULT_DECK)?.fields || {});
	wiki.addTiddler({ title: DEFAULT_DECK + "/study", list: queue });
	const unfolded = wiki.filterTiddlers(f.unfold);
	wiki.addTiddler({ title: "$:/state/folded/" + first, text: unfolded.includes(first) ? "show" : "hide" });

	widget.dispatchEvent({ type: "tm-navigate", navigateTo: first });
}

/** 开始阅读目标（旧版兼容接口） */
function globalReadingTarget(wiki: any): string {
	const g = String(wiki.getTiddler(GLOBAL_READPOINT)?.fields?.text || "");
	if (g && wiki.getTiddler(g)) return g;
	const first = wiki.filterTiddlers(
		"[all[shadows+tiddlers]tidme.kind[topic]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]sort[priority]first[]]"
	)[0];
	if (first) return first;
	return READING_LIST;
}

function startStudy(wiki: any, widget: any): void {
	startGlobalLearning(wiki, widget);
}

exports["tidme-workflow"] = makeWorkflow();
exports.globalReadingTarget = globalReadingTarget;
exports.startStudy = startStudy;
exports.startGlobalLearning = startGlobalLearning;
