/*
widgets/card-manager.ts — 统一卡片管理器

<$card-manager/> 把浏览/状态/操作集中到一个组件：
- 视图过滤：全部 / 在队 / 已读 / 搁置 / 逾期
- 树形浏览：Deck → 文档 → 卡片（可折叠）
- 每卡：状态徽章 + 优先级 + 复选框 + 标题(点击打开) + 行内操作(移出/恢复/删除)
- 批量工具条：选中卡 → 顺延/提前/移出队列/搁置/恢复/遗忘/删除
操作复用 core/scheduler 纯函数；状态徽章与 core/stats 语义一致。
Done 语义：移出队列 = 去 ? 和 . 标签 + tidme.done（默认/阅读/自动牌组均出队）。
*/

declare function require(module: string): any;
const sched = require("$:/plugins/tidme/core/scheduler.js");
const stats = require("$:/plugins/tidme/core/stats.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

type View = "all" | "inqueue" | "done" | "suspended" | "overdue";
const VIEWS: { id: View; label: string }[] = [
	{ id: "all", label: "全部" },
	{ id: "inqueue", label: "在队" },
	{ id: "done", label: "已读" },
	{ id: "suspended", label: "搁置" },
	{ id: "overdue", label: "逾期" }
];

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

			let view: View = "all";
			const selected = new Set<string>();
			let allCards: { title: string; fields: Record<string, any> }[] = [];

			const collectAll = () => {
				// 所有带 tidme 标识的卡（在队 + 已读 + 搁置）
				allCards = wiki.filterTiddlers("[has[tidme.doc]!is[draft]]")
					.concat(wiki.filterTiddlers("[has[tidme.kind]!is[draft]]"))
					.filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i)
					.map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }))
					.filter((c: any) => c.fields["tidme.doc"] || c.fields["tidme.kind"]);
			};

			const inView = (f: Record<string, any>): boolean => {
				const tags = Array.isArray(f.tags) ? f.tags : [];
				const suspended = f["tidme.suspended"] === "yes";
				const done = f["tidme.done"] === "yes" || !tags.includes("?");
				if (view === "inqueue") return !done && !suspended;
				if (view === "done") return done;
				if (view === "suspended") return suspended;
				if (view === "overdue") return String(f.state || "0") === "2" && sched.parseTwDate(f.due).getTime() < Date.now();
				return true;
			};

			/** 重新渲染整个面板 */
			const render = () => {
				wrap.textContent = "";
				collectAll();

				// 视图过滤按钮
				const viewRow = el(doc, "div", "tm-cm-views");
				for (const v of VIEWS) {
					const count = v.id === "all" ? allCards.length
						: allCards.filter((c) => inView(c.fields)).length;
					const b = el(doc, "button", "tm-cm-view" + (view === v.id ? " tm-cm-view-active" : ""),
						`${v.label}(${count})`);
					b.addEventListener("click", () => { view = v.id; render(); });
					viewRow.appendChild(b);
				}
				wrap.appendChild(viewRow);

				// 批量工具条
				const bar = el(doc, "div", "tm-cm-bar");
				bar.appendChild(el(doc, "span", "tm-import-muted",
					selected.size ? `已选 ${selected.size} 张` : "勾选卡片后可批量操作"));
				const batch = (label: string, apply: (f: Record<string, any>) => Record<string, any>) => {
					const b = el(doc, "button", "", label);
					b.addEventListener("click", () => {
						let n = 0;
						for (const title of selected) {
							const t = wiki.getTiddler(title);
							if (!t) continue;
							wiki.addTiddler({ ...t.fields, ...apply(t.fields) });
							n++;
						}
						selected.clear();
						render();
					});
					return b;
				};
				bar.appendChild(batch("顺延7d", (f) => sched.postponeCard(f, 7)));
				bar.appendChild(batch("提前", () => sched.advanceCard()));
				bar.appendChild(batch("移出队列", (f) => doneFields(f)));
				bar.appendChild(batch("搁置", () => sched.suspendCard()));
				bar.appendChild(batch("恢复", (f) => resumeFields(f)));
				bar.appendChild(batch("遗忘", () => sched.forgetCard()));
				bar.appendChild(batch("删除", () => ({} as Record<string, any>)));
				wrap.appendChild(bar);

				// 树：Deck → 文档 → 卡片
				const treeBox = el(doc, "div", "tm-cm-tree");
				const decks = wiki.filterTiddlers("[tag[$:/tags/TidmeDeck]!is[draft]]");
				if (!decks.length) {
					treeBox.appendChild(el(doc, "div", "tm-import-muted", "暂无牌组——导入/切分后自动创建。"));
				}
				for (const deck of decks) {
					const d = wiki.getTiddler(deck)?.fields || {};
					const deckCards = allCards.filter((c) => {
						// 属于该 deck：card 过滤器命中
						return wiki.filterTiddlers(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}match[${c.title}]]`).length > 0
							|| (view === "done" || view === "suspended" || view === "all")
								&& wiki.filterTiddlers(`[subfilter{${deck}!!card}match[${c.title}]]`).length > 0
							&& inView(c.fields);
					}).filter((c) => inView(c.fields));
					if (!deckCards.length && view !== "all") continue;
					const deckDetails = el(doc, "details", "tm-cm-deck");
					deckDetails.open = true;
					const ds = el(doc, "summary", "", "");
					ds.appendChild(el(doc, "strong", "", `${String(d.caption || deck.split("/").pop() || deck)}（${deckCards.length}）`));
					deckDetails.appendChild(ds);

					// 按文档分组
					const docGroups = new Map<string, any[]>();
					for (const c of deckCards) {
						const key = String(c.fields["tidme.doc"] || c.fields["tidme.parent"] || "__none__");
						if (!docGroups.has(key)) docGroups.set(key, []);
						docGroups.get(key)!.push(c);
					}
					const docOrder = [...docGroups.entries()].sort((a, b) => {
						const ta = String(a[1][0]?.fields["tidme.breadcrumb"] || "");
						const tb = String(b[1][0]?.fields["tidme.breadcrumb"] || "");
						return ta < tb ? -1 : ta > tb ? 1 : 0;
					});
					for (const [docKey, docCards] of docOrder) {
						const bc = String(docCards[0]?.fields["tidme.breadcrumb"] || "");
						const docTitle = bc.split(" › ")[0] || docKey;
						const dd = el(doc, "details", "tm-cm-doc");
						dd.open = true;
						const dsum = el(doc, "summary", "", "");
						dsum.appendChild(el(doc, "span", "tm-cm-doc-title", `${docTitle}（${docCards.length}）`));
						dd.appendChild(dsum);
						const sorted = [...docCards].sort((a: any, b: any) => {
							const pa = String(a.fields["tidme.breadcrumb"] || "");
							const pb = String(b.fields["tidme.breadcrumb"] || "");
							return pa < pb ? -1 : pa > pb ? 1 : 0;
						});
						for (const c of sorted) {
							const row = el(doc, "div", "tm-cm-card");
							const depth = Math.max(0, String(c.fields["tidme.breadcrumb"] || "").split(" › ").length - 1);
							row.style.paddingLeft = `${depth * 0.9}em`;
							// 复选框
							const cb = doc.createElement("input");
							cb.type = "checkbox";
							cb.checked = selected.has(c.title);
							cb.addEventListener("change", () => {
								if (cb.checked) selected.add(c.title); else selected.delete(c.title);
								render();
							});
							row.appendChild(cb);
							// 状态徽章
							const bd = badgeOf(c.fields);
							row.appendChild(el(doc, "span", `tm-cm-badge ${bd.cls}`, bd.text));
							const km = kindMark(c.fields);
							if (km) row.appendChild(el(doc, "span", "tm-cm-kind", km));
							const pri = c.fields["tidme.priority"];
							if (pri !== undefined) {
								row.appendChild(el(doc, "span", "tm-cm-pri", `p${String(pri).padStart(2, "0")}`));
							}
							// 标题（点击打开）
							const link = el(doc, "a", "tc-tiddlylink tm-cm-link",
								String(c.fields["tidme.breadcrumb"] || c.title).split(" › ").pop() || c.title);
							link.href = "#";
							link.title = c.title;
							link.addEventListener("click", (e: Event) => {
								e.preventDefault();
								this.dispatchEvent({ type: "tm-navigate", navigateTo: c.title });
							});
							row.appendChild(link);
							// 行内操作：在队 → 读（移出队列）；出队/搁置 → 回（恢复）
							const inQueue = (Array.isArray(c.fields.tags) && c.fields.tags.includes("?"))
								&& c.fields["tidme.suspended"] !== "yes" && c.fields["tidme.done"] !== "yes";
							if (inQueue) {
								const readBtn = el(doc, "button", "tm-cm-op", "读");
								readBtn.title = "移出队列（已读）";
								readBtn.addEventListener("click", () => { wiki.addTiddler(doneFields(c.fields)); render(); });
								row.appendChild(readBtn);
							} else {
								const resumeBtn = el(doc, "button", "tm-cm-op", "回");
								resumeBtn.title = "恢复到学习队列";
								resumeBtn.addEventListener("click", () => { wiki.addTiddler(resumeFields(c.fields)); render(); });
								row.appendChild(resumeBtn);
							}
							const del = el(doc, "button", "tm-cm-op tm-cm-del", "✕");
							del.title = "删除卡片";
							del.addEventListener("click", () => {
								selected.delete(c.title);
								wiki.deleteTiddler(c.title);
								render();
							});
							row.appendChild(del);
							dd.appendChild(row);
						}
						deckDetails.appendChild(dd);
					}
					treeBox.appendChild(deckDetails);
				}
				wrap.appendChild(treeBox);
			};

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
