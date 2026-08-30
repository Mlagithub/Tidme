/*
widgets/theme.js — 主题切换（浅色/暗色）

- 设置 documentElement.data-tme-dark 触发 core/tokens 的暗色 token 覆盖
- 持久化到 localStorage（tm-theme），下次刷新保持
- 按钮用 tm-btn，图标太阳/月亮随当前主题
*/

declare function require(module: string): any;
const Widget = require("$:/core/modules/widgets/widget.js").widget;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function lsGet(key: string): string | null {
	try { return (globalThis as any).localStorage?.getItem(key) ?? null; } catch { return null; }
}
function lsSet(key: string, value: string): void {
	try { (globalThis as any).localStorage?.setItem(key, value); } catch { /* 忽略 */ }
}
function setTheme(dark: boolean): void {
	try {
		if (dark) document.documentElement.setAttribute("data-tme-dark", "true");
		else document.documentElement.removeAttribute("data-tme-dark");
	} catch { /* 无 document（无头）时忽略 */ }
}

function makeThemeToggle(): any {
	class ThemeWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const root = el(doc, "div", "tm-theme-toggle");
			this.domNodes.push(root);

			const isDark = () => lsGet("tm-theme") === "dark";
			// 初始化：按持久化设置应用主题
			setTheme(isDark());

			const apply = () => {
				const dark = isDark();
				setTheme(dark);
				btn.textContent = dark ? "浅色" : "深色";
				btn.title = dark ? "切换到浅色模式" : "切换到深色模式";
			};
			const btn = el(doc, "button", "tm-btn", "深色");
			btn.addEventListener("click", () => {
				lsSet("tm-theme", isDark() ? "light" : "dark");
				apply();
			});
			root.appendChild(btn);
			apply();

			parent.insertBefore(root, nextSibling);
		}
	}
	return ThemeWidget as any;
}

exports["tidme-theme-toggle"] = makeThemeToggle();
