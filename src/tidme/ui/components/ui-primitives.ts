/*
manager/widgets/ui-primitives.ts — 通用 UI 元件构建器
提供指标卡网格、声明式表格、操作列表卡片等通用数据与仪表盘 UI。
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const reactive = require('$:/plugins/keepone/tidme/core/reactive.js');
const el = dom.el;

// 0. 空状态（Empty State）
export interface EmptyOptions {
  text: string;
  icon?: string;
  actionText?: string;
  onAction?: (e: MouseEvent) => void;
  className?: string;
}

export function renderEmpty(
  doc: Document,
  options: EmptyOptions | string,
): HTMLElement {
  const opts: EmptyOptions = typeof options === 'string' ? { text: options } : options;
  const wrap = el(doc, 'div', 'tm-empty' + (opts.className ? ' ' + opts.className : ''));
  if (opts.icon) {
    wrap.appendChild(el(doc, 'div', 'tm-empty-icon', opts.icon));
  }
  wrap.appendChild(el(doc, 'div', '', opts.text));
  if (opts.actionText && opts.onAction) {
    const btn = el(doc, 'a', 'tc-tiddlylink', opts.actionText);
    btn.href = '#';
    btn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      opts.onAction!(e);
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

// 0.1 进度条（Progress Bar）
export interface ProgressBarOptions {
  showText?: boolean;
  textFormat?: (done: number, total: number, pct: number) => string;
  className?: string;
}

export function renderProgressBar(
  doc: Document,
  done: number,
  total: number,
  options: ProgressBarOptions = {},
): HTMLElement {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const barWrap = el(doc, 'span', 'tm-progress tm-stat-bar' + (options.className ? ' ' + options.className : ''));
  const bar = el(doc, 'span', 'tm-progress-fill tm-stat-bar-fill', '');
  bar.style.width = `${pct}%`;
  barWrap.appendChild(bar);

  if (options.showText) {
    const fmt = options.textFormat || ((d, t, p) => `${d}/${t} (${p}%)`);
    barWrap.appendChild(el(doc, 'span', 'tm-progress-text', fmt(done, total, pct)));
  }
  return barWrap;
}

// 0.2 Widget 响应式刷新绑定（集中管理属性计算与 reactive 嗅探）
export function bindWidgetRefresh(
  widget: any,
  changedTiddlers: Record<string, any>,
  rebuildFn: () => void,
  options?: {
    checkRelevant?: (wiki: any, changed: Record<string, any>) => boolean;
  },
): boolean {
  if (typeof widget.computeAttributes === 'function') {
    const changedAttributes = widget.computeAttributes();
    if (Object.keys(changedAttributes).length > 0) {
      if (typeof widget.refreshSelf === 'function') {
        widget.refreshSelf();
        return true;
      }
    }
  }
  const checker = options?.checkRelevant || reactive.hasCardDataChange;
  if (!checker(widget.wiki, changedTiddlers)) return false;
  return reactive.rebuildSoon(rebuildFn);
}

// 1. 指标卡（Metric Cards）
export interface MetricCardItem {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}

export function renderMetricCards(
  doc: Document,
  container: HTMLElement,
  cards: MetricCardItem[],
): HTMLElement {
  const grid = el(doc, 'div', 'tm-stat-cards');
  for (const c of cards) {
    const card = el(doc, 'div', 'tm-stat-card' + (c.highlight ? ' tm-stat-card--highlight' : ''));
    card.appendChild(el(doc, 'div', 'tm-stat-num', String(c.value)));
    card.appendChild(el(doc, 'div', 'tm-stat-label', c.label));
    if (c.sub) {
      card.appendChild(el(doc, 'div', 'tm-stat-sub', c.sub));
    }
    grid.appendChild(card);
  }
  container.appendChild(grid);
  return grid;
}

// 2. 声明式数据表格（TableView）
export interface TableColumn<T = any> {
  key: string;
  title: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (row: T, index: number) => HTMLElement | string;
}

export interface TableConfig<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  emptyText?: string;
}

export function renderTable<T = any>(
  doc: Document,
  container: HTMLElement,
  config: TableConfig<T>,
): HTMLElement {
  const wrap = el(doc, 'div', 'tm-table-wrap');
  if (!config.data || config.data.length === 0) {
    const empty = renderEmpty(doc, config.emptyText || '暂无数据');
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return wrap;
  }

  const table = el(doc, 'table', 'tm-table');
  const thead = el(doc, 'thead');
  const htr = el(doc, 'tr');
  for (const col of config.columns) {
    const th = el(doc, 'th', '', col.title);
    if (col.align) th.style.textAlign = col.align;
    if (col.width) th.style.width = col.width;
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = el(doc, 'tbody');
  for (let i = 0; i < config.data.length; i++) {
    const row = config.data[i];
    const tr = el(doc, 'tr');
    for (const col of config.columns) {
      const td = el(doc, 'td');
      if (col.align) td.style.textAlign = col.align;
      if (col.render) {
        const res = col.render(row, i);
        if (typeof res === 'string') {
          td.textContent = res;
        } else if (res && (res as any).nodeType) {
          td.appendChild(res);
        }
      } else {
        td.textContent = String((row as any)[col.key] ?? '');
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
  return wrap;
}

// 3. 操作列表行（Action List Item）
export interface ActionListItem {
  id?: string;
  title: string;
  sub?: string;
  progress?: { done: number; total: number };
  badge?: { text: string; cls?: string };
  action?: {
    label: string;
    cls?: string;
    onClick: () => void;
  };
}

export function renderActionList(
  doc: Document,
  container: HTMLElement,
  items: ActionListItem[],
  emptyText?: string,
): HTMLElement {
  const wrap = el(doc, 'div', 'tm-action-list');
  if (!items || items.length === 0) {
    if (emptyText) {
      wrap.appendChild(renderEmpty(doc, emptyText));
    }
    container.appendChild(wrap);
    return wrap;
  }

  for (const item of items) {
    const row = el(doc, 'div', 'tm-today-read-row tm-action-row');

    // 标题
    const nameEl = el(doc, 'span', 'tm-today-read-name', item.title);
    row.appendChild(nameEl);

    // 进度条
    if (item.progress && item.progress.total > 0) {
      const { done, total } = item.progress;
      const barWrap = el(doc, 'span', 'tm-progress tm-stat-bar');
      const bar = el(doc, 'span', 'tm-progress-fill tm-stat-bar-fill', '');
      bar.style.width = `${Math.round((done / total) * 100)}%`;
      barWrap.appendChild(bar);
      row.appendChild(barWrap);

      const countEl = el(doc, 'span', 'tm-today-read-count', `${done}/${total}`);
      row.appendChild(countEl);
    }

    // 徽章
    if (item.badge) {
      const b = el(doc, 'span', 'tm-badge ' + (item.badge.cls || ''), item.badge.text);
      row.appendChild(b);
    }

    // 操作按钮
    if (item.action) {
      const btn = el(doc, 'button', 'tm-btn tm-btn--sm ' + (item.action.cls || ''), item.action.label);
      btn.addEventListener('click', item.action.onClick);
      row.appendChild(btn);
    }

    wrap.appendChild(row);
  }

  container.appendChild(wrap);
  return wrap;
}
