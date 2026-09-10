/*
core/session.ts — 学习会话（$:/state/tidme/learning-session）读写与推进（唯一读写口）

背景：学习会话曾被 section-bar / workflow / startstudy.tid / repeat.tid 各自
读写与推进，语义分叉导致 1:1 死循环、首卡 unfold 等回归。
本模块是会话的唯一读写口；推进统一用 core/scheduler.nextSchedulable。
- 注意：跨 core 模块引用一律显式 require("$:/plugins/keepone/tidme/core/<x>.js")，
  不要用 ES import（会被 esbuild 内联复制，造成同实现多处）。
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');

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

/** 写会话（list 为空数组时不建/清空） */
export function setSession(wiki: any, session: { list: string[]; mode?: string; currentIndex?: string }): void {
  if (!wiki || typeof wiki.addTiddler !== 'function') return;
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

/** 清空会话 */
export function clearSession(wiki: any): void {
  if (!wiki || typeof wiki.deleteTiddler !== 'function') return;
  wiki.deleteTiddler(SESSION_TIDDLER);
}

/**
 * 会话内推进：从当前卡之后找下一张"当前可学"的卡（cur 为 null/不在会话时从头找）。
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

/** 学习会话是否激活（全局会话或任一牌组 study 列表非空）。学习模式条 / workflow 主按钮读这里 */
export function isSessionActive(wiki: any): boolean {
  return getActiveStudy(wiki) !== null;
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
    const at = schema.parseTwDate(study?.fields?.modified, new Date(0)).getTime();
    if (!best || at > best.at) best = { title: d, list, at };
  }
  return best ? { list: best.list, source: 'deck', deckTitle: best.title } : null;
}

/**
 * 统一结束学习（唯一写入口）：清全局会话 + 全部 <deck>/study + 子集牌组（含 /log）
 * + $:/temp/tidme/* 临时项。学习模式条「结束学习」与 stopstudy 的全局收场都走这里；
 * 禁止各处自行拼删除逻辑。子集牌组（tidme.subset-doc）是「复习本书」的临时复习
 * 脚手架，随学习结束一并焚烧（普通牌组仅清 study 列表，定义保留）。
 * @returns 清理的 tiddler 数
 */
export function endSession(wiki: any): number {
  if (!wiki || typeof wiki.deleteTiddler !== 'function') return 0;
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
    const dd = deckMod.getDeck(wiki, d);
    if (dd && deckMod.isSubset(dd)) {
      const log = ns.deckLogTitle(d);
      if (wiki.getTiddler(log)) {
        wiki.deleteTiddler(log);
        n++;
      }
      wiki.deleteTiddler(d);
      n++;
    }
  }
  for (const t of wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${TEMP_PREFIX}]]`)) {
    wiki.deleteTiddler(t);
    n++;
  }
  return n;
}

/**
 * 跳转复习卡（item）前设置折叠态：$:/state/folded/<title> = "hide"（折叠，先看问题）
 * 除非该卡命中其所属 deck 的 card_unfold（"show"）。与 startstudy.tid / fsrs4tw
 * 折叠语义一致——否则 state 缺失时 reveal 默认展开（答案直接显示）。
 * 非 item 卡（阅读/文档页）不设（不影响阅读界面）。
 */
export function prepareCardFold(wiki: any, title: string): void {
  if (!wiki || typeof wiki.filterTiddlers !== 'function' || !title) return;
  const f = wiki.getTiddler(title)?.fields;
  if (!f || f['tidme.kind'] !== 'item') return;
  // 专注计时锚点：评分时（core/grade）按锚点差值记本卡专注时长；
  // $:/temp/tidme/ 前缀使 endSession/stopstudy 清场自动带走残留
  wiki.addTiddler({ title: ns.CARD_OPEN_AT_TITLE, text: schema.twDateString(new Date()) });
  // 默认折叠（先看问题）；仅当存在配置了 card_unfold 的牌组且命中当前卡时展开
  // （反转原先先算 O(全库) deckCards 的逻辑，无 unfold 字段直接短路跳过，耗时近 0）
  let text = 'hide';
  for (const d of deckMod.listDecks(wiki)) {
    const unfoldFilter = String(wiki.getTiddler(d)?.fields?.card_unfold || '').trim();
    if (!unfoldFilter) continue;
    if (wiki.filterTiddlers(`[subfilter{${d}!!card_unfold}]`).includes(title)) {
      text = 'show';
      break;
    }
  }
  wiki.addTiddler({ title: ns.FOLDED_STATE_PREFIX + title, text });
}
