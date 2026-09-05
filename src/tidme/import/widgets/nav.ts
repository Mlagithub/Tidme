/*
widgets/nav.ts — 页面间导航条（Tidme 主页面切换 + 分隔线 + 当前页高亮）

渲染：今天 · 阅读 · 导入 · 管理 · 统计
点击 tm-navigate 切换；当前 tiddler 高亮（主色）。
放各主页面顶部，替换散落的底部链接。
*/

declare function require(module: string): any;
const dom = require("$:/plugins/keepone/tidme/core/dom.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const NAV: [string, string][] = [
	["$:/Today", "今天"],
	["$:/plugins/keepone/tidme/import/ui/reading-list", "阅读"],
	["$:/plugins/keepone/tidme/import/ui/import-center", "导入"],
	["$:/plugins/keepone/tidme/manager/ui/card-manager", "管理"],
	["$:/plugins/keepone/tidme/import/ui/stats", "统计"]
];

// 共享 DOM 工具（实现收敛于 core/dom）
const el = dom.el;

function makeNav(): any {
	class NavWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const root = el(doc, "nav", "tm-nav");
			this.domNodes.push(root);

			const current = this.getVariable("currentTiddler") || this.getVariable("currentTiddlerTitle") || "";
			for (const [title, label] of NAV) {
				const a = el(doc, "a", "tm-nav-item" + (current === title ? " tm-nav-active" : ""), label);
				a.href = "#";
				a.addEventListener("click", (e: Event) => {
					e.preventDefault();
					this.dispatchEvent({ type: "tm-navigate", navigateTo: title });
				});
				root.appendChild(a);
			}

			parent.insertBefore(root, nextSibling);
		}
	}
	return NavWidget as any;
}

exports["tidme-nav"] = makeNav();
