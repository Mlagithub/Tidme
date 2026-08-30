/*
widgets/workflow.ts — $:/Decks 工作流中心：开始阅读 / 开始复习 双按钮

双轨一键直达：
- 开始阅读：跳到全局续读点（最近读过的节卡）→ 无则第一张待读节卡 → 无则阅读列表页
- 开始复习：进入默认牌组（测试卡复习流）
按钮用 Tidme tm-btn 风格，点击触发 tm-navigate（与 section-bar 一致的导航约定）。
*/

declare function require(module: string): any;
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const GLOBAL_READPOINT = "$:/state/tidme-import/readpoint/global";
const DEFAULT_DECK = "$:/Deck/default";
const READING_LIST = "$:/plugins/keepone/tidme/import/ui/reading-list";

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

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

			const navigate = (target: string) => {
				this.dispatchEvent({ type: "tm-navigate", navigateTo: target });
			};

			const readBtn = iconButton(doc, "tm-btn tm-btn--primary tm-workflow-btn", "read", "开始阅读");
			readBtn.title = "从上次阅读位置继续（无则跳第一张待读节卡）";
			readBtn.addEventListener("click", () => navigate(globalReadingTarget(wiki)));
			root.appendChild(readBtn);

			const studyBtn = iconButton(doc, "tm-btn tm-workflow-btn", "study", "开始复习");
			studyBtn.title = "进入默认牌组开始复习";
			studyBtn.addEventListener("click", () => navigate(DEFAULT_DECK));
			root.appendChild(studyBtn);

			parent.insertBefore(root, nextSibling);
		}
	}
	return WorkflowWidget as any;
}

/** 开始阅读目标：全局续读点（最近读过的节卡）→ 第一张待读节卡 → 阅读列表页 */
function globalReadingTarget(wiki: any): string {
	const g = String(wiki.getTiddler(GLOBAL_READPOINT)?.fields?.text || "");
	if (g && wiki.getTiddler(g)) return g;
	const first = wiki.filterTiddlers(
		"[all[shadows+tiddlers]tag[.]tidme.kind[section]!has[tidme.done]!has[tidme.suspended]sort[priority]first[]]"
	)[0];
	if (first) return first;
	return READING_LIST;
}

exports["tidme-workflow"] = makeWorkflow();
exports.globalReadingTarget = globalReadingTarget;
