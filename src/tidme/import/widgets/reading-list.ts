/*
widgets/reading-list.ts — 阅读列表（topic 队列，统一阅读入口）

- 全库未读 topic 卡（kind=topic 阅读材料：节卡/摘录）按文档分组
- 组内排序：优先级（0 最高）→ due → 阅读顺序（tidme.order）——"按 due 被动重读"
- 每文档组：进度（已读/总数）+ 进度条 + 「▶ 继续」跳到第一未读节
- 空态引导导入中心；事件总线即时刷新
- 复习流（item）不在此页——默认牌组 / 「复习本书」
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const dialog = require('$:/plugins/keepone/tidme/ui/base/dialog.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const paths = require('$:/plugins/keepone/tidme/core/paths.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const primitives = require('$:/plugins/keepone/tidme/ui/components/ui-primitives.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

// 共享 DOM/徽章/文档节查询（实现收敛于 ui/base/dom、ui/components/ui-primitives、core/display、core/doc-ops）
const el = dom.el;
const navigateTo = dom.navigateTo;
const createNavLink = dom.createNavLink;
const renderEmpty = primitives.renderEmpty;
const renderProgressBar = primitives.renderProgressBar;
const bindWidgetRefresh = primitives.bindWidgetRefresh;
const badgeOf = display.badgeOf;
const sectionsOfDoc = docOps.sectionsOfDoc;

/** 阅读列表过滤（topic 队列）：全库 kind=topic 卡，未搁置/未完成。
 * 忽略（tidme.ignored）与已读（tidme.done）自动出列；item 卡不在此页。
 * 过滤器唯一产地 = core/scheduler.TOPIC_QUEUE_FILTER（勿在此手拼）。 */
const topicQueueFilter = () => sched.TOPIC_QUEUE_FILTER;

interface TopicCard {
  title: string;
  kind: string; // subkind：section/extract
  priority: number;
  due: Date;
  order: string;
  doc: string;
  breadcrumb: string;
  fields: Record<string, any>;
}

/** 收集与排序唯一产地 = core/scheduler（collectTopicQueue / sortTopicQueue）；本文件只做分组与渲染 */
function collectTopicCards(wiki: any): TopicCard[] {
  return sched.collectTopicQueue(wiki);
}

/** 组内排序：优先级（0 最高）→ due（早的在前，topic 被动重读）→ 阅读顺序 */
function sortTopicCards(cards: TopicCard[]): TopicCard[] {
  return sched.sortTopicQueue(cards);
}

/** 按文档分组（组间按文档名；无 doc 的散卡收进「未分组」） */
function groupByDoc(cards: TopicCard[]): { doc: string; cards: TopicCard[] }[] {
  const m = new Map<string, TopicCard[]>();
  for (const c of cards) {
    const key = c.doc || '未分组';
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  return [...m.entries()]
    .map(([doc, cs]) => ({ doc, cards: sortTopicCards(cs) }))
    .sort((a, b) => String(a.doc).localeCompare(String(b.doc), 'zh'));
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
      this._compact = this.getAttribute('compact') === 'yes';
      const wrap = el(this.document, 'div', 'tm-reading-list' + (this._compact ? ' tm-rl-compact' : ''));
      this._root = wrap;
      this.build();
      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }

    build() {
      const doc = this.document;
      const wiki = this.wiki;
      const root = this._root;
      const compact = this._compact;
      root.textContent = '';

      const groups = groupByDoc(collectTopicCards(wiki));
      const total = groups.reduce((n, g) => n + g.cards.length, 0);

      // 页头：标题 + 计数（compact：侧边栏精简）
      const head = el(doc, 'div', 'tm-rl-head');
      head.appendChild(el(doc, 'div', 'tm-rl-title', '阅读列表'));
      head.appendChild(el(doc, 'div', 'tm-rl-sub', `${groups.length} 篇文档 · ${total} 张待读`));
      if (!compact) {
        head.appendChild(el(doc, 'div', 'tm-rl-sub', '按优先级和到期时间排序'));
      }
      root.appendChild(head);

      if (!groups.length) {
        root.appendChild(
          renderEmpty(doc, {
            text: '没有待读材料。',
            actionText: !compact ? '→ 去导入中心导入新内容' : undefined,
            onAction: !compact ? () => navigateTo(this, ns.PAGE_IMPORT_CENTER) : undefined,
          }),
        );
        return;
      }

      for (const g of groups) {
        const det = el(doc, 'details', 'tm-rl-doc');
        // 文档组默认折叠（两本书也不占长页面）；summary = 名 + 进度 + 继续阅读
        const docAll = sectionsOfDoc(wiki, g.doc);
        const docDone = docAll.filter((t) => sched.isCardDone(wiki.getTiddler(t)?.fields)).length;
        // 真实 doc tiddler title（命名空间路径，folder 冲突时含 ~docId 后缀）：
        // 按 docId 查真实文档页（B1），不再由书名+docId 重算（slug 规则一变即失配）
        const bookTitle = g.cards[0].breadcrumb.split(ns.CRUMB_SEP)[0] || '';
        const docTiddlerTitle = docOps.docPageOfDoc(wiki, g.doc) ||
          (bookTitle ? paths.bookRoot(bookTitle, g.doc) : '');
        const docLabel = bookTitle || g.doc;

        const sum = el(doc, 'summary', 'tm-rl-doc-head');
        const name = el(doc, 'a', 'tc-tiddlylink tm-rl-doc-name', docLabel);
        name.href = '#';
        name.title = docTiddlerTitle ? `打开文档页：${docLabel}` : `文档页已删除（仅剩摘录/手动内容）`;
        name.addEventListener('click', (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          if (docTiddlerTitle) navigateTo(this, docTiddlerTitle);
        });
        sum.appendChild(name);

        sum.appendChild(el(doc, 'span', 'tm-rl-doc-count', `${g.cards.length} 张待读`));
        if (!compact && docAll.length) {
          sum.appendChild(el(doc, 'span', 'tm-rl-doc-prog', `${docDone}/${docAll.length} 节已读`));
          sum.appendChild(renderProgressBar(doc, docDone, docAll.length, { className: 'tm-rl-doc-bar' }));
        }

        // 继续阅读跳到第一张"当前可读"卡（scheduler.isDueNow，与 section-bar/doc-resume 一致）；
        // 全部未来排期时退回第一张（允许显式打开）
        const targetCard = docOps.docReadingTarget(wiki, g.doc) || (g.cards.find((c) => sched.isDueNow(c.fields)) || g.cards[0])?.title;
        const cont = el(doc, 'button', 'tm-btn', '▶ 继续阅读');
        cont.title = '从续读点或第一张待读卡开始';
        cont.addEventListener('click', (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          const rp = docOps.parseReadPoint(wiki, g.doc);
          const pageMatch = rp?.s && /^p(\d+)$/.exec(rp.s);
          if (pageMatch && g.doc) {
            wiki.addTiddler({ title: '$:/state/tidme-pdf/page/' + g.doc, text: pageMatch[1] });
          }
          if (targetCard) navigateTo(this, targetCard);
        });
        sum.appendChild(cont);

        // 删除阅读材料（文档页 + 节卡/大纲新节）；摘录/挖空/问答/手动散卡等知识产物保留
        const del = icons.iconButton(doc, 'tm-btn tm-rl-del', 'trash', '清理阅读');
        del.title = '删除本书阅读材料（文档页 + 全部普通节卡）；已提取的知识（摘录/挖空/问答）保留在复习流';
        del.addEventListener('click', async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          if (
            await dialog.confirmDialog(doc, {
              title: '清理阅读材料',
              message: `删除《${docLabel}》的阅读材料？

将删除文档页与全部普通节卡（含大纲手动插入的新节）。
已提取的知识（摘录/挖空/问答/手动卡）会保留，不受影响。
此操作不可恢复。`,
              confirmLabel: '删除',
              danger: true,
            })
          ) {
            const n = docOps.deleteDocContent(wiki, g.doc);
            if (n === 0) await dialog.alertDialog(doc, { message: '没有可删除的阅读材料（本书只剩摘录/知识卡，已全部保留）。' });
          }
        });
        sum.appendChild(del);
        det.appendChild(sum);
        root.appendChild(det);

        // 卡片表格按需渲染：文档组默认折叠，首次展开才建行（大库下省掉不可见 DOM）
        let tableRendered = false;
        const renderTableContent = () => {
          if (tableRendered) return;
          tableRendered = true;
          const columns: any[] = [
            {
              key: 'kind',
              title: '',
              width: '28px',
              render: (c: TopicCard) => {
                const mark = el(doc, 'span', c.kind === 'extract' ? 'tm-rl-kind tm-rl-kind-extract' : 'tm-rl-kind', c.kind === 'extract' ? '摘' : '节');
                mark.title = c.kind === 'extract' ? '摘录卡（阅读材料）' : '节卡（阅读单元）';
                return mark;
              },
            },
            {
              key: 'title',
              title: '卡片',
              render: (c: TopicCard) => {
                const titleLink = el(doc, 'a', 'tc-tiddlylink tm-rl-title', display.displayTitle(c.fields, c.title));
                titleLink.href = '#';
                titleLink.title = '打开阅读';
                titleLink.addEventListener('click', (e: Event) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigateTo(this, c.title);
                });
                return titleLink;
              },
            },
          ];
          if (!compact) {
            columns.push({
              key: 'priority',
              title: '优先',
              width: '60px',
              render: (c: TopicCard) => {
                const pri = el(doc, 'span', 'tm-rl-pri', `P${c.priority}`);
                pri.title = `优先级 ${c.priority}（0 最高）`;
                return pri;
              },
            });
            columns.push({
              key: 'status',
              title: '状态',
              width: '75px',
              render: (c: TopicCard) => {
                const bd = badgeOf(c.fields);
                return el(doc, 'span', `tm-badge ${bd.cls}`, bd.text);
              },
            });
          }
          const scrollBox = el(doc, 'div', 'tm-scroll');
          primitives.renderTable(doc, scrollBox, {
            columns,
            data: g.cards,
            emptyText: '暂无待读卡片',
          });
          det.appendChild(scrollBox);
        };
        if ((det as any).open) renderTableContent();
        else {
          det.addEventListener('toggle', () => {
            if ((det as any).open) renderTableContent();
          });
        }
      }
    }

    refresh(changedTiddlers: Record<string, any>) {
      if (!this._root) return false;
      return bindWidgetRefresh(this, changedTiddlers, () => this.build());
    }
  }
  return ReadingListWidget as any;
}

exports['reading-list'] = makeReadingList();

// 供单元测试/复用
exports.topicQueueFilter = topicQueueFilter;
exports.collectTopicCards = collectTopicCards;
exports.sortTopicCards = sortTopicCards;
exports.groupByDoc = groupByDoc;
