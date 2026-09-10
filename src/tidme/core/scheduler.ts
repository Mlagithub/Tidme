/*
scheduler.ts — 调度体系（对标 SuperMemo 优先级）

- 优先级：tidme.priority 0–100（0 最高）；normalizePriority 归一化
- 批量操作：postpone / advance / ignore / suspend / resume / forget（返回字段补丁）
- autoPostpone：按优先级顺延低优先级逾期卡（保留 top N 高优先级）

所有函数纯字段操作（无 $tw 依赖、不查 wiki），返回 { title, fields } 补丁由调用方写入。
按 docId 的 wiki 查询（阅读队列快照/分节文档页集合/本书 item 过滤器）在 core/doc-ops。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

/** auto-postpone 配置 tiddler（startup 定时器 / queue-ops / card-manager 共用同一产地；
 *  前缀取自 ns.CONFIG_TITLE_PREFIX，不在此重写字面量） */
export const AUTOPOSTPONE_CONFIG_TITLE = ns.CONFIG_TITLE_PREFIX + 'AutoPostpone';

export const PRIORITY_DEFAULT = 50;
export const AFACTOR_DEFAULT = 1.5;
/** 连续型长材料（整本 PDF/未切分长文）的 A-Factor：与 afactorForText 的 10000+ 字档一致 */
export const AFACTOR_CONTINUOUS = 1.3;
/** Topic 顺延的最小间隔（天）：防止 A-Factor 展期把材料压到过短 */
export const TOPIC_MIN_INTERVAL_DAYS = 3;
/** 过载顺延时对 Item 记忆卡的防护加权（优先级数值 -15 = 等效提升 15 档，排前受保护） */
export const ITEM_PROTECTION_WEIGHT = 15;
/** 顺延默认天数（管理器「顺延 7d」按钮与 auto-postpone 共用同一产地） */
export const POSTPONE_DEFAULT_DAYS = 7;
/** auto-postpone 行为默认值（设置页 config.AUTOPOSTPONE_DEFAULTS 由此派生，勿各写一份） */
export const AUTOPOSTPONE_OPTS_DEFAULTS = {
  maxPriority: 60,
  postponeDays: POSTPONE_DEFAULT_DAYS,
  keepTop: 10,
  maxOverdueThreshold: 0,
} as const;
/** 默认牌组 FSRS 参数缺省（与 $:/Deck/default 的 p 同值；config.readDefaultDeckParams 消费） */
export const DECK_PARAM_DEFAULTS = {
  leechThreshold: 8,
  requestRetention: 0.9,
  maximumInterval: 36500,
} as const;
export const PRIORITY_TIERS = { high: 10, medium: 50, low: 90 } as const;

/** 过载顺延的防护排序分：数值小=靠前受保护（Item 记忆卡加权） */
function protectionScore(fields: Record<string, any>): number {
  return normalizePriority(fields['tidme.priority']) +
    (fields['tidme.kind'] === 'item' ? -ITEM_PROTECTION_WEIGHT : 0);
}

/**
 * 复习流（item 类）的 kind 过滤片段（分类对齐 SuperMemo：Topic=阅读 / Item=测试）。
 * topic（阅读流）不进主动复习流；item（复习流）进默认牌组。
 * 拼进 deck card / 子集过滤器，如 `[all[...]tidme.kind[item]] <ITEM_FILTER>`。
 * 卡片一律带 kind（制卡工厂与各文档页构建处保证），无需"无 kind 兜底分支"。
 */
export const ITEM_FILTER = `[tidme.kind[item]]`;

// 日期序列化/解析收敛于 core/schema（唯一实现）；CardLike 类型契约同在 schema（类型级复用）。
// 运行时用显式 require：ES import 会被 esbuild 内联复制成第二份实现（parseTwDate/twDateString 曾因此重复）。
declare function require(module: string): any;
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
import type { CardLike as CardLikeBase } from './schema.ts';
const parseTwDate = schema.parseTwDate as (v: unknown, fallback?: Date) => Date;
const tryParseTwDate = schema.tryParseTwDate as (v: unknown) => Date | null;
const twDateString = schema.twDateString as (d: Date) => string;

/** 阅读队列排序（阅读列表 / 继续阅读入口共用）：优先级（0 最高）→ due（早在前，被动重读）→ 阅读顺序 */
export function sortTopicQueue(cards: Record<string, any>[]): Record<string, any>[] {
  return [...cards].sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0) ||
      String(a.order).localeCompare(String(b.order)),
  );
}

/** 归一化优先级：非法值回默认 50 */
export function normalizePriority(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(100, Math.round(v)));
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }
  return PRIORITY_DEFAULT;
}

/** 优先级三档分界（唯一产地）：≤33 高 / ≤66 中 / 其余低。
 *  「未设」是另一维度（字段缺失/空串），由调用方按字段判定后单独成桶。 */
export const PRIORITY_BUCKET_BOUNDS = { high: 33, medium: 66 } as const;

/** 优先级档次（展示/分桶共用；入参先经 normalizePriority） */
export function priorityBucket(v: unknown): 'high' | 'medium' | 'low' {
  const p = normalizePriority(v);
  if (p <= PRIORITY_BUCKET_BOUNDS.high) return 'high';
  if (p <= PRIORITY_BUCKET_BOUNDS.medium) return 'medium';
  return 'low';
}

/** 三档选择 → 区间随机值（导入时分散，避免同批材料挤在同一队列位置，对应 SM 优先级分散） */
export function tierRandom(tier: keyof typeof PRIORITY_TIERS, spread = 8): number {
  const base = PRIORITY_TIERS[tier];
  return Math.max(0, Math.min(100, base + Math.round((Math.random() - 0.5) * 2 * spread)));
}

/**
 * 评分 → 优先级调整量（对标 SM "pass grades automatically decrease priority"）。
 * 0 = 最高优先；数值增大 = 降优先。SM 语义：及格评分（Good/Easy）自动降低 item 优先级；
 * Again/Hard 不动优先级（遗忘靠 FSRS 间隔重学，不升优先——优先级是重要性，间隔是记忆状态）。
 * cfg 可选（{again, hard, good, easy} 或 {enable:false} 关闭）；默认 0/0/+5/+10。
 */
export function priorityDeltaForRating(rating: string | number, cfg?: Record<string, any>): number {
  if (cfg && cfg.enable === false) return 0;
  const c = cfg || {};
  const r = String(rating).toLowerCase();
  if (r === 'again' || r === '1') return Number(c.again) || 0;
  if (r === 'hard' || r === '2') return Number(c.hard) || 0;
  if (r === 'good' || r === '3') return Number(c.good) || 5;
  if (r === 'easy' || r === '4') return Number(c.easy) || 10;
  return 0;
}

/** 应用优先级调整：clamp 0-100，返回字符串字段值（内部实现，对外经 shiftPriority） */
function adjustPriority(priority: unknown, delta: number): string {
  return String(Math.max(0, Math.min(100, normalizePriority(priority) + delta)));
}

/** 优先级快速增减：步长默认 5，clamp 0-100 */
export function shiftPriority(priority: unknown, step = 5): string {
  return adjustPriority(priority, step);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export interface CardLike extends CardLikeBase {}
export interface Patch {
  title: string;
  fields: Record<string, any>;
}

/** 顺延：due 推后 byDays 天（相对当前 due 或 now；已逾期卡相对 now 顺延，确保落入未来）。
 *  now 可注入，便于测试固定时钟（与 isDueNow(fields, now) 同风格）。 */
export function postponeCard(
  fields: Record<string, any>,
  byDays = POSTPONE_DEFAULT_DAYS,
  now = new Date(),
): Record<string, any> {
  const d = parseTwDate(fields.due);
  const base = d.getTime() < now.getTime() ? now : d;
  return { due: twDateString(addDays(base, byDays)) };
}

/** 提前：due = 今天（强制复习） */
export function advanceCard(): Record<string, any> {
  return { due: twDateString(new Date()) };
}

/**
 * 忽略：移出所属队列，保留内容（可经 restoreCard 恢复）。分类对齐 SuperMemo Bury：
 * kind 决定归属，忽略 = 置 tidme.ignored（出队标记），不依赖标签。
 * 返回**补丁**（本模块批量操作族统一约定：调用方 `{ ...fields, ...patch }` 写库）。
 */
export function ignoreCard(): Record<string, any> {
  return { 'tidme.ignored': 'yes' };
}

/** 搁置：tidme.suspended=yes（配合 deck card_exclude 过滤器） */
export function suspendCard(): Record<string, any> {
  return { 'tidme.suspended': 'yes' };
}

export function resumeCard(): Record<string, any> {
  return { 'tidme.suspended': undefined };
}

/** 遗忘：回到新卡（state=0，清空调度） */
export function forgetCard(): Record<string, any> {
  const t = twDateString(new Date());
  return {
    state: '0',
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    due: t,
    last_review: t,
  };
}

/** 出队判定（done 或 ignored）：已读/完成与忽略都移出所属队列，可经 restoreCard 恢复。
 *  命名说明：这不是"已读"语义——ignored 的节从未被读，只是不再等待处理；
 *  进度类口径（阅读进度等）把两者合并计为"不再待处理"。
 *  「在队」用 isInQueue（另含 suspended）；本函数只回答"是否已处理完"。 */
export function isCardOutOfQueue(fields: Record<string, any>): boolean {
  if (!fields) return false;
  return fields['tidme.done'] === 'yes' || fields['tidme.ignored'] === 'yes';
}

/** 在队判定：未完成/未忽略/未搁置——三个出队标记的唯一定义处（与 ns.QUEUE_EXCLUDE 过滤器同口径）。
 *  历史上各处手写 `!isCardOutOfQueue(f) && f['tidme.suspended'] !== 'yes'`，漏写即判定漂移。 */
export function isInQueue(fields: Record<string, any> | null | undefined): boolean {
  if (!fields) return false;
  return fields['tidme.done'] !== 'yes' && fields['tidme.ignored'] !== 'yes' && fields['tidme.suspended'] !== 'yes';
}

/**
 * Done（已读/完成）：移出学习队列 = 置 tidme.done 标记（kind 决定队列归属，无需标签）。
 * 返回**补丁**；完全可逆（restoreCard）。
 */
export function doneCard(): Record<string, any> {
  return { 'tidme.done': 'yes' };
}

/**
 * 恢复队列（Done/Ignore 的可逆反操作）：清除 done/ignored/suspended 标记，返回**补丁**。
 * 三个键显式 undefined = TW addTiddler 的"删除字段"语义——必须走合并写
 * （`{ ...fields, ...restoreCard() }`）；返回"删除键后的完整字段集"会在合并时静默失效。
 */
export function restoreCard(): Record<string, any> {
  return { 'tidme.done': undefined, 'tidme.ignored': undefined, 'tidme.suspended': undefined };
}

/**
 * 当前是否可调度：在队（未完成/未忽略/未搁置）且 due ≤ now。
 * 尊重评分/顺延写出的未来排期——"下一张/继续阅读"导航用此跳过未来到期的卡，不提前重放。
 * 无 due 的卡（Pending 语义）视为可读；**无法解析的 due 视为不可调度**（脏数据不伪装成"立即到期"）。
 */
export function isDueNow(fields: Record<string, any> | null | undefined, now = new Date()): boolean {
  if (!isInQueue(fields)) return false;
  const due = fields!.due;
  if (due === undefined || due === null || String(due) === '') return true;
  const parsed = tryParseTwDate(due);
  return parsed ? parsed.getTime() <= now.getTime() : false;
}

/**
 * 序列推进（阅读流"下一张"统一决策）：
 * 在有序 title 序列中，从 cur 之后找第一张"当前可学"的卡；cur 为 null 时从序列头找。
 * 可学判定由调用方注入（通常是 isDueNow(fields) —— 已含出队/未来排期过滤），
 * 使 section-bar / 阅读列表 / 文档页 / 复习帧等所有"下一张"入口共享同一调度算法。
 * 找不到返回 null。
 */
export function nextSchedulable(
  ordered: readonly string[],
  cur: string | null,
  canLearn: (title: string) => boolean,
): string | null {
  const start = cur === null || cur === undefined ? 0 : ordered.indexOf(cur) + 1;
  for (let i = start; i < ordered.length; i++) {
    if (canLearn(ordered[i])) return ordered[i];
  }
  return null;
}

export type QueueSortMode = 'priority-first' | 'due-first' | 'hybrid';

/**
 * 混合队列统一判序（负数 = a 在前）：priority-first / due-first / hybrid。
 * - priority-first（SM 优先级优先）：优先级数值小（高优先）在前面，相同时按 due 升序。
 * - due-first（到期优先）：due 越早越在前面，相同时按优先级升序。
 * - hybrid（混合加权得分）：score = priority - overdueDays * weight * 10（逾期越久加权越优先）。
 * 管理器列表等处的单对比较共用此定义，勿对二元数组整体排序（同一判序只此一份）。
 * now 可注入（与 isDueNow/postponeCard 同风格）：hybrid 的逾期权重依赖"现在"，不可注入则不可重放。
 */
export function comparePriorityMixed(
  a: CardLike,
  b: CardLike,
  mode: QueueSortMode = 'hybrid',
  overdueWeight = 0.5,
  now = new Date(),
): number {
  const nowMs = now.getTime();
  const pa = normalizePriority(a.fields['tidme.priority']);
  const pb = normalizePriority(b.fields['tidme.priority']);
  const da = parseTwDate(a.fields.due, new Date(0)).getTime();
  const db = parseTwDate(b.fields.due, new Date(0)).getTime();

  if (mode === 'priority-first') {
    if (pa !== pb) return pa - pb;
    return da - db;
  }

  if (mode === 'due-first') {
    if (da !== db) return da - db;
    return pa - pb;
  }

  // hybrid 模式：逾期天数抵扣 priority（使高逾期的低优先卡也能被调度，但不打破整体优先级框架）
  // 无 due = 视为 now（score 0）—— 不应伪装成"逾期多年"排到队首
  const overMs = (d: number) => (d === 0 ? 0 : Math.max(0, (nowMs - d) / 86400000));
  const daysA = overMs(da);
  const daysB = overMs(db);
  const scoreA = pa - daysA * overdueWeight * 10;
  const scoreB = pb - daysB * overdueWeight * 10;
  if (Math.abs(scoreA - scoreB) > 0.001) return scoreA - scoreB;
  return pa - pb || da - db;
}

/**
 * A-Factor 归一化：非法/越界回默认 1.5；允许 1.0–10（UI 调节范围 1.1–3.0，字段可更大）。
 */
export function normalizeAFactor(v: unknown, fallback = AFACTOR_DEFAULT): number {
  let n: number;
  if (typeof v === 'number') n = v;
  else {
    const s = String(v ?? '').trim();
    if (s === '') return fallback;
    n = parseFloat(s);
  }
  if (Number.isFinite(n) && n >= 1.0 && n <= 10) return Math.round(n * 100) / 100;
  return fallback;
}

/**
 * 按文本长度启发式设定 A-Factor（SM：A-Factor 由系统根据文章长度与处理行为启发式设定）。
 * 短材料（网页短文）A-Factor 大 → 间隔快速拉长、快速榨干归档；长材料（书）A-Factor 小 → 间隔平缓、长尾消化。
 */
export function afactorForText(chars: number): number {
  const c = Number(chars) || 0;
  if (c <= 0) return AFACTOR_DEFAULT;
  if (c < 800) return 2.0; // 短文：快速展期
  if (c < 3000) return 1.6;
  if (c < 10000) return 1.4;
  return AFACTOR_CONTINUOUS; // 长文/书：平缓
}

/** 读取卡片的 A-Factor：字段（tidme.afactor）优先，其次按字符数启发式，最后默认 1.5 */
export function afactorOf(fields: Record<string, any>, fallback = AFACTOR_DEFAULT): number {
  const raw = fields?.['tidme.afactor'];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') return normalizeAFactor(raw, fallback);
  return afactorForText(Number(fields?.chars ?? fields?.['tidme.chars']) || 0);
}

/**
 * Topic 专属 A-Factor 展期函数（对标 SuperMemo 优先级漏斗调度）：
 * 下一次间隔 = 当前间隔 * A-Factor（最小 3 天），顺延后将低优先阅读材料自动推后，释放队列空间给更高优先内容。
 * A-Factor 读取卡片 tidme.afactor（无则按字符数启发式，再回默认 1.5）。now 可注入（测试固定时钟）。
 */
export function postponeTopicByAFactor(
  fields: Record<string, any>,
  aFactor?: number,
  minDays = TOPIC_MIN_INTERVAL_DAYS,
  now = new Date(),
): Record<string, any> {
  const factor = aFactor !== undefined ? normalizeAFactor(aFactor) : afactorOf(fields);
  const lastDate = parseTwDate(fields.last_review || fields.due, new Date(now));
  const elapsedDays = Math.max(1, Math.round((now.getTime() - lastDate.getTime()) / 86400000));
  const currentInterval = Number(fields.scheduled_days) || elapsedDays;
  const newInterval = Math.max(minDays, Math.round(currentInterval * factor));
  const due = twDateString(addDays(now, newInterval));
  const reps = String((Number(fields.reps) || 0) + 1);
  return {
    due,
    scheduled_days: String(newInterval),
    last_review: twDateString(now),
    reps,
  };
}

export interface AutoPostponeOptions {
  /** 逾期卡中超过该优先级（数值更大=更低优先）的才顺延 */
  maxPriority?: number;
  /** 顺延天数 */
  postponeDays?: number;
  /** 始终保留的高优先级卡数（按优先级升序取前 N，严密保护记忆卡复习） */
  keepTop?: number;
  /** 触发顺延的逾期阈值：只有逾期任务总数 > maxOverdueThreshold 时才触发过载顺延（默认 0 表示无门槛） */
  maxOverdueThreshold?: number;
}

export interface AutoPostponeResult {
  patches: Patch[];
  stats: { overdue: number; postponed: number; kept: number };
}

/**
 * auto-postpone（“弃车保帅”过载保护）：
 * 优先推迟低优先级的 Topic 阅读材料与低优先级 Item 记忆卡，
 * 严密保护高优先级 Item 记忆卡的 FSRS 复习间隔不受破坏。
 * 默认值与设置页的共同产地 = AUTOPOSTPONE_OPTS_DEFAULTS（曾与 config 默认值漂移 40/15 vs 60/10）。
 * @param cards 候选卡（fields 含 due / tidme.priority / tidme.suspended / tidme.kind）
 * @param opts 见 AutoPostponeOptions
 * @param now 可注入时钟（与其它调度函数同风格）
 */
export function autoPostpone(cards: CardLike[], opts: AutoPostponeOptions = {}, now = new Date()): AutoPostponeResult {
  const maxPriority = opts.maxPriority ?? AUTOPOSTPONE_OPTS_DEFAULTS.maxPriority;
  const postponeDays = opts.postponeDays ?? AUTOPOSTPONE_OPTS_DEFAULTS.postponeDays;
  const keepTop = opts.keepTop ?? AUTOPOSTPONE_OPTS_DEFAULTS.keepTop;
  const maxOverdueThreshold = opts.maxOverdueThreshold ?? AUTOPOSTPONE_OPTS_DEFAULTS.maxOverdueThreshold;
  const nowMs = now.getTime();

  const overdue = cards
    .filter((c) => isInQueue(c.fields) && parseTwDate(c.fields.due, new Date(0)).getTime() < nowMs)
    .sort((a, b) => {
      // Item 记忆卡相比 Topic 在过载顺延时享受防护加权（数值小=高优先，排前受保护）
      const pa = protectionScore(a.fields);
      const pb = protectionScore(b.fields);
      if (pa !== pb) return pa - pb;
      return parseTwDate(a.fields.due).getTime() - parseTwDate(b.fields.due).getTime();
    });

  if (overdue.length <= maxOverdueThreshold) {
    return {
      patches: [],
      stats: { overdue: overdue.length, postponed: 0, kept: overdue.length },
    };
  }

  const kept = overdue.slice(0, keepTop);
  const postponable = overdue
    .slice(keepTop)
    .filter((c) => normalizePriority(c.fields['tidme.priority']) >= maxPriority);

  return {
    patches: postponable.map((c) => ({
      title: c.title,
      fields: c.fields['tidme.kind'] === 'topic'
        ? postponeTopicByAFactor(c.fields, undefined, TOPIC_MIN_INTERVAL_DAYS, now)
        : postponeCard(c.fields, postponeDays, now),
    })),
    // 注：overdue ≠ postponed + kept——低于 maxPriority 的逾期卡两者都不进（有意保留在队列）
    stats: { overdue: overdue.length, postponed: postponable.length, kept: kept.length },
  };
}
