/*
widgets/card-manager.ts — 统一卡片管理器 v2

对标 SuperMemo 的管理三件套（Contents 知识树 / Browser 子集浏览 / Find elements）：
- 视图过滤：全部 / 在队 / 已读 / 搁置 / 逾期（定义一个"子集"）
- 组织方式：按文档（树，默认，全量稳定）/ 按牌组（树，含「未入组」兜底）/ 列表（Browser 式平铺，可排序、行预览联动）
- 每卡：状态徽章 + 类型 + 优先级 + 标题(点击打开) + 行内操作(读/回/删除)
- 批量工具条：选中卡 → 顺延/提前/移出队列/搁置/恢复/遗忘/删除

卡片 = 任何带 tidme.* 的 tiddler 或带 ?/. 学习标签的 tiddler（含手动建卡）。
"全部"视图计数与实际显示一致：按文档树全量；按牌组树由各牌组分支 + 未入组分支兜底全量。
Done 语义：移出队列 = 去 ? 和 . 标签 + tidme.done（默认/阅读/自动牌组均出队）。
*/

declare function require(module: string): any;
const sched = require("$:/plugins/tidme/core/scheduler.js");
const stats = require("$:/plugins/tidme/core/stats.js");
const events = require("$:/plugins/tidme/core/events.js");
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

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function badgeOf(fields: Record<string, any>): { text: string; cls: string } {
	const tags = Array.isArray(fields.tags) ? fields.tags : [];
	if (fields["tidme.suspended"] === "yes") return { text: "⏸", cls: "tm-badge-suspended" };
	if (fields["tidme.done"] === "yes" || !tags.includes("?")) return { text: "✓", cls: "tm-badge-done" };
	const state = String(fields.state || "0");
	if (state === "1" || state === "3") return { text: "学", cls: "tm-badge-learn" };
	if (state === "2") {
		const overdue = sched.parseTwDate(fields.due).getTime() < Date.now();
		return overdue ? { text: "逾", cls: "tm-badge-overdue" } : { text: "到", cls: "tm-badge-due" };
	}
	return { text: "新", cls: "tm-badge-new" };
}

function kindMark(fields: Record<string, any>): string {
	const kind = String(fields["tidme.kind"] || "");
	if (kind === "extract") return "摘";
	if (kind === "cloze") return "挖";
	if (kind === "qa") return "问";
	return "";
}

function stateLabel(fields: Record<string, any>): string {
	const b = badgeOf(fields);
	const state = String(fields.state || "0");
	if (state === "1" || state === "3") return "学习中";
	if (state === "2") {
		const overdue = sched.parseTwDate(fields.due).getTime() < Date.now();
		return overdue ? "已逾期" : "到期";
	}
	if (b.text === "✓") return "已读";
	if (b.text === "⏸") return "搁置";
	return "新卡";
}

function dueLabel(fields: Record<string, any>): string {
	if (String(fields.state || "0") !== "2") return "—";
	const d = sched.parseTwDate(fields.due);
	return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/** 信息列（对标 SuperMemo Element data） */
function intervalLabel(fields: Record<string, any>): string {
	const s = Number(fields.scheduled_days);
	return Number.isFinite(s) && s > 0 ? `${Math.round(s)}天` : "—";
}
function repsLabel(fields: Record<string, any>): string {
	return fields.reps !== undefined && fields.reps !== "" ? String(fields.reps) : "—";
}
function lapsesLabel(fields: Record<string, any>): string {
	return fields.lapses !== undefined && fields.lapses !== "" ? String(fields.lapses) : "—";
}
function diffLabel(fields: Record<string, any>): string {
	const d = Number(fields.difficulty);
	return Number.isFinite(d) && d > 0 ? `${Math.round(d * 100)}%` : "—";
}
function dateLabel(raw: any): string {
	if (raw === undefined || raw === null || raw === "") return "—";
	const d = sched.parseTwDate(raw);
	return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/** 卡片收集：带 tidme.* 或 FSRS 字段的 tiddler + 带 ?/. 学习标签的 tiddler（含手动建卡）
 * 注意：空格分隔的 filter run 才是并集（`+` 前缀是交集）。
 * 排除文档汇总页（仅有 tidme.doc，无 kind/parent/?/. /state）。 */
const CARD_FILTER =
	"[all[shadows+tiddlers]!is[draft]has[tidme.kind]] " +
	"[all[shadows+tiddlers]!is[draft]has[tidme.parent]] " +
	"[all[shadows+tiddlers]!is[draft]tag[?]] " +
	"[all[shadows+tiddlers]!is[draft]tag[.]] " +
	"[all[shadows+tiddlers]!is[draft]has[state]has[due]]";

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
			let sortKey: "breadcrumb" | "priority" | "due" | "deck" = "breadcrumb";
			let sortAsc = true;
			let searchText = ""; // 查找：按标题/面包屑过滤当前视图
			let previewTitle: string | null = null;
			let editTitle: string | null = null; // 单卡参数编辑（对标 Element parameters）
			const selected = new Set<string>();
			let allCards: Card[] = [];
			let deckInfos: DeckInfo[] = [];

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
				deckInfos = wiki.filterTiddlers("[tag[$:/tags/TidmeDeck]!is[draft]]").map((deck: string) => {
					const f = wiki.getTiddler(deck)?.fields || {};
					return {
						title: deck,
						caption: String(f.caption || deck.split("/").pop() || deck),
						strict: new Set(wiki.filterTiddlers(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}]`)),
						loose: new Set(wiki.filterTiddlers(`[subfilter{${deck}!!card}]`))
					};
				});
			};

			const inView = (f: Record<string, any>, v: View): boolean => {
				const tags = Array.isArray(f.tags) ? f.tags : [];
				const suspended = f["tidme.suspended"] === "yes";
				// W1 双轨：? = 主动复习流（item 类/手动卡）；topic（section/extract）即使带 ? 也不在"在队"
				const kind = String(f["tidme.kind"] || "");
				const inReviewQueue = tags.includes("?") && kind !== "section" && kind !== "extract";
				const done = f["tidme.done"] === "yes" || !inReviewQueue;
				if (v === "inqueue") return !done && !suspended;
				if (v === "done") return done;
				if (v === "suspended") return suspended;
				if (v === "overdue") return String(f.state || "0") === "2" && sched.parseTwDate(f.due).getTime() < Date.now();
				return true;
			};

			const decksOf = (c: Card): DeckInfo[] => deckInfos.filter((d) => d.loose.has(c.title));
			const anyStrict = (c: Card): boolean => deckInfos.some((d) => d.strict.has(c.title));

			const crumbOf = (c: Card): string => String(c.fields["tidme.breadcrumb"] || c.title);
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
				const inQueue = (Array.isArray(c.fields.tags) && c.fields.tags.includes("?"))
					&& c.fields["tidme.suspended"] !== "yes" && c.fields["tidme.done"] !== "yes";
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
				const badge = el(doc, "span", `tm-cm-badge ${bd.cls}`, bd.text);
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
				cb.addEventListener("change", () => {
					if (cb.checked) selected.add(c.title); else selected.delete(c.title);
					render();
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
					ds.appendChild(el(doc, "strong", "", `${d.caption}（${deckCards.length}）`));
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
				os.appendChild(el(doc, "strong", "", `未入组（${orphans.length}）`));
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
				if (sortKey === "priority") {
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
				const all = doc.createElement("input");
				all.type = "checkbox";
				all.checked = cards.length > 0 && cards.every((c) => selected.has(c.title));
				all.title = "全选/清空当前列表";
				all.addEventListener("change", () => {
					for (const c of cards) { if (all.checked) selected.add(c.title); else selected.delete(c.title); }
					render();
				});
				allTd.appendChild(all);
				trh.appendChild(allTd);
				trh.appendChild(el(doc, "th", "", "状态"));
				trh.appendChild(el(doc, "th", "", "类型"));
				trh.appendChild(el(doc, "th", "", "优先"));
				const th = (label: string, key?: "breadcrumb" | "priority" | "due" | "deck") => {
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
						if (m) patch.due = `${m[1]}${m[2]}${m[3]}00000000000`;
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
				wrap.textContent = "";
				collectAll();
				// 查找：按标题/面包屑包含过滤
				const matches = (c: Card) => {
					if (!searchText.trim()) return true;
					const hay = String(c.title + " " + (c.fields["tidme.breadcrumb"] || "")).toLowerCase();
					return hay.includes(searchText.trim().toLowerCase());
				};

				// 工具栏（sticky：查找/视图/组织/批量操作固定在顶部）
				const toolbar = el(doc, "div", "tm-cm-toolbar");
				// 查找输入框
				const searchRow = el(doc, "div", "tm-cm-search-row");
				const searchInput = el(doc, "input", "tm-cm-search") as any;
				searchInput.value = searchText;
				searchInput.placeholder = "查找卡片…";
				searchInput.addEventListener("input", () => { searchText = String(searchInput.value || ""); render(); });
				searchRow.appendChild(searchInput);
				if (searchText) {
					const clear = el(doc, "button", "tm-btn tm-cm-clear", "×");
					clear.title = "清空查找";
					clear.addEventListener("click", () => { searchText = ""; searchInput.value = ""; render(); });
					searchRow.appendChild(clear);
				}
				toolbar.appendChild(searchRow);
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
				toolbar.appendChild(viewRow);

				// 组织方式切换
				const orgRow = el(doc, "div", "tm-cm-orgs");
				for (const o of ORGS) {
					const b = el(doc, "button", "tm-btn" + (org === o.id ? " tm-btn--active" : ""), o.label);
					b.title = o.tip;
					b.addEventListener("click", () => { org = o.id; render(); });
					orgRow.appendChild(b);
				}
				toolbar.appendChild(orgRow);

				// 批量工具条（分组：调度 / 状态 / 危险）
				const bar = el(doc, "div", "tm-cm-bar");
				bar.appendChild(el(doc, "span", "tm-import-muted",
					selected.size ? `已选 ${selected.size} 张` : "勾选卡片后可批量操作"));
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
				bar.appendChild(batch("顺延7d", (f) => sched.postponeCard(f, 7)));
				bar.appendChild(batch("提前", () => sched.advanceCard()));
				bar.appendChild(batch("遗忘", () => sched.forgetCard()));
				// G3 批量优先级（对标 SM Browser Priority: Modify）
				bar.appendChild(batch("优先↑", (f) => ({ "tidme.priority": sched.shiftPriority(f["tidme.priority"], -5) })));
				bar.appendChild(batch("优先↓", (f) => ({ "tidme.priority": sched.shiftPriority(f["tidme.priority"], 5) })));
				bar.appendChild(batch("设高", () => ({ "tidme.priority": "10" })));
				bar.appendChild(batch("设中", () => ({ "tidme.priority": "50" })));
				bar.appendChild(batch("设低", () => ({ "tidme.priority": "90" })));
				bar.appendChild(batch("移出队列", (f) => doneFields(f)));
				bar.appendChild(batch("搁置", () => sched.suspendCard()));
				bar.appendChild(batch("恢复", (f) => resumeFields(f)));
				bar.appendChild(batch("删除", () => ({} as Record<string, any>), true));
				toolbar.appendChild(bar);
				wrap.appendChild(toolbar);

				// 主体：按组织方式渲染
				const body = el(doc, "div", "tm-cm-body");
				const visible = allCards.filter((c) => inView(c.fields, view) && matches(c));
				if (org === "deck") renderDeckTree(body, visible);
				else if (org === "list") renderList(body, visible);
				else renderDocTree(body, visible);
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
