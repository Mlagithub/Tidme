/*
scheduler.ts — 调度体系（对标 SuperMemo 优先级）

- 优先级：tidme.priority 0–100（0 最高）；normalizePriority 归一化
- 批量操作：postpone / advance / ignore / suspend / resume / forget（返回字段补丁）
- autoPostpone：按优先级顺延低优先级逾期卡（保留 top N 高优先级）
- 在队/可调度判定（isInQueue / isDueNow / isQueueable / isDueNowFor）
- 每日边界与额度：学习日上下文（learningDayContext）、每日配额记账（read/record/rollbackDailyQuota）、
  今日剩余额度单点（resolveDailyLimits）、间隔模糊（applyFuzz）、兄弟卡搁置、日末操练队列

纯字段函数（排序/补丁/判定）无 wiki 依赖，便于直测；学习日与配额一族要读配置 tiddler，
经惰性 require 取 core/config（见 configMod 注释：顶层反向 require 会循环初始化）。
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

/** 模糊分段（与 Anki FUZZ_RANGES 同值同序）：[起始天, 终止天, 系数]。
 *  终止为 Infinity 表示"20 天以上按 interval − 20 线性增长"（Anki 用 f32::MAX）。 */
const FUZZ_RANGES: ReadonlyArray<readonly [number, number, number]> = [
  [2.5, 7, 0.15],
  [7, 20, 0.1],
  [20, Infinity, 0.05],
];

/**
 * 模糊半径（Anki states/fuzz.rs `fuzz_delta`）：
 * `1 + Σ factor × max(0, min(interval, end) − start)`；interval < 2.5 天不抖。
 * 注意：Anki 对 20 天以上**不设半径上限**（区间项为 interval − 20 线性增长）；
 * 文档里"90 天上限"指的是 Anki load balancer 的 90 天视野，不是抖动半径。
 */
export function fuzzDelta(interval: number): number {
  if (!(interval >= 2.5)) return 0;
  return FUZZ_RANGES.reduce((delta, [start, end, factor]) => delta + factor * Math.max(0, Math.min(interval, end) - start), 1);
}

/** 未约束的抖动上下界（Anki `fuzz_bounds`）：[round(i−δ), round(i+δ)] */
export function fuzzBounds(interval: number): { lower: number; upper: number } {
  const delta = fuzzDelta(interval);
  return { lower: Math.round(interval - delta), upper: Math.round(interval + delta) };
}

/**
 * 约束后的抖动上下界（Anki `constrained_fuzz_bounds`）：
 * interval 先夹到 [minimum, maximum]，上下界再夹一次；当上下界相等且 >2 且未顶到上限时
 * 放开 1 天，保证至少有两档可选（均匀分布不塌缩到单值）。
 */
export function constrainedFuzzBounds(
  interval: number,
  minimum: number,
  maximum: number,
): { lower: number; upper: number } {
  const lo = Math.min(minimum, maximum);
  const clamped = Math.min(Math.max(interval, lo), maximum);
  const bounds = fuzzBounds(clamped);
  let lower = Math.min(Math.max(bounds.lower, lo), maximum);
  let upper = Math.min(Math.max(bounds.upper, lo), maximum);
  if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;
  return { lower, upper };
}

/**
 * 抖动下界保护（Anki `minimum_review_fuzz_interval`）：及格复习的间隔不应因抖动缩回。
 * - 新间隔（四舍五入）比旧间隔大 → 下界 = 旧间隔 + 1（保证"确实前进了"）；
 * - 新间隔没长大但旧间隔落在抖动上界内 → 下界 = 旧间隔（不许抖到更短）；
 * - 新间隔收缩（FSRS 参数变化/难度调整）→ 下界 = 0，允许自由抖动。
 */
export function minimumReviewFuzzInterval(
  interval: number,
  previousInterval: number,
  maximumInterval: number,
): number {
  const rounded = Math.round(interval);
  const { upper } = constrainedFuzzBounds(interval, 1, maximumInterval);
  if (rounded > previousInterval) return previousInterval + 1;
  if (previousInterval <= upper) return previousInterval;
  return 0;
}

/**
 * 施加抖动（Anki `with_review_fuzz`）：factor ∈ [0,1) 时在约束区间内均匀取整数；
 * factor = null（调用方判定不抖）时取 round(interval) 并夹到 [minimum, maximum]。
 */
export function withReviewFuzz(
  fuzzFactor: number | null,
  interval: number,
  minimum: number,
  maximum: number,
): number {
  if (fuzzFactor === null) {
    return Math.min(Math.max(Math.round(interval), minimum), maximum);
  }
  const { lower, upper } = constrainedFuzzBounds(interval, minimum, maximum);
  return Math.floor(lower + fuzzFactor * (1 + upper - lower));
}

export interface FuzzRange {
  minDelta: number;
  maxDelta: number;
}

/** 抖动区间（向外暴露对称半径；等价于 Anki 的 constrained_fuzz_bounds，仅换表述）。
 *  prevInterval / maxInterval 缺省时只按 1..DECK_PARAM_DEFAULTS.maximumInterval 约束。 */
export function calculateFuzzRange(interval: number, opts: { prevInterval?: number; maxInterval?: number } = {}): FuzzRange {
  const maximum = opts.maxInterval && opts.maxInterval > 0 ? Math.floor(opts.maxInterval) : DECK_PARAM_DEFAULTS.maximumInterval;
  const minimum = opts.prevInterval && opts.prevInterval > 0 ? minimumReviewFuzzInterval(interval, Math.floor(opts.prevInterval), maximum) : 1;
  const { lower, upper } = constrainedFuzzBounds(interval, minimum, maximum);
  return { minDelta: lower - Math.round(interval), maxDelta: upper - Math.round(interval) };
}

export interface FuzzOptions {
  /** 上次间隔（天）：用于 minimum_review_fuzz_interval 下界保护 */
  prevInterval?: number;
  /** 牌组最大间隔（天）：抖动结果不越过它 */
  maxInterval?: number;
  /** 随机数注入（默认 Math.random，便于测试确定性断言） */
  randomFn?: () => number;
}

/**
 * 应用间隔模糊：返回抖动后的整数天数。
 * 语义与 Anki 一致（fuzz_delta → minimum_review_fuzz_interval → with_review_fuzz）：
 * 2.5 天以下不抖；抖动区间受前次间隔与 maximum_interval 双重约束。
 */
export function applyFuzz(scheduledDays: number, opts: FuzzOptions = {}): number {
  const maxInterval = opts.maxInterval && opts.maxInterval > 0 ? Math.floor(opts.maxInterval) : DECK_PARAM_DEFAULTS.maximumInterval;
  if (!(scheduledDays >= 2.5)) return withReviewFuzz(null, scheduledDays, 1, maxInterval);
  const minimum = opts.prevInterval && opts.prevInterval > 0
    ? minimumReviewFuzzInterval(scheduledDays, Math.floor(opts.prevInterval), maxInterval)
    : 1;
  const factor = typeof opts.randomFn === 'function' ? opts.randomFn() : Math.random();
  return withReviewFuzz(factor, scheduledDays, minimum, maxInterval);
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

/** 取消当日搁置（Anki 的 Unbury）：清 tidme.buried → 当日即可再次调度。返回补丁。 */
export function unburyCard(): Record<string, any> {
  return { [ns.BURIED_FIELD]: undefined };
}

/**
 * 难点卡重置（SM 对 leech 的根治手段 reformulate 的入口）：清 leech 标记 + 遗忘回新卡。
 *
 * 必须一并清**三态出队标记，尤其 tidme.ignored**：默认 `leech_action` 是 `action/exclude`
 * （写 tidme.ignored），只清 tidme.leech/suspended 的话，重置后卡依旧被 card_exclude 挡在
 * 所有队列之外——用户按了"重置难点"却看不到任何变化（曾如此）。
 */
export function resetLeechCard(): Record<string, any> {
  return {
    'tidme.leech': undefined,
    'tidme.ignored': undefined,
    'tidme.suspended': undefined,
    ...unburyCard(),
    ...forgetCard(),
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

/** FSRS state 归一化：数字（fsrs JSON 写回的就是数字）/字符串/缺失 → '0'|'1'|'2'|'3'。
 *  唯一产地：比较处直接写 `=== '1'` 会与数字 state 静默失配（提前学习放行/新卡判定曾如此）。 */
export function stateOf(fields: Record<string, any> | null | undefined): string {
  const raw = fields ? fields.state : undefined;
  const s = raw === undefined || raw === null ? '' : String(raw).trim();
  return s === '1' || s === '2' || s === '3' ? s : '0';
}

/** 当日搁置判定（Bury Siblings）：tidme.buried == 当前学习日 → 今日不可调度（次日自动解埋） */
export function isBuriedToday(fields: Record<string, any> | null | undefined, learningDay: string): boolean {
  const buried = fields ? fields[ns.BURIED_FIELD] : undefined;
  return buried !== undefined && buried !== null && String(buried) === learningDay;
}

/** 在队且未被当日搁置：**不判 due** 的最小可进入判定。
 *  cram（预演未到期内容）与 final drill（日末重练）用它推进；正常复习流用 isDueNow。 */
export function isQueueable(fields: Record<string, any> | null | undefined, learningDay: string): boolean {
  return isInQueue(fields) && !isBuriedToday(fields, learningDay);
}

/**
 * 当前是否可调度：在队（未完成/未忽略/未搁置、非当日搁置）且 due ≤ now（或符合提前学习放行限制）。
 * 尊重评分/顺延写出的未来排期——"下一张/继续阅读"导航用此跳过未来到期的卡，不提前重放。
 * 无 due 的卡（Pending 语义）视为可读；**无法解析的 due 视为不可调度**（脏数据不伪装成"立即到期"）。
 *
 * 纯谓词：不读 wiki/配置。wiki 感知的调用点一律用 isDueNowFor（换天时刻与提前学习窗口
 * 由 learningDayContext 单点解析），不要各自拼这些参数。
 * @param fields 卡片字段集
 * @param now 当前基准时刻
 * @param learnAheadMinutes 提前学习放行上限（分钟，默认 0 = 严格不提前；>0 时放行窗口内的学习步卡片）
 * @param rolloverHour 换天时刻（小时，仅影响当日搁置判定）
 */
export function isDueNow(
  fields: Record<string, any> | null | undefined,
  now = new Date(),
  learnAheadMinutes = 0,
  rolloverHour = 4,
): boolean {
  if (!isQueueable(fields, schema.learningDayOf(now, rolloverHour))) return false;

  const due = fields!.due;
  if (due === undefined || due === null || String(due) === '') return true;
  const parsed = tryParseTwDate(due);
  if (!parsed) return false;

  const dueMs = parsed.getTime();
  const nowMs = now.getTime();
  if (dueMs <= nowMs) return true;

  // 提前学习放行（Learn Ahead Limit）：仅对会内学习步卡片（state 1/3）生效
  const state = stateOf(fields);
  if (learnAheadMinutes > 0 && (state === '1' || state === '3')) {
    return dueMs <= nowMs + learnAheadMinutes * 60000;
  }
  return false;
}

/**
 * 配置读取的惰性入口。core/config 在模块顶层 require 本模块（AUTOPOSTPONE_OPTS_DEFAULTS /
 * DECK_PARAM_DEFAULTS 的单一产地），顶层反向 require 会构成循环初始化——config 顶层将读到
 * 半成品 exports（默认值变 undefined）。故此处惰性取用，调用时两模块均已初始化完毕。
 */
function configMod(): any {
  return require('$:/plugins/keepone/tidme/core/config.js');
}

/** 换天时刻（小时）：唯一实现 = config.readRolloverHour。
 *  本模块不再自读配置 tiddler——曾用 `Number(text) || 4` 把合法的 0 点换天吞成 4 点。 */
export function resolveRolloverHour(wiki: any): number {
  return configMod().readRolloverHour(wiki);
}

export interface LearningDayContext {
  now: Date;
  /** 换天时刻（小时 0–23） */
  rolloverHour: number;
  /** 当前学习日（YYYYMMDD 本地） */
  learningDay: string;
  /** 提前学习放行窗口（分钟） */
  learnAheadMinutes: number;
}

/** 学习日上下文唯一产地：换天时刻与提前学习窗口一律经此读取。
 *  历史上 isDueNow 用默认 4 点、写入口用配置值，导致非默认换天时刻下"当日搁置"同日失效。 */
export function learningDayContext(wiki: any, now = new Date()): LearningDayContext {
  const config = configMod();
  const rolloverHour = config.readRolloverHour(wiki);
  return {
    now,
    rolloverHour,
    learningDay: schema.learningDayOf(now, rolloverHour),
    learnAheadMinutes: config.readLearnAheadMinutes(wiki),
  };
}

/** 生产入口（wiki 感知）：按配置解析学习日上下文后再判定 */
export function isDueNowFor(
  wiki: any,
  fields: Record<string, any> | null | undefined,
  now = new Date(),
): boolean {
  const ctx = learningDayContext(wiki, now);
  return isDueNow(fields, ctx.now, ctx.learnAheadMinutes, ctx.rolloverHour);
}

export interface DailyQuotaState {
  learningDay: string;
  newCount: number;
  reviewCount: number;
}

/** 配额记账类别：new = 引入新卡（state 0 → 非 0）；review = 复习卡（state 2）；
 *  learn = 会内学习步（state 1/3）——**不计入任何每日上限**（对标 Anki：会内学习不受每日上限约束）。 */
export type QuotaKind = 'new' | 'review' | 'learn';

function writeDailyQuota(wiki: any, state: DailyQuotaState): void {
  if (wiki && typeof wiki.addTiddler === 'function') {
    wiki.addTiddler({
      title: ns.DAILY_QUOTA_STATE_TITLE,
      type: 'application/json',
      text: JSON.stringify(state),
    });
  }
}

/** 读今日配额消耗状态（跨天自动重置；换天时刻经 config 单点解析） */
export function readDailyQuota(wiki: any, now = new Date()): DailyQuotaState {
  const currentDay = schema.learningDayOf(now, resolveRolloverHour(wiki));
  const fallback: DailyQuotaState = { learningDay: currentDay, newCount: 0, reviewCount: 0 };
  if (!wiki || typeof wiki.getTiddler !== 'function') return fallback;
  const raw = wiki.getTiddlerText?.(ns.DAILY_QUOTA_STATE_TITLE, '');
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw);
    if (data && data.learningDay === currentDay) {
      return {
        learningDay: currentDay,
        newCount: Math.max(0, Math.floor(Number(data.newCount) || 0)),
        reviewCount: Math.max(0, Math.floor(Number(data.reviewCount) || 0)),
      };
    }
  } catch {
    // 坏 JSON 视为"今日尚未记账"（下一次评分会整体重写）；不抛错以免阻断评分
  }
  return fallback;
}

/** 记入今日配额消耗（评分成功后调用）。learn（会内学习步）不记账，只回读当前状态。 */
export function recordDailyQuota(wiki: any, kind: QuotaKind, now = new Date()): DailyQuotaState {
  const current = readDailyQuota(wiki, now);
  const updated: DailyQuotaState = {
    learningDay: current.learningDay,
    newCount: current.newCount + (kind === 'new' ? 1 : 0),
    reviewCount: current.reviewCount + (kind === 'review' ? 1 : 0),
  };
  if (kind !== 'learn') writeDailyQuota(wiki, updated);
  return updated;
}

/** 回滚今日配额消耗（Undo 评分时调用） */
export function rollbackDailyQuota(wiki: any, kind: QuotaKind, now = new Date()): DailyQuotaState {
  const current = readDailyQuota(wiki, now);
  const updated: DailyQuotaState = {
    learningDay: current.learningDay,
    newCount: Math.max(0, current.newCount - (kind === 'new' ? 1 : 0)),
    reviewCount: Math.max(0, current.reviewCount - (kind === 'review' ? 1 : 0)),
  };
  if (kind !== 'learn') writeDailyQuota(wiki, updated);
  return updated;
}

export interface DailyLimits {
  learningDay: string;
  rolloverHour: number;
  /** 今日已引入新卡数（state 0 出卡）/ 已复习卡数（state 2） */
  newCount: number;
  reviewCount: number;
  /** 今日剩余可放行的复习卡数；null = 不限 */
  reviewLimit: number | null;
  /** 今日剩余可放行的新卡数（已按 Anki 语义受剩余复习额度封顶）；null = 不限 */
  newLimit: number | null;
}

/**
 * 今日剩余额度唯一产地（全局学习队列 / 今日面板 / 任何"今天还能做多少"共用）。
 *
 * 语义对标 Anki rslib/src/decks/limits.rs（RemainingLimits::new_for_normal_deck_v3）：
 * - 剩余复习 = 复习上限 − 今日已复习；
 * - 开启"新卡受复习上限压制"（默认）时，剩余复习还要再扣掉今日已引入的新卡，
 *   且新卡剩余 = min(新卡上限 − 今日已引入, 剩余复习)——新卡消耗复习预算，
 *   复习额度见底时新卡一并归零。不是"整段压制/放开"的开关，更不是"额度用尽反而放行"。
 * - 上限配置 0 = 不限（设置面板语义），在**此处**翻译为 null；传给 deck-engine 的
 *   number 语义是"今日还可放行多少张"（0 = 一张不放）。
 */
export function resolveDailyLimits(wiki: any, now = new Date()): DailyLimits {
  const config = configMod();
  const quota = readDailyQuota(wiki, now);
  const newCap = config.readNewPerDay(wiki);
  const reviewCap = config.readReviewsPerDay(wiki);
  const suppress = config.readLimitsSuppressNew(wiki);

  let reviewLimit: number | null = reviewCap > 0 ? Math.max(0, reviewCap - quota.reviewCount) : null;
  let newLimit: number | null = newCap > 0 ? Math.max(0, newCap - quota.newCount) : null;
  if (suppress && reviewLimit !== null) {
    const budget = Math.max(0, reviewLimit - quota.newCount);
    reviewLimit = budget;
    newLimit = newLimit === null ? budget : Math.min(newLimit, budget);
  }
  return {
    learningDay: quota.learningDay,
    rolloverHour: resolveRolloverHour(wiki),
    newCount: quota.newCount,
    reviewCount: quota.reviewCount,
    reviewLimit,
    newLimit,
  };
}

// ---------- 同源卡分散与兄弟卡搁置（Bury Siblings） ----------

/** 查找指定卡片的可搁置兄弟卡（同一 tidme.parent、在队、title 不同的 item 卡）。
 *
 * 排除两类：
 * - **会内学习步卡（state 1/3）永不搁置**：Anki 明确不埋时间敏感的会内学习卡
 *   （interday learning 埋卡是独立开关且默认关）；把它们藏到次日会丢掉重学步。
 * - 父卡 title 含过滤器元字符（`[`/`]`/`{`/`}`，TW 无法转义）时直接返回空：
 *   宁可这一轮不分散，也不能靠"删字符"改写成另一个父卡——那会把无关卡误埋
 *   （唯一判据 = ns.isFilterSafeTitle，勿自写净化）。 */
export function findSiblings(wiki: any, cardTitle: string): string[] {
  if (!wiki || typeof wiki.filterTiddlers !== 'function' || !cardTitle) return [];
  const f = wiki.getTiddler(cardTitle)?.fields;
  const parent = f?.['tidme.parent'];
  if (!parent || !ns.isFilterSafeTitle(parent)) return [];
  const raw = wiki.filterTiddlers(
    `[all[shadows+tiddlers]tidme.parent[${parent}]!is[draft]tidme.kind[item]]`,
  );
  return raw.filter((t: string) => {
    if (t === cardTitle) return false;
    const sf = wiki.getTiddler(t)?.fields;
    if (!isInQueue(sf)) return false;
    const state = stateOf(sf);
    return state !== '1' && state !== '3';
  });
}

/** 搁置兄弟卡（Bury siblings）：将传入卡列表打上 tidme.buried = <learningDay> */
export function buryCards(wiki: any, titles: string[], learningDay: string): string[] {
  if (!wiki || typeof wiki.addTiddler !== 'function' || !titles.length) return [];
  const buried: string[] = [];
  for (const t of titles) {
    const f = wiki.getTiddler(t)?.fields;
    if (f && f[ns.BURIED_FIELD] !== learningDay) {
      wiki.addTiddler({ ...f, [ns.BURIED_FIELD]: learningDay });
      buried.push(t);
    }
  }
  return buried;
}

/** 解除搁置（Unbury）：清理指定卡片或全库的 tidme.buried 标记 */
export function unburyCards(wiki: any, titles?: string[]): number {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return 0;
  const targetTitles = titles || wiki.filterTiddlers(`[all[shadows+tiddlers]has[${ns.BURIED_FIELD}]]`);
  let count = 0;
  for (const t of targetTitles) {
    const f = wiki.getTiddler(t)?.fields;
    if (f && f[ns.BURIED_FIELD]) {
      wiki.addTiddler({ ...f, ...unburyCard() });
      count++;
    }
  }
  return count;
}

// ---------- 日末操练队列（Final Drill）----------
// 已独立为 core/drill（队列读写与调度判定分离）：本模块不再承载"队列状态存储"，
// 需要的调用方直接 require('$:/plugins/keepone/tidme/core/drill.js')。

/**
 * 序列推进（阅读流"下一张"统一决策）：
 * 在有序 title 序列中，从 cur 之后找第一张"当前可学"的卡；cur 为 null 时从序列头找。
 * 可学判定由调用方注入（正常流用 isDueNowFor(wiki, fields) —— 已含出队/当日搁置/未来排期过滤；
 * cram 与 final-drill 用 isQueueable(fields, learningDay)，不判 due），
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
