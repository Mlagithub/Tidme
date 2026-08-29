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
const Widget = require("$:/core/modules/widgets/widget.js").widget;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function escapeHtml(s: string): string {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 阅读列表过滤（topic 队列）：全库 tag[.]（阅读态）卡，未搁置。
 * 忽略（去 .）与已读（去 ?. + tidme.done）自动出列；手动 ? 卡（item）不在此页。 */
function topicQueueFilter(): string {
	return "[all[shadows+tiddlers]!is[draft]tag[.]!has[tidme.suspended]]";
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
	return wiki.filterTiddlers(topicQueueFilter()).map((t: string) => {
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
	});
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
	if (!f) return false;
	if (f["tidme.done"] === "yes") return true;
	const tags = f?.tags;
	return !tags || !tags.includes(".");
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

		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const wrap = el(this.document, "div", "tm-reading-list");
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
			root.textContent = "";

			const groups = groupByDoc(collectTopicCards(wiki));
			const total = groups.reduce((n, g) => n + g.cards.length, 0);

			// 页头：标题 + 计数 + 双轨说明
			const head = el(doc, "div", "tm-rl-head");
			head.appendChild(el(doc, "div", "tm-rl-title", "📚 阅读列表"));
			head.appendChild(el(doc, "div", "tm-rl-sub",
				`${groups.length} 篇文档 · ${total} 张待读 —— 阅读轨（topic）：按优先级/到期被动重读`));
			const toDeck = el(doc, "button", "tm-btn tm-rl-deck-btn", "复习测试卡 →");
			toDeck.title = "跳转默认牌组（复习流：挖空/问答）";
			toDeck.addEventListener("click", () => {
				this.dispatchEvent({ type: "tm-navigate", navigateTo: "$:/Deck/default" });
			});
			head.appendChild(toDeck);
			root.appendChild(head);

			if (!groups.length) {
				const empty = el(doc, "div", "tm-empty");
				empty.appendChild(el(doc, "div", "tm-empty-icon", "🎉"));
				empty.appendChild(el(doc, "div", "", "没有待读材料。"));
				const link = el(doc, "a", "tc-tiddlylink", "→ 去导入中心导入新内容");
				link.href = "#";
				link.addEventListener("click", (e: Event) => {
					e.preventDefault();
					this.dispatchEvent({ type: "tm-navigate", navigateTo: "$:/plugins/tidme/import/ui/import-center" });
				});
				empty.appendChild(link);
				root.appendChild(empty);
				return;
			}

			for (const g of groups) {
				const sec = el(doc, "section", "tm-rl-doc");
				// 文档头：名 + 进度 + 继续阅读
				const docAll = sectionsOfDoc(wiki, g.doc);
				const docDone = docAll.filter((t) => isReadDone(wiki.getTiddler(t)?.fields)).length;
				const docTitle = g.cards[0].breadcrumb.split(" › ")[0] || g.doc;

				const headRow = el(doc, "div", "tm-rl-doc-head");
				const name = el(doc, "a", "tc-tiddlylink tm-rl-doc-name", docTitle);
				name.href = "#";
				name.title = `打开文档页：${docTitle}`;
				name.addEventListener("click", (e: Event) => {
					e.preventDefault();
					this.dispatchEvent({ type: "tm-navigate", navigateTo: docTitle });
				});
				headRow.appendChild(name);

				if (docAll.length) {
					const prog = el(doc, "span", "tm-rl-doc-prog",
						`${docDone}/${docAll.length} 节已读`);
					const barWrap = el(doc, "span", "tm-stat-bar tm-rl-doc-bar", "");
					const bar = el(doc, "span", "tm-stat-bar-fill", "");
					bar.style.width = `${Math.round((docDone / docAll.length) * 100)}%`;
					barWrap.appendChild(bar);
					headRow.appendChild(prog);
					headRow.appendChild(barWrap);
				}

				const firstUnread = g.cards[0];
				const cont = el(doc, "button", "tm-btn", "▶ 继续阅读");
				cont.title = "从本组第一张待读卡开始";
				cont.addEventListener("click", () => {
					this.dispatchEvent({ type: "tm-navigate", navigateTo: firstUnread.title });
				});
				headRow.appendChild(cont);
				sec.appendChild(headRow);

				// 卡片行
				const list = el(doc, "div", "tm-rl-cards");
				for (const c of g.cards) {
					const row = el(doc, "div", "tm-rl-row");
					const mark = el(doc, "span",
						c.kind === "extract" ? "tm-rl-kind tm-rl-kind-extract" : "tm-rl-kind",
						c.kind === "extract" ? "摘" : "节");
					mark.title = c.kind === "extract" ? "摘录卡（阅读材料）" : "节卡（阅读单元）";
					row.appendChild(mark);

					const title = el(doc, "a", "tc-tiddlylink tm-rl-title", c.title);
					title.href = "#";
					title.title = "打开阅读";
					title.addEventListener("click", (e: Event) => {
						e.preventDefault();
						this.dispatchEvent({ type: "tm-navigate", navigateTo: c.title });
					});
					row.appendChild(title);

					const pri = el(doc, "span", "tm-rl-pri", `P${c.priority}`);
					pri.title = `优先级 ${c.priority}（0 最高）`;
					row.appendChild(pri);

					const dueTxt = dueLabel(c);
					if (dueTxt) {
						const badge = el(doc, "span", "tm-rl-due", dueTxt);
						row.appendChild(badge);
					}

					list.appendChild(row);
				}
				sec.appendChild(list);
				root.appendChild(sec);
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
