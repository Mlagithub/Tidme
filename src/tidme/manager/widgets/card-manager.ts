/*
widgets/card-manager.ts — 统一卡片管理器 v2

对标 SuperMemo 的管理三件套（Contents 知识树 / Browser 子集浏览 / Find elements）：
- 视图过滤：全部 / 在队 / 已读 / 搁置 / 逾期（定义一个"子集"）
- 组织方式：按文档（树，默认，全量稳定）/ 按牌组（树，含「未入组」兜底）/ 列表（Browser 式平铺，可排序、行预览联动）
- 每卡：状态徽章 + 类型 + 优先级 + 标题(点击打开) + 行内操作(读/回/删除)
- 批量工具条：选中卡 → 顺延/提前/移出队列/搁置/恢复/遗忘/删除

卡片 = 任何带 tidme.* 的 tiddler 或带 ?/. 学习标签的 tiddler（含手动建卡）。
"全部"视图计数与实际显示一致：按文档树全量；按牌组树由各牌组分支 + 未入组分支兜底全量。
Done 语义：移出队列 = 置 tidme.done（kind 决定归属：item 出默认牌组，topic 出阅读列表）。
*/

declare function require(module: string): any;
const sched = require("$:/plugins/keepone/tidme/core/scheduler.js");
const stats = require("$:/plugins/keepone/tidme/core/stats.js");
const events = require("$:/plugins/keepone/tidme/core/events.js");
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
const deckMod = require("$:/plugins/keepone/tidme/core/deck.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

type View = "all" | "inqueue" | "done" | "suspended" | "overdue";
type Org = "doc" | "deck" | "list";

const VIEWS: { id: View; label: string }[] = [
	{ id: "all", label: "全部" },
	{ id: "inqueue", label: "在队" },
	{ id: "done", label: "已读" },
	{ id: "suspended", label: "搁置" },
	{ id: "overdue", label: "逾期" }
];

const ORGS: { id: Org; label: string; tip: string }[] = [
	{ id: "doc", label: "按文档", tip: "所有卡片按文档/面包屑树形组织（含已读/搁置/散卡）" },
	{ id: "deck", label: "按牌组", tip: "按学习牌组组织，未入组卡片收进「未入组」分支" },
	{ id: "list", label: "列表", tip: "全部卡片平铺（SuperMemo Browser 式）：可排序、勾选、预览" }
];

interface Card { title: string; fields: Record<string, any> }

interface DeckInfo { title: string; caption: string; strict: Set<string>; loose: Set<string> }

// 共享 DOM/徽章/标签工具（实现收敛于 core/ui-utils）
const el = uiUtils.el;
const badgeOf = uiUtils.badgeOf;
const kindMark = uiUtils.kindMark;
const stateLabel = uiUtils.stateLabel;
const dueLabel = uiUtils.dueLabel;
const intervalLabel = uiUtils.intervalLabel;
const repsLabel = uiUtils.repsLabel;
const lapsesLabel = uiUtils.lapsesLabel;
const diffLabel = uiUtils.diffLabel;
const dateLabel = uiUtils.dateLabel;

/** 卡片收集：带 tidme.kind 的 tiddler（topic/item）+ 无 kind 但有 FSRS 字段的手动卡。
 * 排除文档汇总页（仅有 tidme.doc/tag，无 kind、无 FSRS 字段）。 */
const CARD_FILTER =
	"[all[shadows+tiddlers]!is[draft]has[tidme.kind]] " +
	"[all[shadows+tiddlers]!is[draft]!has[tidme.kind]has[state]has[due]]";

/** Done：移出队列（core scheduler 实现） */
function doneFields(fields: Record<string, any>): Record<string, any> {
	return sched.doneCard(fields);
}

/** 恢复：回到队列（core scheduler 实现） */
function resumeFields(fields: Record<string, any>): Record<string, any> {
	return sched.restoreCard(fields);
}

function makeCardManager(): WidgetCtor {
	class CardManagerWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const wrap = el(doc, "div", "tm-card-manager");

			// 可选属性：view / org（模板可固定初始视图与组织方式）
			const viewAttr = this.getAttribute("view", "") as View;
			const orgAttr = this.getAttribute("org", "") as Org;
			let view: View = VIEWS.some((v) => v.id === viewAttr) ? viewAttr : "all";
			let org: Org = ORGS.some((o) => o.id === orgAttr) ? orgAttr : "doc";
			let sortKey: "breadcrumb" | "priority" | "due" | "deck" | "mixed" = "breadcrumb";
			let sortAsc = true;
			let searchText = ""; // 查找：按标题/面包屑过滤当前视图
			let previewTitle: string | null = null;
			let editTitle: string | null = null; // 单卡参数编辑（对标 Element parameters）
			const selected = new Set<string>();
			let lastCheckedCardTitle: string | null = null;
			let renderedCardTitles: string[] = [];
			let allCards: Card[] = [];
			let deckInfos: DeckInfo[] = [];
			let bulkCb: HTMLInputElement | null = null;
			let selLabel: HTMLElement | null = null;
			let visibleCards: Card[] = [];
			let groupCbUpdaters: (() => void)[] = [];
			let cardCbUpdaters: (() => void)[] = [];

			const updateSelectionUI = () => {
				const visibleCount = visibleCards.length;
				const selectedVisibleCount = visibleCards.filter((c) => selected.has(c.title)).length;

				if (bulkCb) {
					bulkCb.checked = visibleCount > 0 && selectedVisibleCount === visibleCount;
					bulkCb.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCount;
				}
				if (selLabel) {
					selLabel.textContent = `已选 ${selected.size}/${visibleCount} 张`;
				}
				for (const u of groupCbUpdaters) u();
				for (const u of cardCbUpdaters) u();
			};

			// P3 toast 反馈（面板内临时提示；写库动作后调用）
			const toast = (msg: string, kind = "") => {
				const t = el(doc, "div", "tm-toast" + (kind ? " tm-toast--" + kind : ""), msg);
				wrap.insertBefore(t, wrap.firstChild);
				setTimeout(() => t.remove(), 2500);
			};

			const collectAll = () => {
				allCards = wiki.filterTiddlers(CARD_FILTER)
					.filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i)
					.map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }));
deckInfos = deckMod.listDecks(wiki).map((deck: string) => {
					const f = wiki.getTiddler(deck)?.fields || {};
					return {
						title: deck,
						caption: uiUtils.captionText(wiki, f.caption || deck.split("/").pop() || deck, this),
						strict: new Set(deckMod.deckCards(wiki, deck)),
						loose: new Set(deckMod.deckCards(wiki, deck, { strict: false }))
					};
				})			};

			const inView = (f: Record<string, any>, v: View): boolean => {
				const suspended = f["tidme.suspended"] === "yes";
				const done = sched.isCardDone(f);
				if (v === "inqueue") return !done && !suspended;
				if (v === "done") return done;
				if (v === "suspended") return suspended;
				if (v === "overdue") return String(f.state || "0") === "2" && sched.parseTwDate(f.due).getTime() < Date.now();
				return true;
			};

			const decksOf = (c: Card): DeckInfo[] => deckInfos.filter((d) => d.loose.has(c.title));
			const anyStrict = (c: Card): boolean => deckInfos.some((d) => d.strict.has(c.title));

			const crumbOf = (c: Card): string => String(c.fields["tidme.breadcrumb"] || c.title);
			const isDescendantOf = (child: Card, parent: Card): boolean => {
				if (child.title === parent.title) return false;
				const parentCrumb = crumbOf(parent);
				const childCrumb = crumbOf(child);
				if (childCrumb.startsWith(parentCrumb + " › ")) return true;
				let p = String(child.fields["tidme.parent"] || "");
				while (p) {
					if (p === parent.title) return true;
					const pt = wiki.getTiddler(p);
					p = pt ? String(pt.fields["tidme.parent"] || "") : "";
				}
				return false;
			};
			const docNameOf = (c: Card): string => {
				const key = String(c.fields["tidme.doc"] || c.fields["tidme.parent"] || "");
				if (!key) return "未分组";
				const first = crumbOf(c).split(" › ")[0];
				return first || key;
			};

			/** 按文档分组（组间按文档名排序；docKey 为空 → 未分组） */
			const docGroupsOf = (cards: Card[]): [string, Card[]][] => {
				const m = new Map<string, Card[]>();
				for (const c of cards) {
					const key = String(c.fields["tidme.doc"] || c.fields["tidme.parent"] || "");
					if (!m.has(key)) m.set(key, []);
					m.get(key)!.push(c);
				}
				return [...m.entries()].sort((a, b) => {
					const na = docNameOf(a[1][0]); const nb = docNameOf(b[1][0]);
					return na < nb ? -1 : na > nb ? 1 : 0;
				});
			};

			/** 卡片行通用操作：读（移出队列）/ 回（恢复）+ 删除 */
			const appendOps = (row: HTMLElement, c: Card) => {
				const inQueue = !sched.isCardDone(c.fields) && c.fields["tidme.suspended"] !== "yes";
				if (inQueue) {
					const readBtn = el(doc, "button", "tm-cm-op", "读");
					readBtn.title = "移出队列（已读）";
					readBtn.addEventListener("click", () => {
						wiki.addTiddler(doneFields(c.fields));
						events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
						render();
					});
					row.appendChild(readBtn);
				} else {
					const resumeBtn = el(doc, "button", "tm-cm-op", "回");
					resumeBtn.title = "恢复到学习队列";
					resumeBtn.addEventListener("click", () => {
						wiki.addTiddler(resumeFields(c.fields));
						events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
						render();
					});
					row.appendChild(resumeBtn);
				}
				const del = el(doc, "button", "tm-cm-op tm-cm-del", "✕");
				del.title = "删除卡片";
				del.addEventListener("click", () => {
					selected.delete(c.title);
					wiki.deleteTiddler(c.title);
					events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
					render();
				});
				row.appendChild(del);
			};

			/** 卡片行基础：复选框 + 状态 + 类型 + 优先级 + 标题链接 */
			const appendRowBase = (row: HTMLElement, c: Card, cb: HTMLInputElement) => {
				const bd = badgeOf(c.fields);
				const badge = el(doc, "span", `tm-badge tm-cm-badge ${bd.cls}`, bd.text);
				badge.title = stateLabel(c.fields); // P2：徽章 tooltip
				row.appendChild(badge);
				const km = kindMark(c.fields);
				if (km) row.appendChild(el(doc, "span", "tm-cm-kind", km));
				const pri = c.fields["tidme.priority"];
				if (pri !== undefined) {
					row.appendChild(el(doc, "span", "tm-cm-pri", `p${String(pri).padStart(2, "0")}`));
				}
				const link = el(doc, "a", "tc-tiddlylink tm-cm-link",
					String(c.fields["tidme.breadcrumb"] || c.title).split(" › ").pop() || c.title);
				link.href = "#";
				link.title = crumbOf(c);
				link.addEventListener("click", (e: Event) => {
					e.preventDefault();
					this.dispatchEvent({ type: "tm-navigate", navigateTo: c.title });
				});
				row.appendChild(link);
				const updateCardCb = () => {
					const children = allCards.filter((child) => isDescendantOf(child, c));
					if (children.length > 0) {
						const selChildrenCount = children.filter((child) => selected.has(child.title)).length;
						const selfSel = selected.has(c.title);
						cb.checked = selfSel && selChildrenCount === children.length;
						cb.indeterminate = (selfSel || selChildrenCount > 0) && !(selfSel && selChildrenCount === children.length);
					} else {
						cb.checked = selected.has(c.title);
						cb.indeterminate = false;
					}
				};
				cardCbUpdaters.push(updateCardCb);
				cb.addEventListener("click", (e: MouseEvent) => {
					if (e.shiftKey && lastCheckedCardTitle && renderedCardTitles.includes(lastCheckedCardTitle)) {
						const idx1 = renderedCardTitles.indexOf(lastCheckedCardTitle);
						const idx2 = renderedCardTitles.indexOf(c.title);
						if (idx1 !== -1 && idx2 !== -1) {
							const start = Math.min(idx1, idx2);
							const end = Math.max(idx1, idx2);
							const range = renderedCardTitles.slice(start, end + 1);
							const checked = cb.checked;
							for (const title of range) {
								if (checked) selected.add(title); else selected.delete(title);
							}
						}
					} else {
						const checked = cb.checked;
						if (checked) {
							selected.add(c.title);
						} else {
							selected.delete(c.title);
						}
						for (const child of allCards) {
							if (isDescendantOf(child, c)) {
								if (checked) selected.add(child.title); else selected.delete(child.title);
							}
						}
					}
					lastCheckedCardTitle = c.title;
					updateSelectionUI();
				});
			};

			/** 空状态（P0：tm-empty 组件） */
			const emptyEl = (text: string, icon = "🗂") => {
				const e = el(doc, "div", "tm-empty", "");
				e.appendChild(el(doc, "div", "tm-empty-icon", icon));
				e.appendChild(el(doc, "div", "", text));
				return e;
			};

			/** 树折叠状态持久化（P2）：$:/state/tidme/manager/fold/<view>/<key>，text = open/closed */
			const foldState = (view: string, key: string): string =>
				`$:/state/tidme/manager/fold/${view}/${encodeURIComponent(key)}`;
			const isFoldOpen = (stateTitle: string, defOpen: boolean): boolean => {
				const v = wiki.getTiddlerText(stateTitle, "");
				if (v === "open") return true;
				if (v === "closed") return false;
				return defOpen;
			};
			const bindFold = (details: HTMLElement, stateTitle: string) => {
				details.addEventListener("toggle", () => {
					wiki.addTiddler({ title: stateTitle, text: (details as any).open ? "open" : "closed" });
				});
			};
			/** 文档分组 details（带折叠状态） */
			const docDetails = (view: string, key: string, docCards: Card[]): HTMLElement => {
				const dd = el(doc, "details", "tm-cm-doc");
				dd.open = isFoldOpen(foldState(view, key), true);
				bindFold(dd, foldState(view, key));
				const dsum = el(doc, "summary", "", "");

				// Checkbox for doc group
				const groupCb = doc.createElement("input");
				groupCb.type = "checkbox";
				groupCb.className = "tm-cm-group-cb";
				const updateDocGroupCb = () => {
					const docSelCount = docCards.filter((c) => selected.has(c.title)).length;
					groupCb.checked = docCards.length > 0 && docSelCount === docCards.length;
					groupCb.indeterminate = docSelCount > 0 && docSelCount < docCards.length;
				};
				updateDocGroupCb();
				groupCbUpdaters.push(updateDocGroupCb);
				groupCb.addEventListener("click", (e) => {
					e.stopPropagation(); // Prevent toggling the details
				});
				groupCb.addEventListener("change", () => {
					if (groupCb.checked) {
						for (const c of docCards) selected.add(c.title);
					} else {
						for (const c of docCards) selected.delete(c.title);
					}
					updateSelectionUI();
				});
				dsum.appendChild(groupCb);

				dsum.appendChild(el(doc, "span", "tm-cm-doc-title",
					`${docNameOf(docCards[0])}（${docCards.length}）`));
				dd.appendChild(dsum);
				const sorted = [...docCards].sort((a: Card, b: Card) => {
					const pa = crumbOf(a); const pb = crumbOf(b);
					return pa < pb ? -1 : pa > pb ? 1 : 0;
				});
				for (const c of sorted) renderCardRow(dd, c);
				return dd;
			};

			/** 树形：按文档组织（全量，默认） */
			const renderDocTree = (treeBox: HTMLElement, cards: Card[]) => {
				const groups = docGroupsOf(cards);
				if (!groups.length) {
					treeBox.appendChild(emptyEl("当前视图下没有卡片。"));
					return;
				}
				for (const [key, docCards] of groups) {
					treeBox.appendChild(docDetails("doc", key, docCards));
				}
			};

			/** 树形：按牌组组织（牌组分支 + 未入组兜底） */
			const renderDeckTree = (treeBox: HTMLElement, cards: Card[]) => {
				if (!deckInfos.length) {
					treeBox.appendChild(emptyEl("暂无牌组——导入/切分后自动创建。未入组卡片见下方「未入组」分支。", "🃏"));
				}
				for (const d of deckInfos) {
					const deckCards = cards.filter((c) => d.strict.has(c.title));
					const details = el(doc, "details", "tm-cm-deck");
					const deckFold = foldState("deck", d.title);
					details.open = isFoldOpen(deckFold, deckCards.length > 0);
					bindFold(details, deckFold);
					const ds = el(doc, "summary", "", "");

					// Deck checkbox
					const deckCb = doc.createElement("input");
					deckCb.type = "checkbox";
					deckCb.className = "tm-cm-group-cb";
					const updateDeckCb = () => {
						const deckSelCount = deckCards.filter((c) => selected.has(c.title)).length;
						deckCb.checked = deckCards.length > 0 && deckSelCount === deckCards.length;
						deckCb.indeterminate = deckSelCount > 0 && deckSelCount < deckCards.length;
					};
					updateDeckCb();
					groupCbUpdaters.push(updateDeckCb);
					deckCb.addEventListener("click", (e) => {
						e.stopPropagation();
					});
					deckCb.addEventListener("change", () => {
						if (deckCb.checked) {
							for (const c of deckCards) selected.add(c.title);
						} else {
							for (const c of deckCards) selected.delete(c.title);
						}
						updateSelectionUI();
					});
					ds.appendChild(deckCb);

					ds.appendChild(el(doc, "strong", "", ` ${d.caption}（${deckCards.length}）`));
					details.appendChild(ds);
					if (deckCards.length) {
						const groups = docGroupsOf(deckCards);
						for (const [docKey, docCards] of groups) {
							details.appendChild(docDetails("deck", d.title + "/" + docKey, docCards));
						}
					}
					treeBox.appendChild(details);
				}
				// 未入组：不被任何牌组命中的卡（已读/搁置/手动散卡）
				const orphans = cards.filter((c) => !anyStrict(c));
				const ob = el(doc, "details", "tm-cm-deck tm-cm-orphan");
				const orphanFold = foldState("deck", "__orphan__");
				ob.open = isFoldOpen(orphanFold, orphans.length > 0);
				bindFold(ob, orphanFold);
				const os = el(doc, "summary", "", "");

				// Orphans checkbox
				const orphanCb = doc.createElement("input");
				orphanCb.type = "checkbox";
				orphanCb.className = "tm-cm-group-cb";
				const updateOrphanCb = () => {
					const orphanSelCount = orphans.filter((c) => selected.has(c.title)).length;
					orphanCb.checked = orphans.length > 0 && orphanSelCount === orphans.length;
					orphanCb.indeterminate = orphanSelCount > 0 && orphanSelCount < orphans.length;
				};
				updateOrphanCb();
				groupCbUpdaters.push(updateOrphanCb);
				orphanCb.addEventListener("click", (e) => {
					e.stopPropagation();
				});
				orphanCb.addEventListener("change", () => {
					if (orphanCb.checked) {
						for (const c of orphans) selected.add(c.title);
					} else {
						for (const c of orphans) selected.delete(c.title);
					}
					updateSelectionUI();
				});
				os.appendChild(orphanCb);

				os.appendChild(el(doc, "strong", "", ` 未入组（${orphans.length}）`));
				os.title = "不属于任何牌组队列的卡片：已读、搁置或手动创建的散卡";
				ob.appendChild(os);
				if (orphans.length) {
					const groups = docGroupsOf(orphans);
					for (const [docKey, docCards] of groups) {
						ob.appendChild(docDetails("deck", "__orphan__/" + docKey, docCards));
					}
				}
				treeBox.appendChild(ob);
			};

			/** 树行：复选框 + 徽章 + 标题 + 操作（缩进按 breadcrumb 深度） */
			const renderCardRow = (parentEl: HTMLElement, c: Card) => {
				renderedCardTitles.push(c.title);
				const row = el(doc, "div", "tm-cm-card");
				const depth = Math.max(0, crumbOf(c).split(" › ").length - 1);
				row.style.paddingLeft = `${depth * 0.9}em`;
				const cb = doc.createElement("input");
				cb.type = "checkbox";
				cb.checked = selected.has(c.title);
				row.appendChild(cb);
				appendRowBase(row, c, cb);
				appendOps(row, c);
				parentEl.appendChild(row);
			};

			/** 列表行（Browser 式表格行，P2）：勾选 + 状态 + 类型 + 优先 + 标题 + 牌组 + 到期 + 间隔/重复/难度 + 操作 */
			const renderListRow = (tbody: HTMLElement, c: Card) => {
				renderedCardTitles.push(c.title);
				const tr = el(doc, "tr", "tm-cm-listrow");
				const cbTd = el(doc, "td", "tm-cm-cell-cb");
				const cb = doc.createElement("input");
				cb.type = "checkbox";
				cb.checked = selected.has(c.title);
				cbTd.appendChild(cb);
				tr.appendChild(cbTd);
				// 状态/类型/优先/标题（flex 单元）
				const baseTd = el(doc, "td", "tm-cm-cell-flex", "");
				appendRowBase(baseTd, c, cb);
				tr.appendChild(baseTd);
				// 牌组列
				const ds = decksOf(c);
				tr.appendChild(el(doc, "td", "tm-cm-col-deck", ds.length ? ds.map((d) => d.caption).join("·") : "—"));
				// 到期列
				tr.appendChild(el(doc, "td", "tm-cm-col-due", dueLabel(c.fields)));
				// 信息列（对标 Element data）
				tr.appendChild(el(doc, "td", "tm-cm-col-info", intervalLabel(c.fields)));
				tr.appendChild(el(doc, "td", "tm-cm-col-info", repsLabel(c.fields)));
				tr.appendChild(el(doc, "td", "tm-cm-col-info", diffLabel(c.fields)));
				// 操作列（图标按钮）
				const opTd = el(doc, "td", "tm-cm-cell-flex", "");
				appendOps(opTd, c);
				tr.appendChild(opTd);
				// 行点击 → 预览联动（对标 SuperMemo Browser 的 Synchronization）
				tr.addEventListener("click", (e: Event) => {
					const t = e.target as HTMLElement;
					if (t && (t.tagName === "A" || t.tagName === "BUTTON" || t.tagName === "INPUT")) return;
					previewTitle = previewTitle === c.title ? null : c.title;
					editTitle = null;
					render();
				});
				tbody.appendChild(tr);
			};

			/** 列表排序比较 */
			const cmpCards = (a: Card, b: Card): number => {
				let r = 0;
				if (sortKey === "mixed") {
					const sorted = sched.sortPriorityMixedQueue([a, b], "hybrid");
					r = sorted[0] === a ? -1 : 1;
				} else if (sortKey === "priority") {
					const pa = Number(a.fields["tidme.priority"] ?? 99);
					const pb = Number(b.fields["tidme.priority"] ?? 99);
					r = pa - pb;
				} else if (sortKey === "due") {
					const da = String(a.fields.state || "0") === "2" ? sched.parseTwDate(a.fields.due).getTime() : Infinity;
					const db = String(b.fields.state || "0") === "2" ? sched.parseTwDate(b.fields.due).getTime() : Infinity;
					r = da - db;
				} else if (sortKey === "deck") {
					const da = decksOf(a).map((d) => d.caption).join("·");
					const db = decksOf(b).map((d) => d.caption).join("·");
					r = da < db ? -1 : da > db ? 1 : 0;
				} else {
					const pa = crumbOf(a); const pb = crumbOf(b);
					r = pa < pb ? -1 : pa > pb ? 1 : 0;
				}
				return sortAsc ? r : -r;
			};

			/** 列表视图（P2：真 <table>，表头 sticky + 排序箭头 + hover） */
			const renderList = (listBox: HTMLElement, cards: Card[]) => {
				const table = el(doc, "table", "tm-cm-table");
				const thead = el(doc, "thead", "");
				const trh = el(doc, "tr", "");
				const allTd = el(doc, "th", "tm-cm-cell-cb", "");
				trh.appendChild(allTd);
				trh.appendChild(el(doc, "th", "", "状态"));
				trh.appendChild(el(doc, "th", "", "类型"));
				const th = (label: string, key?: "breadcrumb" | "priority" | "due" | "deck" | "mixed") => {
					const t = el(doc, "th", "");
					if (key) {
						const b = el(doc, "button", "tm-cm-sort" + (sortKey === key ? " tm-cm-sort-active" : ""),
							label + (sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""));
						b.title = "点击排序";
						b.addEventListener("click", () => {
							if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
							render();
						});
						t.appendChild(b);
					} else {
						t.textContent = label;
					}
					return t;
				};
				trh.appendChild(th("优先", "priority"));
				trh.appendChild(th("混合", "mixed"));
				trh.appendChild(th("标题", "breadcrumb"));
				trh.appendChild(th("牌组", "deck"));
				trh.appendChild(th("到期", "due"));
				trh.appendChild(th("间隔"));
				trh.appendChild(th("重复"));
				trh.appendChild(th("难度"));
				trh.appendChild(th("操作"));
				thead.appendChild(trh);
				table.appendChild(thead);

				if (!cards.length) {
					listBox.appendChild(emptyEl("当前视图下没有卡片。"));
					return;
				}
				const tbody = el(doc, "tbody", "");
				const sorted = [...cards].sort(cmpCards);
				for (const c of sorted) renderListRow(tbody, c);
				table.appendChild(tbody);
				listBox.appendChild(table);

				// 预览联动区（对标 SuperMemo Browser Synchronization + Element data + Element parameters）
				const prev = previewTitle ? allCards.find((c) => c.title === previewTitle) : null;
				if (prev) {
					const pv = el(doc, "div", "tm-cm-preview");
					const f = prev.fields;
					pv.appendChild(el(doc, "div", "tm-cm-preview-head",
						`${crumbOf(prev)} · ${kindMark(f) || "节"} · p${String(f["tidme.priority"] ?? "-").padStart(2, "0")} · ${stateLabel(f)}${dueLabel(f) !== "—" ? " · 到期 " + dueLabel(f) : ""}`));
					// 信息网格（对标 Element data：Dates/Interval/Repetitions/Difficulty/DSR）
					const grid = el(doc, "div", "tm-cm-info-grid");
					const info = (label: string, value: any) => {
						const s = el(doc, "span", "");
						s.appendChild(el(doc, "span", "tm-cm-info-label", label));
						s.appendChild(doc.createTextNode(String(value ?? "—")));
						grid.appendChild(s);
					};
					info("下次到期", dueLabel(f));
					info("上次复习", dateLabel(f.last_review));
					info("间隔", intervalLabel(f));
					info("重复", repsLabel(f));
					info("遗忘", lapsesLabel(f));
					info("稳定性", f.stability !== undefined && f.stability !== "" ? String(Number(f.stability).toFixed(1)) : "—");
					info("难度", diffLabel(f));
					info("已过天数", f.elapsed_days !== undefined && f.elapsed_days !== "" ? String(Number(f.elapsed_days).toFixed(1)) : "—");
					info("牌组", decksOf(prev).map((d) => d.caption).join("·") || "—");
					if (f["tidme.comment"]) info("注释", f["tidme.comment"]);
					pv.appendChild(grid);
					// 单卡参数编辑（对标 Element parameters）
					if (editTitle === prev.title) {
						pv.appendChild(editForm(prev));
					} else {
						const editBtn = el(doc, "button", "tm-cm-op", "✎ 编辑参数");
						editBtn.title = "修改下次到期 / 优先级 / 注释（对标 SuperMemo Element parameters）";
						editBtn.addEventListener("click", () => { editTitle = prev.title; render(); });
						pv.appendChild(editBtn);
					}
					// 正文预览
					const body = el(doc, "div", "tm-cm-preview-body");
					const text = String(f.text || "").replace(/\s+/g, " ").trim();
					body.appendChild(el(doc, "span", "", text.slice(0, 400) + (text.length > 400 ? " …" : "")));
					pv.appendChild(body);
					listBox.appendChild(pv);
				}
			};

			/** 单卡参数编辑表单（对标 Element parameters：下次到期 / 优先级 / 注释） */
			const editForm = (c: Card) => {
				const box = el(doc, "div", "tm-cm-edit");
				const f = c.fields;
				const row = (label: string, input: HTMLElement) => {
					const r = el(doc, "div", "tm-cm-edit-row");
					r.appendChild(el(doc, "span", "tm-cm-info-label", label));
					r.appendChild(input);
					box.appendChild(r);
				};
				const dueInput = doc.createElement("input");
				dueInput.type = "text";
				dueInput.value = dueLabel(f) !== "—" ? dueLabel(f) : "";
				dueInput.placeholder = "YYYY-MM-DD（下次到期）";
				row("下次到期", dueInput);
				const priInput = doc.createElement("input");
				priInput.type = "number";
				priInput.min = "0";
				priInput.max = "100";
				priInput.value = String(f["tidme.priority"] ?? "");
				priInput.placeholder = "0-100（0 最高）";
				row("优先级", priInput);
				const commentInput = doc.createElement("input");
				commentInput.type = "text";
				commentInput.value = String(f["tidme.comment"] || "");
				commentInput.placeholder = "注释（tidme.comment）";
				row("注释", commentInput);
				const save = el(doc, "button", "tm-btn tm-btn--primary", "✔ 保存");
				save.addEventListener("click", () => {
					const patch: Record<string, any> = {};
					const dueVal = String(dueInput.value || "").trim();
					if (dueVal) {
						const m = dueVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
						// 17 位 UTC 编码（YYYYMMDD + 9 位 0），与 schema.twDateString 兼容；parseTwDate 只认 17 位
						if (m) patch.due = `${m[1]}${m[2]}${m[3]}000000000`;
					}
					const priVal = String(priInput.value || "").trim();
					if (priVal !== "" && Number.isFinite(Number(priVal))) {
						patch["tidme.priority"] = String(Math.max(0, Math.min(100, Math.round(Number(priVal)))));
					}
					patch["tidme.comment"] = String(commentInput.value || "");
					const ex = wiki.getTiddler(c.title);
					if (ex) wiki.addTiddler({ ...ex.fields, ...patch });
					editTitle = null;
					events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
					render();
					toast("✔ 已保存卡片参数", "ok");
				});
				const cancel = el(doc, "button", "tm-btn", "取消");
				cancel.addEventListener("click", () => { editTitle = null; render(); });
				const r = el(doc, "div", "tm-cm-edit-row");
				r.appendChild(save);
				r.appendChild(cancel);
				box.appendChild(r);
				return box;
			};

			/** 重新渲染整个面板 */
			const render = () => {
				const oldBody = wrap.querySelector(".tm-cm-body") as HTMLElement | null;
				const savedScrollTop = oldBody ? oldBody.scrollTop : 0;

				wrap.textContent = "";
				collectAll();
				renderedCardTitles = [];
				groupCbUpdaters = [];
				cardCbUpdaters = [];
				// 查找：按标题/面包屑包含过滤
				const matches = (c: Card) => {
					if (!searchText.trim()) return true;
					const hay = String(c.title + " " + (c.fields["tidme.breadcrumb"] || "")).toLowerCase();
					return hay.includes(searchText.trim().toLowerCase());
				};
				visibleCards = allCards.filter((c) => inView(c.fields, view) && matches(c));

				// 工具栏（sticky：查找/视图/组织/批量操作固定在顶部）
				const toolbar = el(doc, "div", "tm-cm-toolbar");
				const topRow = el(doc, "div", "tm-cm-top-row");

				// 查找输入框
				const searchRow = el(doc, "div", "tm-cm-search-row");
				const input = el(doc, "input", "tm-cm-search");
				input.placeholder = "查找卡片...";
				input.value = searchText;
				input.addEventListener("input", () => {
					searchText = (input.value || "").trim().toLowerCase();
					render();
				});
				searchRow.appendChild(input);
				if (searchText) {
					const clear = el(doc, "button", "tm-btn tm-cm-clear", "✕");
					clear.addEventListener("click", () => { searchText = ""; render(); });
					searchRow.appendChild(clear);
				}
				topRow.appendChild(searchRow);

				// 组织方式切换
				const orgRow = el(doc, "div", "tm-cm-orgs");
				for (const o of ORGS) {
					const b = el(doc, "button", "tm-btn" + (org === o.id ? " tm-btn--active" : ""), o.label);
					b.title = o.tip;
					b.addEventListener("click", () => { org = o.id; render(); });
					orgRow.appendChild(b);
				}
				topRow.appendChild(orgRow);

				// 视图过滤按钮（计数 = 该子集实际卡数）
				const viewRow = el(doc, "div", "tm-cm-views");
				for (const v of VIEWS) {
					const count = v.id === "all" ? allCards.length
						: allCards.filter((c) => inView(c.fields, v.id)).length;
					const b = el(doc, "button", "tm-btn" + (view === v.id ? " tm-btn--active" : ""),
						`${v.label}(${count})`);
					b.addEventListener("click", () => { view = v.id; render(); });
					viewRow.appendChild(b);
				}
				topRow.appendChild(viewRow);

				toolbar.appendChild(topRow);

				// 批量工具条（单行排列，删除“勾选卡片后可批量操作”文本）
				const bar = el(doc, "div", "tm-cm-bar");
				const row = el(doc, "div", "tm-cm-bar-row", "");

				// Top-level bulk select checkbox
				const visibleCount = visibleCards.length;
				const selectedVisibleCount = visibleCards.filter((c) => selected.has(c.title)).length;

				const bulkCbGroup = el(doc, "span", "tm-cm-bar-group", "");
				bulkCb = doc.createElement("input") as HTMLInputElement;
				bulkCb.type = "checkbox";
				bulkCb.className = "tm-cm-group-cb";
				bulkCb.title = "全选/清空所有当前可见卡片";
				bulkCb.checked = visibleCount > 0 && selectedVisibleCount === visibleCount;
				bulkCb.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCount;
				bulkCb.addEventListener("change", () => {
					if (bulkCb?.checked) {
						for (const c of visibleCards) selected.add(c.title);
					} else {
						for (const c of visibleCards) selected.delete(c.title);
					}
					updateSelectionUI();
				});
				bulkCbGroup.appendChild(bulkCb);

				selLabel = el(doc, "span", "tm-cm-sel-info", `已选 ${selected.size}/${visibleCount} 张`);
				bulkCbGroup.appendChild(selLabel);
				row.appendChild(bulkCbGroup);

				const schedGroup = el(doc, "span", "tm-cm-bar-group", "");
				const priGroup = el(doc, "span", "tm-cm-bar-group", "");
				const stateGroup = el(doc, "span", "tm-cm-bar-group", "");
				const dangerGroup = el(doc, "span", "tm-cm-bar-group", "");

				const batch = (label: string, apply: (f: Record<string, any>) => Record<string, any>, destructive = false) => {
					const b = el(doc, "button", "tm-btn" + (destructive ? " tm-btn--danger" : ""), label);
					b.addEventListener("click", () => {
						// P2：危险操作确认
						const confirmFn = (globalThis as any).confirm;
						if (destructive && typeof confirmFn === "function" &&
							!confirmFn(`确定删除选中的 ${selected.size} 张卡片？此操作不可恢复。`)) return;
						let n = 0;
						for (const title of selected) {
							const t = wiki.getTiddler(title);
							if (!t) continue;
							if (destructive) wiki.deleteTiddler(title);
							else wiki.addTiddler({ ...t.fields, ...apply(t.fields) });
							n++;
						}
						selected.clear();
						events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
						render();
						toast(destructive ? `已删除 ${n} 张卡片` : `${label}：已处理 ${n} 张`, destructive ? "err" : "ok");
					});
					return b;
				};

				schedGroup.appendChild(batch("顺延7d", (f) => sched.postponeCard(f, 7)));
				schedGroup.appendChild(batch("提前", () => sched.advanceCard()));
				schedGroup.appendChild(batch("遗忘", () => sched.forgetCard()));
				const autoBtn = el(doc, "button", "tm-cm-btn", "⚡ 顺延过载");
				autoBtn.title = "自动按优先级顺延低优先级的逾期卡片（保留高优先级卡片）";
				autoBtn.addEventListener("click", () => {
					let cfg: any = {};
					try { cfg = JSON.parse(wiki.getTiddlerText("$:/config/Tidme/AutoPostpone", "{}") || "{}"); } catch { /* 默认配置 */ }
					const res = sched.autoPostpone(visibleCards, cfg);
					if (res.patches.length === 0) {
						toast(`无需顺延（逾期 ${res.stats.overdue} 张，保留 Top ${res.stats.kept}）`, "ok");
						return;
					}
					for (const p of res.patches) {
						const tiddler = wiki.getTiddler(p.title);
						if (tiddler) wiki.addTiddler({ ...tiddler.fields, ...p.fields });
					}
					events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
					render();
					toast(`已顺延 ${res.stats.postponed} 张低优先逾期卡（保留 Top ${res.stats.kept}）`, "ok");
				});
				schedGroup.appendChild(autoBtn);
				row.appendChild(schedGroup);

				stateGroup.appendChild(batch("移出队列", (f) => doneFields(f)));
				stateGroup.appendChild(batch("搁置", () => sched.suspendCard()));
				stateGroup.appendChild(batch("恢复", (f) => resumeFields(f)));
				row.appendChild(stateGroup);

				dangerGroup.appendChild(batch("删除", () => ({} as Record<string, any>), true));
				row.appendChild(dangerGroup);

				// G3 批量优先级（对标 SM Browser Priority: Modify）
				priGroup.appendChild(batch("优先↑", (f) => ({ "tidme.priority": sched.shiftPriority(f["tidme.priority"], -5) })));
				priGroup.appendChild(batch("优先↓", (f) => ({ "tidme.priority": sched.shiftPriority(f["tidme.priority"], 5) })));
				priGroup.appendChild(batch("设高", () => ({ "tidme.priority": "10" })));
				priGroup.appendChild(batch("设中", () => ({ "tidme.priority": "50" })));
				priGroup.appendChild(batch("设低", () => ({ "tidme.priority": "90" })));
				row.appendChild(priGroup);

				bar.appendChild(row);

				toolbar.appendChild(bar);
				wrap.appendChild(toolbar);

				// 主体：按组织方式渲染
				const body = el(doc, "div", "tm-cm-body");
				if (org === "deck") renderDeckTree(body, visibleCards);
				else if (org === "list") renderList(body, visibleCards);
				else renderDocTree(body, visibleCards);
				body.scrollTop = savedScrollTop;
				wrap.appendChild(body);
			};

			// 事件总线：队列/导入变化 → 重建面板（评分、阅读操作、批量操作后即时刷新）
			this._rerender = render;
			if (!this._bound) {
				this._bound = true;
				events.bindComponentRefresh(
					[events.EVENTS.QUEUE_CHANGED, events.EVENTS.IMPORT_DONE, events.EVENTS.CARD_CREATED],
					() => this._rerender?.()
				);
			}

			render();
			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return CardManagerWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["card-manager"] = makeCardManager();
// 供测试/复用：Done 与恢复的字段转换
exports.doneFields = doneFields;
exports.resumeFields = resumeFields;
// 供测试：卡片信息标签（对标 Element data 的显示层）
exports.labels = { dueLabel, intervalLabel, repsLabel, lapsesLabel, diffLabel, dateLabel };
