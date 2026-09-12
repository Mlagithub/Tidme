/*
stats.ts — 统计聚合（纯函数）

- deckLoad：牌组负载（total / new / learn / due / overdue）
- retentionFromLogs：从复习日志估算保留率（1 - Again 占比）
- funnelCounts：漏斗（文档页 / Section / 摘录 / 卡）
- 文档阅读进度不在此模块：唯一实现在 core/doc-ops.docReadingProgress（区分连续型/分节型）

review log 行格式（repeat 写入 $:/Deck/<deck>/log 单文件，键 = 17 位复习时刻）：
  { rating: 1-4, elapsed_days, scheduled_days, review, state }
*/

declare var require: any;
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const parseTwDate = schema.parseTwDate;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const nsMod = require('$:/plugins/keepone/tidme/core/ns.js');
const isCardOutOfQueue = sched.isCardOutOfQueue;
const isInQueue = sched.isInQueue;

import type { CardLike } from './schema.ts';
export type { CardLike };

export interface DeckLoad {
  total: number;
  learn: number; // state 1/3（learning/relearning）
  due: number; // state 2 且 due <= now
  overdue: number; // state 2 且 due < now
  newCount: number; // 无 state 或 state 0
}

export function deckLoad(cards: CardLike[], now = new Date()): DeckLoad {
  const load: DeckLoad = { total: cards.length, learn: 0, due: 0, overdue: 0, newCount: 0 };
  const nowMs = now.getTime();
  for (const c of cards) {
    const f = c.fields;
    if (!isInQueue(f)) continue; // 出队三态统一判定（done/ignored/suspended）
    const state = String(f.state || '0');
    if (state === '1' || state === '3') load.learn++;
    else if (state === '2') {
      // 到期 = 已排期复习且 due ≤ now；未来排期不算"到期"（注释与实现对齐）
      const dueMs = parseTwDate(f.due).getTime();
      if (dueMs <= nowMs) {
        load.due++;
        if (dueMs < nowMs) load.overdue++;
      }
    } else load.newCount++;
  }
  return load;
}

export interface Retention {
  reviews: number;
  againRate: number;
  retention: number;
}

/** 从复习日志估算保留率（简化：1 - Again 占比） */
export function retentionFromLogs(logEntries: Array<{ rating?: number | string }>): Retention {
  if (!logEntries.length) return { reviews: 0, againRate: 0, retention: 1 };
  let again = 0;
  for (const e of logEntries) {
    const r = Number(e.rating);
    if (r === 1) again++;
  }
  const againRate = again / logEntries.length;
  return { reviews: logEntries.length, againRate, retention: 1 - againRate };
}

export interface TrueRetention {
  matureReviews: number;
  maturePass: number;
  matureAgain: number;
  trueRetention: number;
  youngReviews: number;
  youngPass: number;
  youngAgain: number;
  youngRetention: number;
  allReviews: number;
  overallRetention: number;
}

export const MATURE_INTERVAL_DAYS = 21;

/**
 * 真实保留率（True Retention）：对标 Anki / SuperMemo 成熟卡（间隔 ≥ 21 天）及格率指标。
 * 过滤掉短期新学/重学步的干扰，精确反映长期记忆稳定性。
 */
export function trueRetentionFromLogs(
  logEntries: Array<{
    rating?: number | string;
    state?: number | string;
    elapsed_days?: number | string;
    last_elapsed_days?: number | string;
  }>,
  matureIntervalDays = MATURE_INTERVAL_DAYS,
): TrueRetention {
  const result: TrueRetention = {
    matureReviews: 0,
    maturePass: 0,
    matureAgain: 0,
    trueRetention: 1,
    youngReviews: 0,
    youngPass: 0,
    youngAgain: 0,
    youngRetention: 1,
    allReviews: logEntries.length,
    overallRetention: 1,
  };

  if (!logEntries.length) return result;

  let totalAgain = 0;

  for (const e of logEntries) {
    const r = Number(e.rating);
    const isAgain = r === 1;
    if (isAgain) totalAgain++;

    const stateStr = String(e.state ?? '');
    const isReviewState = stateStr === '2' || stateStr.toLowerCase() === 'review';
    const elapsed = Number(e.last_elapsed_days !== undefined ? e.last_elapsed_days : e.elapsed_days);

    if (isReviewState && Number.isFinite(elapsed) && elapsed >= matureIntervalDays) {
      result.matureReviews++;
      if (isAgain) result.matureAgain++;
      else result.maturePass++;
    } else if (isReviewState) {
      result.youngReviews++;
      if (isAgain) result.youngAgain++;
      else result.youngPass++;
    }
  }

  result.trueRetention = result.matureReviews > 0
    ? result.maturePass / result.matureReviews
    : 1;

  result.youngRetention = result.youngReviews > 0
    ? result.youngPass / result.youngReviews
    : 1;

  result.overallRetention = result.allReviews > 0
    ? (result.allReviews - totalAgain) / result.allReviews
    : 1;

  return result;
}

export interface FutureDueDay {
  dayIndex: number;
  dateString: string;
  dueCount: number;
  cumulativeDue: number;
}

/**
 * 未来到期负荷预测（Future Due）：按卡片排期预测未来 N 天的每日复习量。
 * 逾期卡归入第 0 天（今天）；跨天边界遵循 rolloverHour 本地学习日。
 */
export function futureDueSchedule(
  cards: CardLike[],
  days = 30,
  now = new Date(),
  rolloverHour = 4,
): FutureDueDay[] {
  // 学习日之间的天数推算一律走纯日历函数（schema.addLearningDays / learningDayDiff）：
  // 曾用 parseTwDate(<本地学习日串>) 拿"当日零点"，那是把本地日当 UTC 时刻
  // ——UTC 负偏移时区整体错一天（分桶 index 对、日期标签错）。
  const currentDay = schema.learningDayOf(now, rolloverHour);

  const schedule: FutureDueDay[] = [];
  for (let i = 0; i < days; i++) {
    schedule.push({
      dayIndex: i,
      dateString: schema.addLearningDays(currentDay, i),
      dueCount: 0,
      cumulativeDue: 0,
    });
  }

  for (const c of cards) {
    const f = c.fields;
    if (!isInQueue(f)) continue;
    if (f['tidme.kind'] !== 'item') continue;
    const state = String(f.state || '0');
    if (state === '0') continue; // 新卡尚未排期

    const dueStr = f.due;
    if (!dueStr) continue;
    const parsed = schema.tryParseTwDate(dueStr);
    if (!parsed) continue;

    const dayDiff = schema.learningDayDiff(currentDay, schema.learningDayOf(parsed, rolloverHour));
    if (dayDiff <= 0) {
      schedule[0].dueCount++;
    } else if (dayDiff < days) {
      schedule[dayDiff].dueCount++;
    }
  }

  let runningTotal = 0;
  for (const day of schedule) {
    runningTotal += day.dueCount;
    day.cumulativeDue = runningTotal;
  }

  return schedule;
}

export interface Funnel {
  docs: number;
  sections: number;
  extracts: number;
  concepts: number;
  cards: number;
}

/** 漏斗：文档页（tidme-doc 标签，宿主/阅读单元）/ Topic 节 / 摘录 / 概念卡 / 测试卡。
 *  文档页优先于 kind 判定——文档页是 kind=topic 的宿主页，按 kind 会误记成"节"。
 *  概念卡（subkind=concept）单独成桶：它同属 topic 轨道但不是切分出的节，
 *  混进"节"会让漏斗数字虚高（曾如此）。 */
export function funnelCounts(items: CardLike[]): Funnel {
  const f: Funnel = { docs: 0, sections: 0, extracts: 0, concepts: 0, cards: 0 };
  for (const c of items) {
    const kind = String(c.fields['tidme.kind'] || '');
    const sub = String(c.fields['tidme.subkind'] || '');
    if (Array.isArray(c.fields.tags) && c.fields.tags.includes('tidme-doc')) f.docs++;
    else if (kind === 'topic') {
      if (sub === 'extract') f.extracts++;
      else if (sub === 'concept') f.concepts++;
      else f.sections++;
    } else if (kind === 'item') f.cards++;
  }
  return f;
}

export const READTIME_TIDDLER = '$:/plugins/keepone/tidme/stats/readtime';

/** 单段专注时长上限（秒）：超过视为挂机/休眠/机器时间跳变，整段丢弃并告警。
 *  不 clamp——clamp 会把 3 小时挂机伪装成 1 小时，比丢弃更失真。
 *  （「快刷保底 1 秒」在 session.recordFocus，属另一侧口径：短段补足，长段丢弃。） */
export const FOCUS_SEGMENT_MAX_SECONDS = 3600;

export interface ReadTimeStats {
  totalSeconds: number;
  todaySeconds: number;
  docSeconds: Record<string, number>;
}

export function formatDuration(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec} s`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins} m ${remSec} s` : `${mins} m`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs} h ${remMins} m` : `${hrs} h`;
}

/** 读取阅读时长 tiddler 原始 JSON（get/record 共用；损坏宽容回空对象） */
function readStatsRaw(wiki: any): any {
  const raw = wiki.getTiddlerText ? wiki.getTiddlerText(READTIME_TIDDLER, '') : '';
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') return v;
    } catch { /* ignore */ }
  }
  return {};
}

export function getReadTimeStats(wiki: any): ReadTimeStats {
  if (!wiki || typeof wiki.getTiddlerText !== 'function') {
    return { totalSeconds: 0, todaySeconds: 0, docSeconds: {} };
  }
  const data = readStatsRaw(wiki);
  const totalSeconds = Number(data.totalSeconds) || 0;
  const todaySeconds = Number(data.days?.[readTimeDayKey(wiki)]) || 0;
  const docSeconds = (typeof data.docs === 'object' && data.docs) ? { ...data.docs } : {};
  return { totalSeconds, todaySeconds, docSeconds };
}

/** 阅读时长的"日"桶键 = 学习日（与复习计数/每日额度同一换天口径）。
 *  曾用 schema.todayKey（UTC 绝对日）：UTC 正偏移时区里与复习数各按不同日历切天，
 *  "今日反馈条"上两个数字会在夜间时段互相矛盾。 */
function readTimeDayKey(wiki: any): string {
  return sched.learningDayContext(wiki).learningDay;
}

export function recordReadTime(wiki: any, docId: string, seconds: number) {
  if (!wiki || !seconds || seconds <= 0) return;
  const data = readStatsRaw(wiki);
  if (!data.docs) data.docs = {};
  if (!data.days) data.days = {};

  const sec = Math.max(1, Math.round(seconds));
  const day = readTimeDayKey(wiki);

  data.totalSeconds = (Number(data.totalSeconds) || 0) + sec;
  data.days[day] = (Number(data.days[day]) || 0) + sec;
  if (docId) {
    data.docs[docId] = (Number(data.docs[docId]) || 0) + sec;
  }

  wiki.addTiddler({
    title: READTIME_TIDDLER,
    type: 'application/json',
    text: JSON.stringify(data),
  });
}

/** 按优先级分桶（供排序展示）；priority 缺失或空串 = 未设。
 *  三档分界引 scheduler.priorityBucket（唯一产地），未设单独成桶不再靠默认值混入"中" */
export function priorityBuckets(cards: CardLike[]): { high: number; medium: number; low: number; none: number } {
  const b = { high: 0, medium: 0, low: 0, none: 0 };
  for (const c of cards) {
    const raw = c.fields['tidme.priority'];
    const unset = raw === undefined || raw === null || String(raw).trim() === '';
    if (unset) {
      b.none++;
      continue;
    }
    b[sched.priorityBucket(raw)]++;
  }
  return b;
}

// ---------- 「今天」口径的聚合（widget 只渲染，算数在 core） ----------

/** 今日已复习卡数：遍历全部牌组日志单文件，按**学习日**计数。
 *  日志键是绝对时刻（UTC 17 位串），故须逐键换算学习日——不能按 UTC 日前缀截断。
 *  与 DAILY_QUOTA_STATE 的口径差异（有意，勿合并）：这里回答"今天复习了多少张"（含会内学习步），
 *  配额账本只记"消耗了每日上限的评分"（引入新卡/复习卡），两者本就不同数。 */
export function reviewCountToday(wiki: any): number {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return 0;
  const ctx = sched.learningDayContext(wiki);
  let n = 0;
  for (const lt of wiki.filterTiddlers(`[prefix[${nsMod.DECK_PREFIX}]]`)) {
    if (!nsMod.isDeckLogTitle(lt)) continue;
    const data = wiki.getTiddlerData(lt);
    if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        const d = schema.tryParseTwDate(k);
        if (d) {
          if (schema.learningDayOf(d, ctx.rolloverHour) === ctx.learningDay) n += 1;
        } else if (String(k).startsWith(ctx.learningDay)) {
          n += 1;
        }
      }
    }
  }
  return n;
}

export interface TodayWorkload {
  /** 会内学习步卡（不受每日上限约束） */
  learn: number;
  /** 今日还可放行的复习卡数（已受剩余额度截断） */
  due: number;
  /** 今日还可放行的新卡数（已受剩余额度截断） */
  newly: number;
  /** 实际待学量 = learn + due + newly（与「开始学习」拉起的队列同口径） */
  todayToStudy: number;
  /** 卡库全量池（未截断，仅作参考显示） */
  totalDue: number;
  totalNew: number;
  totalPool: number;
  toRead: number;
}

/**
 * 「今天」页的待学负荷：**与「开始学习」实际拉起的队列同口径**。
 * 额度（scheduler.resolveDailyLimits）、截断（deck-engine.clippedCount）、
 * 当日搁置排除（ns.buriedExcludeFilter）三者都与队列构建共用同一实现，
 * 展示侧不再自算一套 min/压制算术（曾因两份算式而长期偏离真实队列）。
 */
export function todayWorkload(wiki: any): TodayWorkload {
  // 惰性取队列组合与 deck 常量：stats 是纯聚合模块，不必在加载期就拉进队列组合图
  const deckEngine = require('$:/plugins/keepone/tidme/core/deck-engine.js');
  const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
  const limits = sched.resolveDailyLimits(wiki);
  const f = deckEngine.composeDeckFilters(deckMod.DEFAULT_DECK);
  const bury = nsMod.buriedExcludeFilter(limits.learningDay);
  const count = (filter: string) => wiki.filterTiddlers(bury ? `${filter} ${bury}` : filter).length;
  const learn = count(f.learn);
  const totalDue = count(f.due);
  const totalNew = count(f.newly);
  const due = deckEngine.clippedCount(totalDue, limits.reviewLimit);
  const newly = deckEngine.clippedCount(totalNew, limits.newLimit);
  return {
    learn,
    due,
    newly,
    todayToStudy: learn + due + newly,
    totalDue,
    totalNew,
    totalPool: learn + totalDue + totalNew,
    toRead: count(nsMod.TOPIC_QUEUE_FILTER),
  };
}
