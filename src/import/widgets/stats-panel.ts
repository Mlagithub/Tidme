/*
widgets/stats-panel.ts — 统计面板（M5-T4，P1 UI：指标卡 + 表格 + 漏斗横条）

<$stats-panel/> 渲染：指标卡（牌组/文档/复习/保留率）、牌组负载表、文档进度、
漏斗（横条可视化）、复习与保留率、优先级分桶。
数据源：core/stats 纯函数 + 复习日志（$:/Deck 下的 log tiddler data）。
事件总线：监听队列/导入变化 → 重建面板（评分、导入、批量操作后数字即时更新）。
样式：统一复用 core 设计系统（tm-card/tm-table/tm-progress/tm-section-title）。
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

function sectionTitle(doc: Document, label: string): HTMLElement {
	return el(doc, "div", "tm-section-title", label);
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

				// 0) 指标卡
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

				// 创建分栏网格布局
				const grid = el(doc, "div", "tm-stats-grid");
				const mainCol = el(doc, "div", "tm-stats-col-main");
				const sideCol = el(doc, "div", "tm-stats-col-side");
				grid.appendChild(mainCol);
				grid.appendChild(sideCol);
				wrap.appendChild(grid);

				// 1) 牌组负载（卡片表格）
				const cardLoad = el(doc, "div", "tm-dashboard-card");
				cardLoad.appendChild(el(doc, "div", "tm-dashboard-card-title", "牌组负载"));
				const deckWrap = el(doc, "div", "tm-table-wrap");
				const deckTable = el(doc, "table", "tm-table", "");
				const thead = el(doc, "thead", "");
				const htr = el(doc, "tr", "");
				for (const h of ["牌组", "总数", "新", "学习中", "到期", "逾期"]) {
					htr.appendChild(el(doc, "th", "", h));
				}
				thead.appendChild(htr);
				deckTable.appendChild(thead);
				const tbody = el(doc, "tbody", "");
				if (!decks.length) {
					tbody.appendChild(el(doc, "tr", "", ""));
					const td = el(doc, "td", "tm-import-muted", "暂无牌组");
					td.setAttribute("colspan", "6");
					tbody.lastChild.appendChild(td);
				}
				for (const deck of decks) {
					const cards2 = cardLikes(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}]`);
					const load = stats.deckLoad(cards2);
					const tr = el(doc, "tr", "");
					tr.appendChild(el(doc, "td", "tm-stats-deck", deck));
					for (const v of [load.total, load.newCount, load.learn, load.due, load.overdue]) {
						const td = el(doc, "td", "tm-stats-num-cell", String(v));
						tr.appendChild(td);
					}
					tbody.appendChild(tr);
				}
				deckTable.appendChild(tbody);
				deckWrap.appendChild(deckTable);
				cardLoad.appendChild(deckWrap);
				mainCol.appendChild(cardLoad);

				// 2) 文档进度（表格）
				const cardDoc = el(doc, "div", "tm-dashboard-card");
				cardDoc.appendChild(el(doc, "div", "tm-dashboard-card-title", "文档进度"));
				const docWrap = el(doc, "div", "tm-table-wrap");
				const docTable = el(doc, "table", "tm-table", "");
				const dthead = el(doc, "thead", "");
				const dhtr = el(doc, "tr", "");
				for (const h of ["文档", "进度", "已读"]) dhtr.appendChild(el(doc, "th", "", h));
				dthead.appendChild(dhtr);
				docTable.appendChild(dthead);
				const dtbody = el(doc, "tbody", "");
				if (!docs.length) {
					const tr0 = el(doc, "tr", "");
					const td0 = el(doc, "td", "tm-import-muted", "暂无导入文档——导入中心导入书籍后显示进度。");
					td0.setAttribute("colspan", "3");
					tr0.appendChild(td0);
					dtbody.appendChild(tr0);
				}
				for (const d of docs) {
					const docId = wiki.getTiddler(d)?.fields["tidme.doc"];
					if (!docId) continue;
					const sections = cardLikes(`[tidme.doc[${docId}]tidme.kind[section]]`);
					const p = stats.docProgress(sections);
					const tr = el(doc, "tr", "");
					tr.appendChild(el(doc, "td", "tm-stat-doc-name", d));
					const progTd = el(doc, "td", "", "");
					const barWrap = el(doc, "span", "tm-progress tm-stat-bar");
					const bar = el(doc, "span", "tm-progress-fill tm-stat-bar-fill", "");
					bar.style.width = p.total ? `${Math.round((p.done / p.total) * 100)}%` : "0%";
					barWrap.appendChild(bar);
					progTd.appendChild(barWrap);
					tr.appendChild(progTd);
					tr.appendChild(el(doc, "td", "tm-import-muted",
						`已读 ${p.done} / ${p.total}（剩 ${p.left}）`));
					dtbody.appendChild(tr);
				}
				docTable.appendChild(dtbody);
				docWrap.appendChild(docTable);
				docWrap.classList.add("tm-scroll");
				cardDoc.appendChild(docWrap);
				mainCol.appendChild(cardDoc);

				// 3) 漏斗
				const cardFunnel = el(doc, "div", "tm-dashboard-card");
				cardFunnel.appendChild(el(doc, "div", "tm-dashboard-card-title", "学习漏斗"));
				const funnelBox = el(doc, "div", "tm-stat-funnel");
				const funnelMax = Math.max(1, funnel.docs, funnel.sections, funnel.extracts, funnel.cards);
				const funnelRow = (label: string, n: number) => {
					const row = el(doc, "div", "tm-stat-funnel-row");
					row.appendChild(el(doc, "span", "tm-stat-funnel-label", label));
					const barWrap = el(doc, "span", "tm-progress tm-stat-bar tm-stat-bar-lg");
					const bar = el(doc, "span", "tm-progress-fill tm-stat-bar-fill", "");
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
				cardFunnel.appendChild(funnelBox);
				sideCol.appendChild(cardFunnel);

				// 4) 复习与保留率
				const cardRet = el(doc, "div", "tm-dashboard-card");
				cardRet.appendChild(el(doc, "div", "tm-dashboard-card-title", "复习与保留率"));
				const retBox = el(doc, "div", "tm-stat-pills");
				retBox.appendChild(el(doc, "span", "tm-badge tm-badge-learn", `复习 ${ret.reviews} 次`));
				if (ret.reviews) {
					retBox.appendChild(el(doc, "span", "tm-badge tm-badge-due", `保留率 ${Math.round(ret.retention * 100)}%`));
				}
				cardRet.appendChild(retBox);
				sideCol.appendChild(cardRet);

				// 5) 优先级分桶
				const cardBucket = el(doc, "div", "tm-dashboard-card");
				cardBucket.appendChild(el(doc, "div", "tm-dashboard-card-title", "优先级分桶"));
				const bucketBox = el(doc, "div", "tm-stat-pills");
				bucketBox.appendChild(el(doc, "span", "tm-badge tm-badge-new", `高 ${buckets.high}`));
				bucketBox.appendChild(el(doc, "span", "tm-badge tm-badge-due", `中 ${buckets.medium}`));
				bucketBox.appendChild(el(doc, "span", "tm-badge tm-badge-learn", `低 ${buckets.low}`));
				bucketBox.appendChild(el(doc, "span", "tm-badge tm-badge-suspended", `未设 ${buckets.none}`));
				cardBucket.appendChild(bucketBox);
				sideCol.appendChild(cardBucket);
			};
			build();

			// 事件总线：队列/导入变化 → 重建
			this._rebuild = () => {
				if (!this._wrap || !this._wrap.parentNode) return;
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
