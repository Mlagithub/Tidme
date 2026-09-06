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
const semMod = require('$:/plugins/keepone/tidme/core/server/semantic-split');

/** 自动顺延默认值（enable 默认关闭：不自动改用户数据） */
export const AUTOPOSTPONE_DEFAULTS = {
  enable: false,
  maxPriority: 60,
  postponeDays: 7,
  keepTop: 10,
  maxOverdueThreshold: 0,
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

export function readAutoPostpone(wiki: any): Record<string, any> {
  return { ...AUTOPOSTPONE_DEFAULTS, ...readJson(wiki, sched.AUTOPOSTPONE_CONFIG_TITLE) };
}

export function writeAutoPostpone(wiki: any, patch: Record<string, any>): void {
  if (!wiki) return;
  const next = { ...readAutoPostpone(wiki), ...patch };
  wiki.addTiddler({ title: sched.AUTOPOSTPONE_CONFIG_TITLE, type: 'application/json', text: JSON.stringify(next) });
}

// ---------- 语义切分 ----------

export function readSemanticSplit(wiki: any): Record<string, any> {
  const cfg = { ...SEMANTIC_SPLIT_DEFAULTS, ...readJson(wiki, semMod.SEMANTIC_SPLIT_CONFIG_TITLE) };
  // 历史兼容：apiKey/baseUrl/model 允许写在 tiddler 字段上（字段优先于 JSON）
  const f = wiki.getTiddler(semMod.SEMANTIC_SPLIT_CONFIG_TITLE)?.fields || {};
  if (f.apiKey) cfg.apiKey = String(f.apiKey).trim();
  if (f.baseUrl) cfg.baseUrl = String(f.baseUrl).trim();
  if (f.model) cfg.model = String(f.model).trim();
  return cfg;
}

export function writeSemanticSplit(wiki: any, patch: Record<string, any>): void {
  if (!wiki) return;
  const next = { ...readSemanticSplit(wiki), ...patch };
  // 统一写 text JSON（字段覆盖仅为历史读兼容，不再新增）
  wiki.addTiddler({ title: semMod.SEMANTIC_SPLIT_CONFIG_TITLE, type: 'application/json', text: JSON.stringify(next) });
}

// ---------- 复习日志保留 ----------

/** 复习日志保留天数默认值（启动调度器按此修剪旧条目；0 = 永久保留） */
export const LOG_RETENTION_DEFAULT_DAYS = 90;
export const LOG_RETENTION_TITLE = '$:/config/Tidme/LogRetention';

export function readLogRetentionDays(wiki: any): number {
  const raw = Number(wiki.getTiddlerText?.(LOG_RETENTION_TITLE, ''));
  if (!Number.isFinite(raw) || raw < 0) return LOG_RETENTION_DEFAULT_DAYS;
  return Math.floor(raw);
}

export function writeLogRetentionDays(wiki: any, days: number): void {
  if (!wiki) return;
  const n = Math.max(0, Math.floor(Number(days) || 0));
  wiki.addTiddler({ title: LOG_RETENTION_TITLE, text: String(n) });
}

// ---------- 默认牌组参数 ----------

export function readDefaultDeckParams(wiki: any): Record<string, any> {
  const f = wiki.getTiddler(deckMod.DEFAULT_DECK)?.fields || {};
  let p: Record<string, any> = {};
  try {
    const v = JSON.parse(f.p || '{}');
    if (v && typeof v === 'object') p = v;
  } catch {
    /* 非法 p 宽容兜底（FSRS 侧另有整体验证） */
  }
  return {
    order: DECK_ORDERS.includes(String(f.order)) ? String(f.order) : 'due-new',
    leech_threshold: Number(f.leech_threshold ?? 8),
    request_retention: Number(p.request_retention ?? 0.9),
    maximum_interval: Number(p.maximum_interval ?? 365),
  };
}

export function writeDefaultDeckParams(wiki: any, patch: Record<string, any>): void {
  if (!wiki) return;
  const deck = wiki.getTiddler(deckMod.DEFAULT_DECK);
  if (!deck) return;
  const fields: Record<string, any> = { ...deck.fields, title: deckMod.DEFAULT_DECK };
  if (patch.order !== undefined && DECK_ORDERS.includes(String(patch.order))) {
    fields.order = String(patch.order);
  }
  if (patch.leech_threshold !== undefined) {
    const n = Number(patch.leech_threshold);
    if (Number.isFinite(n)) fields.leech_threshold = String(Math.max(1, Math.floor(n)));
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
    fields.p = JSON.stringify(p);
  }
  wiki.addTiddler(fields);
}
