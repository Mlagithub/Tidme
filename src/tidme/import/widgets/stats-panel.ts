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
const primitives = require('$:/plugins/keepone/tidme/ui/components/ui-primitives.js');
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
        const docs = wiki.filterTiddlers('[tag[tidme-import-doc]]');
        // 漏斗只消费卡片与文档页（[!is[system]] 会把状态/配置/临时 tiddler 全部载入）
        const all = cardLikes('[all[shadows+tiddlers]!is[draft]has[tidme.kind]] [all[shadows+tiddlers]!is[draft]tag[tidme-import-doc]]');
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
        const buckets = stats.priorityBuckets(cardLikes('[tidme.kind[item]]'));
        const rt = stats.getReadTimeStats ? stats.getReadTimeStats(wiki) : { totalSeconds: 0, todaySeconds: 0, docSeconds: {} };
        const fmtDur = stats.formatDuration ? stats.formatDuration : (s: number) => `${s} 秒`;

        // 0) 指标卡（纯化为声明式数据）
        primitives.renderMetricCards(doc, wrap, [
          { label: '牌组', value: String(decks.length) },
          { label: '文档', value: String(docs.length) },
          { label: '在队卡', value: String(funnel.cards) },
          { label: '复习', value: String(ret.reviews), sub: ret.reviews ? `保留率 ${Math.round(ret.retention * 100)}%` : '' },
          { label: '今日阅读', value: fmtDur(rt.todaySeconds), sub: `累计 ${fmtDur(rt.totalSeconds)}` },
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
        cardLoad.appendChild(el(doc, 'div', 'tm-dashboard-card-title', '牌组负载'));
        const deckRows = decks.map((deck: string) => {
          const cards2 = deckMod.deckCards(wiki, deck).map((t: string) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
          const load = stats.deckLoad(cards2);
          return { deck, total: load.total, newCount: load.newCount, learn: load.learn, due: load.due, overdue: load.overdue };
        });
        primitives.renderTable(doc, cardLoad, {
          columns: [
            { key: 'deck', title: '牌组', render: (row: any) => el(doc, 'span', 'tm-stats-deck', row.deck) },
            { key: 'total', title: '总数' },
            { key: 'newCount', title: '新' },
            { key: 'learn', title: '学习中' },
            { key: 'due', title: '到期' },
            { key: 'overdue', title: '逾期' },
          ],
          data: deckRows,
          emptyText: '暂无牌组',
        });
        mainCol.appendChild(cardLoad);

        // 2) 文档进度（声明式表格）
        const cardDoc = el(doc, 'div', 'tm-dashboard-card');
        cardDoc.appendChild(el(doc, 'div', 'tm-dashboard-card-title', '文档进度'));
        const docRows: any[] = [];
        for (const d of docs) {
          const docId = wiki.getTiddler(d)?.fields['tidme.doc'];
          if (!docId) continue;
          const sections = cardLikes(`[tidme.doc[${docId}]tidme.kind[topic]!tidme.subkind[extract]]`);
          const p = stats.docProgress(sections);
          const docFields = wiki.getTiddler(d)?.fields || {};
          docRows.push({
            name: displayTitle(docFields, d),
            done: p.done,
            total: p.total,
            left: p.left,
          });
        }
        const docTableWrap = primitives.renderTable(doc, cardDoc, {
          columns: [
            { key: 'name', title: '文档', render: (row: any) => el(doc, 'span', 'tm-stat-doc-name', row.name) },
            {
              key: 'bar',
              title: '进度',
              render: (row: any) => renderProgressBar(doc, row.done, row.total),
            },
            { key: 'info', title: '已读', render: (row: any) => el(doc, 'span', 'tm-import-muted', `已读 ${row.done} / ${row.total}（剩 ${row.left}）`) },
          ],
          data: docRows,
          emptyText: '暂无导入文档——导入中心导入书籍后显示进度。',
        });
        docTableWrap.classList.add('tm-scroll');
        mainCol.appendChild(cardDoc);

        // 3) 漏斗
        const cardFunnel = el(doc, 'div', 'tm-dashboard-card');
        cardFunnel.appendChild(el(doc, 'div', 'tm-dashboard-card-title', '学习漏斗'));
        const funnelBox = el(doc, 'div', 'tm-stat-funnel');
        const funnelMax = Math.max(1, funnel.docs, funnel.sections, funnel.extracts, funnel.cards);
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
        funnelBox.appendChild(funnelRow('导入', funnel.docs));
        funnelBox.appendChild(funnelRow('切分', funnel.sections));
        funnelBox.appendChild(funnelRow('摘录', funnel.extracts));
        funnelBox.appendChild(funnelRow('卡', funnel.cards));
        cardFunnel.appendChild(funnelBox);
        sideCol.appendChild(cardFunnel);

        // 4) 复习与保留率
        const cardRet = el(doc, 'div', 'tm-dashboard-card');
        cardRet.appendChild(el(doc, 'div', 'tm-dashboard-card-title', '复习与保留率'));
        const retBox = el(doc, 'div', 'tm-stat-pills');
        retBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-learn', `复习 ${ret.reviews} 次`));
        if (ret.reviews) {
          retBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-due', `保留率 ${Math.round(ret.retention * 100)}%`));
        }
        cardRet.appendChild(retBox);
        sideCol.appendChild(cardRet);

        // 5) 优先级分桶
        const cardBucket = el(doc, 'div', 'tm-dashboard-card');
        cardBucket.appendChild(el(doc, 'div', 'tm-dashboard-card-title', '优先级分桶'));
        const bucketBox = el(doc, 'div', 'tm-stat-pills');
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-new', `高 ${buckets.high}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-due', `中 ${buckets.medium}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-learn', `低 ${buckets.low}`));
        bucketBox.appendChild(el(doc, 'span', 'tm-badge tm-badge-suspended', `未设 ${buckets.none}`));
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
