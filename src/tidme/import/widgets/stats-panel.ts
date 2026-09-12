/*
widgets/stats-panel.ts — 统计面板（指标卡 + 表格 + 漏斗横条）

<$stats-panel/> 渲染：指标卡（牌组/文档/复习/保留率）、牌组负载表、文档进度、
漏斗（横条可视化）、复习与保留率、优先级分桶。
数据源：core/stats 纯函数 + 复习日志（$:/Deck 下的 log tiddler data）。
事件总线：监听队列/导入变化 → 重建面板（评分、导入、批量操作后数字即时更新）。
样式：统一复用 core 设计系统（tm-card/tm-table/tm-progress/tm-section-title）。
*/

declare function require(module: string): any;
const stats = require('$:/plugins/keepone/tidme/core/stats.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const primitives = require('$:/plugins/keepone/tidme/ui/components/ui-primitives.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
function lingo(wiki: any, key: string, fallback: string): string {
  return lingoMod ? lingoMod.lingo(wiki, key, fallback) : fallback;
}
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;
const renderProgressBar = primitives.renderProgressBar;

/** 横向条形（0–1 比例）：用与漏斗同一套进度条样式，避免自造类名导致条不可见 */
function barCell(doc: Document, ratio: number): HTMLElement {
  const wrap = dom.el(doc, 'span', 'tm-progress tm-stat-bar');
  const fill = dom.el(doc, 'span', 'tm-progress-fill tm-stat-bar-fill', '');
  fill.style.width = `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%`;
  wrap.appendChild(fill);
  return wrap;
}
const bindWidgetRefresh = primitives.bindWidgetRefresh;
const displayTitle = display.displayTitle;

function sectionTitle(doc: Document, label: string): HTMLElement {
  return el(doc, 'div', 'tm-section-title', label);
}

function makeStatsPanel(): WidgetCtor {
  class StatsPanelWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const wrap = el(doc, 'div', 'tm-stats-panel');
      this._wrap = wrap;

      const build = () => {
        wrap.textContent = '';
        const cardLikes = (filter: string) => wiki.filterTiddlers(filter).map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }));

        const decks = deckMod.listDecks(wiki);
        const docs = wiki.filterTiddlers('[tag[tidme-doc]]');
        // 漏斗只消费卡片与文档页（[!is[system]] 会把状态/配置/临时 tiddler 全部载入）；
        // 文档页同样是 kind=topic 的卡片，一个 run 即可
        const all = cardLikes('[all[shadows+tiddlers]!is[draft]has[tidme.kind]]');
        const funnel = stats.funnelCounts(all);
        // 复习日志行收集收口在 core/stats.collectReviewLogs（对象/字符串两种行形态、坏行宽容都在那实现一次）
        const entries = stats.collectReviewLogs(wiki);
        const ret = stats.retentionFromLogs(entries);
        // 真实保留率（Anki true retention 口径）：只统计成熟卡（间隔 ≥ 21 天）的复习。
        // 旧的 1 − Again 占比会把新卡/学习步一锅算，系统性低估记忆表现（见 doc/concept-gaps.md 错位 2）。
        const trueRet = stats.trueRetentionFromLogs(entries);
        // 今日复习数：与「今天」页同源（core/stats.reviewCountToday，按学习日换天）。
        // 曾直接用 ret.reviews（= 全库全部时间日志行数）当"今日"值 —— 标签与数字不符。
        const todayReviews = stats.reviewCountToday(wiki);
        const buckets = stats.priorityBuckets(cardLikes('[tidme.kind[item]]'));
        const rt = stats.getReadTimeStats ? stats.getReadTimeStats(wiki) : { totalSeconds: 0, todaySeconds: 0, docSeconds: {} };
        const fmtDur = stats.formatDuration ? stats.formatDuration : (s: number) => `${s}s`;

        // 0) 指标卡（纯化为声明式数据）
        primitives.renderMetricCards(doc, wrap, [
          { label: lingo(wiki, 'stats.decks', 'Decks'), value: String(decks.length) },
          { label: lingo(wiki, 'stats.docs', 'Documents'), value: String(docs.length) },
          { label: lingo(wiki, 'stats.total.cards', 'Cards in Queue'), value: String(funnel.cards) },
          {
            label: lingo(wiki, 'stats.today.reviewed', 'Today Reviewed'),
            value: String(todayReviews),
            // 累计次数给足上下文；保留率优先展示成熟卡真实值（有成熟复习时）
            sub: `${lingo(wiki, 'stats.total', 'Total')} ${ret.reviews} · ` + (trueRet.matureReviews > 0
              ? `${lingo(wiki, 'stats.trueretention', 'True retention (mature)')} ${Math.round(trueRet.trueRetention * 100)}% · ${lingo(wiki, 'stats.retention', 'Retention')} ${
                Math.round(ret.retention * 100)
              }%`
              : `${lingo(wiki, 'stats.retention', 'Retention')} ${Math.round(ret.retention * 100)}%`),
          },
          { label: lingo(wiki, 'stats.todayread', 'Today Read'), value: fmtDur(rt.todaySeconds), sub: `${lingo(wiki, 'stats.total', 'Total')} ${fmtDur(rt.totalSeconds)}` },
        ]);

        // 瀑布布局：全部卡片进同一容器，CSS 多栏按内容高度自动均衡分栏（窄容器回落单栏）。
        // 矮表格卡在前、行数最多的直方图卡（卡片分布）垫底，贪婪填充后两栏高度接近，
        // 避免旧版「主栏两张矮卡 + 侧栏五张高卡」造成的一侧大片留白
        const masonry = el(doc, 'div', 'tm-stats-masonry');
        wrap.appendChild(masonry);

        // 1) 牌组负载（声明式卡片表格）
        const cardLoad = el(doc, 'div', 'tm-dashboard-card');
        cardLoad.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.deckload', 'Deck Load')));
        const deckRows = decks.map((deck: string) => {
          const cards2 = deckMod.deckCards(wiki, deck).map((t: string) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
          const load = stats.deckLoad(cards2);
          const df = wiki.getTiddler(deck)?.fields || {};
          // 展示名走 caption（默认牌组 caption 是语言转义 → captionText 解析为「全部卡片」），裸标题进 tooltip
          const name = display.captionText(wiki, displayTitle(df, deck), this) || deck;
          return { deck, name, total: load.total, newCount: load.newCount, learn: load.learn, due: load.due, overdue: load.overdue };
        });
        primitives.renderTable(doc, cardLoad, {
          columns: [
            {
              key: 'deck',
              title: lingo(wiki, 'deck', 'Deck'),
              render: (row: any) => {
                const s = el(doc, 'span', 'tm-stats-deck', row.name);
                s.title = row.deck;
                return s;
              },
            },
            { key: 'total', title: lingo(wiki, 'col.total', 'Total') },
            { key: 'newCount', title: lingo(wiki, 'state.new', 'New') },
            { key: 'learn', title: lingo(wiki, 'state.learning', 'Learn') },
            { key: 'due', title: lingo(wiki, 'state.due', 'Due') },
            { key: 'overdue', title: lingo(wiki, 'state.overdue', 'Overdue') },
          ],
          data: deckRows,
          emptyText: lingo(wiki, 'stats.nodecks', 'No decks'),
        });
        masonry.appendChild(cardLoad);

        // 2) 文档进度（声明式表格）
        const cardDoc = el(doc, 'div', 'tm-dashboard-card');
        cardDoc.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.docprogress', 'Document Progress')));
        const docRows: any[] = [];
        for (const d of docs) {
          const docId = wiki.getTiddler(d)?.fields['tidme.doc'];
          if (!docId) continue;
          const prog = docOps.docReadingProgress(wiki, docId);
          const docFields = wiki.getTiddler(d)?.fields || {};
          const isContinuous = prog.type === 'continuous';
          docRows.push({
            name: displayTitle(docFields, d),
            done: prog.current,
            total: prog.total,
            left: Math.max(0, prog.total - prog.current),
            isContinuous,
            doneText: prog.doneText,
          });
        }
        const docTableWrap = primitives.renderTable(doc, cardDoc, {
          columns: [
            { key: 'name', title: lingo(wiki, 'stats.docs', 'Document'), render: (row: any) => el(doc, 'span', 'tm-stat-doc-name', row.name) },
            {
              key: 'bar',
              title: lingo(wiki, 'col.progress', 'Progress'),
              render: (row: any) => renderProgressBar(doc, row.done, row.total),
            },
            {
              key: 'info',
              title: lingo(wiki, 'state.read', 'Read'),
              render: (row: any) =>
                el(
                  doc,
                  'span',
                  'tm-import-muted',
                  row.isContinuous
                    ? (row.total > 0 ? `${row.doneText} (${row.left} ${lingo(wiki, 'read.pages', 'pages')})` : row.doneText)
                    : `${row.done} / ${row.total} (${row.left} ${lingo(wiki, 'today.sectionsleft', 'left')})`,
                ),
            },
          ],
          data: docRows,
          emptyText: lingo(wiki, 'stats.nodocs', 'No documents imported - import books to track progress.'),
        });
        docTableWrap.classList.add('tm-scroll');
        masonry.appendChild(cardDoc);

        // 3) 预测（对标 Anki「预测」卡）：未来 14 天到期条形 + 四个汇总数
        // （窗口总量 / 平均每天 / 明天到期 / 每日负载 Σ 1/间隔）。逾期并入第 0 天，不重复计；
        // 新卡未排期不入桶。看得到未来负载才能提前顺延/限额干预。
        const futureDays = 14;
        const itemCards = cardLikes('[tidme.kind[item]]');
        const future = stats.futureDueSchedule(itemCards, futureDays, new Date(), config.readRolloverHour(wiki));
        const forecast = stats.forecastSummary(itemCards, futureDays, new Date(), config.readRolloverHour(wiki));
        const cardFuture = el(doc, 'div', 'tm-dashboard-card');
        cardFuture.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.forecast', 'Due Forecast')));
        const futureBox = el(doc, 'div', 'tm-stat-funnel');
        const futureMax = Math.max(1, ...future.map((d: any) => d.dueCount));
        for (const d of future) {
          const row = el(doc, 'div', 'tm-stat-funnel-row');
          row.appendChild(el(doc, 'span', 'tm-stat-funnel-label', d.dateString.slice(4, 6) + '-' + d.dateString.slice(6, 8)));
          row.appendChild(barCell(doc, d.dueCount / futureMax));
          row.appendChild(el(doc, 'span', 'tm-stat-funnel-num', String(d.dueCount)));
          futureBox.appendChild(row);
        }
        cardFuture.appendChild(futureBox);
        const forecastBox = el(doc, 'div', 'tm-stat-pills');
        const one = (n: number) => (Math.round(n * 10) / 10).toString();
        forecastBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-learn', `${lingo(wiki, 'stats.total', 'Total')} ${forecast.total}`));
        forecastBox.appendChild(
          el(doc, 'span', 'tm-badge tm-badge-due', `${lingo(wiki, 'stats.forecast.avg', 'Average')} ${one(forecast.averagePerDay)}/${lingo(wiki, 'stats.day', 'day')}`),
        );
        forecastBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-new', `${lingo(wiki, 'stats.forecast.tomorrow', 'Tomorrow')} ${forecast.dueTomorrow}`));
        forecastBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-suspended', `${lingo(wiki, 'stats.forecast.burden', 'Daily workload')} ${one(forecast.burden)}`));
        cardFuture.appendChild(forecastBox);
        masonry.appendChild(cardFuture);

        // 4) 漏斗
        const cardFunnel = el(doc, 'div', 'tm-dashboard-card');
        cardFunnel.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.funnel', 'Learning Funnel')));
        const funnelBox = el(doc, 'div', 'tm-stat-funnel');
        const funnelMax = Math.max(1, funnel.docs, funnel.sections, funnel.extracts, funnel.concepts, funnel.cards);
        const funnelRow = (label: string, n: number) => {
          const row = el(doc, 'div', 'tm-stat-funnel-row');
          row.appendChild(el(doc, 'span', 'tm-stat-funnel-label', label));
          const barWrap = el(doc, 'span', 'tm-progress tm-stat-bar tm-stat-bar-lg');
          const bar = el(doc, 'span', 'tm-progress-fill tm-stat-bar-fill', '');
          bar.style.width = `${Math.round((n / funnelMax) * 100)}%`;
          barWrap.appendChild(bar);
          row.appendChild(barWrap);
          row.appendChild(el(doc, 'span', 'tm-stat-funnel-num', String(n)));
          return row;
        };
        funnelBox.appendChild(funnelRow(lingo(wiki, 'stats.funnel.import', 'Docs'), funnel.docs));
        funnelBox.appendChild(funnelRow(lingo(wiki, 'stats.funnel.sections', 'Sections'), funnel.sections));
        funnelBox.appendChild(funnelRow(lingo(wiki, 'stats.funnel.extracts', 'Extracts'), funnel.extracts));
        funnelBox.appendChild(funnelRow(lingo(wiki, 'stats.funnel.concepts', 'Concepts'), funnel.concepts));
        funnelBox.appendChild(funnelRow(lingo(wiki, 'stats.funnel.cards', 'Cards'), funnel.cards));
        cardFunnel.appendChild(funnelBox);
        masonry.appendChild(cardFunnel);

        // 5) 复习与保留率
        const cardRet = el(doc, 'div', 'tm-dashboard-card');
        cardRet.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.reviewretention', 'Review & Retention')));
        // 保留率表（对标 Anki Stats）：时间范围 × 成熟/年轻/总计，全部走真实保留率口径
        // （学习步与新卡不计入——用被新卡拉低的数字去调 request_retention 会调错方向）
        const periodRows = stats.retentionByPeriod(entries, new Date(), config.readRolloverHour(wiki));
        const periodLabel: Record<string, string> = {
          today: lingo(wiki, 'stats.period.today', 'Today'),
          yesterday: lingo(wiki, 'stats.period.yesterday', 'Yesterday'),
          lastWeek: lingo(wiki, 'stats.period.lastweek', 'Last 7 days'),
          lastMonth: lingo(wiki, 'stats.period.lastmonth', 'Last 30 days'),
          all: lingo(wiki, 'stats.period.all', 'All time'),
        };
        const cell = (c: any) => (c.reviews ? `${Math.round(c.retention * 100)}% (${c.reviews})` : '—');
        primitives.renderTable(doc, cardRet, {
          columns: [
            { key: 'period', title: lingo(wiki, 'stats.period', 'Period'), render: (row: any) => el(doc, 'span', '', periodLabel[row.period] || row.period) },
            { key: 'mature', title: lingo(wiki, 'stats.mature', 'Mature'), render: (row: any) => el(doc, 'span', '', cell(row.mature)) },
            { key: 'young', title: lingo(wiki, 'stats.young', 'Young'), render: (row: any) => el(doc, 'span', '', cell(row.young)) },
            { key: 'total', title: lingo(wiki, 'stats.total', 'Total'), render: (row: any) => el(doc, 'span', '', cell(row.total)) },
          ],
          data: periodRows.filter((r: any) => r.total.reviews > 0 || r.period === 'today' || r.period === 'all'),
          emptyText: lingo(wiki, 'stats.noreviews', 'No reviews yet'),
        });
        const retBox = el(doc, 'div', 'tm-stat-pills');
        // 明确"累计"：全部时间口径（"今日"在上方指标卡，按学习日统计）
        retBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-learn', `${lingo(wiki, 'stats.total', 'Total')} ${ret.reviews} ${lingo(wiki, 'stats.reviews', 'Reviews')}`));
        if (ret.reviews) {
          retBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-due', `${lingo(wiki, 'stats.retention', 'Retention')}: ${Math.round(ret.retention * 100)}%`));
        }
        cardRet.appendChild(retBox);
        masonry.appendChild(cardRet);

        // 6) 优先级分桶
        const cardBucket = el(doc, 'div', 'tm-dashboard-card');
        cardBucket.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.prioritybuckets', 'Priority Distribution')));
        const bucketBox = el(doc, 'div', 'tm-stat-pills');
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-new', `${lingo(wiki, 'priority.high', 'High')}: ${buckets.high}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-due', `${lingo(wiki, 'priority.med', 'Med')}: ${buckets.medium}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-learn', `${lingo(wiki, 'priority.low', 'Low')}: ${buckets.low}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-suspended', `${lingo(wiki, 'priority.none', 'None')}: ${buckets.none}`));
        cardBucket.appendChild(bucketBox);
        masonry.appendChild(cardBucket);

        // 7) 卡片分布（对标 Anki 的间隔 / 稳定度 / 难度三图，纯聚合直方图）——
        // 三张直方图行数最多，放序列末尾垫底，多栏贪婪填充后两栏高度才接近
        const cardDist = el(doc, 'div', 'tm-dashboard-card');
        cardDist.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.distributions', 'Card Distributions')));
        const histBlock = (title: string, bins: any[]) => {
          cardDist.appendChild(el(doc, 'div', 'tm-stat-subtitle', title));
          const box = el(doc, 'div', 'tm-stat-funnel');
          const max = Math.max(1, ...bins.map((b: any) => b.count));
          for (const b of bins) {
            const row = el(doc, 'div', 'tm-stat-funnel-row');
            row.appendChild(el(doc, 'span', 'tm-stat-funnel-label', b.label));
            row.appendChild(barCell(doc, b.count / max));
            row.appendChild(el(doc, 'span', 'tm-stat-funnel-num', String(b.count)));
            box.appendChild(row);
          }
          cardDist.appendChild(box);
        };
        histBlock(lingo(wiki, 'stats.dist.interval', 'Interval (days)'), stats.intervalHistogram(itemCards));
        histBlock(lingo(wiki, 'stats.dist.stability', 'Stability (days)'), stats.stabilityHistogram(itemCards));
        histBlock(lingo(wiki, 'stats.dist.difficulty', 'Difficulty'), stats.difficultyHistogram(itemCards));
        masonry.appendChild(cardDist);
      };
      build();

      // 刷新：唯一机制（TW 原生 refresh 嗅探 + core/reactive 谓词）
      this._build = build;

      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }
    refresh(changedTiddlers: Record<string, any>) {
      if (!this._wrap || !this._wrap.parentNode) return false;
      return bindWidgetRefresh(
        this,
        changedTiddlers,
        () => {
          this._wrap.textContent = '';
          this._build?.();
        },
        { checkRelevant: reactive.hasRelevantChange },
      );
    }
  }
  return StatsPanelWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports['stats-panel'] = makeStatsPanel();
