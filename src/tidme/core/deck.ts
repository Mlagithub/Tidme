/*
core/deck.ts — 牌组实体（唯一读写入口）

背景：牌组此前被 queue-ops/stats-panel/card-manager/doc-resume/decks.tid
等多处直接拼字段（card/card_exclude/state_*…），页面与导入脚本各自手写
低层 fsrs4tw 字段。本模块收口：
- 牌组仍以 tag $:/tags/TidmeDeck 的 tiddler 存在（$:/Deck/<name>，fsrs4tw
  学习循环运行时依赖），但一切读写走本 API；
- 高层参数（DeckConfig）→ 低层字段由 configToFields 依据 $:/Deck/default
  模板生成（state_learn/due/new、order_*、p、actions…），页面不再手填；
- 成员唯一来源 = card 过滤器（deckCards 求值）。
本模块纯 wiki 操作，无 DOM；仅引用零依赖的 core/ns 常量（防环）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

export const DECK_TAG = ns.DECK_TAG;
export const DEFAULT_DECK = ns.DECK_PREFIX + 'default';

/**
 * 牌组判定（字段级，无需 wiki）：tag $:/tags/TidmeDeck 的 tiddler 即牌组。
 * learning-package 词书页（如 $:/Deck/IELTS_3）带 legacy tidme.kind=topic，
 * 但它是词卡管理单元而非阅读材料——阅读/学习队列与「读完」标记一律按牌组排除。
 */
export function isDeckFields(fields: Record<string, any> | null | undefined): boolean {
  return Array.isArray(fields?.tags) && fields.tags.includes(DECK_TAG);
}

export interface DeckConfig {
  /** 牌组名（不含 $:/Deck/ 前缀；slug 化落标题） */
  name: string;
  caption?: string;
  description?: string;
  /** 成员过滤器（缺省 = default deck 的 card） */
  card?: string;
  cardExclude?: string;
  cardUnfold?: string;
  order?: 'due-new' | 'new-due' | 'random';
  /** 每次会话进入的新卡上限（落地到 order_new 过滤尾部 limit[N]；0/缺省 = 不限） */
  newPerDay?: number;
  /** FSRS 权重 JSON 对象（缺省 = default deck 的 p） */
  p?: Record<string, unknown> | string;
  leechThreshold?: number;
  kind?: 'standard' | 'subset';
  /** subset 专用：来源 docId（落 tidme.subset-doc，兼容 fsrs4tw 清理过滤器） */
  sourceDoc?: string;
}

export interface Deck {
  title: string;
  name: string;
  fields: Record<string, any>;
}

/** 名称 → 标题（sanitize：防路径/系统段注入）。合法完整标题（$:/Deck/…、Tidme/Decks/…）原样通过。
 *  危险字符集合来自 ns.TITLE_UNSAFE_CHARS（与 paths.slugify 同源，含过滤器无法转义的 `[]{}`）；
 *  本函数选择"换成 -"而非删除（牌组名要保留可读轮廓）。 */
export function titleOf(name: string): string {
  const raw = String(name || '').trim();
  if (raw.startsWith(ns.DECK_PREFIX) || raw.startsWith(ns.NS_DECKS)) return raw;
  const clean = raw
    .replace(ns.TITLE_UNSAFE_CHARS, '-')
    .replace(/[\s]+/g, '-');
  if (!clean || clean === '-') throw new Error('deck: invalid deck name: ' + name);
  return ns.DECK_PREFIX + clean;
}

/** 全部牌组标题（shadow+普通；含 default） */
export function listDecks(wiki: any): string[] {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return [];
  return wiki.filterTiddlers(`[all[shadows+tiddlers]tag[${DECK_TAG}]!is[draft]]`);
}

/** 取牌组（name 或完整 title 均可；含 shadow）。无 → null */
export function getDeck(wiki: any, nameOrTitle: string): Deck | null {
  if (!wiki || typeof wiki.getTiddler !== 'function' || !nameOrTitle) return null;
  const title = titleOf(nameOrTitle); // 含 "/" 视为完整标题
  const t = wiki.getTiddler(title);
  if (!t) return null;
  const name = title.startsWith(ns.DECK_PREFIX) ? title.slice(ns.DECK_PREFIX.length) : (title.split('/').pop() || title);
  return { title, name, fields: t.fields || {} };
}

/** subset 判定（tidme.subset-doc 存在） */
export function isSubset(deck: Deck | null): boolean {
  return !!deck && deck.fields['tidme.subset-doc'] !== undefined && deck.fields['tidme.subset-doc'] !== '';
}

/** default deck 的现字段（低层 fsrs4tw 默认值的模板源） */
function templateFields(wiki: any): Record<string, any> {
  const def = getDeck(wiki, DEFAULT_DECK);
  return def ? { ...def.fields } : {};
}

/**
 * 高层配置 → 落库字段（不写库）。缺省项从 default deck 模板继承，
 * 保证 state_learn/due/new、order_*、p、actions 等低层字段一致生成。
 */
export function configToFields(wiki: any, cfg: DeckConfig): Record<string, any> {
  const tpl = templateFields(wiki);
  delete tpl.title; // 模板带 default 的 title，不得污染新牌组
  const fields: Record<string, any> = {
    ...tpl,
    tags: DECK_TAG,
    // fsrs4tw 运行时字段始终存在（模板缺失时兜底）
    order_learn: tpl.order_learn || '[sort[due]]',
    order_due: tpl.order_due || '[sort[due]]',
    order_new: tpl.order_new || '[sortan[title]]',
    state_learn: tpl.state_learn || '[state[1]] [state[3]] :filter[{!!due}compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>]',
    state_due: tpl.state_due || '[state[2]has[due]] -[!days:due[1]]',
    state_new: tpl.state_new || '[!has[state]] [state[0]]',
  };
  // 允许显式清空的字段（空串/undefined 落 fallback，不继承模板的 caption 转义等）
  const set = (k: string, v: string | undefined | null, fallback?: string) => {
    if (v === undefined) {
      fields[k] = fallback;
      return;
    }
    fields[k] = v === null || v === '' ? fallback || '' : v;
  };
  set('caption', cfg.caption, cfg.name);
  set('description', cfg.description, '');
  set('card', cfg.card, DEFAULT_CARD_FILTER);
  set('card_exclude', cfg.cardExclude, fields.card_exclude);
  set('card_unfold', cfg.cardUnfold, '');
  set('order', cfg.order, 'due-new');
  if (cfg.leechThreshold !== undefined) fields.leech_threshold = String(cfg.leechThreshold);
  if (cfg.p !== undefined) fields.p = typeof cfg.p === 'string' ? cfg.p : JSON.stringify(cfg.p);
  // 每日新卡上限 → order_new 尾部 limit[N]（不设则保持模板）
  if (cfg.newPerDay !== undefined && Number(cfg.newPerDay) > 0) {
    const base = String(fields.order_new || '[sortan[title]]');
    if (!/limit\[\d+\]/.test(base)) fields.order_new = `${base}limit[${Math.floor(Number(cfg.newPerDay))}]`;
  }
  // subset 标记（兼容 fsrs4tw 的 tidme.subset-doc 清理过滤器）
  if (cfg.kind === 'subset' && cfg.sourceDoc) fields['tidme.subset-doc'] = cfg.sourceDoc;
  return fields;
}

/** 创建牌组前的成员预览：card 过滤器命中的卡数，及与其它牌组成员的重叠数。
 * 牌组是筛选视图而非容器——同一张卡会出现在所有匹配它的牌组里（进度共享），
 * 预览让重叠在创建前可见。过滤器无法求值时 hits 返回 -1（表单提示检查语法）。
 * selfTitle 传入时从重叠统计中排除该牌组自身（编辑场景）。 */
export function previewMembership(wiki: any, card: string, selfTitle?: string): { hits: number; overlap: number } {
  if (!wiki || typeof wiki.filterTiddlers !== 'function' || !card || !card.trim()) return { hits: 0, overlap: 0 };
  let hits: string[];
  try {
    hits = wiki.filterTiddlers(card);
  } catch {
    return { hits: -1, overlap: 0 };
  }
  const others = new Set<string>();
  for (const d of listDecks(wiki)) {
    if (selfTitle && d === selfTitle) continue;
    for (const c of deckCards(wiki, d)) others.add(c);
  }
  return { hits: hits.length, overlap: hits.filter((t) => others.has(t)).length };
}

/** 默认成员过滤器：全部在队 item（卡片一律带 tidme.kind，制卡工厂保证）；
 *  出队三态排除复用 ns.QUEUE_EXCLUDE（与阅读队列同口径） */
export const DEFAULT_CARD_FILTER = `[all[shadows+tiddlers]tidme.kind[item]${ns.QUEUE_EXCLUDE}]`;

/** 创建牌组；名称已存在抛错。返回标题。 */
export function createDeck(wiki: any, cfg: DeckConfig): string {
  const title = titleOf(cfg.name);
  if (getDeck(wiki, title)) throw new Error(`deck: deck already exists: ${title}`);
  wiki.addTiddler({ title, ...configToFields(wiki, cfg) });
  return title;
}

/** 更新牌组字段（patch 合并；值 undefined 忽略）。default 允许（普通覆盖 shadow）。 */
export function updateDeck(wiki: any, nameOrTitle: string, patch: Record<string, any>): void {
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck) throw new Error(`deck: deck not found: ${nameOrTitle}`);
  const fields = { ...deck.fields };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete fields[k];
    else fields[k] = v;
  }
  wiki.addTiddler({ ...fields, title: deck.title });
}

/**
 * 删除牌组定义。语义（默认）：仅删容器，成员卡保留（item 卡仍被 default
 * 复习流收录，避免误删知识）；subset 可 alsoCards 连成员卡一起删。
 */
export function deleteDeck(wiki: any, nameOrTitle: string, opts: { alsoCards?: boolean } = {}): number {
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck) return 0;
  if (deck.title === DEFAULT_DECK) throw new Error('deck: default deck cannot be deleted');
  let removed = 0;
  if (opts.alsoCards) {
    for (const c of deckCards(wiki, deck.title)) {
      if (wiki.getTiddler(c)) {
        wiki.deleteTiddler(c);
        removed++;
      }
    }
  }
  wiki.deleteTiddler(deck.title);
  wiki.deleteTiddler(ns.deckLogTitle(deck.title)); // 复习日志随牌组删除
  return removed;
}

/**
 * 焚烧子集牌组（含 /log）：`tidme.subset-doc` 牌组是「复习本书」的临时复习脚手架，
 * 用完（startstudy 空队）/ 停止（stopstudy）/ 结束学习（endSession）三个流程边界都要烧掉，
 * 否则它会作为幽灵牌组留在牌组库里。普通牌组不受影响（生命周期函数只认子集）。
 * @returns 删除的 tiddler 数
 */
export function burnSubsetDeck(wiki: any, nameOrTitle: string): number {
  if (!wiki || typeof wiki.deleteTiddler !== 'function') return 0;
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck || !isSubset(deck)) return 0;
  let n = 0;
  const log = ns.deckLogTitle(deck.title);
  if (wiki.getTiddler(log)) {
    wiki.deleteTiddler(log);
    n++;
  }
  if (wiki.getTiddler(deck.title)) {
    wiki.deleteTiddler(deck.title);
    n++;
  }
  return n;
}

/**
 * 成员求值：card 过滤器（strict=true 时再排除 card_exclude）。
 * 成员唯一来源 = 过滤器（与 fsrs4tw 学习循环一致）。
 */
export function deckCards(wiki: any, nameOrTitle: string, opts: { strict?: boolean } = {}): string[] {
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck) return [];
  // 手写 deck title 含 `]`/`}` 时无法安全插值进过滤器（TW 不支持转义）→ 返回空并告警，
  // 而不是让 "Filter error" 文本冒充卡标题流向下游
  if (!ns.isFilterSafeTitle(deck.title)) {
    console.warn('[tidme] deck title 含过滤器不安全字符，已跳过成员求值:', deck.title);
    return [];
  }
  const strict = opts.strict !== false;
  const card = String(deck.fields.card || '');
  if (!card) return [];
  if (!strict) return wiki.filterTiddlers(`[subfilter{${deck.title}!!card}]`);
  const exclude = String(deck.fields.card_exclude || '');
  // 同一 run 内正/负 subfilter（勿拆成两个 run）
  return exclude
    ? wiki.filterTiddlers(`[subfilter{${deck.title}!!card}!subfilter{${deck.title}!!card_exclude}]`)
    : wiki.filterTiddlers(`[subfilter{${deck.title}!!card}]`);
}
