/*
widgets/card-manager.ts — 统一卡片管理器 v3

对标 SuperMemo 的管理三件套（Contents 知识树 / Browser 子集浏览 / Find elements）：
- 视图过滤：全部 / 在队 / 已读 / 搁置 / 逾期（定义一个"子集"）
- 组织方式：按文档（树，默认，全量稳定）/ 按牌组（树，含「未入组」兜底）/ 列表（Browser 式平铺）
- 每卡：状态徽章 + 类型 + 优先级 + 标题(点击打开) + 行内操作(读/回/删除)
- 批量工具条：选中卡 → 顺延/提前/移出队列/搁置/恢复/遗忘/删除/批量优先级

结构（原 render 闭包拆件）：状态收进 CMState（原 16 个闭包可变量），视图构建为
模块级函数（统一收 Ctx），事件处理器早退扁平化。
卡片 = 任何带 tidme.kind 的 tiddler（topic 节卡 / item 测试卡）；文档页（宿主页）不列入。
"全部"视图计数与实际显示一致：按文档树全量；按牌组树由各牌组分支 + 未入组分支兜底全量。
Done 语义：移出队列 = 置 tidme.done（kind 决定归属：item 出默认牌组，topic 出阅读列表）。
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const dialog = require('$:/plugins/keepone/tidme/ui/base/dialog.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const primitives = require('$:/plugins/keepone/tidme/ui/components/ui-primitives.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const showToast = dom.showToast;
const navigateTo = dom.navigateTo;
const renderEmpty = primitives.renderEmpty;
const bindWidgetRefresh = primitives.bindWidgetRefresh;

type View = 'all' | 'inqueue' | 'done' | 'suspended' | 'overdue' | 'leech';
type Org = 'doc' | 'deck' | 'list';
type SortKey = 'breadcrumb' | 'priority' | 'due' | 'deck' | 'mixed';

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'all', label: 'All', key: 'manager.all' },
  { id: 'inqueue', label: 'In Queue', key: 'manager.inqueue' },
  { id: 'done', label: 'Read', key: 'manager.read' },
  { id: 'suspended', label: 'Suspended', key: 'manager.suspended' },
  { id: 'overdue', label: 'Overdue', key: 'manager.overdue' },
  { id: 'leech', label: 'Leech', key: 'manager.leech' },
];

const ORGS: { id: Org; label: string; tip: string; key: string }[] = [
  { id: 'doc', label: 'By Document', tip: 'All cards organized by document / breadcrumb tree', key: 'manager.bydoc' },
  { id: 'deck', label: 'By Deck', tip: 'Organized by study decks, unassigned cards in unassigned branch', key: 'manager.bydeck' },
  { id: 'list', label: 'List', tip: 'Flat list of all cards (SuperMemo Browser style)', key: 'manager.flatlist' },
];

interface Card {
  title: string;
  fields: Record<string, any>;
}
interface DeckInfo {
  title: string;
  caption: string;
  strict: Set<string>;
  loose: Set<string>;
  /** 牌组配置的 leech 阈值（渲染期判定同源：deck.leech_threshold 字段，缺省 = core 默认） */
  leechThreshold: number;
}

/** 管理器状态（原 render 闭包的 16 个可变量收进一处；render 时重建，选中集跨重建保持） */
interface CMState {
  view: View;
  org: Org;
  sortKey: SortKey;
  sortAsc: boolean;
  searchText: string;
  previewTitle: string | null;
  editTitle: string | null;
  selected: Set<string>;
  lastCheckedCardTitle: string | null;
  renderedCardTitles: string[];
  allCards: Card[];
  deckInfos: DeckInfo[];
  visibleCards: Card[];
  groupCbUpdaters: (() => void)[];
  cardCbUpdaters: (() => void)[];
  bulkCb: HTMLInputElement | null;
  selLabel: HTMLElement | null;
}

/** 渲染上下文：模块级视图函数统一收 ctx */
interface Ctx {
  widget: any;
  doc: Document;
  wiki: any;
  wrap: HTMLElement;
  st: CMState;
}

// 共享 DOM/徽章/标签工具（实现收敛于 core/dom、core/display）
const el = dom.el;
const badgeOf = display.badgeOf;
const kindMark = display.kindMark;
const stateLabel = display.stateLabel;
const dueLabel = display.dueLabel;
const intervalLabel = display.intervalLabel;
const repsLabel = display.repsLabel;
const lapsesLabel = display.lapsesLabel;
const diffLabel = display.diffLabel;
const dateLabel = display.dateLabel;

/** 卡片收集：带 tidme.kind 的 tiddler（topic/item）。卡片一律带 kind——制卡工厂
 *  （core/card-factory）与文档页构建处保证。排除文档汇总页（文档页宿主不是可管理卡片）。 */
const CARD_FILTER = '[all[shadows+tiddlers]!is[draft]has[tidme.kind]!tag[tidme-doc]]';

/** Done：字段补丁（core scheduler 实现，与批量恢复同族——一律返回补丁，调用方展开写库） */
function doneFields(): Record<string, any> {
  return sched.doneCard();
}
/** 恢复：直接用 core 的补丁（三键显式 undefined = TW addTiddler 删除字段语义） */
function resumePatch(): Record<string, any> {
  return sched.restoreCard();
}

// ---------- 纯查询 ----------

function crumbOf(c: Card): string {
  return String(c.fields['tidme.breadcrumb'] || c.title);
}

/** 视图判定。
 *  leech 视图的阈值按卡所属牌组的 leech_threshold（多牌组取最小），
 *  与 repeat.tid 渲染期触发判定同源——曾写死 core 默认值 8，牌组改过阈值后视图与触发脱节。 */
function inView(st: CMState, f: Record<string, any>, v: View, title = ''): boolean {
  const suspended = f['tidme.suspended'] === 'yes';
  const done = sched.isCardOutOfQueue(f);
  if (v === 'inqueue') return !done && !suspended;
  if (v === 'done') return done;
  if (v === 'suspended') return suspended;
  if (v === 'overdue') return String(f.state || '0') === '2' && schema.parseTwDate(f.due).getTime() < Date.now();
  if (v === 'leech') {
    const lapses = Number(f.lapses || 0);
    // 触发期落库的标记（repeat.tid 达阈值时写 tidme.leech）+ lapses 兜底（历史卡/阈值调低后）
    const hasLeechMark = f['tidme.leech'] === 'yes' || (Array.isArray(f.tags) && f.tags.includes('leech'));
    return hasLeechMark || lapses >= leechThresholdOfCard(st, title);
  }
  return true;
}

function matches(st: CMState, c: Card): boolean {
  if (!st.searchText.trim()) return true;
  const hay = String(c.title + ' ' + (c.fields['tidme.breadcrumb'] || '')).toLowerCase();
  return hay.includes(st.searchText.trim().toLowerCase());
}

function decksOf(st: CMState, c: Card): DeckInfo[] {
  return st.deckInfos.filter((d) => d.loose.has(c.title));
}

function anyStrict(st: CMState, c: Card): boolean {
  return st.deckInfos.some((d) => d.strict.has(c.title));
}

function isDescendantOf(wiki: any, child: Card, parent: Card): boolean {
  if (child.title === parent.title) return false;
  const parentCrumb = crumbOf(parent);
  const childCrumb = crumbOf(child);
  if (childCrumb.startsWith(parentCrumb + ns.CRUMB_SEP)) return true;
  let p = String(child.fields['tidme.parent'] || '');
  while (p) {
    if (p === parent.title) return true;
    const pt = wiki.getTiddler(p);
    p = pt ? String(pt.fields['tidme.parent'] || '') : '';
  }
  return false;
}

function docNameOf(c: Card, wiki?: any): string {
  const key = String(c.fields['tidme.doc'] || c.fields['tidme.parent'] || '');
  if (!key) return lingoMod.lingo(wiki, 'manager.ungrouped', 'Ungrouped');
  const first = crumbOf(c).split(ns.CRUMB_SEP)[0] || key;
  // 语义名回退：内部路径名去前缀显示（$:/Deck/IELTS_3 → IELTS_3；$:/IncrementalLearning → IncrementalLearning）
  let name = first || key;
  if (name.startsWith(ns.DECK_PREFIX)) name = name.slice(ns.DECK_PREFIX.length);
  else if (name.startsWith('$:/')) name = name.slice(3);
  return name;
}

function docGroupsOf(cards: Card[], wiki?: any): [string, Card[]][] {
  const wk = wiki || null;
  const m = new Map<string, Card[]>();
  for (const c of cards) {
    const key = String(c.fields['tidme.doc'] || c.fields['tidme.parent'] || '');
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  return [...m.entries()].sort(cmpStr<[string, Card[]]>((entry) => docNameOf(entry[1][0], wiki)));
}

function collectAll(ctx: Ctx) {
  const { wiki, st } = ctx;
  // 单条 run 即可：卡片一律带 tidme.kind（含 topic 节卡与 item 测试卡），文档页已排除
  st.allCards = wiki.filterTiddlers(CARD_FILTER)
    .map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }));
  // card/card_exclude 各求值一次：strict = loose − exclude（省去 strict 内部对 card 的二次求值）
  st.deckInfos = deckMod.listDecks(wiki).map((deck: string) => {
    const f = wiki.getTiddler(deck)?.fields || {};
    const loose = new Set(deckMod.deckCards(wiki, deck, { strict: false }));
    const excludeFilter = String(f.card_exclude || '');
    const exclude = new Set(excludeFilter ? wiki.filterTiddlers(`[subfilter{${deck}!!card_exclude}]`) : []);
    const strict = new Set([...loose].filter((t) => !exclude.has(t)));
    return {
      title: deck,
      caption: display.captionText(wiki, f.caption || deck.split('/').pop() || deck, ctx.widget),
      strict,
      loose,
      leechThreshold: leechThresholdOfFields(f),
    };
  });
}

/** 牌组 leech 阈值：deck.leech_threshold 字段 → core 默认（与 repeat.tid 渲染期判定同源） */
function leechThresholdOfFields(fields: Record<string, any>): number {
  const raw = Number(fields && fields.leech_threshold);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : sched.DECK_PARAM_DEFAULTS.leechThreshold;
}

/** 卡片的有效 leech 阈值 = 命中牌组中最小的那个（多牌组命中时取"最容易触发"的口径） */
function leechThresholdOfCard(st: CMState, title: string): number {
  let min = sched.DECK_PARAM_DEFAULTS.leechThreshold;
  for (const d of st.deckInfos) {
    if (d.loose.has(title)) min = Math.min(min, d.leechThreshold);
  }
  return min;
}

// ---------- 选中状态与反馈 ----------

function toast(ctx: Ctx, msg: string, kind: '' | 'ok' | 'err' = '') {
  showToast(ctx.doc, ctx.wrap, msg, kind);
}

function updateSelectionUI(ctx: Ctx) {
  const { st } = ctx;
  const visibleCount = st.visibleCards.length;
  const selectedVisibleCount = st.visibleCards.filter((c) => st.selected.has(c.title)).length;
  if (st.bulkCb) {
    st.bulkCb.checked = visibleCount > 0 && selectedVisibleCount === visibleCount;
    st.bulkCb.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCount;
  }
  if (st.selLabel) {
    const prefix = lingoMod.lingo(ctx.wiki, 'manager.selected', 'Selected');
    st.selLabel.textContent = `${prefix} ${st.selected.size}/${visibleCount}`;
  }
  for (const u of st.groupCbUpdaters) u();
  for (const u of st.cardCbUpdaters) u();
}

/** shift 区选：以渲染顺序为界，把 [上次勾选, 当前] 区间统一置为 checked */
function applyShiftRange(ctx: Ctx, checked: boolean, curTitle: string) {
  const { st } = ctx;
  const anchor = st.lastCheckedCardTitle;
  if (!anchor || !st.renderedCardTitles.includes(anchor)) return;
  const i1 = st.renderedCardTitles.indexOf(anchor);
  const i2 = st.renderedCardTitles.indexOf(curTitle);
  if (i1 === -1 || i2 === -1) return;
  for (const title of st.renderedCardTitles.slice(Math.min(i1, i2), Math.max(i1, i2) + 1)) {
    if (checked) st.selected.add(title);
    else st.selected.delete(title);
  }
}

// ---------- 折叠持久化 ----------

function foldStateTitle(view: string, key: string): string {
  return `$:/state/tidme/manager/fold/${view}/${encodeURIComponent(key)}`;
}

function isFoldOpen(wiki: any, stateTitle: string, defOpen: boolean): boolean {
  const v = wiki.getTiddlerText(stateTitle, '');
  if (v === 'open') return true;
  if (v === 'closed') return false;
  return defOpen;
}

function bindFold(wiki: any, details: HTMLElement, stateTitle: string) {
  details.addEventListener('toggle', () => {
    wiki.addTiddler({ title: stateTitle, text: (details as any).open ? 'open' : 'closed' });
  });
}

function emptyEl(doc: Document, text: string, icon = '🗂'): HTMLElement {
  return renderEmpty(doc, { text, icon });
}

/** 字符串键比较器（pa<pb?-1:pa>pb?1:0 的唯一实现） */
function cmpStr<T>(keyOf: (t: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

/** 三态分组复选框绑定：按 items 选中数计算 checked/indeterminate，登记进 groupCbUpdaters 随全局选中联动 */
function bindTriStateCb(ctx: Ctx, cb: HTMLInputElement, items: Card[]): void {
  const { st } = ctx;
  const update = () => {
    const selCount = items.filter((c) => st.selected.has(c.title)).length;
    cb.checked = items.length > 0 && selCount === items.length;
    cb.indeterminate = selCount > 0 && selCount < items.length;
  };
  update();
  st.groupCbUpdaters.push(update);
}

// ---------- 行构建 ----------

/** 卡片行通用操作：读（移出队列）/ 回（恢复）+ 删除 */
function appendOps(ctx: Ctx, row: HTMLElement, c: Card) {
  const { doc, wiki, st } = ctx;
  const inQueue = !sched.isCardOutOfQueue(c.fields) && c.fields['tidme.suspended'] !== 'yes';
  if (inQueue) {
    const readBtn = el(doc, 'button', 'tm-cm-op', lingoMod.lingo(wiki, 'manager.action.read', 'Read'));
    readBtn.title = lingoMod.lingo(wiki, 'manager.action.read.tip', 'Remove from queue (Mark as read)');
    readBtn.addEventListener('click', () => {
      wiki.addTiddler({ ...c.fields, ...doneFields() });
      render(ctx);
    });
    row.appendChild(readBtn);
  } else {
    const resumeBtn = el(doc, 'button', 'tm-cm-op', lingoMod.lingo(wiki, 'manager.action.back', 'Back'));
    resumeBtn.title = lingoMod.lingo(wiki, 'manager.action.back.tip', 'Restore to learning queue');
    resumeBtn.addEventListener('click', () => {
      wiki.addTiddler({ ...c.fields, ...resumePatch() });
      render(ctx);
    });
    row.appendChild(resumeBtn);
  }
  const del = el(doc, 'button', 'tm-cm-op tm-cm-del', '✕');
  del.title = lingoMod.lingo(wiki, 'manager.action.del.tip', 'Delete card');
  del.addEventListener('click', () => {
    st.selected.delete(c.title);
    wiki.deleteTiddler(c.title);
    render(ctx);
  });
  row.appendChild(del);
}

/** 卡片行基础：复选框 + 状态 + 类型 + 优先级 + 标题链接（勾选含子孙联动与 shift 区选） */
function appendRowBase(ctx: Ctx, row: HTMLElement, c: Card, cb: HTMLInputElement) {
  const { doc, st } = ctx;
  const bd = badgeOf(c.fields);
  const badge = el(doc, 'span', `tm-badge tm-cm-badge ${bd.cls}`, bd.text);
  badge.title = stateLabel(c.fields);
  row.appendChild(badge);
  const km = kindMark(c.fields);
  if (km) row.appendChild(el(doc, 'span', 'tm-cm-kind', km));
  const pri = c.fields['tidme.priority'];
  if (pri !== undefined) {
    row.appendChild(el(doc, 'span', 'tm-cm-pri', `p${String(pri).padStart(2, '0')}`));
  }
  const link = el(doc, 'a', 'tc-tiddlylink tm-cm-link', String(c.fields['tidme.breadcrumb'] || c.title).split(ns.CRUMB_SEP).pop() || c.title);
  link.href = '#';
  link.title = crumbOf(c);
  link.addEventListener('click', (e: Event) => {
    e.preventDefault();
    navigateTo(ctx.widget, c.title);
  });
  row.appendChild(link);

  const updateCardCb = () => {
    const children = st.allCards.filter((child) => isDescendantOf(ctx.wiki, child, c));
    if (children.length > 0) {
      const selChildrenCount = children.filter((child) => st.selected.has(child.title)).length;
      const selfSel = st.selected.has(c.title);
      cb.checked = selfSel && selChildrenCount === children.length;
      cb.indeterminate = (selfSel || selChildrenCount > 0) && !(selfSel && selChildrenCount === children.length);
    } else {
      cb.checked = st.selected.has(c.title);
      cb.indeterminate = false;
    }
  };
  st.cardCbUpdaters.push(updateCardCb);

  cb.addEventListener('click', (e: MouseEvent) => {
    if (e.shiftKey && st.lastCheckedCardTitle && st.renderedCardTitles.includes(st.lastCheckedCardTitle)) {
      applyShiftRange(ctx, cb.checked, c.title);
    } else {
      if (cb.checked) st.selected.add(c.title);
      else st.selected.delete(c.title);
      for (const child of st.allCards) {
        if (isDescendantOf(ctx.wiki, child, c)) {
          if (cb.checked) st.selected.add(child.title);
          else st.selected.delete(child.title);
        }
      }
    }
    st.lastCheckedCardTitle = c.title;
    updateSelectionUI(ctx);
  });
}

/** 文档分组 details（带折叠状态 + 分组三态复选） */
function docDetails(ctx: Ctx, view: string, key: string, docCards: Card[]): HTMLElement {
  const { doc, wiki, st } = ctx;
  const dd = el(doc, 'details', 'tm-cm-doc');
  const stateTitle = foldStateTitle(view, key);
  dd.open = isFoldOpen(wiki, stateTitle, true);
  bindFold(wiki, dd, stateTitle);
  const dsum = el(doc, 'summary', '', '');

  const groupCb = doc.createElement('input');
  groupCb.type = 'checkbox';
  groupCb.className = 'tm-cm-group-cb';
  bindTriStateCb(ctx, groupCb, docCards);
  groupCb.addEventListener('click', (e) => e.stopPropagation());
  groupCb.addEventListener('change', () => {
    for (const c of docCards) {
      if (groupCb.checked) st.selected.add(c.title);
      else st.selected.delete(c.title);
    }
    updateSelectionUI(ctx);
  });
  dsum.appendChild(groupCb);

  dsum.appendChild(el(doc, 'span', 'tm-cm-doc-title', `${docNameOf(docCards[0], ctx.wiki)}（${docCards.length}）`));
  dd.appendChild(dsum);
  const sorted = [...docCards].sort(cmpStr(crumbOf));
  for (const c of sorted) renderCardRow(ctx, dd, c);
  return dd;
}

/** 树形：按文档组织（全量，默认） */
function renderDocTree(ctx: Ctx, treeBox: HTMLElement, cards: Card[]) {
  if (!cards.length) {
    treeBox.appendChild(emptyEl(ctx.doc, lingoMod.lingo(ctx.wiki, 'manager.empty', 'No cards found in this view.')));
    return;
  }
  for (const [key, docCards] of docGroupsOf(cards, ctx.wiki)) {
    treeBox.appendChild(docDetails(ctx, 'doc', key, docCards));
  }
}

/** 树形：按牌组组织（牌组分支 + 未入组兜底） */
function renderDeckTree(ctx: Ctx, treeBox: HTMLElement, cards: Card[]) {
  const { doc, wiki, st } = ctx;
  if (!st.deckInfos.length) {
    treeBox.appendChild(emptyEl(doc, lingoMod.lingo(wiki, 'manager.nodecks', 'No decks found. Cards appear in the unassigned branch below.'), '🃏'));
  }
  for (const d of st.deckInfos) {
    const deckCards = cards.filter((c) => d.strict.has(c.title));
    const details = el(doc, 'details', 'tm-cm-deck');
    const deckFold = foldStateTitle('deck', d.title);
    details.open = isFoldOpen(wiki, deckFold, deckCards.length > 0);
    bindFold(wiki, details, deckFold);
    const ds = el(doc, 'summary', '', '');

    const deckCb = doc.createElement('input');
    deckCb.type = 'checkbox';
    deckCb.className = 'tm-cm-group-cb';
    bindTriStateCb(ctx, deckCb, deckCards);
    deckCb.addEventListener('click', (e) => e.stopPropagation());
    deckCb.addEventListener('change', () => {
      for (const c of deckCards) {
        if (deckCb.checked) st.selected.add(c.title);
        else st.selected.delete(c.title);
      }
      updateSelectionUI(ctx);
    });
    ds.appendChild(deckCb);

    ds.appendChild(el(doc, 'strong', '', ` ${d.caption}（${deckCards.length}）`));
    details.appendChild(ds);
    // 文档分组按需渲染：折叠的牌组不建行（大库下省掉不可见 DOM），首次展开时补建
    let docGroupsRendered = false;
    const renderDocGroups = () => {
      if (docGroupsRendered) return;
      docGroupsRendered = true;
      for (const [docKey, docCards] of docGroupsOf(deckCards, wiki)) {
        details.appendChild(docDetails(ctx, 'deck', d.title + '/' + docKey, docCards));
      }
    };
    if (details.open) renderDocGroups();
    else {details.addEventListener('toggle', () => {
        if (details.open) renderDocGroups();
      });}
    treeBox.appendChild(details);
  }
  // 未入组：不被任何牌组命中的卡（已读/搁置/手动散卡）
  const orphans = cards.filter((c) => !anyStrict(st, c));
  const ob = el(doc, 'details', 'tm-cm-deck tm-cm-orphan');
  const orphanFold = foldStateTitle('deck', '__orphan__');
  ob.open = isFoldOpen(wiki, orphanFold, orphans.length > 0);
  bindFold(wiki, ob, orphanFold);
  const os = el(doc, 'summary', '', '');

  const orphanCb = doc.createElement('input');
  orphanCb.type = 'checkbox';
  orphanCb.className = 'tm-cm-group-cb';
  bindTriStateCb(ctx, orphanCb, orphans);
  orphanCb.addEventListener('click', (e) => e.stopPropagation());
  orphanCb.addEventListener('change', () => {
    for (const c of orphans) {
      if (orphanCb.checked) st.selected.add(c.title);
      else st.selected.delete(c.title);
    }
    updateSelectionUI(ctx);
  });
  os.appendChild(orphanCb);

  const unassignedLabel = lingoMod.lingo(wiki, 'manager.unassigned', 'Unassigned');
  os.appendChild(el(doc, 'strong', '', ` ${unassignedLabel}（${orphans.length}）`));
  os.title = lingoMod.lingo(wiki, 'manager.unassigned.tip', 'Cards not belonging to any deck queue: read, suspended or standalone cards');
  ob.appendChild(os);
  let orphansRendered = false;
  const renderOrphanGroups = () => {
    if (orphansRendered) return;
    orphansRendered = true;
    for (const [docKey, docCards] of docGroupsOf(orphans)) {
      ob.appendChild(docDetails(ctx, 'deck', '__orphan__/' + docKey, docCards));
    }
  };
  if (ob.open) renderOrphanGroups();
  else {ob.addEventListener('toggle', () => {
      if (ob.open) renderOrphanGroups();
    });}
  treeBox.appendChild(ob);
}

/** 树行：复选框 + 徽章 + 标题 + 操作（缩进按 breadcrumb 深度） */
function renderCardRow(ctx: Ctx, parentEl: HTMLElement, c: Card) {
  const { doc, st } = ctx;
  st.renderedCardTitles.push(c.title);
  const row = el(doc, 'div', 'tm-cm-card');
  const depth = Math.max(0, crumbOf(c).split(ns.CRUMB_SEP).length - 1);
  row.style.paddingLeft = `${depth * 0.9}em`;
  const cb = doc.createElement('input');
  cb.type = 'checkbox';
  cb.checked = st.selected.has(c.title);
  row.appendChild(cb);
  appendRowBase(ctx, row, c, cb);
  appendOps(ctx, row, c);
  parentEl.appendChild(row);
}

// ---------- 列表视图 ----------

function cmpCards(ctx: Ctx): (a: Card, b: Card) => number {
  const { st } = ctx;
  return (a, b) => {
    let r = 0;
    if (st.sortKey === 'mixed') {
      // 混合排序判序唯一实现 = scheduler.comparePriorityMixed（勿再对二元数组整体排序）
      r = sched.comparePriorityMixed(a, b, 'hybrid');
    } else if (st.sortKey === 'priority') {
      const pa = Number(a.fields['tidme.priority'] ?? 99);
      const pb = Number(b.fields['tidme.priority'] ?? 99);
      r = pa - pb;
    } else if (st.sortKey === 'due') {
      const da = String(a.fields.state || '0') === '2' ? schema.parseTwDate(a.fields.due).getTime() : Infinity;
      const db = String(b.fields.state || '0') === '2' ? schema.parseTwDate(b.fields.due).getTime() : Infinity;
      r = da - db;
    } else if (st.sortKey === 'deck') {
      r = cmpStr((c: Card) => decksOf(st, c).map((d) => d.caption).join('·'))(a, b);
    } else {
      r = cmpStr(crumbOf)(a, b);
    }
    return st.sortAsc ? r : -r;
  };
}

/** 列表行（Browser 式表格行）：勾选 + 状态/类型/优先/标题 + 牌组/到期/信息列 + 行点击预览联动 */
function renderListRow(ctx: Ctx, tbody: HTMLElement, c: Card) {
  const { doc, st } = ctx;
  st.renderedCardTitles.push(c.title);
  const tr = el(doc, 'tr', 'tm-cm-listrow');
  const cbTd = el(doc, 'td', 'tm-cm-cell-cb');
  const cb = doc.createElement('input');
  cb.type = 'checkbox';
  cb.checked = st.selected.has(c.title);
  cbTd.appendChild(cb);
  tr.appendChild(cbTd);
  const baseTd = el(doc, 'td', 'tm-cm-cell-flex', '');
  appendRowBase(ctx, baseTd, c, cb);
  tr.appendChild(baseTd);
  const ds = decksOf(st, c);
  tr.appendChild(el(doc, 'td', 'tm-cm-col-deck', ds.length ? ds.map((d) => d.caption).join('·') : '—'));
  tr.appendChild(el(doc, 'td', 'tm-cm-col-due', dueLabel(c.fields)));
  tr.appendChild(el(doc, 'td', 'tm-cm-col-info', intervalLabel(c.fields)));
  tr.appendChild(el(doc, 'td', 'tm-cm-col-info', repsLabel(c.fields)));
  tr.appendChild(el(doc, 'td', 'tm-cm-col-info', diffLabel(c.fields)));
  const opTd = el(doc, 'td', 'tm-cm-cell-flex', '');
  appendOps(ctx, opTd, c);
  tr.appendChild(opTd);
  tr.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'A' || t.tagName === 'BUTTON' || t.tagName === 'INPUT')) return;
    st.previewTitle = st.previewTitle === c.title ? null : c.title;
    st.editTitle = null;
    render(ctx);
  });
  tbody.appendChild(tr);
}

/** 单卡参数编辑表单（对标 Element parameters：下次到期 / 优先级 / 注释） */
function editForm(ctx: Ctx, c: Card): HTMLElement {
  const { doc, wiki, st } = ctx;
  const box = el(doc, 'div', 'tm-cm-edit');
  const f = c.fields;
  const row = (label: string, input: HTMLElement) => {
    const r = el(doc, 'div', 'tm-cm-edit-row');
    r.appendChild(el(doc, 'span', 'tm-cm-info-label', label));
    r.appendChild(input);
    box.appendChild(r);
  };
  const dueInput = doc.createElement('input');
  dueInput.type = 'text';
  dueInput.value = dueLabel(f) !== '—' ? dueLabel(f) : '';
  dueInput.placeholder = 'YYYY-MM-DD';
  row(lingoMod.lingo(wiki, 'manager.col.due', 'Next Due'), dueInput);
  const priInput = doc.createElement('input');
  priInput.type = 'number';
  priInput.min = '0';
  priInput.max = '100';
  priInput.value = String(f['tidme.priority'] ?? '');
  priInput.placeholder = '0-100 (0 is highest)';
  row(lingoMod.lingo(wiki, 'manager.col.priority', 'Priority'), priInput);
  const commentInput = doc.createElement('input');
  commentInput.type = 'text';
  commentInput.value = String(f['tidme.comment'] || '');
  commentInput.placeholder = 'tidme.comment';
  row(lingoMod.lingo(wiki, 'manager.col.comment', 'Comment'), commentInput);
  const save = el(doc, 'button', 'tm-btn tm-btn--primary', `✔ ${lingoMod.lingo(wiki, 'save', 'Save')}`);
  save.addEventListener('click', () => {
    const patch: Record<string, any> = {};
    const m = String(dueInput.value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    // 17 位 UTC 编码（YYYYMMDD + 9 位 0），与 schema.twDateString 兼容
    if (m) patch.due = `${m[1]}${m[2]}${m[3]}000000000`;
    const priVal = String(priInput.value || '').trim();
    if (priVal !== '' && Number.isFinite(Number(priVal))) {
      patch['tidme.priority'] = String(Math.max(0, Math.min(100, Math.round(Number(priVal)))));
    }
    patch['tidme.comment'] = String(commentInput.value || '');
    const ex = wiki.getTiddler(c.title);
    if (ex) wiki.addTiddler({ ...ex.fields, ...patch });
    st.editTitle = null;
    render(ctx);
    toast(ctx, `✔ ${lingoMod.lingo(wiki, 'manager.params.saved', 'Card parameters saved')}`, 'ok');
  });
  const cancel = el(doc, 'button', 'tm-btn', lingoMod.lingo(wiki, 'cancel', 'Cancel'));
  cancel.addEventListener('click', () => {
    st.editTitle = null;
    render(ctx);
  });
  const r = el(doc, 'div', 'tm-cm-edit-row');
  r.appendChild(save);
  r.appendChild(cancel);
  box.appendChild(r);
  return box;
}

/** 列表视图（真 <table>，表头 sticky + 排序箭头 + 预览联动区） */
function renderList(ctx: Ctx, listBox: HTMLElement, cards: Card[]) {
  const { doc, wiki, st } = ctx;
  const table = el(doc, 'table', 'tm-cm-table');
  const thead = el(doc, 'thead', '');
  const trh = el(doc, 'tr', '');
  trh.appendChild(el(doc, 'th', 'tm-cm-cell-cb', ''));
  trh.appendChild(el(doc, 'th', '', lingoMod.lingo(wiki, 'manager.col.state', 'State')));
  trh.appendChild(el(doc, 'th', '', lingoMod.lingo(wiki, 'manager.col.kind', 'Kind')));
  const th = (label: string, key?: SortKey) => {
    const t = el(doc, 'th', '');
    if (key) {
      const active = st.sortKey === key;
      const b = el(doc, 'button', 'tm-cm-sort' + (active ? ' tm-cm-sort-active' : ''), label + (active ? (st.sortAsc ? ' ↑' : ' ↓') : ''));
      b.title = lingoMod.lingo(wiki, 'manager.clicksort', 'Click to sort');
      b.addEventListener('click', () => {
        if (st.sortKey === key) st.sortAsc = !st.sortAsc;
        else {
          st.sortKey = key;
          st.sortAsc = true;
        }
        render(ctx);
      });
      t.appendChild(b);
    } else {
      t.textContent = label;
    }
    return t;
  };
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.priority', 'Priority'), 'priority'));
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.mixed', 'Mixed'), 'mixed'));
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.title', 'Title'), 'breadcrumb'));
  trh.appendChild(th(lingoMod.lingo(wiki, 'deck', 'Deck'), 'deck'));
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.due', 'Due'), 'due'));
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.interval', 'Interval')));
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.reps', 'Reps')));
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.diff', 'Difficulty')));
  trh.appendChild(th(lingoMod.lingo(wiki, 'manager.col.actions', 'Actions')));
  thead.appendChild(trh);
  table.appendChild(thead);

  if (!cards.length) {
    listBox.appendChild(emptyEl(doc, lingoMod.lingo(wiki, 'manager.empty', 'No cards found in this view.')));
    return;
  }
  const tbody = el(doc, 'tbody', '');
  for (const c of [...cards].sort(cmpCards(ctx))) renderListRow(ctx, tbody, c);
  table.appendChild(tbody);
  listBox.appendChild(table);

  // 预览联动区（对标 SuperMemo Browser Synchronization + Element data + Element parameters）
  const prev = st.previewTitle ? cards.find((c) => c.title === st.previewTitle) : null;
  if (!prev) return;
  const pv = el(doc, 'div', 'tm-cm-preview');
  const f = prev.fields;
  pv.appendChild(
    el(
      doc,
      'div',
      'tm-cm-preview-head',
      `${crumbOf(prev)} · ${kindMark(f, wiki) || 'S'} · p${String(f['tidme.priority'] ?? '-').padStart(2, '0')} · ${stateLabel(f, wiki)}${
        dueLabel(f) !== '—' ? ` · ${lingoMod.lingo(wiki, 'manager.col.due', 'Due')} ` + dueLabel(f) : ''
      }`,
    ),
  );
  const grid = el(doc, 'div', 'tm-cm-info-grid');
  const info = (label: string, value: any) => {
    const s = el(doc, 'span', '');
    s.appendChild(el(doc, 'span', 'tm-cm-info-label', label));
    s.appendChild(doc.createTextNode(String(value ?? '—')));
    grid.appendChild(s);
  };
  info(lingoMod.lingo(wiki, 'manager.col.due', 'Next Due'), dueLabel(f));
  info(lingoMod.lingo(wiki, 'lastreview', 'Last Review'), dateLabel(f.last_review));
  info(lingoMod.lingo(wiki, 'manager.col.interval', 'Interval'), intervalLabel(f, wiki));
  info(lingoMod.lingo(wiki, 'manager.col.reps', 'Reps'), repsLabel(f));
  info(lingoMod.lingo(wiki, 'manager.col.lapses', 'Lapses'), lapsesLabel(f));
  info(lingoMod.lingo(wiki, 'manager.col.stability', 'Stability'), f.stability !== undefined && f.stability !== '' ? String(Number(f.stability).toFixed(1)) : '—');
  info(lingoMod.lingo(wiki, 'manager.col.diff', 'Difficulty'), diffLabel(f));
  info(lingoMod.lingo(wiki, 'manager.col.elapsed', 'Elapsed Days'), f.elapsed_days !== undefined && f.elapsed_days !== '' ? String(Number(f.elapsed_days).toFixed(1)) : '—');
  info(lingoMod.lingo(wiki, 'deck', 'Deck'), decksOf(st, prev).map((d) => d.caption).join('·') || '—');
  if (f['tidme.comment']) info(lingoMod.lingo(wiki, 'manager.col.comment', 'Comment'), f['tidme.comment']);
  pv.appendChild(grid);
  if (st.editTitle === prev.title) {
    pv.appendChild(editForm(ctx, prev));
  } else {
    const editBtn = el(doc, 'button', 'tm-cm-op', `✎ ${lingoMod.lingo(wiki, 'manager.editparams', 'Edit Parameters')}`);
    editBtn.title = lingoMod.lingo(wiki, 'manager.editparams.tip', 'Modify Next Due / Priority / Comment');
    editBtn.addEventListener('click', () => {
      st.editTitle = prev.title;
      render(ctx);
    });
    pv.appendChild(editBtn);
  }
  const body = el(doc, 'div', 'tm-cm-preview-body');
  const text = String(f.text || '').replace(/\s+/g, ' ').trim();
  body.appendChild(el(doc, 'span', '', text.slice(0, 400) + (text.length > 400 ? ' …' : '')));
  pv.appendChild(body);
  listBox.appendChild(pv);
}

// ---------- 工具条与主渲染 ----------

/** 批量动作按钮：对选中卡逐张写字段（删除带确认） */
function batchButton(ctx: Ctx, label: string, apply: (f: Record<string, any>) => Record<string, any>, destructive = false): HTMLElement {
  const { doc, wiki, st } = ctx;
  const b = el(doc, 'button', 'tm-btn' + (destructive ? ' tm-btn--danger' : ''), label);
  b.addEventListener('click', async () => {
    if (
      destructive && !(await dialog.confirmDialog(doc, {
        title: lingoMod.lingo(wiki, 'manager.delete', 'Delete Cards'),
        message: lingoMod.lingo(wiki, 'manager.confirm.delete', `Are you sure you want to delete ${st.selected.size} cards? This cannot be undone.`),
        confirmLabel: lingoMod.lingo(wiki, 'delete', 'Delete'),
        danger: true,
      }))
    ) return;
    let n = 0;
    for (const title of st.selected) {
      const t = wiki.getTiddler(title);
      if (!t) continue;
      if (destructive) wiki.deleteTiddler(title);
      else wiki.addTiddler({ ...t.fields, ...apply(t.fields) });
      n++;
    }
    st.selected.clear();
    render(ctx);
    toast(ctx, destructive ? `${lingoMod.lingo(wiki, 'manager.deleted.count', 'Deleted')} ${n}` : `${label}: ${n}`, destructive ? 'err' : 'ok');
  });
  return b;
}

/** ⚡ 顺延过载：autoPostpone 当前可见卡（按优先级保高顺低） */
function autoPostponeButton(ctx: Ctx): HTMLElement {
  const { doc, wiki, st } = ctx;
  const b = icons.iconButton(doc, 'tm-cm-btn', 'zap', lingoMod.lingo(wiki, 'manager.autopostpone', 'Auto Postpone'));
  b.title = lingoMod.lingo(wiki, 'manager.autopostpone.tip', 'Automatically postpone low-priority overdue cards (preserving high-priority ones)');
  b.addEventListener('click', () => {
    let cfg: any = {};
    try {
      cfg = JSON.parse(wiki.getTiddlerText(sched.AUTOPOSTPONE_CONFIG_TITLE, '{}') || '{}');
    } catch { /* 默认配置 */ }
    const res = sched.autoPostpone(st.visibleCards, cfg);
    if (res.patches.length === 0) {
      toast(ctx, lingoMod.lingo(wiki, 'manager.autopostpone.none', `No postponement needed (Overdue: ${res.stats.overdue}, Retained: Top ${res.stats.kept})`), 'ok');
      return;
    }
    for (const p of res.patches) {
      const tiddler = wiki.getTiddler(p.title);
      if (tiddler) wiki.addTiddler({ ...tiddler.fields, ...p.fields });
    }
    render(ctx);
    toast(ctx, lingoMod.lingo(wiki, 'manager.autopostpone.done', `Postponed ${res.stats.postponed} low-priority overdue cards (Retained: Top ${res.stats.kept})`), 'ok');
  });
  return b;
}

function buildToolbar(ctx: Ctx): HTMLElement {
  const { doc, wiki, st } = ctx;
  const toolbar = el(doc, 'div', 'tm-cm-toolbar');
  const topRow = el(doc, 'div', 'tm-cm-top-row');

  // 查找（按标题/面包屑过滤当前视图）
  const searchRow = el(doc, 'div', 'tm-cm-search-row');
  const input = el(doc, 'input', 'tm-cm-search');
  input.placeholder = lingoMod.lingo(wiki, 'manager.search.placeholder', 'Find cards...');
  input.value = st.searchText;
  input.addEventListener('input', () => {
    st.searchText = (input.value || '').trim().toLowerCase();
    render(ctx);
  });
  searchRow.appendChild(input);
  if (st.searchText) {
    const clear = el(doc, 'button', 'tm-btn tm-cm-clear', '✕');
    clear.addEventListener('click', () => {
      st.searchText = '';
      render(ctx);
    });
    searchRow.appendChild(clear);
  }
  topRow.appendChild(searchRow);

  // 组织方式切换
  const orgRow = el(doc, 'div', 'tm-cm-orgs');
  for (const o of ORGS) {
    const label = lingoMod.lingo(wiki, o.key, o.label);
    const b = el(doc, 'button', 'tm-btn' + (st.org === o.id ? ' tm-btn--active' : ''), label);
    b.title = lingoMod.lingo(wiki, o.key + '.tip', o.tip);
    b.addEventListener('click', () => {
      st.org = o.id;
      render(ctx);
    });
    orgRow.appendChild(b);
  }
  topRow.appendChild(orgRow);

  // 视图过滤按钮（计数 = 该子集实际卡数）
  const viewRow = el(doc, 'div', 'tm-cm-views');
  for (const v of VIEWS) {
    const count = v.id === 'all'
      ? st.allCards.length
      : st.allCards.filter((c) => inView(st, c.fields, v.id, c.title)).length;
    const label = lingoMod.lingo(wiki, v.key, v.label);
    const b = el(doc, 'button', 'tm-btn' + (st.view === v.id ? ' tm-btn--active' : ''), `${label}(${count})`);
    b.addEventListener('click', () => {
      st.view = v.id;
      render(ctx);
    });
    viewRow.appendChild(b);
  }
  topRow.appendChild(viewRow);
  toolbar.appendChild(topRow);

  // 批量工具条（单行：全选 + 调度 + 状态 + 危险 + 优先级）
  const bar = el(doc, 'div', 'tm-cm-bar');
  const row = el(doc, 'div', 'tm-cm-bar-row', '');

  const bulkCbGroup = el(doc, 'span', 'tm-cm-bar-group', '');
  st.bulkCb = doc.createElement('input');
  st.bulkCb.type = 'checkbox';
  st.bulkCb.className = 'tm-cm-group-cb';
  st.bulkCb.title = lingoMod.lingo(wiki, 'manager.selectall.tip', 'Select / Deselect all currently visible cards');
  st.bulkCb.addEventListener('change', () => {
    for (const c of st.visibleCards) {
      if (st.bulkCb?.checked) st.selected.add(c.title);
      else st.selected.delete(c.title);
    }
    updateSelectionUI(ctx);
  });
  bulkCbGroup.appendChild(st.bulkCb);
  const selPrefix = lingoMod.lingo(wiki, 'manager.selected', 'Selected');
  st.selLabel = el(doc, 'span', 'tm-cm-sel-info', `${selPrefix} ${st.selected.size}/${st.visibleCards.length}`);
  bulkCbGroup.appendChild(st.selLabel);
  row.appendChild(bulkCbGroup);

  const schedGroup = el(doc, 'span', 'tm-cm-bar-group', '');
  schedGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.postpone7d', 'Postpone 7d'), (f) => sched.postponeCard(f, 7)));
  schedGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.advance', 'Advance'), () => sched.advanceCard()));
  schedGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.forget', 'Forget'), () => sched.forgetCard()));
  schedGroup.appendChild(autoPostponeButton(ctx));
  row.appendChild(schedGroup);

  const stateGroup = el(doc, 'span', 'tm-cm-bar-group', '');
  stateGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.done', 'Done'), () => doneFields()));
  stateGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.suspend', 'Suspend'), () => sched.suspendCard()));
  stateGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.restore', 'Restore'), () => resumePatch()));
  // 取消失效搁置（Anki 牌组概览的 Unbury）：清 tidme.buried，卡当日即可再次调度。
  // 没有这个入口时，被搁置的卡只能等到次日自动解埋，或靠撤销评分间接触发。
  stateGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.unbury', 'Unbury'), () => sched.unburyCard()));
  // 重新表述（SM 对 leech 的根治手段）：补丁唯一产地 = core/scheduler.resetLeechCard
  // （内含"必须同时清 tidme.ignored"的理由，勿在此重写一份）。
  stateGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.resetleech', 'Reset Leech'), () => sched.resetLeechCard()));
  row.appendChild(stateGroup);

  // 突击复习（cram）：选中卡只操练不写调度/日志（core/session.startCramSession + grade 的 cram 分支）。
  // 考前一小时过一遍错题、不想污染 FSRS 间隔时用。
  const cramBtn = el(doc, 'button', 'tm-btn', lingoMod.lingo(wiki, 'manager.cram', 'Cram Selected'));
  cramBtn.title = lingoMod.lingo(wiki, 'manager.cram.tip', 'Practice selected cards without writing FSRS state or review logs');
  cramBtn.addEventListener('click', () => {
    const titles = [...st.selected];
    if (!titles.length) {
      toast(ctx, lingoMod.lingo(wiki, 'manager.noselection', 'Select cards first'), 'err');
      return;
    }
    const started = sessionMod.startCramSession(wiki, titles);
    if (!started) {
      toast(ctx, lingoMod.lingo(wiki, 'manager.cram.empty', 'No practiceable cards in selection'), 'err');
      return;
    }
    navigateTo(ctx.widget, started.list[0]);
  });
  row.appendChild(cramBtn);

  const dangerGroup = el(doc, 'span', 'tm-cm-bar-group', '');
  dangerGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.delete', 'Delete'), () => ({} as Record<string, any>), true));
  row.appendChild(dangerGroup);

  // 批量优先级（对标 SM Browser Priority: Modify）
  const priGroup = el(doc, 'span', 'tm-cm-bar-group', '');
  priGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.priup', 'Pri ↑'), (f) => ({ 'tidme.priority': sched.shiftPriority(f['tidme.priority'], -5) })));
  priGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.pridown', 'Pri ↓'), (f) => ({ 'tidme.priority': sched.shiftPriority(f['tidme.priority'], 5) })));
  priGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.prihigh', 'High'), () => ({ 'tidme.priority': '10' })));
  priGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.primid', 'Mid'), () => ({ 'tidme.priority': '50' })));
  priGroup.appendChild(batchButton(ctx, lingoMod.lingo(wiki, 'manager.prilow', 'Low'), () => ({ 'tidme.priority': '90' })));
  row.appendChild(priGroup);

  bar.appendChild(row);
  toolbar.appendChild(bar);
  return toolbar;
}

/** 主渲染：保存滚动 → 收集 → 工具条 → 按组织方式分派主体 */
function render(ctx: Ctx) {
  const { doc, wrap, st } = ctx;
  const oldBody = wrap.querySelector('.tm-cm-body') as HTMLElement | null;
  const savedScrollTop = oldBody ? oldBody.scrollTop : 0;

  wrap.textContent = '';
  collectAll(ctx);
  st.renderedCardTitles = [];
  st.groupCbUpdaters = [];
  st.cardCbUpdaters = [];
  st.visibleCards = st.allCards.filter((c) => inView(st, c.fields, st.view, c.title) && matches(st, c));

  wrap.appendChild(buildToolbar(ctx));

  const body = el(doc, 'div', 'tm-cm-body');
  if (st.org === 'deck') renderDeckTree(ctx, body, st.visibleCards);
  else if (st.org === 'list') renderList(ctx, body, st.visibleCards);
  else renderDocTree(ctx, body, st.visibleCards);
  body.scrollTop = savedScrollTop;
  wrap.appendChild(body);
}

// ---------- Widget ----------

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

function makeCardManager(): WidgetCtor {
  class CardManagerWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wrap = el(doc, 'div', 'tm-card-manager');

      const viewAttr = this.getAttribute('view', '') as View;
      const orgAttr = this.getAttribute('org', '') as Org;
      const ctx: Ctx = {
        widget: this,
        doc,
        wiki: this.wiki,
        wrap,
        st: {
          view: VIEWS.some((v) => v.id === viewAttr) ? viewAttr : 'all',
          org: ORGS.some((o) => o.id === orgAttr) ? orgAttr : 'doc',
          sortKey: 'breadcrumb',
          sortAsc: true,
          searchText: '',
          previewTitle: null,
          editTitle: null,
          selected: new Set<string>(),
          lastCheckedCardTitle: null,
          renderedCardTitles: [],
          allCards: [],
          deckInfos: [],
          visibleCards: [],
          groupCbUpdaters: [],
          cardCbUpdaters: [],
          bulkCb: null,
          selLabel: null,
        },
      };

      // 刷新：唯一机制（TW 原生 refresh 嗅探 + core/reactive 谓词）
      this._ctx = ctx;

      render(ctx);
      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }
    refresh(changedTiddlers: Record<string, any>) {
      const ctx = this._ctx;
      if (!ctx) return false;
      return bindWidgetRefresh(this, changedTiddlers, () => render(ctx));
    }
  }
  return CardManagerWidget as any;
}

exports['card-manager'] = makeCardManager();
// 供测试/复用：Done 字段补丁、恢复合并补丁（三键 undefined = 删除）、信息标签
exports.doneFields = doneFields;
exports.resumePatch = resumePatch;
exports.labels = { dueLabel, intervalLabel, repsLabel, lapsesLabel, diffLabel, dateLabel };
