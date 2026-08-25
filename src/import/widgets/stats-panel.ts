/*
widgets/stats-panel.ts — 统计面板（M5-T4）

<$stats-panel/> 渲染：牌组负载 / 文档进度 / 漏斗 / 保留率 / 优先级分桶。
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

				// 1) 牌组负载
				wrap.appendChild(el(doc, "h3", "", "牌组负载"));
				const deckTable = el(doc, "table", "tm-stats-table", "");
				const thead = el(doc, "tr", "");
				for (const h of ["牌组", "总数", "新", "学习中", "到期", "逾期"]) {
					thead.appendChild(el(doc, "th", "", h));
				}
				deckTable.appendChild(thead);
				const decks = wiki.filterTiddlers("[tag[$:/tags/TidmeDeck]!is[draft]]");
				if (!decks.length) {
					const row = el(doc, "tr", "");
					row.appendChild(el(doc, "td", "tm-import-muted", "暂无牌组"));
					deckTable.appendChild(row);
				}
				for (const deck of decks) {
					const cards = cardLikes(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}]`);
					const load = stats.deckLoad(cards);
					const tr = el(doc, "tr", "");
					for (const v of [deck, load.total, load.newCount, load.learn, load.due, load.overdue]) {
						tr.appendChild(el(doc, "td", "", String(v)));
					}
					deckTable.appendChild(tr);
				}
				wrap.appendChild(deckTable);

				// 2) 文档进度
				wrap.appendChild(el(doc, "h3", "", "文档进度"));
				const docList = el(doc, "div", "", "");
				const docs = wiki.filterTiddlers("[tag[tidme-import-doc]]");
				if (!docs.length) docList.appendChild(el(doc, "div", "tm-import-muted", "暂无导入文档"));
				for (const d of docs) {
					const docId = wiki.getTiddler(d)?.fields["tidme.doc"];
					if (!docId) continue;
					const sections = cardLikes(`[tidme.doc[${docId}]tidme.kind[section]]`);
					const p = stats.docProgress(sections);
					docList.appendChild(el(doc, "div", "tm-import-row",
						`${d}：已读 ${p.done} / ${p.total}（剩余 ${p.left}）`));
				}
				wrap.appendChild(docList);

				// 3) 漏斗
				wrap.appendChild(el(doc, "h3", "", "漏斗"));
				const all = cardLikes("[!is[system]]");
				const funnel = stats.funnelCounts(all);
				wrap.appendChild(el(doc, "div", "tm-import-row",
					`导入 ${funnel.docs} · 切分 ${funnel.sections} · 摘录 ${funnel.extracts} · 卡 ${funnel.cards}`));

				// 4) 保留率（复习日志 data）
				wrap.appendChild(el(doc, "h3", "", "复习与保留率"));
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
				wrap.appendChild(el(doc, "div", "tm-import-row",
					`复习 ${ret.reviews} 次 · 保留率 ${Math.round(ret.retention * 100)}%`));

				// 5) 优先级分桶
				const buckets = stats.priorityBuckets(cardLikes("[tag[?]]"));
				wrap.appendChild(el(doc, "div", "tm-import-row",
					`优先级：高 ${buckets.high} · 中 ${buckets.medium} · 低 ${buckets.low} · 未设 ${buckets.none}`));
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
