/*
widgets/nav.ts — 页面间导航条（Tidme 主页面切换 + 分隔线 + 当前页高亮）

渲染：学习中心 · 阅读列表 · 导入中心 · 卡片管理器 · 统计
点击 tm-navigate 切换；当前 tiddler 高亮（主色）。
放各主页面顶部，替换散落的底部链接。
*/

declare function require(module: string): any;
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const NAV: [string, string][] = [
	["$:/Decks", "学习中心"],
	["$:/plugins/keepone/tidme/import/ui/reading-list", "阅读列表"],
	["$:/plugins/keepone/tidme/import/ui/import-center", "导入中心"],
	["$:/plugins/keepone/tidme/manager/ui/card-manager", "卡片管理器"],
	["$:/plugins/keepone/tidme/import/ui/stats", "统计"]
];

// 共享 DOM 工具（实现收敛于 core/ui-utils）
const el = uiUtils.el;

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
