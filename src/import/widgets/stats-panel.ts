/*
widgets/stats-panel.ts — 统计面板（M5-T4，P1 UI：指标卡 + 表格 + 漏斗横条）

<$stats-panel/> 渲染：指标卡（牌组/文档/复习/保留率）、牌组负载表、文档进度、
漏斗（横条可视化）、复习与保留率、优先级分桶。
数据源：core/stats 纯函数 + 复习日志（$:/Deck 下的 log tiddler data）。
事件总线：监听队列/导入变化 → 重建面板（评分、导入、批量操作后数字即时更新）。
*/

declare function require(module: string): any;
const stats = require("$:/plugins/tidme/core/stats.js");
const events = require("$:/plugins/tidme/core/events.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function makeStatsPanel(): WidgetCtor {
	class StatsPanelWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const wrap = el(doc, "div", "tm-stats-panel");
			this._wrap = wrap;

			const build = () => {
				wrap.textContent = "";
				const cardLikes = (filter: string) =>
					wiki.filterTiddlers(filter).map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }));

				const decks = wiki.filterTiddlers("[tag[$:/tags/TidmeDeck]!is[draft]]");
				const docs = wiki.filterTiddlers("[tag[tidme-import-doc]]");
				const all = cardLikes("[!is[system]]");
				const funnel = stats.funnelCounts(all);
				const logTitles = wiki.filterTiddlers("[prefix[$:/Deck/]suffix[/log/]]");
				const entries: any[] = [];
				for (const lt of logTitles) {
					const data = wiki.getTiddlerData(lt);
					if (data && typeof data === "object") {
						for (const k of Object.keys(data)) {
							try { entries.push(JSON.parse(String((data as any)[k]))); } catch { /* 忽略坏行 */ }
						}
					}
				}
				const ret = stats.retentionFromLogs(entries);
				const buckets = stats.priorityBuckets(cardLikes("[tag[?]]"));

				// 0) 指标卡（P1：大数字 + 标签）
				const cards = el(doc, "div", "tm-stat-cards");
				const statCard = (label: string, value: string, sub?: string) => {
					const c = el(doc, "div", "tm-stat-card");
					c.appendChild(el(doc, "div", "tm-stat-num", value));
					c.appendChild(el(doc, "div", "tm-stat-label", label));
					if (sub) c.appendChild(el(doc, "div", "tm-stat-sub", sub));
					return c;
				};
				cards.appendChild(statCard("牌组", String(decks.length)));
				cards.appendChild(statCard("文档", String(docs.length)));
				cards.appendChild(statCard("在队卡", String(funnel.cards)));
				cards.appendChild(statCard("复习", String(ret.reviews), ret.reviews ? `保留率 ${Math.round(ret.retention * 100)}%` : ""));
				wrap.appendChild(cards);

				// 1) 牌组负载
				wrap.appendChild(el(doc, "h3", "", "牌组负载"));
				const deckTable = el(doc, "table", "tm-stats-table", "");
				const thead = el(doc, "tr", "");
				for (const h of ["牌组", "总数", "新", "学习中", "到期", "逾期"]) {
					thead.appendChild(el(doc, "th", "", h));
				}
				deckTable.appendChild(thead);
				if (!decks.length) {
					const row = el(doc, "tr", "");
					row.appendChild(el(doc, "td", "tm-import-muted", "暂无牌组"));
					deckTable.appendChild(row);
				}
				for (const deck of decks) {
					const cards2 = cardLikes(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}]`);
					const load = stats.deckLoad(cards2);
					const tr = el(doc, "tr", "");
					tr.appendChild(el(doc, "td", "tm-stats-deck", deck));
					for (const v of [load.total, load.newCount, load.learn, load.due, load.overdue]) {
						tr.appendChild(el(doc, "td", "tm-stats-num-cell", String(v)));
					}
					deckTable.appendChild(tr);
				}
				wrap.appendChild(deckTable);

				// 2) 文档进度
				wrap.appendChild(el(doc, "h3", "", "文档进度"));
				const docList = el(doc, "div", "", "");
				if (!docs.length) docList.appendChild(el(doc, "div", "tm-import-muted", "暂无导入文档"));
				for (const d of docs) {
					const docId = wiki.getTiddler(d)?.fields["tidme.doc"];
					if (!docId) continue;
					const sections = cardLikes(`[tidme.doc[${docId}]tidme.kind[section]]`);
					const p = stats.docProgress(sections);
					const row = el(doc, "div", "tm-import-row tm-stat-doc");
					const label = el(doc, "span", "", d);
					row.appendChild(label);
					// 进度条（P1）
					const barWrap = el(doc, "span", "tm-stat-bar");
					const bar = el(doc, "span", "tm-stat-bar-fill", "");
					bar.style.width = p.total ? `${Math.round((p.done / p.total) * 100)}%` : "0%";
					barWrap.appendChild(bar);
					row.appendChild(barWrap);
					row.appendChild(el(doc, "span", "tm-import-muted",
						`已读 ${p.done} / ${p.total}（剩 ${p.left}）`));
					docList.appendChild(row);
				}
				wrap.appendChild(docList);

				// 3) 漏斗（P1：横条可视化）
				wrap.appendChild(el(doc, "h3", "", "漏斗"));
				const funnelBox = el(doc, "div", "tm-stat-funnel");
				const funnelMax = Math.max(1, funnel.docs, funnel.sections, funnel.extracts, funnel.cards);
				const funnelRow = (label: string, n: number) => {
					const row = el(doc, "div", "tm-stat-funnel-row");
					row.appendChild(el(doc, "span", "tm-stat-funnel-label", label));
					const barWrap = el(doc, "span", "tm-stat-bar tm-stat-bar-lg");
					const bar = el(doc, "span", "tm-stat-bar-fill", "");
					bar.style.width = `${Math.round((n / funnelMax) * 100)}%`;
					barWrap.appendChild(bar);
					row.appendChild(barWrap);
					row.appendChild(el(doc, "span", "tm-stat-funnel-num", String(n)));
					return row;
				};
				funnelBox.appendChild(funnelRow("导入", funnel.docs));
				funnelBox.appendChild(funnelRow("切分", funnel.sections));
				funnelBox.appendChild(funnelRow("摘录", funnel.extracts));
				funnelBox.appendChild(funnelRow("卡", funnel.cards));
				wrap.appendChild(funnelBox);

				// 4) 复习与保留率
				wrap.appendChild(el(doc, "h3", "", "复习与保留率"));
				wrap.appendChild(el(doc, "div", "tm-import-row",
					`复习 ${ret.reviews} 次 · 保留率 ${Math.round(ret.retention * 100)}%`));

				// 5) 优先级分桶
				wrap.appendChild(el(doc, "h3", "", "优先级分桶"));
				wrap.appendChild(el(doc, "div", "tm-import-row",
					`高 ${buckets.high} · 中 ${buckets.medium} · 低 ${buckets.low} · 未设 ${buckets.none}`));
			};
			build();

			// 事件总线：队列/导入变化 → 重建（评分、导入、批量操作后数字即时更新）
			this._rebuild = () => {
				if (!this._wrap || !this._wrap.parentNode) return; // 已卸载实例零成本跳过
				this._wrap.textContent = "";
				build();
			};
			if (!this._bound) {
				this._bound = true;
				events.bindComponentRefresh(
					[events.EVENTS.QUEUE_CHANGED, events.EVENTS.IMPORT_DONE, events.EVENTS.CARD_CREATED],
					() => this._rebuild?.()
				);
			}

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return StatsPanelWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["stats-panel"] = makeStatsPanel();
