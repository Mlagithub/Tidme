/*
manager/widgets/deck-ui.ts — 牌组 UI 组件（与今天页 tm 风格统一）

- <$deck-create/> ：「＋ 新建牌组」折叠表单 —— 名称/显示名/成员来源（全库测试卡
  或自定义过滤器）→ core/deck.createDeck（数据层唯一入口）；成功即打开新牌组。
- <$deck-delete deck="<完整标题>"/>：确认删除牌组（默认仅删容器、卡保留；
  subset 提供连卡选项）→ core/deck.deleteDeck。
编辑参数仍走原有 牌组「选项」弹窗（modal/options，字段级 + default 继承）。
*/

declare function require(module: string): any;
const deckMod = require("$:/plugins/keepone/tidme/core/deck.js");
const dom = require("$:/plugins/keepone/tidme/core/dom.js");
const dialog = require("$:/plugins/keepone/tidme/core/dialog.js");
const display = require("$:/plugins/keepone/tidme/core/display.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const el = dom.el;
const captionText = display.captionText;

function toastIn(wrap: HTMLElement, doc: Document, msg: string, kind = "") {
	const t = el(doc, "div", "tm-toast" + (kind ? " tm-toast--" + kind : ""), msg);
	wrap.insertBefore(t, wrap.firstChild);
	setTimeout(() => t.remove(), 3000);
}

/** ＋ 新建牌组 */
function makeDeckCreate(): WidgetCtor {
	class DeckCreateWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const wrap = el(doc, "div", "tm-decks-create");

			const details = el(doc, "details", "tm-decks-create-box");
			const summary = el(doc, "summary", "tm-btn tm-btn--primary", "＋ 新建牌组");
			details.appendChild(summary);

			const form = el(doc, "div", "tm-dashboard-card tm-decks-create-form");
			form.style.cssText = "margin:6px 0 0;padding:10px 14px;";
			const rowOf = (label: string, input: HTMLElement) => {
				const r = el(doc, "div", "tm-decks-create-row");
				r.style.cssText = "display:flex;gap:8px;align-items:center;margin:4px 0;flex-wrap:wrap;";
				r.appendChild(el(doc, "span", "tm-import-muted", label));
				r.appendChild(input);
				return r;
			};
			const nameIn = doc.createElement("input");
			nameIn.className = "tm-input";
			nameIn.placeholder = "名称，如 六级词汇";
			const capIn = doc.createElement("input");
			capIn.className = "tm-input";
			capIn.placeholder = "显示名（留空 = 名称）";
			const srcSel = doc.createElement("select");
			srcSel.className = "tm-input";
			for (const [v, l] of [["item", "全库测试卡（挖空/问答）"], ["custom", "自定义过滤器"]] as const) {
				const o = doc.createElement("option");
				o.value = v; o.textContent = l;
				srcSel.appendChild(o);
			}
			const customIn = doc.createElement("textarea");
			customIn.className = "tm-input";
			customIn.rows = 2;
			customIn.style.display = "none";
			customIn.value = deckMod.DEFAULT_CARD_FILTER || "";
			srcSel.addEventListener("change", () => { customIn.style.display = srcSel.value === "custom" ? "" : "none"; });
			form.appendChild(rowOf("名称", nameIn));
			form.appendChild(rowOf("显示名", capIn));
			form.appendChild(rowOf("成员来源", srcSel));
			form.appendChild(rowOf("过滤器", customIn));
			const btnRow = el(doc, "div", "tm-decks-create-actions");
			btnRow.style.cssText = "display:flex;gap:8px;margin-top:6px;";
			const ok = el(doc, "button", "tm-btn tm-btn--primary", "✔ 创建");
			const cancel = el(doc, "button", "tm-btn", "取消");
			ok.addEventListener("click", () => {
				const name = nameIn.value.trim();
				if (!name) { toastIn(wrap, doc, "请输入牌组名称", "err"); return; }
				try {
					const title = deckMod.createDeck(wiki, {
						name,
						caption: capIn.value.trim() || undefined,
						card: srcSel.value === "custom" ? (customIn.value.trim() || undefined) : undefined
					});
					details.open = false;
					toastIn(wrap, doc, `✔ 已创建「${name}」，可点行内「选项」配置参数`, "ok");
					this.dispatchEvent({ type: "tm-navigate", navigateTo: title });
				} catch (e: any) {
					toastIn(wrap, doc, "创建失败：" + String(e?.message || e), "err");
				}
			});
			cancel.addEventListener("click", () => { details.open = false; });
			btnRow.appendChild(ok);
			btnRow.appendChild(cancel);
			form.appendChild(btnRow);
			details.appendChild(form);
			wrap.appendChild(details);

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return DeckCreateWidget as any;
}

/** 确认删除牌组（options 弹窗 footer 用） */
function makeDeckDelete(): WidgetCtor {
	class DeckDeleteWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const deckTitle = String(this.getAttribute("deck", "") || "");
			const label = this.getAttribute("label", "删除牌组");
			const btn = el(doc, "button", "tm-btn tm-btn--danger", label);
			btn.title = "删除牌组定义（成员卡保留，仍由默认牌组复习）";
			const d = deckTitle ? deckMod.getDeck(wiki, deckTitle) : null;
			if (!d) { btn.setAttribute("disabled", "true"); btn.title = "牌组不存在"; }
			else if (d.title === deckMod.DEFAULT_DECK) { btn.setAttribute("disabled", "true"); btn.title = "默认牌组不可删除"; }
			btn.addEventListener("click", async () => {
				if (!deckTitle || !d) return;
				const subset = deckMod.isSubset(d);
				let also = false;
				if (subset) also = await dialog.confirmDialog(doc, {
					title: "子集牌组",
					message: `《${captionText(wiki, d.fields.caption || d.name, this) || d.name}》是子集牌组。
连成员卡一起删除？
（确定 = 连卡删；取消 = 仅删牌组定义）`,
					confirmLabel: "连卡删", danger: true
				});
				const msg = subset
					? `删除子集牌组${also ? "及其成员卡" : "（卡片保留）"}？`
					: `删除牌组「${captionText(wiki, d.fields.caption || d.name, this) || d.name}」的定义？\n成员卡会保留（挖空/问答卡仍由默认牌组收录）。`;
				if (!(await dialog.confirmDialog(doc, { title: "删除牌组", message: msg, confirmLabel: "删除", danger: true }))) return;
				try {
					const n = deckMod.deleteDeck(wiki, deckTitle, { alsoCards: also });
					this.dispatchEvent({ type: "tm-close-tiddler" });
					this.dispatchEvent({ type: "tm-notify", param: also ? `已删除牌组及 ${n} 张成员卡` : "✔ 已删除牌组（卡片保留）" });
				} catch (e: any) {
					await dialog.alertDialog(doc, { title: "删除失败", message: String((e as any)?.message || e) });
				}
			});
			parent.insertBefore(btn, nextSibling);
			this.domNodes.push(btn);
		}
		refresh() { return false; }
	}
	return DeckDeleteWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["deck-create"] = makeDeckCreate();
exports["deck-delete"] = makeDeckDelete();
