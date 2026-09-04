/*
widgets/workflow.ts — $:/Decks 工作流中心：开始学习按钮

- 开始学习：调起 startGlobalLearning 走 core/deck-engine.composeGlobalLearningQueue
  （默认纯知识卡复习流），写到 $:/state/tidme/learning-session 并跳到首张。
- 可选项「到期阅读材料也加入学习流」写 $:/config/Tidme/QueueMode
  （存在 = 混入 topic：strict=宏观三段式 / interleaved=4:1 交错）。
*/

declare function require(module: string): any;
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
const sessionMod = require("$:/plugins/keepone/tidme/core/session.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const DEFAULT_DECK = "$:/Deck/default";

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

const QUEUE_MODE_TIDDLER = "$:/config/Tidme/QueueMode";

/** 队列选项：$:/config/Tidme/QueueMode 存在 = 混入阅读材料（"strict"=宏观三段式，其余=4:1 交错）；
 *  不存在（默认）= 纯知识卡复习流，阅读材料不打断（阅读走阅读列表/文档页/继续阅读）。 */
function queueOptions(wiki: any): { mode: "interleaved" | "strict"; topics: boolean } {
	const m = String(wiki?.getTiddlerText?.(QUEUE_MODE_TIDDLER, "") || "").trim();
	if (m === "") return { mode: "interleaved", topics: false };
	return { mode: m === "strict" ? "strict" : "interleaved", topics: true };
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
			learnBtn.title = "复习全部到期/新知识卡（挖空/问答）：按 FSRS 到期与新卡顺序连续学习，不混入阅读材料；勾选下方选项可把到期阅读材料也加入（SM 交错）";
			learnBtn.addEventListener("click", () => startGlobalLearning(wiki, this));
			root.appendChild(learnBtn);

			// 可选项：把到期/待读阅读材料（topic）混入学习流（SM 交错；默认纯知识卡）
			const modeRow = el(doc, "div", "tm-decks-mode");
			const modeCheck = doc.createElement("input");
			modeCheck.type = "checkbox";
			modeCheck.checked = queueOptions(wiki).topics;
			modeCheck.title = "勾选后：到期/待读的阅读材料（节卡/摘录）会按 4:1 交错进学习流（SuperMemo 精神）；不勾选则学习流只含知识卡，阅读从阅读列表/文档页进入";
			modeRow.appendChild(modeCheck);
			const modeLabel = el(doc, "span", "tm-import-muted",
				"到期阅读材料也加入学习流（交错）");
			modeLabel.title = modeCheck.title;
			modeRow.appendChild(modeLabel);
			modeCheck.addEventListener("change", () => {
				// 勾选 → 写 QueueMode（含 topic 交错）；取消 → 删 tiddler（纯知识卡）
				if (modeCheck.checked) wiki.addTiddler({ title: QUEUE_MODE_TIDDLER, text: "interleaved" });
				else wiki.deleteTiddler(QUEUE_MODE_TIDDLER);
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
	const { mode, topics } = queueOptions(wiki);
	const queue = deckEngine.composeGlobalLearningQueue((filter: string) => wiki.filterTiddlers(filter), { mode, topics });

	if (!queue || queue.length === 0) {
		widget.dispatchEvent({ type: "tm-confetti-launch" });
		widget.dispatchEvent({ type: "tm-confetti-launch", originY: 0.6, spread: 70, delay: 300 });
		widget.dispatchEvent({ type: "tm-confetti-launch", originY: 0.55, spread: 30, delay: 600 });
		widget.dispatchEvent({ type: "tm-notify", param: "$:/plugins/keepone/tidme/review/notify/congratulation" });
		return;
	}

	const first = queue[0];
	sessionMod.setSession(wiki, {
		list: queue,
		currentIndex: "0",
		mode: mode === "strict" ? "global-strict" : topics ? "global-interleaved" : "items-only"
	});

	wiki.addTiddler({ title: DEFAULT_DECK + "/study", list: queue });
	// 首卡折叠态统一走 ui-utils（item → hide/show，按所属 deck card_unfold）
	uiUtils.prepareCardFold(wiki, first);

	widget.dispatchEvent({ type: "tm-navigate", navigateTo: first });
}

/** 开始阅读目标（开始学习按钮外的"开始阅读"语义）：
 *  全局续读点（最近读过）→ 第一张待读 topic → 阅读列表页 */
function globalReadingTarget(wiki: any): string {
	const g = String(wiki.getTiddler("$:/state/tidme-import/readpoint/global")?.fields?.text || "");
	if (g && wiki.getTiddler(g)) return g;
	const first = wiki.filterTiddlers(
		"[all[shadows+tiddlers]tidme.kind[topic]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]sort[priority]first[]]"
	)[0];
	if (first) return first;
	return "$:/plugins/keepone/tidme/import/ui/reading-list";
}

/** 开始复习：startGlobalLearning 的别名（与"开始学习"同义；历史 API 兼容） */
function startStudy(wiki: any, widget: any): void {
	startGlobalLearning(wiki, widget);
}

exports["tidme-workflow"] = makeWorkflow();
exports.globalReadingTarget = globalReadingTarget;
exports.startStudy = startStudy;
exports.startGlobalLearning = startGlobalLearning;
