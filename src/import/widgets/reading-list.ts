/*
widgets/reading-list.ts — W2 阅读列表（topic 队列，统一阅读入口）

- 全库未读 topic 卡（tag[.] = 阅读态：节卡 ?. / 摘录 .）按文档分组
- 组内排序：优先级（0 最高）→ due → 阅读顺序（tidme.order）——"按 due 被动重读"
- 每文档组：进度（已读/总数）+ 进度条 + 「▶ 继续」跳到第一未读节
- 空态引导导入中心；事件总线即时刷新
- 复习流（item）不在此页——默认牌组 / 「复习本书」
*/

declare function require(module: string): any;
const sched = require("$:/plugins/tidme/core/scheduler.js");
const events = require("$:/plugins/tidme/core/events.js");
const uiUtils = require("$:/plugins/tidme/core/ui-utils.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	return uiUtils.el(doc, tag, cls, text);
}

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 阅读列表过滤（topic 队列）：全库 tag[.]（阅读态）卡，未搁置。
 * 忽略（去 .）与已读（去 ?. + tidme.done）自动出列；手动 ? 卡（item）不在此页。 */
function topicQueueFilter(): string {
	return "[all[shadows+tiddlers]!is[draft]tag[.]!has[tidme.suspended]!field:tidme.done[yes]]";
}

interface TopicCard {
	title: string;
	kind: string;
	priority: number;
	due: Date;
	order: string;
	doc: string;
	breadcrumb: string;
	fields: Record<string, any>;
}

function collectTopicCards(wiki: any): TopicCard[] {
	return wiki.filterTiddlers(topicQueueFilter())
		.map((t: string) => {
			const f = wiki.getTiddler(t)?.fields || {};
			return {
				title: t,
				kind: String(f["tidme.kind"] || ""),
				priority: sched.normalizePriority(f["tidme.priority"]),
				due: sched.parseTwDate(f.due, new Date(0)),
				order: String(f["tidme.order"] || f["tidme.breadcrumb"] || t),
				doc: String(f["tidme.doc"] || ""),
				breadcrumb: String(f["tidme.breadcrumb"] || t),
				fields: f
			};
		})
		.filter((c: TopicCard) => !isReadDone(c.fields));
}

/** 组内排序：优先级（0 最高）→ due（早的在前，topic 被动重读）→ 阅读顺序 */
function sortTopicCards(cards: TopicCard[]): TopicCard[] {
	return [...cards].sort((a, b) =>
		a.priority - b.priority ||
		a.due.getTime() - b.due.getTime() ||
		String(a.order).localeCompare(String(b.order))
	);
}

/** 按文档分组（组间按文档名；无 doc 的散卡收进「未分组」） */
function groupByDoc(cards: TopicCard[]): { doc: string; cards: TopicCard[] }[] {
	const m = new Map<string, TopicCard[]>();
	for (const c of cards) {
		const key = c.doc || "未分组";
		if (!m.has(key)) m.set(key, []);
		m.get(key)!.push(c);
	}
	return [...m.entries()]
		.map(([doc, cs]) => ({ doc, cards: sortTopicCards(cs) }))
		.sort((a, b) => String(a.doc).localeCompare(String(b.doc), "zh"));
}

/** 阅读态判定（W1 双轨：. = 阅读态；忽略去 . 视为完成） */
function isReadDone(f: any): boolean {
	return sched.isCardDone(f);
}

/** 某文档全部节卡（阅读进度口径，与文档页一致） */
function sectionsOfDoc(wiki: any, docId: string): string[] {
	return wiki
		.filterTiddlers("[has[tidme.doc]nsort[tidme.order]]")
		.filter((t: string) => {
			const f = wiki.getTiddler(t)?.fields;
			if (!f) return false;
			const kind = f["tidme.kind"];
			return String(f["tidme.doc"]) === docId &&
				(kind === "section" || (kind === undefined && f["tidme.order"] !== undefined));
		});
}

function makeReadingList(): any {
	class ReadingListWidget extends Widget {
		_root: any = null;
		_bound = false;
		_compact = false;

		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			this._compact = this.getAttribute("compact") === "yes";
			const wrap = el(this.document, "div", "tm-reading-list" + (this._compact ? " tm-rl-compact" : ""));
			this._root = wrap;
			this.build();
			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
			// 事件总线：队列/导入/制卡变化 → 重建（实例判活）
			this._rerender = () => { if (this._root) this.build(); };
			if (!this._bound) {
				this._bound = true;
				events.bindComponentRefresh(
					[events.EVENTS.QUEUE_CHANGED, events.EVENTS.IMPORT_DONE, events.EVENTS.CARD_CREATED],
					this._rerender
				);
			}
		}

		build() {
			const doc = this.document;
			const wiki = this.wiki;
			const root = this._root;
			const compact = this._compact;
			root.textContent = "";

			const groups = groupByDoc(collectTopicCards(wiki));
			const total = groups.reduce((n, g) => n + g.cards.length, 0);

			// 页头：标题 + 计数（compact：侧边栏精简）
			const head = el(doc, "div", "tm-rl-head");
			head.appendChild(el(doc, "div", "tm-rl-title", "阅读列表"));
			head.appendChild(el(doc, "div", "tm-rl-sub",
				`${groups.length} 篇文档 · ${total} 张待读`));
			if (!compact) {
				head.appendChild(el(doc, "div", "tm-rl-sub", "按优先级和到期时间排序"));
				const toDeck = el(doc, "button", "tm-btn tm-rl-deck-btn", "去复习 →");
				toDeck.title = "跳转默认牌组（复习流：挖空/问答）";
				toDeck.addEventListener("click", () => {
					this.dispatchEvent({ type: "tm-navigate", navigateTo: "$:/Deck/default" });
				});
				head.appendChild(toDeck);
			}
			root.appendChild(head);

			if (!groups.length) {
				const empty = el(doc, "div", "tm-empty");
				empty.appendChild(el(doc, "div", "", "没有待读材料。"));
				if (!compact) {
					const link = el(doc, "a", "tc-tiddlylink", "→ 去导入中心导入新内容");
					link.href = "#";
					link.addEventListener("click", (ev: Event) => {
						ev.preventDefault();
						this.dispatchEvent({ type: "tm-navigate", navigateTo: "$:/plugins/tidme/import/ui/import-center" });
					});
					empty.appendChild(link);
				}
				root.appendChild(empty);
				return;
			}

			for (const g of groups) {
				const det = el(doc, "details", "tm-rl-doc");
				// 文档组默认折叠（两本书也不占长页面）；summary = 名 + 进度 + 继续阅读
				const docAll = sectionsOfDoc(wiki, g.doc);
				const docDone = docAll.filter((t) => isReadDone(wiki.getTiddler(t)?.fields)).length;
				const docTitle = g.cards[0].breadcrumb.split(" › ")[0] || g.doc;

				const sum = el(doc, "summary", "tm-rl-doc-head");
				const name = el(doc, "a", "tc-tiddlylink tm-rl-doc-name", docTitle);
				name.href = "#";
				name.title = `打开文档页：${docTitle}`;
				name.addEventListener("click", (e: Event) => {
					e.preventDefault(); e.stopPropagation();
					this.dispatchEvent({ type: "tm-navigate", navigateTo: docTitle });
				});
				sum.appendChild(name);

				sum.appendChild(el(doc, "span", "tm-rl-doc-count", `${g.cards.length} 张待读`));
				if (!compact && docAll.length) {
					sum.appendChild(el(doc, "span", "tm-rl-doc-prog", `${docDone}/${docAll.length} 节已读`));
					const barWrap = el(doc, "span", "tm-stat-bar tm-rl-doc-bar", "");
					const bar = el(doc, "span", "tm-stat-bar-fill", "");
					bar.style.width = `${Math.round((docDone / docAll.length) * 100)}%`;
					barWrap.appendChild(bar);
					sum.appendChild(barWrap);
				}

				const firstUnread = g.cards[0];
				const cont = el(doc, "button", "tm-btn", "▶ 继续阅读");
				cont.title = "从本组第一张待读卡开始";
				cont.addEventListener("click", (e: Event) => {
					e.preventDefault(); e.stopPropagation();
					this.dispatchEvent({ type: "tm-navigate", navigateTo: firstUnread.title });
				});
				sum.appendChild(cont);
				det.appendChild(sum);

				// 卡片表格（列式紧凑，避免竖排条目拉长页面；compact 只留 类型/标题 两列）
				const table = el(doc, "table", "tm-rl-table");
				const thead = el(doc, "thead", "");
				const htr = el(doc, "tr", "");
				htr.appendChild(el(doc, "th", "", ""));
				htr.appendChild(el(doc, "th", "", "卡片"));
				if (!compact) {
					htr.appendChild(el(doc, "th", "", "优先"));
					htr.appendChild(el(doc, "th", "", "状态"));
				}
				thead.appendChild(htr);
				table.appendChild(thead);
				const tbody = el(doc, "tbody", "");
				for (const c of g.cards) {
					const tr = el(doc, "tr", "tm-rl-row");
					const kindTd = el(doc, "td", "", "");
					const mark = el(doc, "span",
						c.kind === "extract" ? "tm-rl-kind tm-rl-kind-extract" : "tm-rl-kind",
						c.kind === "extract" ? "摘" : "节");
					mark.title = c.kind === "extract" ? "摘录卡（阅读材料）" : "节卡（阅读单元）";
					kindTd.appendChild(mark);
					tr.appendChild(kindTd);

					const titleTd = el(doc, "td", "", "");
					const titleLink = el(doc, "a", "tc-tiddlylink tm-rl-title", c.title);
					titleLink.href = "#";
					titleLink.title = "打开阅读";
					titleLink.addEventListener("click", (e: Event) => {
						e.preventDefault(); e.stopPropagation();
						this.dispatchEvent({ type: "tm-navigate", navigateTo: c.title });
					});
					titleTd.appendChild(titleLink);
					tr.appendChild(titleTd);

					if (!compact) {
						const priTd = el(doc, "td", "tm-rl-pri", `P${c.priority}`);
						priTd.title = `优先级 ${c.priority}（0 最高）`;
						tr.appendChild(priTd);
						const dueTd = el(doc, "td", "", "");
						const dueTxt = dueLabel(c);
						if (dueTxt) {
							const badgeCls =
								dueTxt === "逾" ? "tm-badge tm-badge-overdue" :
								dueTxt === "到" ? "tm-badge tm-badge-due" :
								dueTxt === "学" ? "tm-badge tm-badge-learn" :
								"tm-badge tm-badge-new";
							const badge = el(doc, "span", badgeCls, dueTxt);
							dueTd.appendChild(badge);
						}
						tr.appendChild(dueTd);
					}

					tbody.appendChild(tr);
				}
				table.appendChild(tbody);
				const scrollBox = el(doc, "div", "tm-scroll");
				scrollBox.appendChild(table);
				det.appendChild(scrollBox);
				root.appendChild(det);
			}
		}

		refresh(changedTiddlers: Record<string, any>) {
			// 即时刷新：任何 topic/衍生卡变化 → 重建列表
			if (!this._root) return false;
			let need = false;
			for (const title of Object.keys(changedTiddlers || {})) {
				if (title.startsWith("$:/state/tidme-import/readpoint/")) { need = true; break; }
				const f = this.wiki.getTiddler(title)?.fields;
				if (!f) continue;
				const tags = f.tags;
				if (f["tidme.kind"] || (Array.isArray(tags) && tags.includes("."))) { need = true; break; }
			}
			if (need) { this.build(); return true; }
			return false;
		}
	}
	return ReadingListWidget as any;
}

function dueLabel(c: TopicCard): string {
	const state = String(c.fields.state || "0");
	if (state === "2") {
		const overdue = c.due.getTime() < Date.now();
		return overdue ? "逾" : "到";
	}
	if (state === "1" || state === "3") return "学";
	return "新";
}

exports["reading-list"] = makeReadingList();

// 供单元测试/复用
exports.topicQueueFilter = topicQueueFilter;
exports.collectTopicCards = collectTopicCards;
exports.sortTopicCards = sortTopicCards;
exports.groupByDoc = groupByDoc;
exports.isReadDone = isReadDone;
