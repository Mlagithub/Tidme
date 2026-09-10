/*
core/session.ts — 学习会话（$:/state/tidme/learning-session）读写与推进（唯一读写口）

背景：学习会话曾被 section-bar / workflow / startstudy.tid / repeat.tid 各自
读写与推进，语义分叉导致 1:1 死循环、首卡 unfold 等回归。
本模块是会话的唯一读写口；推进统一用 core/scheduler.nextSchedulable。
- 注意：跨 core 模块引用一律显式 require("$:/plugins/keepone/tidme/core/<x>.js")，
  不要用 ES import（会被 esbuild 内联复制，造成同实现多处）。

另外本模块拥有「专注计时锚点」的生命周期（见文件末尾一节）：进入卡片即写锚点，
换卡 / 评分 / 结束学习时结算，时长记账委托 core/stats。
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const statsMod = require('$:/plugins/keepone/tidme/core/stats.js');

/** 牌组学习会话列表的 title 后缀（<deck>/study，fsrs4tw 契约） */
export const DECK_STUDY_SUFFIX = '/study';
/** 学习模式临时项前缀（结束学习时统一清场，与 stopstudy 语义一致） */
export const TEMP_PREFIX = '$:/temp/tidme/';

export const SESSION_TIDDLER = '$:/state/tidme/learning-session';

export interface LearningSession {
  list: string[];
  mode?: string;
  currentIndex?: string;
}

/** 读会话（无/损坏返回 null） */
export function getSession(wiki: any): LearningSession | null {
  if (!wiki || typeof wiki.getTiddler !== 'function') return null;
  const f = wiki.getTiddler(SESSION_TIDDLER)?.fields;
  if (!f) return null;
  const list = Array.isArray(f.list) ? [...f.list] : String(f.list || '').split(' ').filter(Boolean);
  if (!list.length) return null;
  return {
    list,
    mode: f.mode !== undefined ? String(f.mode) : undefined,
    currentIndex: f.current_index !== undefined ? String(f.current_index) : undefined,
  };
}

/** 写会话（list 为空 → 删除会话 tiddler：保持「会话 tiddler 存在 ⟺ list 非空」不变式，
 *  否则会留下 getSession 读不到的"空会话"残骸，而 wikitext 侧直接读 list 会看到它） */
export function setSession(wiki: any, session: { list: string[]; mode?: string; currentIndex?: string }): void {
  if (!wiki || typeof wiki.addTiddler !== 'function') return;
  if (!Array.isArray(session.list) || !session.list.length) {
    wiki.deleteTiddler?.(SESSION_TIDDLER);
    return;
  }
  const fields: Record<string, any> = { title: SESSION_TIDDLER, list: session.list };
  if (session.mode !== undefined) fields.mode = session.mode;
  if (session.currentIndex !== undefined) fields.current_index = session.currentIndex;
  wiki.addTiddler(fields);
}

/** 从会话移除指定卡（不在则无操作）。返回是否移除 */
export function removeFromSession(wiki: any, title: string): boolean {
  return removeFromSessionMany(wiki, [title]);
}

/** 批量从会话移除（删除阅读材料/推进学习共用；一次读写，mode/currentIndex 保留）。
 *  会话是本模块唯一读写口——需要剔除卡片的调用方一律走这里，禁止手写 SESSION_TIDDLER。 */
export function removeFromSessionMany(wiki: any, titles: Iterable<string>): boolean {
  const s = getSession(wiki);
  if (!s) return false;
  const kill = titles instanceof Set ? titles : new Set(titles);
  const next = s.list.filter((t) => !kill.has(t));
  if (next.length === s.list.length) return false;
  setSession(wiki, { list: next, mode: s.mode, currentIndex: s.currentIndex });
  return true;
}

/** 会话内推进：从当前卡之后找下一张"当前可学"的卡（cur 为 null/不在会话时从头找）。
 * canLearn 缺省 = scheduler.isDueNow（未出队且 due≤now，与阅读流/复习流一致）。
 * 注意：cur 之后找（不回选 cur 之前的滞留卡）——这是与旧 startstudy"从头找"的
 * 语义统一点（曾导致未处理卡被反复拉回的 1:1 死循环）。
 */
export function advanceSession(
  wiki: any,
  cur: string | null,
  canLearn?: (title: string) => boolean,
): string | null {
  const s = getSession(wiki);
  if (!s) return null;
  const learn = canLearn
    ? canLearn
    : (t: string) => {
      const f = wiki.getTiddler(t);
      return f ? sched.isDueNow(f.fields) : false;
    };
  return sched.nextSchedulable(s.list, cur, learn);
}

// ---------- 学习模式（会话状态机单一写入口） ----------

export interface ActiveStudy {
  list: string[];
  /** global = 全局学习会话；deck = 单牌组会话（fsrs4tw startstudy 路径） */
  source: 'global' | 'deck';
  /** source=deck 时的牌组 title */
  deckTitle?: string;
}

/** tiddler 的 modified 字段 → 毫秒：TW 存的是 Date 对象（String(Date) 依赖各引擎对非 ISO 串的宽容解析），
 *  同时也兼容 17 位串与数字。无法解析 → 0（视为最旧，不参与"最近学习"竞争）。 */
function modifiedMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return schema.tryParseTwDate(v)?.getTime() ?? 0;
}

/** 取当前活动学习队列（全局优先，否则取最近学习过的牌组会话）。无 → null。
 *  多个牌组同时留有 study 列表时，按 <deck>/study 的 modified 时刻取最新——
 *  "继续最近一次学习"是确定性行为，不依赖 listDecks 的过滤顺序。 */
export function getActiveStudy(wiki: any): ActiveStudy | null {
  if (!wiki || typeof wiki.getTiddler !== 'function') return null;
  const s = getSession(wiki);
  if (s && s.list.length) return { list: s.list, source: 'global' };
  let best: { title: string; list: string[]; at: number } | null = null;
  for (const d of deckMod.listDecks(wiki)) {
    const study = wiki.getTiddler(d + DECK_STUDY_SUFFIX);
    const list = study && Array.isArray(study.fields.list) ? study.fields.list : [];
    if (!list.length) continue;
    const at = modifiedMs(study?.fields?.modified);
    if (!best || at > best.at) best = { title: d, list, at };
  }
  return best ? { list: best.list, source: 'deck', deckTitle: best.title } : null;
}

/**
 * 统一结束学习（唯一写入口）：清全局会话 + 全部 <deck>/study + 子集牌组（含 /log）
 * + $:/temp/tidme/* 临时项。学习模式条「结束学习」与 stopstudy 的全局收场都走这里；
 * 禁止各处自行拼删除逻辑。子集牌组（tidme.subset-doc）是「复习本书」的临时复习
 * 脚手架，随学习结束一并焚烧（普通牌组仅清 study 列表，定义保留）。
 *
 * 注意：本函数只管 wiki 数据。故事河里还开着的复习卡（item）不在其中——关条目是
 * UI 层的事（core 无 DOM、也不认故事河）：由 ui/base/view-state 判定、学习模式条在
 * 「会话由激活转结束」时派发 tm-close-tiddler 关闭（见 review/widgets/study-mode.ts）。
 * @returns 清理的 tiddler 数
 */
export function endSession(wiki: any): number {
  if (!wiki || typeof wiki.deleteTiddler !== 'function') return 0;
  // 先结算专注锚点再清场：最后一张卡未评分就结束学习时，那段时长不该跟着 $:/temp 一起消失
  settleFocusAnchor(wiki);
  let n = 0;
  if (wiki.getTiddler(SESSION_TIDDLER)) {
    wiki.deleteTiddler(SESSION_TIDDLER);
    n++;
  }
  for (const d of deckMod.listDecks(wiki)) {
    const t = d + DECK_STUDY_SUFFIX;
    if (wiki.getTiddler(t)) {
      wiki.deleteTiddler(t);
      n++;
    }
    // 子集牌组是临时复习脚手架 → 焚烧（定义 + /log）走 core/deck 的生命周期函数
    n += deckMod.burnSubsetDeck(wiki, d);
  }
  for (const t of wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${TEMP_PREFIX}]]`)) {
    wiki.deleteTiddler(t);
    n++;
  }
  return n;
}

/**
 * 跳转复习卡（item）前设置折叠态：$:/state/folded/<title> = "hide"（折叠，先看问题）
 * 除非命中某张 deck 的 card_unfold（"show"）。与 startstudy.tid / fsrs4tw 折叠语义
 * 一致——否则 state 缺失时 reveal 默认展开（答案直接显示）。
 * 非 item 卡（阅读/文档页）不设（不影响阅读界面）。
 *
 * 多牌组归属口径：只要**任一**配置了 card_unfold 的牌组命中当前卡即展开（旧口径是
 * 「listDecks 顺序里第一个包含该卡的牌组说了算」，多牌组卡片的展开态会因此不同）。
 * 这里不为「首个所属牌组」重算全库 deckCards——那正是本函数此前每次导航 O(全库) 的
 * 来源；无 unfold 字段的牌组直接短路跳过。
 *
 * 本函数只管折叠态；专注计时锚点见下方 touchFocusAnchor/consumeFocusAnchor
 * （导航入口用 enterCard 一次调用两者，避免调用方漏写其中一个）。
 */
export function prepareCardFold(wiki: any, title: string): void {
  if (!wiki || typeof wiki.filterTiddlers !== 'function' || !title) return;
  const f = wiki.getTiddler(title)?.fields;
  if (!f || f['tidme.kind'] !== 'item') return;
  // 默认折叠（先看问题）；任一配置了 card_unfold 的 deck 命中即展开（见函数头注：
  // 与「首个所属牌组」旧口径的差异），无 unfold 字段的 deck 直接短路跳过，耗时近 0
  let text = 'hide';
  for (const d of deckMod.listDecks(wiki)) {
    // 手写 deck title 含 `]`/`}` 时无法插入 subfilter（TW 不支持转义）→ 跳过该牌组
    if (!ns.isFilterSafeTitle(d)) continue;
    const unfoldFilter = String(wiki.getTiddler(d)?.fields?.card_unfold || '').trim();
    if (!unfoldFilter) continue;
    if (wiki.filterTiddlers(`[subfilter{${d}!!card_unfold}]`).includes(title)) {
      text = 'show';
      break;
    }
  }
  wiki.addTiddler({ title: ns.FOLDED_STATE_PREFIX + title, text });
}

// ---------- 专注计时锚点（进入卡片写入 → 换卡/评分/结束学习结算） ----------

interface FocusAnchor {
  /** 锚点归属的卡（空串 = 归属未知，例如手写锚点） */
  card: string;
  /** 开始时刻 */
  at: Date;
}

/** 读锚点：无 tiddler / 时刻不可解析 → null（脏数据按"没有锚点"处理，不猜） */
function readFocusAnchor(wiki: any): FocusAnchor | null {
  if (!wiki || typeof wiki.getTiddler !== 'function') return null;
  const fields = wiki.getTiddler(ns.CARD_OPEN_AT_TITLE)?.fields;
  if (!fields) return null;
  const at = schema.tryParseTwDate(fields.text);
  if (!at) return null;
  return { card: String(fields.card || ''), at };
}

/**
 * 记一段专注时长（锚点时刻 → now）并返回记入的秒数（0 = 未记入）。
 * - 时钟回拨（负值）→ 不记；
 * - 超上限 → 整段丢弃并告警：那通常是挂机/休眠/机器时间跳变，clamp 会把 3 小时
 *   挂机伪装成 1 小时，比丢弃更失真；告警让异常可观测（core 无 UI，故走 console）；
 * - 非负短段（同秒内快刷）保底 1 秒：产品口径是"评过卡就不该显示专注 0 秒"。
 */
function recordFocus(wiki: any, card: string, at: Date, now: Date): number {
  const sec = Math.round((now.getTime() - at.getTime()) / 1000);
  if (sec < 0) return 0;
  if (sec > statsMod.FOCUS_SEGMENT_MAX_SECONDS) {
    console.warn('[tidme] 专注段超上限，整段丢弃:', card || '(未知卡)', sec + 's');
    return 0;
  }
  const counted = Math.max(1, sec);
  // 归属卡可能已被删除（时间确实花掉了，只是无法归到具体文档 → docId 为空）
  const docId = String(wiki.getTiddler?.(card)?.fields?.['tidme.doc'] || '');
  statsMod.recordReadTime(wiki, docId, counted);
  return counted;
}

/**
 * 结算并删除锚点（无论是否记入）。返回记入的秒数。
 * 换卡、评分、结束学习都经此——锚点只有一个槽位，不结算就写等于丢掉上一段时长。
 */
export function settleFocusAnchor(wiki: any, now: Date = new Date()): number {
  if (!wiki || typeof wiki.deleteTiddler !== 'function') return 0;
  const anchor = readFocusAnchor(wiki);
  wiki.deleteTiddler(ns.CARD_OPEN_AT_TITLE);
  if (!anchor) return 0;
  return recordFocus(wiki, anchor.card, anchor.at, now);
}

/**
 * 进入卡片的计时锚点写入（跨端契约见 ns.CARD_OPEN_AT_TITLE）：
 * 先结算上一张的时长（换卡 = 上一张的停留到此为止），再为本卡起新锚点。
 * - 同一张卡重复进入不重置起点：study-mode/section-bar 每次 build 都可能重进，
 *   重置会把"已停留"清零（旧实现是覆盖写，正是时长虚低/丢失的来源之一）；
 * - 非 item 卡只结算不写锚点：阅读材料的时长由阅读器自身计时记入，若沿用上一张
 *   的锚点，那段阅读时间会被算进上一张卡。
 */
export function touchFocusAnchor(wiki: any, title: string, now: Date = new Date()): void {
  if (!wiki || typeof wiki.addTiddler !== 'function') return;
  const cur = readFocusAnchor(wiki);
  if (cur && title && cur.card === title) return; // 同一张卡：保留原起点
  if (cur) settleFocusAnchor(wiki, now);
  if (!title) return;
  if (wiki.getTiddler?.(title)?.fields?.['tidme.kind'] !== 'item') return;
  wiki.addTiddler({ title: ns.CARD_OPEN_AT_TITLE, text: schema.twDateString(now), card: title });
}

/**
 * 评分时结算本卡专注时长。返回本次记入的秒数。
 * 锚点归属别的卡时（评分入口绕过导航，如单牌组 startstudy 路径的接续）：先把那段
 * 归还给它的卡，本卡按 0 计——绝不把上一张的停留算到本卡。
 * 归属未知（card 为空的手写锚点）按本卡归属记，不丢时长。
 */
export function consumeFocusAnchor(wiki: any, title: string, now: Date = new Date()): number {
  const anchor = readFocusAnchor(wiki);
  if (!anchor) {
    if (wiki && typeof wiki.deleteTiddler === 'function') wiki.deleteTiddler(ns.CARD_OPEN_AT_TITLE);
    return 0;
  }
  if (anchor.card && anchor.card !== title) {
    settleFocusAnchor(wiki, now); // 归还给它自己的卡（返回值是那张卡的秒数，与本卡无关）
    return 0;
  }
  wiki.deleteTiddler(ns.CARD_OPEN_AT_TITLE);
  return recordFocus(wiki, anchor.card || String(title || ''), anchor.at, now);
}

/** 进入一张卡：折叠态 + 计时锚点（导航入口统一调它，避免只做一半）。 */
export function enterCard(wiki: any, title: string, now: Date = new Date()): void {
  prepareCardFold(wiki, title);
  touchFocusAnchor(wiki, title, now);
}
