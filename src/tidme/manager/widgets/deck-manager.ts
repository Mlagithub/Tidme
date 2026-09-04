/*
manager/widgets/deck-manager.ts — 牌组管理（M2：牌组的创建/编辑/删除/参数配置）

- 列表：全部牌组（default/用户/subset 标记）+ 负载计数（stats.deckLoad）
- 新建：名称 + 显示名 + 成员来源（默认全库 item / 自定义过滤器）
- 编辑：caption/description/成员过滤器/顺序/每日新卡/FSRS p/淹死阈值（低层 fsrs4tw
  字段由 core/deck.configToFields 统一生成，页面不手填）
- 删除：默认仅删牌组定义（卡保留）；subset 可连同成员卡删除
一切读写经 core/deck.ts（唯一入口）。
*/

declare function require(module: string): any;
const deckMod = require("$:/plugins/keepone/tidme/core/deck.js");
const stats = require("$:/plugins/keepone/tidme/core/stats.js");
const events = require("$:/plugins/keepone/tidme/core/events.js");
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

const el = uiUtils.el;

function makeDeckManager(): WidgetCtor {
	class DeckManagerWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const wrap = el(doc, "div", "tm-deck-manager");

			const toast = (msg: string, kind = "") => {
				const t = el(doc, "div", "tm-toast" + (kind ? " tm-toast--" + kind : ""), msg);
				wrap.insertBefore(t, wrap.firstChild);
				setTimeout(() => t.remove(), 2500);
			};

			const mkField = (label: string, input: HTMLElement) => {
				const row = el(doc, "div", "tm-dm-field");
				row.appendChild(el(doc, "label", "tm-dm-label", label));
				row.appendChild(input);
				return row;
			};
			const mkText = (value: string, placeholder = "") => {
				const i = doc.createElement("input") as HTMLInputElement;
				i.className = "tm-input";
				i.value = value;
				i.placeholder = placeholder;
				return i;
			};
			const mkArea = (value: string, placeholder = "") => {
				const i = doc.createElement("textarea") as HTMLTextAreaElement;
				i.className = "tm-input";
				i.rows = 2;
				i.value = value;
				i.placeholder = placeholder;
				return i;
			};

			const fieldObj = (f: Record<string, any>) => ({
				caption: String(f.caption || ""),
				description: String(f.description || ""),
				card: String(f.card || ""),
				card_exclude: String(f.card_exclude || ""),
				card_unfold: String(f.card_unfold || ""),
				order: String(f.order || "due-new"),
				order_new: String(f.order_new || ""),
				newPerDay: (String(f.order_new || "").match(/limit\[(\d+)\]/) || [])[1] || "",
				p: String(f.p || ""),
				leech_threshold: String(f.leech_threshold || "8")
			});

			const render = () => {
				wrap.textContent = "";

				const head = el(doc, "div", "tm-dm-head");
				head.appendChild(el(doc, "div", "tm-section-title", "🃏 牌组管理"));
				head.appendChild(el(doc, "div", "tm-import-muted",
					"牌组是复习流的容器（成员 = card 过滤器）。删除牌组默认只删容器、卡片保留；卡片管理器/批量操作与学习中心均读取同一份牌组配置。"));
				wrap.appendChild(head);

				// —— 新建（折叠表单）——
				const createBox = el(doc, "details", "tm-dm-create");
				const sum = el(doc, "summary", "tm-btn", "＋ 新建牌组");
				createBox.appendChild(sum);
				const form = el(doc, "div", "tm-dm-form");
				const nameIn = mkText("", "名称（如 六级词汇 / 本周新词）");
				const capIn = mkText("", "显示名（留空 = 名称）");
				const srcSel = doc.createElement("select");
				srcSel.className = "tm-input";
				const srcOpts = [
					["item", "全库测试卡（挖空/问答 + 手动卡）"],
					["custom", "自定义过滤器（下方高级框内输入）"]
				];
				for (const [v, l] of srcOpts) {
					const o = doc.createElement("option");
					o.value = v; o.textContent = l;
					srcSel.appendChild(o);
				}
				const customIn = mkArea(deckMod.DEFAULT_CARD_FILTER || "", "成员过滤器（TW filter）");
				customIn.style.display = "none";
				srcSel.addEventListener("change", () => { customIn.style.display = srcSel.value === "custom" ? "" : "none"; });
				form.appendChild(mkField("名称", nameIn));
				form.appendChild(mkField("显示名", capIn));
				form.appendChild(mkField("成员来源", srcSel));
				form.appendChild(mkField("过滤器", customIn));
				const btnRow = el(doc, "div", "tm-dm-actions");
				const ok = el(doc, "button", "tm-btn tm-btn-primary", "✔ 创建");
				const cancel = el(doc, "button", "tm-btn", "取消");
				ok.addEventListener("click", () => {
					const name = nameIn.value.trim();
					if (!name) { toast("请输入牌组名称", "err"); return; }
					try {
						const cfg: any = {
							name,
							caption: capIn.value.trim() || undefined,
							card: srcSel.value === "custom" ? (customIn.value.trim() || undefined) : undefined
						};
						deckMod.createDeck(wiki, cfg);
						createBox.open = false;
						render();
						toast(`✔ 已创建牌组「${name}」`, "ok");
					} catch (e: any) { toast("创建失败：" + String(e?.message || e), "err"); }
				});
				cancel.addEventListener("click", () => { createBox.open = false; });
				btnRow.appendChild(ok);
				btnRow.appendChild(cancel);
				form.appendChild(btnRow);
				createBox.appendChild(form);
				wrap.appendChild(createBox);

				// —— 列表 ——
				const decks = deckMod.listDecks(wiki);
				if (!decks.length) {
					wrap.appendChild(el(doc, "div", "tm-empty", "暂无牌组——在上方新建。"));
					return;
				}
				for (const title of decks) {
					const d = deckMod.getDeck(wiki, title)!;
					const subset = deckMod.isSubset(d);
					const cards = deckMod.deckCards(wiki, title).map((t) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
					const load = stats.deckLoad(cards);
					const caption = uiUtils.captionText(wiki, d.fields.caption || d.name, this) || d.name;

					const cardEl = el(doc, "div", "tm-dm-deck" + (subset ? " tm-dm-deck-subset" : ""));
					const row = el(doc, "div", "tm-dm-deck-row");
					row.appendChild(el(doc, "strong", "", caption));
					if (subset) row.appendChild(el(doc, "span", "tm-badge tm-badge-due", "子集"));
					if (title === deckMod.DEFAULT_DECK) row.appendChild(el(doc, "span", "tm-import-muted", "（默认）"));
					row.appendChild(el(doc, "span", "tm-dm-count", `${cards.length} 卡 · 新 ${load.newCount} · 学 ${load.learn} · 到 ${load.due} · 逾 ${load.overdue}`));
					row.appendChild(el(doc, "span", "tm-import-muted", title));
					cardEl.appendChild(row);

					// 编辑表单
					const ed = el(doc, "details", "tm-dm-edit");
					ed.appendChild(el(doc, "summary", "tm-btn tm-btn-sm", "⚙ 编辑参数"));
					const f = fieldObj(d.fields);
					const fCap = mkText(f.caption);
					const fDesc = mkText(f.description);
					const fCard = mkArea(f.card);
					const fOrder = doc.createElement("select");
					for (const [v, l] of [["due-new", "到期优先 (due-new)"], ["new-due", "新卡优先 (new-due)"], ["random", "随机"]]) {
						const o = doc.createElement("option");
						o.value = v; o.textContent = l;
						if (f.order === v) o.selected = true;
						fOrder.appendChild(o);
					}
					const fNew = mkText(f.newPerDay, "不设");
					const fP = mkArea(f.p);
					const fLeech = mkText(f.leech_threshold);
					const adv = el(doc, "details", "tm-dm-adv");
					adv.appendChild(el(doc, "summary", "tm-import-muted", "高级（card_exclude / unfold / FSRS 权重 p）"));
					const fExcl = mkArea(f.card_exclude);
					const fUnfold = mkArea(f.card_unfold);
					adv.appendChild(mkField("card_exclude", fExcl));
					adv.appendChild(mkField("card_unfold", fUnfold));
					adv.appendChild(mkField("FSRS 权重 p (JSON)", fP));
					adv.appendChild(mkField("淹死阈值 leech_threshold", fLeech));

					const box = el(doc, "div", "tm-dm-form");
					box.appendChild(mkField("显示名", fCap));
					box.appendChild(mkField("描述", fDesc));
					box.appendChild(mkField("成员过滤器 (card)", fCard));
					box.appendChild(mkField("顺序", fOrder));
					box.appendChild(mkField("每日新卡上限", fNew));
					box.appendChild(adv);

					const act = el(doc, "div", "tm-dm-actions");
					const save = el(doc, "button", "tm-btn tm-btn-primary", "✔ 保存");
					save.addEventListener("click", () => {
						try {
							// 高级参数经 configToFields 重新生成低层字段，避免手写不一致
							const cfg: any = {
								name: d.name,
								caption: fCap.value.trim() || undefined,
								description: fDesc.value.trim() || undefined,
								card: fCard.value.trim() || undefined,
								cardExclude: fExcl.value.trim() || null,
								cardUnfold: fUnfold.value.trim() || null,
								order: (fOrder.value === "due-new" || fOrder.value === "new-due" || fOrder.value === "random" ? fOrder.value : "due-new"),
								newPerDay: Number(fNew.value) > 0 ? Number(fNew.value) : undefined,
								leechThreshold: fLeech.value ? Number(fLeech.value) : undefined,
								p: fP.value.trim() ? fP.value : undefined
							};
							if (subset && d.fields["tidme.subset-doc"]) cfg.sourceDoc = String(d.fields["tidme.subset-doc"]);
							const fresh = deckMod.configToFields(wiki, cfg);
							// 重算 order_new（含 limit）落库
							fresh.order_new = String(fresh.order_new);
							deckMod.updateDeck(wiki, title, fresh);
							ed.open = false;
							render();
							toast("✔ 已保存", "ok");
						} catch (e: any) { toast("保存失败：" + String(e?.message || e), "err"); }
					});
					act.appendChild(save);
					// 删除
					const del = el(doc, "button", "tm-btn tm-btn--danger", "🗑 删除");
					del.addEventListener("click", () => {
						const also = subset && confirm(`《${caption}》是子集牌组。\n是否连同其成员卡一并删除？\n（确定=连卡删除；取消=仅删牌组定义）`);
						const msg = subset
							? `删除子集牌组「${caption}」${also ? "及其成员卡" : "（卡片保留）"}？`
							: `删除牌组「${caption}」的定义？\n成员卡会保留（item 卡仍由默认复习流收录）。`;
						if (!confirm(msg)) return;
						try {
							const n = deckMod.deleteDeck(wiki, title, { alsoCards: !!also });
							events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
							render();
							toast(also ? `已删除牌组及 ${n} 张成员卡` : "✔ 已删除牌组（卡片保留）", "ok");
						} catch (e: any) { toast("删除失败：" + String(e?.message || e), "err"); }
					});
					act.appendChild(del);
					box.appendChild(act);
					ed.appendChild(box);
					cardEl.appendChild(ed);
					wrap.appendChild(cardEl);
				}
			};
			render();

			// 事件总线：队列变化（评分/批量操作/复习本书建删）→ 重建计数
			this._rerender = render;
			if (!this._bound) {
				this._bound = true;
				events.bindComponentRefresh([events.EVENTS.QUEUE_CHANGED, events.EVENTS.IMPORT_DONE], () => this._rerender?.());
			}

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return DeckManagerWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["deck-manager"] = makeDeckManager();
