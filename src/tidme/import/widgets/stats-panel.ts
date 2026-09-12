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
        // log tiddler title 形如 $:/Deck/<deck>/log（repeat.tid 写入，单文件），用 prefix + JS 后过滤匹配
        const logTitles = wiki.filterTiddlers('[all[shadows+tiddlers]prefix[$:/Deck/]]')
          .filter((t: string) => /\/log$/.test(t));
        const entries: any[] = [];
        for (const lt of logTitles) {
          const data = wiki.getTiddlerData(lt);
          if (data && typeof data === 'object') {
            for (const k of Object.keys(data)) {
              try {
                entries.push(JSON.parse(String((data as any)[k])));
              } catch { /* 忽略坏行 */ }
            }
          }
        }
        const ret = stats.retentionFromLogs(entries);
        // 真实保留率（Anki true retention 口径）：只统计成熟卡（间隔 ≥ 21 天）的复习。
        // 旧的 1 − Again 占比会把新卡/学习步一锅算，系统性低估记忆表现（见 doc/concept-gaps.md 错位 2）。
        const trueRet = stats.trueRetentionFromLogs(entries);
        const buckets = stats.priorityBuckets(cardLikes('[tidme.kind[item]]'));
        const rt = stats.getReadTimeStats ? stats.getReadTimeStats(wiki) : { totalSeconds: 0, todaySeconds: 0, docSeconds: {} };
        const fmtDur = stats.formatDuration ? stats.formatDuration : (s: number) => `${s}s`;

        // 0) 指标卡（纯化为声明式数据）
        primitives.renderMetricCards(doc, wrap, [
          { label: lingo(wiki, 'stats.decks', 'Decks'), value: String(decks.length) },
          { label: lingo(wiki, 'stats.docs', 'Documents'), value: String(docs.length) },
          { label: lingo(wiki, 'stats.total.cards', 'Cards in Queue'), value: String(funnel.cards) },
          {
            label: lingo(wiki, 'stats.today.reviewed', 'Reviews'),
            value: String(ret.reviews),
            // 成熟卡真实保留率优先展示（有成熟复习时）；无则回落到总口径并标注
            sub: trueRet.matureReviews > 0
              ? `${lingo(wiki, 'stats.trueretention', 'True retention (mature)')} ${Math.round(trueRet.trueRetention * 100)}% · ${lingo(wiki, 'stats.retention', 'Retention')} ${
                Math.round(ret.retention * 100)
              }%`
              : `${lingo(wiki, 'stats.retention', 'Retention')} ${Math.round(ret.retention * 100)}%`,
          },
          { label: lingo(wiki, 'stats.todayread', 'Today Read'), value: fmtDur(rt.todaySeconds), sub: `${lingo(wiki, 'stats.total', 'Total')} ${fmtDur(rt.totalSeconds)}` },
        ]);

        // 创建分栏网格布局
        const grid = el(doc, 'div', 'tm-stats-grid');
        const mainCol = el(doc, 'div', 'tm-stats-col-main');
        const sideCol = el(doc, 'div', 'tm-stats-col-side');
        grid.appendChild(mainCol);
        grid.appendChild(sideCol);
        wrap.appendChild(grid);

        // 1) 牌组负载（声明式卡片表格）
        const cardLoad = el(doc, 'div', 'tm-dashboard-card');
        cardLoad.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.deckload', 'Deck Load')));
        const deckRows = decks.map((deck: string) => {
          const cards2 = deckMod.deckCards(wiki, deck).map((t: string) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
          const load = stats.deckLoad(cards2);
          return { deck, total: load.total, newCount: load.newCount, learn: load.learn, due: load.due, overdue: load.overdue };
        });
        primitives.renderTable(doc, cardLoad, {
          columns: [
            { key: 'deck', title: lingo(wiki, 'deck', 'Deck'), render: (row: any) => el(doc, 'span', 'tm-stats-deck', row.deck) },
            { key: 'total', title: lingo(wiki, 'col.total', 'Total') },
            { key: 'newCount', title: lingo(wiki, 'state.new', 'New') },
            { key: 'learn', title: lingo(wiki, 'state.learning', 'Learn') },
            { key: 'due', title: lingo(wiki, 'state.due', 'Due') },
            { key: 'overdue', title: lingo(wiki, 'state.overdue', 'Overdue') },
          ],
          data: deckRows,
          emptyText: lingo(wiki, 'stats.nodecks', 'No decks'),
        });
        mainCol.appendChild(cardLoad);

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
        mainCol.appendChild(cardDoc);

        // 2.5) 未来到期负荷（Anki Future Due 的简化版）：按学习日分桶的未来 14 天到期量。
        // 逾期卡并入第 0 天（不重复计）；新卡未排期不入桶。看得到未来负载才能提前顺延/限额干预。
        const futureDays = 14;
        const future = stats.futureDueSchedule(
          cardLikes('[tidme.kind[item]]'),
          futureDays,
          new Date(),
          config.readRolloverHour(wiki),
        );
        const cardFuture = el(doc, 'div', 'tm-dashboard-card');
        cardFuture.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.futuredue', 'Future Due (14 days)')));
        const futureBox = el(doc, 'div', 'tm-stat-funnel');
        const futureMax = Math.max(1, ...future.map((d: any) => d.dueCount));
        for (const d of future) {
          const row = el(doc, 'div', 'tm-stat-funnel-row');
          row.appendChild(el(doc, 'span', 'tm-stat-funnel-label', d.dateString.slice(4, 6) + '-' + d.dateString.slice(6, 8)));
          const bar = el(doc, 'span', 'tm-stat-funnel-bar');
          const fill = el(doc, 'span', 'tm-stat-funnel-fill');
          fill.style.width = `${Math.round((d.dueCount / futureMax) * 100)}%`;
          bar.appendChild(fill);
          row.appendChild(bar);
          row.appendChild(el(doc, 'span', 'tm-stat-funnel-count', String(d.dueCount)));
          futureBox.appendChild(row);
        }
        cardFuture.appendChild(futureBox);
        sideCol.appendChild(cardFuture);

        // 3) 漏斗
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
        sideCol.appendChild(cardFunnel);

        // 4) 复习与保留率
        const cardRet = el(doc, 'div', 'tm-dashboard-card');
        cardRet.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.reviewretention', 'Review & Retention')));
        const retBox = el(doc, 'div', 'tm-stat-pills');
        retBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-learn', `${ret.reviews} ${lingo(wiki, 'stats.reviews', 'Reviews')}`));
        if (ret.reviews) {
          retBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-due', `${lingo(wiki, 'stats.retention', 'Retention')}: ${Math.round(ret.retention * 100)}%`));
        }
        // 真实保留率（成熟卡）：与总口径并列，避免用被新卡拉低的数字去调 request_retention
        if (trueRet.matureReviews > 0) {
          retBox.appendChild(
            el(
              doc,
              'span',
              'tm-badge tm-badge-new',
              `${lingo(wiki, 'stats.trueretention', 'True retention (mature)')}: ${Math.round(trueRet.trueRetention * 100)}% (${trueRet.matureReviews})`,
            ),
          );
        }
        cardRet.appendChild(retBox);
        sideCol.appendChild(cardRet);

        // 5) 优先级分桶
        const cardBucket = el(doc, 'div', 'tm-dashboard-card');
        cardBucket.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(wiki, 'stats.prioritybuckets', 'Priority Distribution')));
        const bucketBox = el(doc, 'div', 'tm-stat-pills');
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-new', `${lingo(wiki, 'priority.high', 'High')}: ${buckets.high}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-due', `${lingo(wiki, 'priority.med', 'Med')}: ${buckets.medium}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-learn', `${lingo(wiki, 'priority.low', 'Low')}: ${buckets.low}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-suspended', `${lingo(wiki, 'priority.none', 'None')}: ${buckets.none}`));
        cardBucket.appendChild(bucketBox);
        sideCol.appendChild(cardBucket);
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
