/*
card-query.ts — 卡片查询语法（对标 Anki Browse 的搜索框：一框即查询）

纯函数：解析 + 匹配，不查 wiki、不写库。管理器的搜索框、将来的"保存的搜索条件"都走这里，
避免展示层各写一套子串比较（曾只有标题/面包屑子串，无法表达"tag: 且 到期 且 失误数"）。

语法（空白分隔，全部条件 AND；`key:value` 之外的部分按自由文本处理）：
  tag:汉字                 标签（精确，忽略大小写）
  deck:中药                命中所属牌组标题/名称（子串，需 ctx.deckNamesOf 提供）
  is:new|learn|due|suspended|ignored|done|buried|leech|review
  due:<=7 | due:<0        到期日不晚于 N 天后（0 = 今天或已逾期；负数 = 已逾期 N 天以上）
  ivl:>=21 | ivl:<=7       间隔（scheduled_days）
  stab:>=30 | stab:<=5     稳定度（stability）
  diff:>=80 | diff:<=40    难度（difficulty）
  lapses:>=8 | reps:>=5    失误数 / 复习次数
  priority:<=20            优先级（0 最高）
  parent:笔记甲             同一父源（tidme.parent，精确）
  其它自由文本              标题或面包屑子串（忽略大小写）
*/

export interface CardQueryContext {
  /** 卡片所属牌组的可搜索名称（caption/title）；缺省 = deck: 条件不生效 */
  deckNamesOf?: (title: string) => string[];
  /** 判定基准时刻（due: 用），缺省 = 现在 */
  now?: Date;
  /** 学习日换天时刻（is:due/is:buried 的当日埋卡判定用），缺省 = 4（与全局默认一致） */
  rolloverHour?: number;
}

declare function require(module: string): any;
// 日期解析唯一产地 = core/schema（勿内联第二份解析——17 位串语义漂移过一次）
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const parseDate = (v: unknown): number | null => {
  const d = schema.tryParseTwDate(v);
  return d ? d.getTime() : null;
};

export interface CardQuery {
  /** 原始查询串（回显/保存用） */
  raw: string;
  text: string[];
  tags: string[];
  decks: string[];
  states: string[];
  parent?: string;
  dueNotLaterThanDays?: number;
  intervalMin?: number;
  intervalMax?: number;
  stabilityMin?: number;
  stabilityMax?: number;
  difficultyMin?: number;
  difficultyMax?: number;
  lapsesMin?: number;
  repsMin?: number;
  priorityMax?: number;
}

const STATE_KEYS = new Set(['new', 'learn', 'due', 'review', 'suspended', 'ignored', 'done', 'buried', 'leech']);

function cmpValue(token: string): { op: '<' | '<=' | '>' | '>=' | '='; value: number } | null {
  const m = /^(<=|>=|<|>|=)?\s*(-?\d+(?:\.\d+)?)$/.exec(token.trim());
  if (!m) return null;
  const op = (m[1] || '=') as '<' | '<=' | '>' | '>=' | '=';
  return { op, value: Number(m[2]) };
}

/** 把比较式落到上下界（`<=`/`<` 落 max，`>=`/`>` 落 min，`=` 同时落） */
function applyCmp(
  parsed: { op: string; value: number },
  setMin: (n: number) => void,
  setMax: (n: number) => void,
): void {
  switch (parsed.op) {
    case '<':
      setMax(parsed.value - 1e-9);
      break;
    case '<=':
      setMax(parsed.value);
      break;
    case '>':
      setMin(parsed.value + 1e-9);
      break;
    case '>=':
      setMin(parsed.value);
      break;
    default:
      setMin(parsed.value);
      setMax(parsed.value);
  }
}

export function parseCardQuery(text: string): CardQuery {
  const q: CardQuery = { raw: String(text || ''), text: [], tags: [], decks: [], states: [] };
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    // key 只认「字母前缀 + 冒号」，冒号兼容全角「：」——中文输入法会自动把 ':' 变成 '：'，
    // 不归一化的话整个条件被当自由文本、静默零结果（真实踩坑）。纯自由文本里的 '：' 不受影响。
    const m = /^([A-Za-z]+)[：:](.*)$/.exec(tok);
    if (!m) {
      q.text.push(tok.toLowerCase());
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2];
    if (!value) continue;
    switch (key) {
      case 'tag':
      case 'tags':
        q.tags.push(value.toLowerCase());
        break;
      case 'deck':
        q.decks.push(value.toLowerCase());
        break;
      case 'is':
      case 'state': {
        for (const s of value.toLowerCase().split(',').filter(Boolean)) {
          if (STATE_KEYS.has(s)) q.states.push(s);
        }
        break;
      }
      case 'parent':
        q.parent = value;
        break;
      case 'due': {
        const c = cmpValue(value.replace(/^<=/, '<=')); // due:7 视为 due:<=7（"7 天内到期"）
        if (c) q.dueNotLaterThanDays = c.op === '>=' || c.op === '>' ? q.dueNotLaterThanDays : c.value;
        break;
      }
      case 'ivl':
      case 'interval': {
        const c = cmpValue(value);
        if (c) applyCmp(c, (n) => (q.intervalMin = n), (n) => (q.intervalMax = n));
        break;
      }
      case 'stab':
      case 'stability': {
        const c = cmpValue(value);
        if (c) applyCmp(c, (n) => (q.stabilityMin = n), (n) => (q.stabilityMax = n));
        break;
      }
      case 'diff':
      case 'difficulty': {
        const c = cmpValue(value);
        if (c) applyCmp(c, (n) => (q.difficultyMin = n), (n) => (q.difficultyMax = n));
        break;
      }
      case 'lapses': {
        const c = cmpValue(value);
        if (c && (c.op === '>=' || c.op === '>' || c.op === '=')) q.lapsesMin = c.op === '>' ? c.value + 1e-9 : c.value;
        break;
      }
      case 'reps': {
        const c = cmpValue(value);
        if (c && (c.op === '>=' || c.op === '>' || c.op === '=')) q.repsMin = c.op === '>' ? c.value + 1e-9 : c.value;
        break;
      }
      case 'priority':
      case 'pri': {
        const c = cmpValue(value);
        if (c && (c.op === '<=' || c.op === '<' || c.op === '=')) q.priorityMax = c.op === '<' ? c.value - 1e-9 : c.value;
        break;
      }
      default:
        // 未知 key: 按自由文本处理（避免"输错就静默无结果"）
        q.text.push(tok.toLowerCase());
    }
  }
  return q;
}

/** 单卡匹配（字段 + 标题 + 可选牌组名解析） */
export function matchCardQuery(
  fields: Record<string, any>,
  title: string,
  query: CardQuery,
  ctx: CardQueryContext = {},
): boolean {
  const f = fields || {};
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const now = ctx.now || new Date();
  const rolloverHour = ctx.rolloverHour ?? 4;
  const state = String(f.state ?? '0').trim() || '0';
  // 埋卡字段存的是「埋入时的学习日」，次日自动失效——只有等于当前学习日才算埋着。
  // 曾按「字段存在即埋着」判定：昨天埋的卡早已回队，is:due 却永远查不到它（真实踩坑）。
  const buried = String(f['tidme.buried'] ?? '') === schema.learningDayOf(now, rolloverHour);
  const done = f['tidme.done'] === 'yes' || f['tidme.ignored'] === 'yes';
  const tags = (Array.isArray(f.tags) ? f.tags : String(f.tags || '').split(/\s+/)).map((t: string) => String(t).toLowerCase());

  for (const t of query.tags) {
    if (!tags.includes(t)) return false;
  }
  if (query.decks.length) {
    const names = (ctx.deckNamesOf ? ctx.deckNamesOf(title) : []).map((n) => n.toLowerCase());
    for (const d of query.decks) {
      if (!names.some((n) => n.includes(d))) return false;
    }
  }
  if (query.parent !== undefined && String(f['tidme.parent'] ?? '') !== query.parent) return false;

  for (const s of query.states) {
    const ok = s === 'new'
      ? state === '0'
      : s === 'learn'
      ? (state === '1' || state === '3')
      : s === 'review'
      ? state === '2'
      : s === 'due'
      ? (state === '2' && !done && !buried && (() => {
        const due = parseDate(f.due);
        return due !== null && due <= (ctx.now || new Date()).getTime();
      })())
      : s === 'suspended'
      ? f['tidme.suspended'] === 'yes'
      : s === 'ignored'
      ? f['tidme.ignored'] === 'yes'
      : s === 'done'
      ? f['tidme.done'] === 'yes'
      : s === 'buried'
      ? buried
      : s === 'leech'
      ? (f['tidme.leech'] === 'yes' || (num(f.lapses) ?? 0) >= 8)
      : false;
    if (!ok) return false;
  }

  if (query.dueNotLaterThanDays !== undefined) {
    const due = parseDate(f.due);
    if (due === null) return false;
    const limit = (ctx.now || new Date()).getTime() + query.dueNotLaterThanDays * 86400000;
    if (due > limit) return false;
  }
  const checks: Array<[number | undefined, number | undefined, number | null]> = [
    [query.intervalMin, query.intervalMax, num(f.scheduled_days)],
    [query.stabilityMin, query.stabilityMax, num(f.stability)],
    [query.difficultyMin, query.difficultyMax, num(f.difficulty)],
    [query.lapsesMin, undefined, num(f.lapses)],
    [query.repsMin, undefined, num(f.reps)],
    [undefined, query.priorityMax, num(f['tidme.priority'])],
  ];
  for (const [min, max, v] of checks) {
    if (min === undefined && max === undefined) continue;
    if (v === null) return false;
    if (min !== undefined && v < min) return false;
    if (max !== undefined && v > max) return false;
  }

  if (query.text.length) {
    const hay = `${title} ${f['tidme.breadcrumb'] ?? ''} ${f.caption ?? ''}`.toLowerCase();
    for (const t of query.text) {
      if (!hay.includes(t)) return false;
    }
  }
  return true;
}
