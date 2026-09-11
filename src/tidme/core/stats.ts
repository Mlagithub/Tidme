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
const todayKey = schema.todayKey;

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
  const currentDayStr = schema.learningDayOf(now, rolloverHour);
  const currentDayTime = schema.parseTwDate(currentDayStr + '000000000').getTime();

  const schedule: FutureDueDay[] = [];
  for (let i = 0; i < days; i++) {
    const dayDate = new Date(currentDayTime + i * 86400000);
    const dateString = schema.learningDayOf(dayDate, 0);
    schedule.push({
      dayIndex: i,
      dateString,
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

    const cardDayStr = schema.learningDayOf(parsed, rolloverHour);
    const cardDayTime = schema.parseTwDate(cardDayStr + '000000000').getTime();
    const dayDiff = Math.floor((cardDayTime - currentDayTime) / 86400000);

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
  const todaySeconds = Number(data.days?.[todayKey()]) || 0;
  const docSeconds = (typeof data.docs === 'object' && data.docs) ? { ...data.docs } : {};
  return { totalSeconds, todaySeconds, docSeconds };
}

export function recordReadTime(wiki: any, docId: string, seconds: number) {
  if (!wiki || !seconds || seconds <= 0) return;
  const data = readStatsRaw(wiki);
  if (!data.docs) data.docs = {};
  if (!data.days) data.days = {};

  const sec = Math.max(1, Math.round(seconds));

  data.totalSeconds = (Number(data.totalSeconds) || 0) + sec;
  data.days[todayKey()] = (Number(data.days[todayKey()]) || 0) + sec;
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
