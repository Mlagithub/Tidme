/*
widgets/queue-ops.ts — 牌组批量操作（M4-T4）

<$queue-ops/> 对每个 TidmeDeck 列出批量动作：
  顺延(7天) / 提前(今天) / 忽略(出队) / 搁置(暂停) / 恢复 / 遗忘(回新卡)
动作基于 core scheduler 纯函数，对 deck.card 过滤出的卡片批量写字段。
*/

declare function require(module: string): any;
const sched = require("$:/plugins/tidme/core/scheduler.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function makeQueueOps(): WidgetCtor {
	class QueueOpsWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const wrap = el(doc, "div", "tm-queue-ops");
			wrap.appendChild(el(doc, "h3", "", "牌组批量操作（优先级调度）"));
			wrap.appendChild(el(doc, "div", "tm-import-muted",
				"顺延=due+7d（低优先级积压）· 提前=今天复习 · 忽略=移出队列 · 搁置=暂停（deck.card 已排除）· 遗忘=回新卡"));
			const list = el(doc, "div", "tm-queue-ops-list");
			wrap.appendChild(list);

			const renderList = () => {
				list.textContent = "";
				const decks = wiki.filterTiddlers("[tag[$:/tags/TidmeDeck]!is[draft]]");
				if (!decks.length) {
					list.appendChild(el(doc, "div", "tm-import-muted", "暂无牌组。"));
					return;
				}
				for (const deck of decks) {
					const cards = wiki.filterTiddlers(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}]`);
					const row = el(doc, "div", "tm-import-row");
					row.appendChild(el(doc, "strong", "", `${deck}（${cards.length} 卡）`));
					const apply = (op: (f: Record<string, any>) => Record<string, any>, label: string) => {
						const b = el(doc, "button", "", label);
						b.addEventListener("click", () => {
							let n = 0;
							for (const title of cards) {
								const t = wiki.getTiddler(title);
								if (!t) continue;
								wiki.addTiddler({ ...t.fields, ...op(t.fields) });
								n++;
							}
							row.appendChild(el(doc, "span", "tm-import-muted", `✓ ${n}`));
							b.setAttribute("disabled", "true");
						});
						return b;
					};
					row.appendChild(apply((f) => sched.postponeCard(f, 7), "顺延7d"));
					row.appendChild(apply(() => sched.advanceCard(), "提前"));
					row.appendChild(apply((f) => sched.ignoreCard(f), "忽略"));
					row.appendChild(apply(() => sched.suspendCard(), "搁置"));
					row.appendChild(apply(() => sched.resumeCard(), "恢复"));
					row.appendChild(apply(() => sched.forgetCard(), "遗忘"));
					list.appendChild(row);
				}
			};
			renderList();

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return QueueOpsWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["queue-ops"] = makeQueueOps();
