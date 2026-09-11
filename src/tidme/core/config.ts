/*
core/config.ts — Tidme 配置读写唯一收口（设置页与各消费方共用）

三个配置域（低频、设一次用很久；每次操作都调的高频参数保留在各功能页）：
- 自动顺延：$:/config/Tidme/AutoPostpone（JSON；消费方 = 启动调度器 / queue-ops / 设置页）
- 语义切分：$:/config/Tidme/SemanticSplit（JSON；消费方 = 导入预览的 LLM 二次切分）
- 默认牌组参数：$:/Deck/default 的 order / leech_threshold / p（request_retention、maximum_interval）

约定：读取一律合并默认值（配置缺失或非法 JSON 宽容兜底，不抛错）；
写入一律「读当前 → 合并 patch → 回写」，局部修改不抹掉其它键。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

/** 自动顺延默认值（enable 默认关闭：不自动改用户数据）；行为默认值与 scheduler 同源 */
export const AUTOPOSTPONE_DEFAULTS = {
  enable: false,
  ...sched.AUTOPOSTPONE_OPTS_DEFAULTS,
};

/** 语义切分默认值（无 API Key 时 LLM 二次切分不可用） */
export const SEMANTIC_SPLIT_DEFAULTS = {
  enable: false,
  apiKey: '',
  baseUrl: '',
  model: '',
  maxParas: 200,
};

const DECK_ORDERS = ['due-new', 'new-due', 'random'];

/** 布尔式配置解析：显式假值（false/'false'/'0'/'no'，大小写不敏感）→ false，其余按 dflt */
function boolish(v: unknown, dflt: boolean): boolean {
  if (v === undefined || v === null || String(v).trim() === '') return dflt;
  const s = String(v).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no') return false;
  if (s === 'true' || s === '1' || s === 'yes') return true;
  return dflt;
}

/** 数值式配置解析：非法/越界回 dflt（读侧与写侧同口径，避免 NaN 流入 FSRS/leech） */
function num(v: unknown, dflt: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function readJson(wiki: any, title: string): Record<string, any> {
  const raw = String(wiki.getTiddlerText?.(title, '') || wiki.getTiddler(title)?.fields?.text || '');
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// ---------- 自动顺延 ----------

/** 自动顺延配置：默认值合并 + 读侧强类型化（enable 认 false/'false'/'0'/'no'，数值越界回默认） */
export function readAutoPostpone(wiki: any): Record<string, any> {
  const raw = { ...AUTOPOSTPONE_DEFAULTS, ...readJson(wiki, sched.AUTOPOSTPONE_CONFIG_TITLE) };
  return {
    enable: boolish(raw.enable, AUTOPOSTPONE_DEFAULTS.enable),
    maxPriority: num(raw.maxPriority, AUTOPOSTPONE_DEFAULTS.maxPriority, 0, 100),
    postponeDays: num(raw.postponeDays, AUTOPOSTPONE_DEFAULTS.postponeDays, 1, 3650),
    keepTop: num(raw.keepTop, AUTOPOSTPONE_DEFAULTS.keepTop, 0, 100000),
    maxOverdueThreshold: num(raw.maxOverdueThreshold, AUTOPOSTPONE_DEFAULTS.maxOverdueThreshold, 0, 100000),
  };
}

export function writeAutoPostpone(wiki: any, patch: Record<string, any>): void {
  if (!wiki) return;
  const next = { ...readAutoPostpone(wiki), ...patch };
  wiki.addTiddler({ title: sched.AUTOPOSTPONE_CONFIG_TITLE, type: 'application/json', text: JSON.stringify(next) });
}

// ---------- 语义切分 ----------

/**
 * 语义切分配置：默认值合并 + enable 强类型化。
 * 只认 text JSON（设置页唯一写入口）——历史上的字段级 apiKey 兼容分支无任何生产写入方，已删。
 */
export function readSemanticSplit(wiki: any): Record<string, any> {
  const raw = { ...SEMANTIC_SPLIT_DEFAULTS, ...readJson(wiki, ns.SEMANTIC_SPLIT_TITLE) };
  return {
    enable: boolish(raw.enable, SEMANTIC_SPLIT_DEFAULTS.enable),
    apiKey: String(raw.apiKey ?? '').trim(),
    baseUrl: String(raw.baseUrl ?? '').trim(),
    model: String(raw.model ?? '').trim(),
    maxParas: num(raw.maxParas, SEMANTIC_SPLIT_DEFAULTS.maxParas, 1, 10000),
  };
}

export function writeSemanticSplit(wiki: any, patch: Record<string, any>): void {
  if (!wiki) return;
  const next = { ...readSemanticSplit(wiki), ...patch };
  wiki.addTiddler({ title: ns.SEMANTIC_SPLIT_TITLE, type: 'application/json', text: JSON.stringify(next) });
}

// ---------- 全局学习流（「开始学习」的队列构成） ----------

export const QUEUE_MIX_DEFAULT = '4:1';
const QUEUE_MODE_TITLE = ns.QUEUE_MODE_TITLE;
const QUEUE_MIX_TITLE = ns.QUEUE_MIX_TITLE;
const QUEUE_ORDERS = ['due-new', 'new-due', 'random'];

/** 交错比例默认值：与 QUEUE_MIX_DEFAULT 同源解析（改默认值只改那一处字符串） */
function defaultMix(): { item: number; topic: number } {
  const mm = /^(\d+)\s*[:：]\s*(\d+)$/.exec(QUEUE_MIX_DEFAULT);
  return { item: mm ? Number(mm[1]) : 4, topic: mm ? Number(mm[2]) : 1 };
}

/** 队列选项：QueueMode（''=纯测试卡 / interleaved=交错 / strict=三段式）+ QueueMix（item:topic 交错的本地化调节，
 *  SuperMemo 以统一优先级队列自然混合 topic/item，无独立比例旋钮）。读取合并默认值。 */
export function readQueueOptions(wiki: any): { topics: boolean; mode: 'interleaved' | 'strict'; itemRatio: number; topicRatio: number } {
  const m = String(wiki.getTiddlerText?.(QUEUE_MODE_TITLE, '') || '').trim();
  const topics = m !== '';
  const mode: 'interleaved' | 'strict' = topics && m === 'strict' ? 'strict' : 'interleaved';
  const dflt = defaultMix();
  const mm = /^(\d+)\s*[:：]\s*(\d+)$/.exec(String(wiki.getTiddlerText?.(QUEUE_MIX_TITLE, '') || '').trim());
  return {
    topics,
    mode,
    itemRatio: mm ? Math.max(1, Number(mm[1])) : dflt.item,
    topicRatio: mm ? Math.max(1, Number(mm[2])) : dflt.topic,
  };
}

export function writeQueueOptions(
  wiki: any,
  patch: { topics?: boolean; mode?: 'interleaved' | 'strict'; itemRatio?: number; topicRatio?: number },
): void {
  if (!wiki) return;
  const cur = readQueueOptions(wiki);
  const topics = patch.topics ?? cur.topics;
  const mode: 'interleaved' | 'strict' = patch.mode ?? cur.mode;
  wiki.addTiddler({ title: QUEUE_MODE_TITLE, text: topics ? (mode === 'strict' ? 'strict' : 'interleaved') : '' });
  if (patch.itemRatio !== undefined || patch.topicRatio !== undefined) {
    const ir = Math.max(1, Math.floor(Number(patch.itemRatio ?? cur.itemRatio) || 4));
    const tr = Math.max(1, Math.floor(Number(patch.topicRatio ?? cur.topicRatio) || 1));
    wiki.addTiddler({ title: QUEUE_MIX_TITLE, text: `${ir}:${tr}` });
  }
}

// ---------- 复习优先级动态（评分 → tidme.priority 增量；core/grade 消费） ----------

const PRIORITY_DYNAMICS_TITLE = ns.PRIORITY_DYNAMICS_TITLE;

/**
 * 读取优先级动态配置：四档增量缺省 0/0/+5/+10（及格降优先、遗忘不动——优先级是
 * 重要性，间隔是记忆状态）；enable=false/'false'/'0'/'no' 关闭。字段值原样透传，
 * 数值 coercion 与缺档回退由 scheduler.priorityDeltaForRating 统一处理。
 */
export function readPriorityDynamics(wiki: any): Record<string, any> {
  const f = wiki?.getTiddler?.(PRIORITY_DYNAMICS_TITLE)?.fields || {};
  return {
    enable: boolish(f.enable, true),
    again: f.again,
    hard: f.hard,
    good: f.good,
    easy: f.easy,
  };
}

// ---------- 复习日志保留 ----------

/** 复习日志保留天数默认值（启动调度器按此修剪旧条目；0 = 永久保留） */
export const LOG_RETENTION_DEFAULT_DAYS = 90;
/** 保留天数配置地址（唯一产地在 core/ns；此别名保留既有引用） */
export const LOG_RETENTION_TITLE = ns.LOG_RETENTION_TITLE;

/** 复习日志保留天数：未配置 → 默认 90；显式 0 → 永久保留（不修剪）；非法/负数 → 默认 */
export function readLogRetentionDays(wiki: any): number {
  const raw = String(wiki.getTiddlerText?.(LOG_RETENTION_TITLE, '') ?? '').trim();
  if (raw === '') return LOG_RETENTION_DEFAULT_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return LOG_RETENTION_DEFAULT_DAYS;
  return Math.floor(n);
}

export function writeLogRetentionDays(wiki: any, days: number): void {
  if (!wiki) return;
  const n = Math.max(0, Math.floor(Number(days) || 0));
  wiki.addTiddler({ title: LOG_RETENTION_TITLE, text: String(n) });
}

// ---------- 学习日换天时刻（Rollover Hour，对标 Anki 默认 4:00 AM） ----------

export const ROLLOVER_HOUR_DEFAULT = 4;

export function readRolloverHour(wiki: any): number {
  if (!wiki) return ROLLOVER_HOUR_DEFAULT;
  const raw = String(wiki.getTiddlerText?.(ns.ROLLOVER_HOUR_TITLE, '') || wiki.getTiddler?.(ns.ROLLOVER_HOUR_TITLE)?.fields?.text || '').trim();
  if (raw === '') return ROLLOVER_HOUR_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 23) return ROLLOVER_HOUR_DEFAULT;
  return Math.floor(n);
}

export function writeRolloverHour(wiki: any, hour: number): void {
  if (!wiki) return;
  const n = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)));
  wiki.addTiddler({ title: ns.ROLLOVER_HOUR_TITLE, text: String(n) });
}

// ---------- PDF 导入与 LLM-OCR ----------

/** PDF/OCR 与语义切分配置地址（唯一产地在 core/ns；此处别名保留既有引用） */
export const OCR_TITLE = ns.OCR_TITLE;
export const SEMANTIC_SPLIT_TITLE = ns.SEMANTIC_SPLIT_TITLE;

/** OCR 配置；apiKey 留空 = 复用「语义切分」的 Key（同一 OpenAI 兼容账号体系）。
 *  Key 复用判断走 readSemanticSplit（与读取同源），不再单独 readJson 一份。 */
export function readOcrConfig(wiki: any): { enable: boolean; model: string; baseUrl: string; apiKey: string } {
  const raw = { enable: false, model: 'gpt-4o-mini', baseUrl: '', apiKey: '', ...readJson(wiki, OCR_TITLE) };
  const cfg = {
    enable: boolish(raw.enable, false),
    model: String(raw.model ?? '') || 'gpt-4o-mini',
    baseUrl: String(raw.baseUrl ?? ''),
    apiKey: String(raw.apiKey ?? ''),
  };
  if (!cfg.apiKey) {
    const sem = readSemanticSplit(wiki);
    if (sem.apiKey) cfg.apiKey = String(sem.apiKey);
  }
  return cfg;
}

export function writeOcrConfig(wiki: any, patch: { enable?: boolean; model?: string; baseUrl?: string; apiKey?: string }): void {
  if (!wiki) return;
  const next = { ...readOcrConfig(wiki), ...patch };
  const stored: Record<string, any> = { enable: boolish(next.enable, false), model: next.model, baseUrl: next.baseUrl };
  // 与语义切分 Key 一致时不落盘：保持「留空 = 复用」语义长期有效
  const semKey = String(readSemanticSplit(wiki).apiKey || '');
  if (next.apiKey && next.apiKey !== semKey) stored.apiKey = next.apiKey;
  wiki.addTiddler({ title: OCR_TITLE, type: 'application/json', text: JSON.stringify(stored) });
}

// ---------- 默认牌组参数（读写一律经 core/deck 唯一入口） ----------

export function readDefaultDeckParams(wiki: any): Record<string, any> {
  const f = deckMod.getDeck(wiki, deckMod.DEFAULT_DECK)?.fields || {};
  let p: Record<string, any> = {};
  try {
    const v = JSON.parse(f.p || '{}');
    if (v && typeof v === 'object') p = v;
  } catch {
    /* 非法 p 宽容兜底（FSRS 侧另有整体验证） */
  }
  return {
    order: DECK_ORDERS.includes(String(f.order)) ? String(f.order) : 'due-new',
    // 缺省与 $:/Deck/default 的字段同值（sched.DECK_PARAM_DEFAULTS 单一产地；曾写死 365 与牌组的 36500 差 100 倍）
    leech_threshold: num(f.leech_threshold, sched.DECK_PARAM_DEFAULTS.leechThreshold, 1, 10000),
    request_retention: num(p.request_retention, sched.DECK_PARAM_DEFAULTS.requestRetention, 0.5, 1),
    maximum_interval: num(p.maximum_interval, sched.DECK_PARAM_DEFAULTS.maximumInterval, 1, 365000),
    learn_random: boolish(f.random_learn, false),
  };
}

export function writeDefaultDeckParams(wiki: any, patch: Record<string, any>): void {
  if (!wiki) return;
  const deck = deckMod.getDeck(wiki, deckMod.DEFAULT_DECK);
  if (!deck) return;
  const out: Record<string, any> = {};
  if (patch.order !== undefined && DECK_ORDERS.includes(String(patch.order))) {
    out.order = String(patch.order);
  }
  if (patch.leech_threshold !== undefined) {
    const n = Number(patch.leech_threshold);
    if (Number.isFinite(n)) out.leech_threshold = String(Math.max(1, Math.floor(n)));
  }
  if (patch.learn_random !== undefined) {
    // 学习步随机（对齐 SuperMemo 的 Randomize final drill）：重写 state_learn 消费方读取的标记字段
    // null = 删除标记（updateDeck 的删字段语义）
    out.random_learn = patch.learn_random ? 'yes' : null;
  }
  if (patch.request_retention !== undefined || patch.maximum_interval !== undefined) {
    let p: Record<string, any> = {};
    try {
      const v = JSON.parse(deck.fields.p || '{}');
      if (v && typeof v === 'object') p = v;
    } catch {
      /* 兜底重建（保留后续合并出的子键） */
    }
    if (patch.request_retention !== undefined) {
      const r = Number(patch.request_retention);
      if (Number.isFinite(r)) p.request_retention = Math.min(1, Math.max(0.5, r));
    }
    if (patch.maximum_interval !== undefined) {
      const m = Number(patch.maximum_interval);
      if (Number.isFinite(m)) p.maximum_interval = Math.max(1, Math.floor(m));
    }
    out.p = JSON.stringify(p);
  }
  deckMod.updateDeck(wiki, deckMod.DEFAULT_DECK, out);
}
