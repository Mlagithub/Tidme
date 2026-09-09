/*
core/display.ts — 展示层纯函数（徽章/标签/标题/日期）
仅把字段渲染为可读文本；不写库、不查询文档树。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');

export function badgeOf(fields: Record<string, any>, wiki?: any): { text: string; cls: string } {
  if (fields['tidme.suspended'] === 'yes') return { text: '⏸', cls: 'tm-badge-suspended' };
  if (sched.isCardDone(fields)) return { text: '✓', cls: 'tm-badge-done' };
  const state = String(fields.state || '0');
  if (state === '1' || state === '3') {
    return { text: wiki ? lingoMod.lingo(wiki, 'badge.learn', 'L') : 'L', cls: 'tm-badge-learn' };
  }
  if (state === '2') {
    const overdue = schema.parseTwDate(fields.due).getTime() < Date.now();
    return overdue
      ? { text: wiki ? lingoMod.lingo(wiki, 'badge.overdue', '!') : '!', cls: 'tm-badge-overdue' }
      : { text: wiki ? lingoMod.lingo(wiki, 'badge.due', 'D') : 'D', cls: 'tm-badge-due' };
  }
  return { text: wiki ? lingoMod.lingo(wiki, 'badge.new', 'N') : 'N', cls: 'tm-badge-new' };
}

export function kindMark(fields: Record<string, any>, wiki?: any): string {
  const sub = String(fields['tidme.subkind'] || '');
  if (sub === 'extract') return wiki ? lingoMod.lingo(wiki, 'kind.extract', 'E') : 'E';
  if (sub === 'cloze') return wiki ? lingoMod.lingo(wiki, 'kind.cloze', 'C') : 'C';
  if (sub === 'qa') return wiki ? lingoMod.lingo(wiki, 'kind.qa', 'Q') : 'Q';
  return '';
}

export function stateLabel(fields: Record<string, any>, wiki?: any): string {
  const b = badgeOf(fields, wiki);
  // 出队语义优先（done/ignored/suspended）—— 否则 done 卡仍显示 "到期/已逾期" 误导
  if (b.text === '✓') return wiki ? lingoMod.lingo(wiki, 'state.read', 'Read') : 'Read';
  if (b.text === '⏸') return wiki ? lingoMod.lingo(wiki, 'state.suspended', 'Suspended') : 'Suspended';
  const state = String(fields.state || '0');
  if (state === '1' || state === '3') return wiki ? lingoMod.lingo(wiki, 'state.learning', 'Learning') : 'Learning';
  if (state === '2') {
    const overdue = schema.parseTwDate(fields.due).getTime() < Date.now();
    return overdue
      ? (wiki ? lingoMod.lingo(wiki, 'state.overdue', 'Overdue') : 'Overdue')
      : (wiki ? lingoMod.lingo(wiki, 'state.due', 'Due') : 'Due');
  }
  return wiki ? lingoMod.lingo(wiki, 'state.new', 'New') : 'New';
}

export function dueLabel(fields: Record<string, any>): string {
  if (String(fields.state || '0') !== '2') return '—';
  const d = schema.parseTwDate(fields.due);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export function intervalLabel(fields: Record<string, any>, wiki?: any): string {
  const s = Number(fields.scheduled_days);
  if (!Number.isFinite(s) || s <= 0) return '—';
  const unit = wiki ? lingoMod.lingo(wiki, 'unit.days', 'd') : 'd';
  return `${Math.round(s)}${unit}`;
}

export function repsLabel(fields: Record<string, any>): string {
  return fields.reps !== undefined && fields.reps !== '' ? String(fields.reps) : '—';
}

export function lapsesLabel(fields: Record<string, any>): string {
  return fields.lapses !== undefined && fields.lapses !== '' ? String(fields.lapses) : '—';
}

export function diffLabel(fields: Record<string, any>): string {
  const d = Number(fields.difficulty);
  return Number.isFinite(d) && d > 0 ? `${Math.round(d * 100)}%` : '—';
}

export function dateLabel(raw: any): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  const d = schema.parseTwDate(raw);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

/**
 * 显示名（命名空间 title 可读化）：caption ?? breadcrumb 末段 ?? title 末段。
 * title=路径（Tidme/Books/<slug>/<hash>）后，所有列表/表格显示一律经此，禁止裸显 title。
 */
export function displayTitle(fields: Record<string, any> | null | undefined, title?: string): string {
  const cap = fields && fields.caption !== undefined && fields.caption !== '' ? String(fields.caption).trim() : '';
  if (cap) return cap;
  const br = fields && fields['tidme.breadcrumb']
    ? String(fields['tidme.breadcrumb']).split(ns.CRUMB_SEP).pop()?.trim() || ''
    : '';
  if (br) return br;
  const t = String(title ?? '');
  const i = t.lastIndexOf('/');
  return (i >= 0 ? t.slice(i + 1) : t).trim() || t;
}

/**
 * caption 字段的可读文本：有些 caption 是 wikitext 转义（如牌组 caption = {{$:/language/tidme/default}}），
 * 不能直接当纯文本 textContent。含转义时用 renderText 解析为纯文本；否则原样返回（避免无谓开销）。
 */
export function captionText(wiki: any, caption: unknown, widget?: any): string {
  const raw = String(caption ?? '').trim();
  if (!raw) return raw;
  if (!/\{\{|<<|\$\([^)]*\)/.test(raw)) return raw;
  try {
    return wiki.renderText('text/plain', 'text/vnd.tiddlywiki', raw, { parentWidget: widget });
  } catch {
    // 解析失败：剥掉明显未决的 {{...}} 转义，退回可读形式
    const stripped = raw.replace(/\{\{[^}]+\}\}/g, '').trim();
    return stripped || raw;
  }
}
