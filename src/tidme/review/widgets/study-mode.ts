/*
widgets/study-mode.ts — 学习模式条（固定底部 pill；会话激活时常驻全局可见）

产品语义：学习是一个**模式**而非页面——会话激活期间无论在看哪个 tiddler，
模式条都提供进度与「结束学习」出口（修复"复习中无结束按钮"断点）。

- 可见性：core/session.getActiveStudy 判定；刷新走唯一机制（core/reactive 谓词嗅探）
- 进度：currentTiddler 在活动队列中的位置；不在队列时只显示"学习中"
- 结束学习：core/session.endSession 统一清场（全局会话 + 全部 <deck>/study +
  $:/temp/tidme/*）→ 导航回今天 → 轻通知
*/

declare function require(module: string): any;
const session = require("$:/plugins/keepone/tidme/core/session.js");
const reactive = require("$:/plugins/keepone/tidme/core/reactive.js");
const dom = require("$:/plugins/keepone/tidme/core/dom.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const el = dom.el;

/** 结束后返回的页面（Wave 3a 上线今天页后改指 $:/Today） */
const EXIT_TARGET = "$:/Today";
const NOTIFY_ENDED = "$:/plugins/keepone/tidme/review/notify/study-ended";

/** 结束学习：统一清场 + 导航 + 通知（导出供测试/复用；widget 只需提供 wiki/dispatchEvent） */
function endStudy(widget: any) {
	session.endSession(widget.wiki);
	try {
		widget.dispatchEvent({ type: "tm-navigate", navigateTo: EXIT_TARGET });
		widget.dispatchEvent({ type: "tm-notify", param: NOTIFY_ENDED });
	} catch { /* 无头环境忽略 */ }
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

function makeStudyModeBar(): WidgetCtor {
	class StudyModeBarWidget extends Widget {
		_container: HTMLElement | null = null;

		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const container = dom.el(this.document, "div", "tm-study-mode");
			container.style.display = "none"; // 未激活时隐藏占位（PageTemplate 单实例）
			this._container = container;
			parent.insertBefore(container, nextSibling);
			this.domNodes.push(container);
			this.build();
		}

		build() {
			const container = this._container;
			if (!container) return;
			const doc = this.document;
			container.textContent = "";
			const study = session.getActiveStudy(this.wiki);
			if (!study) {
				container.style.display = "none";
				return;
			}
			container.style.display = "";
			container.appendChild(el(doc, "span", "tm-study-mode-label", "学习中"));
			const i = study.list.indexOf(this.getVariable("currentTiddler"));
			if (i >= 0) {
				container.appendChild(el(doc, "span", "tm-study-mode-progress", `${i + 1}/${study.list.length}`));
			}
			const btn = el(doc, "button", "tm-btn tm-btn--primary", "结束学习");
			btn.title = "结束本次学习：清空会话与排期队列，返回今天";
			btn.addEventListener("click", () => {
				endStudy(this);
				this.build(); // 同步隐藏（真实环境刷新周期也会触发，这里保证确定性反馈）
			});
			container.appendChild(btn);
		}

		refresh(changedTiddlers: Record<string, any>) {
			if (!this._container) return false;
			let need = false;
			for (const title of Object.keys(changedTiddlers || {})) {
				if (reactive.isSessionChange(title)) {
					need = true;
					break;
				}
			}
			if (need) {
				this.build();
				return true;
			}
			return false;
		}
	}
	return StudyModeBarWidget as any;
}

exports["tidme-study-mode-bar"] = makeStudyModeBar();
exports.endStudy = endStudy;
