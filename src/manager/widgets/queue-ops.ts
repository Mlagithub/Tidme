/*
widgets/queue-ops.ts — 牌组批量操作（M4-T4）

<$queue-ops/> 对每个 TidmeDeck 列出批量动作：
  顺延(7天) / 提前(今天) / 忽略(出队) / 搁置(暂停) / 恢复 / 遗忘(回新卡)
动作基于 core scheduler 纯函数，对 deck.card 过滤出的卡片批量写字段。
事件总线：操作后发 tm-tidme-queue-changed；监听队列变化重建列表（计数保持最新）。
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

			// G8 手动触发 auto-postpone（服务端每日自动执行，此处为手动兜底）
			const autoRow = el(doc, "div", "tm-import-actions", "");
			const autoStatus = el(doc, "span", "tm-import-muted", "");
			const runAuto = el(doc, "button", "tm-btn tm-btn--primary", "⚡ 立即顺延（auto-postpone）");
			runAuto.title = "手动触发：低优先级逾期卡顺延 postponeDays 天，保留 top N 高优先级（配置见 $:/config/Tidme/AutoPostpone）";
			runAuto.addEventListener("click", () => {
				let cfg: any = {};
				try { cfg = JSON.parse(wiki.getTiddlerText("$:/config/Tidme/AutoPostpone", "{}") || "{}"); } catch { /* 忽略非法配置 */ }
				const cards = wiki.filterTiddlers("[tag[?]has[due]]")
					.map((t: string) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
				const result = sched.autoPostpone(cards, cfg);
				for (const p of result.patches) {
					const existing = wiki.getTiddler(p.title);
					if (existing) wiki.addTiddler({ ...existing.fields, ...p.fields });
				}
				events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
				autoStatus.textContent =
					`✓ 逾期 ${result.stats.overdue} · 顺延 ${result.stats.postponed} · 保留高优 ${result.stats.kept}`;
				renderList();
			});
			autoRow.appendChild(runAuto);
			autoRow.appendChild(autoStatus);
			wrap.appendChild(autoRow);

			const list = el(doc, "div", "tm-queue-ops-list");
			wrap.appendChild(list);

			const renderList = () => {
				list.textContent = "";
				const decks = wiki.filterTiddlers("[tag[$:/tags/TidmeDeck]!is[draft]]");
				if (!decks.length) {
					const empty = el(doc, "div", "tm-empty", "");
					empty.appendChild(el(doc, "div", "tm-empty-icon", "🃏"));
					empty.appendChild(el(doc, "div", "", "暂无牌组。"));
					list.appendChild(empty);
					return;
				}
				for (const deck of decks) {
					const cards = wiki.filterTiddlers(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}]`);
					const row = el(doc, "div", "tm-import-row");
					row.appendChild(el(doc, "strong", "", `${deck}（${cards.length} 卡）`));
					const apply = (op: (f: Record<string, any>) => Record<string, any>, label: string) => {
						const b = el(doc, "button", "tm-btn", label);
						b.addEventListener("click", () => {
							for (const title of cards) {
								const t = wiki.getTiddler(title);
								if (!t) continue;
								wiki.addTiddler({ ...t.fields, ...op(t.fields) });
							}
							events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
							renderList();
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

			// 事件总线：队列变化 → 重建列表（计数保持最新）
			this._rerender = renderList;
			if (!this._bound) {
				this._bound = true;
				events.bindComponentRefresh([events.EVENTS.QUEUE_CHANGED], () => this._rerender?.());
			}

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return QueueOpsWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["queue-ops"] = makeQueueOps();
