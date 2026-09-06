/*
widgets/section.ts — 阅读闭环组件 v3.2

条栏两行布局（信息与按钮分离，全部按钮统一 tm-sec-btn 风格）：
- 第一行（信息）：面包屑 · 位置 X/Y · 本书剩 N 张待学 · 已读状态
- 第二行（按钮）：◀ ▶ ｜ 续读点 ｜ 已读/稍后/提前/忽略 ｜ 制卡 摘录 挖空 ｜ 更多(优先/A-Factor/清提取/删除) ｜ 学习数据 ｜ ？
即时刷新：refresh 检测本文档任何卡 / 本卡 / 续读点变化 → 重建条栏。
全局快捷键：Alt+X 摘录 · Alt+Z 挖空 · Ctrl+F7 设续读点 · Alt+F7 跳转 · Shift+Ctrl+F7 清除
衍生卡（摘录/挖空）显示迷你生命周期条（完成 / 删除）。
<$doc-resume> 文档页「继续阅读」（同样即时刷新）。
*/

declare function require(module: string): any;
const parse = require('$:/plugins/keepone/tidme/import/parse.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const stats = require('$:/plugins/keepone/tidme/core/stats.js');
const dom = require('$:/plugins/keepone/tidme/core/dom.js');
const display = require('$:/plugins/keepone/tidme/core/display.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const paths = require('$:/plugins/keepone/tidme/core/paths.js');
const factory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const selMod = require('$:/plugins/keepone/tidme/import/widgets/selection.js');
const cardModal = require('$:/plugins/keepone/tidme/import/widgets/card-modal.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const dialog = require('$:/plugins/keepone/tidme/core/dialog.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const READPOINT_PREFIX = docOps.READPOINT_PREFIX;
const GLOBAL_READPOINT = docOps.GLOBAL_READPOINT;

import { TidmeLiveEditor } from '../../editor/codemirror-editor';
import { cleanContaminatedHtmlToWikiText } from '../../editor/wikitext-parser';

/**
 * 活动阅读上下文（原共享 CTX 按职责拆分；每个字段单一职责，写入方见注释）。
 * - dispatch：最近渲染的 story 内 widget（section-bar / section-body / doc-resume 均写）。
 *   全局热键等"无组件路径"的事件派发源——tm-navigate/tm-close-tiddler 必须从 story 树内
 *   冒泡到 Navigator，从 rootWidget 派发不会命中。
 * - body：section-body 实例（唯一写入方）——编辑器视图、防抖保存 flush、_isSelfSaving 守卫。
 * - sectionBar：section-bar 实例（唯一写入方）——划词 frameTitle 回退 _title、保存指示器。
 * - docId：最近打开的阅读文档（section-bar / doc-resume 写）——currentDocId 的最后回退。
 */
const active: { dispatch: any; body: any; sectionBar: any; docId: string } = { dispatch: null, body: null, sectionBar: null, docId: '' };

/** 当前可用 wiki：派发源 widget 优先，回退全局 $tw.wiki（浏览器热键路径） */
function activeWiki(): any {
  return active.dispatch?.wiki || (typeof $tw !== 'undefined' ? $tw.wiki : null);
}

// 共享 DOM/文档节查询（实现收敛于 core/dom、core/doc-ops）
const el = dom.el;
/** 某文档的全部正文章节（排除摘录等衍生卡） */
const sectionsOfDoc = docOps.sectionsOfDoc;
// 制卡与加工的唯一实现 = core/card-factory；本文件只保留 DOM/事件壳
const parseAnchor = factory.parseAnchor;
const processedSnippets = factory.processedSnippets;
const cleanProcessedText = factory.cleanProcessedText;
const buildExtract = factory.buildExtract;
const buildCloze = factory.buildCloze;
const buildQA = factory.buildQA;
const commitCard = factory.commitCard;

/**
 * 取 TW 内置图标 SVG（$:/core/images/*）。
 * TW 5.3.x 图标 tiddler 文本含 `\parameters (size:"22pt")` pragma 行 + `<svg width=<<size>> ...>`；
 * 直接取 fields.text 会把 pragma 行泄漏成按钮文字。此处剥离 pragma 行并把 <<size>> 替换为默认 22pt。
 */
function iconSvgOf(wiki: any, name: string): string {
  const t = wiki.getTiddler('$:/core/images/' + name);
  if (!t) return '';
  let svg = String(t.fields.text || '');
  svg = svg.replace(/^\s*\\parameters\s*\([^)]*\)\s*[\r\n]+/m, '');
  svg = svg.replace(/<<size>>/g, '22pt');
  return svg;
}

/** 某文档的全部阅读 Topic（包含正文章节及摘录卡，统一纳入阅读队列与 ◀/▶ 导航调度） */
function topicsOfDoc(wiki: any, doc: string): string[] {
  return wiki
    .filterTiddlers('[has[tidme.doc]nsort[tidme.order]]')
    .filter((t: string) => {
      const f = wiki.getTiddler(t)?.fields;
      if (!f) return false;
      if (String(f['tidme.doc']) !== String(doc)) return false;
      return f['tidme.kind'] === 'topic';
    });
}

/** 已读判定（分类：topic/item 卡 done/ignored 视为完成出队）—— 直接调 sched.isCardDone，无包装 */

// 划词/弹窗共享实现（section-bar 与全局制卡气泡共用）
const frameTitleOfSelection = (win: any) =>
  selMod.frameTitleOfSelection(win, () => active.sectionBar?._title || active.body?._title || active.dispatch?.getVariable?.('currentTiddler') || null);
const getSelectionInfo = (win: any) => selMod.getSelectionInfo(win, () => active.body?._editor?.view || null);
const openCardModal = cardModal.openCardModal;
// 续读点读写唯一实现 = core/doc-ops（与 deleteDocContent 的清理共用同一解析）
const parseReadPoint = docOps.parseReadPoint;
const saveReadPoint = docOps.saveReadPoint;
const clearReadPoint = docOps.clearReadPoint;

function currentDocId(win: any): string | null {
  const title = frameTitleOfSelection(win);
  if (title) {
    const f = activeWiki()?.getTiddler(title)?.fields;
    if (f?.['tidme.doc']) return String(f['tidme.doc']);
  }
  return active.docId || null;
}

function notify(kind: 'extract' | 'cloze' | 'readpoint' | 'select-first' | 'done' | 'later' | 'extract-note') {
  const map = {
    extract: ns.NOTIFY_EXTRACT,
    cloze: ns.NOTIFY_CLOZE,
    readpoint: ns.NOTIFY_READPOINT,
    'select-first': ns.NOTIFY_SELECT_FIRST,
    'extract-note': ns.NOTIFY_EXTRACT_NOTE,
    done: ns.NOTIFY_SECTION_DONE,
    later: ns.NOTIFY_LATER,
  } as const;
  try {
    active.dispatch?.dispatchEvent({ type: 'tm-notify', param: map[kind] });
  } catch { /* ignore */ }
}

function navigate(target: string) {
  try {
    active.dispatch?.dispatchEvent({ type: 'tm-navigate', navigateTo: target });
  } catch { /* ignore */ }
}

/** 关闭当前卡并跳转（避免故事流堆积；评分路径 fsrs4tw repeat 已有关闭） */
function navigateClose(target: string) {
  try {
    active.dispatch?.dispatchEvent({ type: 'tm-close-tiddler' });
    active.dispatch?.dispatchEvent({ type: 'tm-navigate', navigateTo: target });
  } catch { /* ignore */ }
}

/** 清除已渲染 DOM 中指定类的高亮 mark（幂等：制卡/重跑时不叠加） */
function removeMarks(frame: HTMLElement, cls: string) {
  frame.querySelectorAll('mark.' + cls).forEach((m: any) => {
    const p = m.parentNode!;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
  });
}

/** 跨文本节点检索片段（\u0000 连接跨节点拼接）：返回命中位置；找不到返回 null */
function findTextPosition(frame: HTMLElement, snippet: string): { node: Text; offset: number; length: number } | null {
  const doc = frame.ownerDocument;
  const walker = doc.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const hay: string[] = [];
  let n: any;
  while ((n = walker.nextNode())) {
    nodes.push(n as Text);
    hay.push(n.nodeValue || '');
  }
  const all = hay.join('\u0000');
  const needle = snippet.slice(0, Math.min(snippet.length, 80));
  const at = all.indexOf(needle);
  if (at === -1) return null;
  let acc = 0;
  for (let i = 0; i < nodes.length; i++) {
    const len = hay[i].length;
    if (at < acc + len) return { node: nodes[i], offset: at - acc, length: needle.length };
    acc += len + 1;
  }
  return null;
}

/** 在目标节的已渲染 DOM 中查找片段并临时包一层 <mark> */
function highlightSnippetLater(doc: Document, targetTitle: string, snippet: string) {
  if (!snippet) return;
  let tries = 0;
  const tick = () => {
    tries++;
    const escFn = (window as any).CSS?.escape ?? ((s: string) => s);
    const frame = doc.querySelector(`[data-tiddler-title="${escFn(targetTitle)}"]`) as HTMLElement | null;
    if (!frame) {
      if (tries < 30) setTimeout(tick, 120);
      return;
    }
    removeMarks(frame, 'tm-readpoint');
    const hit = findTextPosition(frame, snippet);
    if (!hit) return;
    try {
      const r = doc.createRange();
      r.setStart(hit.node, hit.offset);
      r.setEnd(hit.node, hit.offset + hit.length);
      const mark = doc.createElement('mark');
      mark.className = 'tm-readpoint';
      r.surroundContents(mark);
      mark.scrollIntoView({ block: 'center' });
    } catch { /* 跨复杂边界时放弃高亮 */ }
  };
  setTimeout(tick, 150);
}

/** 检索正文已生成的派生卡（摘录/挖空/问答）并在已渲染 DOM 中加高亮 */
function highlightCardAnchors(wiki: any, doc: Document, parentTitle: string) {
  if (!wiki || !doc) return;
  const childTitles = wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.parent[${parentTitle.replace(/\]/g, '')}]]`);
  if (!childTitles.length) return;

  setTimeout(() => {
    const escFn = (window as any).CSS?.escape ?? ((s: string) => s);
    const frame = doc.querySelector(`[data-tiddler-title="${escFn(parentTitle)}"]`) as HTMLElement | null;
    if (!frame) return;
    // 幂等：清除既有高亮 mark（制卡后重跑时不叠加）
    removeMarks(frame, 'tm-card-highlight');

    for (const title of childTitles) {
      const fields = wiki.getTiddler(title)?.fields;
      if (!fields) continue;
      const anchor = parseAnchor(fields['tidme.anchor']);
      const snippet = anchor?.snippet;
      if (!snippet) continue;

      const subkind = String(fields['tidme.subkind'] || '');
      const cls = subkind === 'cloze' ? 'tm-card-highlight tm-card-highlight--cloze' : subkind === 'qa' ? 'tm-card-highlight tm-card-highlight--qa' : 'tm-card-highlight';

      const hit = findTextPosition(frame, snippet);
      if (!hit) continue;
      try {
        const r = doc.createRange();
        r.setStart(hit.node, hit.offset);
        r.setEnd(hit.node, hit.offset + hit.length);
        const mark = doc.createElement('mark');
        mark.className = cls;
        mark.title = `${subkind === 'cloze' ? '挖空卡' : subkind === 'qa' ? '问答卡' : '摘录卡'}: ${title}`;
        mark.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          navigate(title);
        });
        r.surroundContents(mark);
      } catch { /* 避免多次高亮或节点变动导致异常 */ }
    }
  }, 250);
}

/** 本书 item 类（复习流）在队卡过滤器：唯一产地 = core/scheduler.docItemsFilter。
 * 修复：此前在本处把 ITEM_FILTER 拼进同一字符串产生第二个 run（并集），
 * 会把全库 item（含他书/已读）混进"复习本书"子集牌组与计数。 */
function docItemFilter(wiki: any, docId: string): string {
  return sched.docItemsFilter(docId);
}

// ---------- 动作 ----------
/** 制卡后留在原文：不 navigate（避免视图刷新丢失阅读焦点/滚动），延迟重新高亮派生卡锚点 */
function refreshAnchorsAfterCard(): void {
  const w = activeWiki();
  if (w) {
    const t = active.dispatch?.getVariable?.('currentTiddler') || active.body?._title || active.sectionBar?._title;
    if (t) setTimeout(() => highlightCardAnchors(w, document, t), 200);
  }
}

/** 制卡公共收尾：落库 → 按选区记续读点（SM 对齐：extract/cloze 自动设续读点）→
 *  清选区 → 刷新锚点高亮 → 通知。draft 为空返回 false（由调用方决定提示语）。 */
function commitCardAndReadPoint(win: any, tt: string, draft: Record<string, any> | null, selected: string, kind: 'extract' | 'cloze'): boolean {
  if (!draft) return false;
  commitCard(activeWiki(), draft, active.dispatch);
  const docId = currentDocId(win);
  if (docId) saveReadPoint(activeWiki(), docId, { t: tt, s: selected.replace(/\s+/g, ' ').trim().slice(0, 200) });
  try {
    win?.getSelection?.()?.removeAllRanges();
  } catch { /* ignore */ }
  refreshAnchorsAfterCard();
  notify(kind);
  return true;
}

function actionExtract(win: any) {
  const tt = frameTitleOfSelection(win);
  if (!tt) {
    notify('select-first');
    return;
  }
  const { selected } = getSelectionInfo(win);
  if (selected.length < 2) {
    notify('select-first');
    return;
  }
  // 摘录只属于阅读材料——普通笔记（无 tidme.doc）不提供摘录
  if (!commitCardAndReadPoint(win, tt, buildExtract(activeWiki(), tt, selected), selected, 'extract')) {
    notify('extract-note');
  }
}

function actionCloze(win: any) {
  const tt = frameTitleOfSelection(win);
  if (!tt) {
    notify('select-first');
    return;
  }
  const { selected, block } = getSelectionInfo(win);
  if (!selected || selected.length < 1) {
    notify('select-first');
    return;
  }

  const fields = buildCloze(activeWiki(), tt, block || selected, selected);
  if (!fields) {
    notify('select-first');
    return;
  }

  openCardModal(win.document || document, 'cloze', String(fields.caption || ''), (res) => {
    fields.caption = res.answerOrCloze;
    commitCardAndReadPoint(win, tt, fields, selected, 'cloze');
  });
}

function actionQA(win: any) {
  const tt = frameTitleOfSelection(win);
  if (!tt) {
    notify('select-first');
    return;
  }
  const { selected } = getSelectionInfo(win);
  if (!selected || selected.length < 1) {
    notify('select-first');
    return;
  }
  openCardModal(win.document || document, 'qa', selected, (res) => {
    const fields = buildQA(activeWiki(), tt, res.question, res.answerOrCloze);
    // 历史口径：QA 完成沿用 "cloze" 通知（notify map 无 qa 项）
    commitCardAndReadPoint(win, tt, fields, selected, 'cloze');
  });
}

function actionSetReadPoint(win: any) {
  const tt = frameTitleOfSelection(win);
  const docId = currentDocId(win);
  if (!docId) return;
  const { selected } = getSelectionInfo(win);
  const snippet = selected ? selected.slice(0, 200) : '';
  const target = tt || parseReadPoint(activeWiki(), docId)?.t || sectionsOfDoc(activeWiki(), docId)[0];
  if (!target) return;
  saveReadPoint(activeWiki(), docId, { t: target, s: snippet });
  highlightSnippetLater(document, target, snippet);
  notify('readpoint');
}

function actionGotoReadPoint(win: any) {
  const docId = currentDocId(win);
  if (!docId) return;
  const rp = parseReadPoint(activeWiki(), docId);
  if (!rp) return;
  highlightSnippetLater(document, rp.t, rp.s);
  navigateClose(rp.t);
}

function actionClearReadPoint(win: any) {
  const docId = currentDocId(win);
  if (!docId) return;
  clearReadPoint(activeWiki(), docId);
  removeMarks(document.body as HTMLElement, 'tm-readpoint');
}

// ---------- 全局快捷键与生命周期钩子（模块级只注册一次；仅浏览器环境） ----------
if (typeof document !== 'undefined') {
  const KEYMAP: Record<string, (e: KeyboardEvent) => boolean> = {
    'alt+x': (e) => e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'x',
    'alt+z': (e) => e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z',
    'alt+q': (e) => e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'q',
    'ctrl+f7': (e) => e.ctrlKey && !e.shiftKey && e.key === 'F7',
    'alt+f7': (e) => e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'F7',
    'shift+ctrl+f7': (e) => e.ctrlKey && e.shiftKey && e.key === 'F7',
  };
  const ACTIONS: Record<string, () => void> = {
    'alt+x': () => actionExtract(document.defaultView || globalThis),
    'alt+z': () => actionCloze(document.defaultView || globalThis),
    'alt+q': () => actionQA(document.defaultView || globalThis),
    'ctrl+f7': () => actionSetReadPoint(document.defaultView || globalThis),
    'alt+f7': () => actionGotoReadPoint(document.defaultView || globalThis),
    'shift+ctrl+f7': () => actionClearReadPoint(document.defaultView || globalThis),
  };
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = String((e.target as any)?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (e.target as any)?.isContentEditable) return;
    for (const key of Object.keys(KEYMAP)) {
      if (KEYMAP[key](e)) {
        e.preventDefault();
        ACTIONS[key]();
        return;
      }
    }
  }, true);

  // TW 关闭 / 离开 / 页面隐藏时自动保存沉浸式编辑器中未刷盘修改
  const flushCurrentWidget = () => {
    active.body?._flushSave?.();
  };
  window.addEventListener('beforeunload', flushCurrentWidget);
  window.addEventListener('pagehide', flushCurrentWidget);
}

// ---------- Widgets ----------

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

function makeSectionBar(): WidgetCtor {
  class SectionBarWidget extends Widget {
    _startTime: number = 0;
    _flushReadTime: () => void = () => {};
    _showStats: boolean = false;
    _isReadingMode: boolean = false; // 默认沉浸式 Word 实时可编辑模式
    _saveTimer: any = null;
    _dirtyText: string | null = null;
    _flushSave() {
      active.body?._flushSave?.();
    }

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const title = this.getVariable('currentTiddler');
      const t = title && this.wiki.getTiddler(title);
      if (!t || !t.fields['tidme.doc']) return;

      active.dispatch = this;
      active.sectionBar = this;
      const docId = String(t.fields['tidme.doc']);
      active.docId = docId;

      this._startTime = Date.now();
      this._flushReadTime = () => {
        if (this._startTime && this.wiki && this._docId) {
          const elapsedSec = (Date.now() - this._startTime) / 1000;
          this._startTime = Date.now();
          if (elapsedSec >= 1 && elapsedSec <= 7200) {
            stats.recordReadTime(this.wiki, this._docId, elapsedSec);
          }
        }
      };

      // 响应式：保存身份与根节点，refresh 时按需重建（信息即时更新）
      this._title = title;
      this._docId = docId;
      const root = el(doc, 'div', 'tm-section-bar');
      this._root = root;

      // 全局续读点（最近打开的阅读卡）：仅在条栏挂载时写一次。
      // 勿移回 build()——refresh 重建同样走 build，渲染路径不允许携带写库副作用。
      this.wiki.addTiddler({ title: GLOBAL_READPOINT, text: title });

      this.build();

      parent.insertBefore(root, nextSibling);
      this.domNodes.push(root);

      // 制卡按钮置灰（B：未在本文档选中文字时禁用摘录/挖空）——监听选区变化实时更新
      if (!this._selBound) {
        this._selBound = true;
        const win = (doc as any).defaultView || globalThis;
        const d = doc || win?.document;
        if (d && typeof d.addEventListener === 'function') {
          d.addEventListener('selectionchange', () => this._syncPick_());
          d.addEventListener('mouseup', () => this._syncPick_());
          d.addEventListener('keyup', () => this._syncPick_());
        }
        this._syncPick_();
      }
    }

    /** 更新制卡按钮可用性并调起划词气泡 */
    _syncPick_() {
      const btns: any[] = this._pickBtns || [];
      const win = (this.document as any).defaultView || globalThis;
      const { selected } = getSelectionInfo(win);
      const hasSel = selected.length > 0;

      for (const b of btns) {
        if (hasSel) {
          b.removeAttribute('disabled');
          (b as any).disabled = false;
        } else {
          b.setAttribute('disabled', 'true');
          (b as any).disabled = true;
        }
      }
      this._updateSelectionBubble_();
    }

    /** 划词浮动气泡菜单（兼容标准 DOM Range 选区） */
    _updateSelectionBubble_() {
      const win = (this.document as any).defaultView || globalThis;
      const doc = this.document;
      if (!doc || !doc.body) return;
      // 只管理自己的气泡（tm-section-bubble）；全局制卡气泡（tm-pick-bubble）不归它管，
      // 否则任意阅读条栏实例会在每次 mouseup 时按共享类名删掉全局气泡（制卡气泡消失的根因）
      let bubble = doc.querySelector('.tm-section-bubble') as HTMLElement;

      const sel = win?.getSelection?.();
      let selectedText = '';
      let rect: DOMRect | null = null;

      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        const selectedTitle = frameTitleOfSelection(win);
        if (!selectedTitle || selectedTitle === this._title) {
          selectedText = sel.toString().trim();
          try {
            const range = sel.getRangeAt(0);
            rect = range.getBoundingClientRect();
          } catch {
            rect = null;
          }
        }
      }

      if (!selectedText || !rect || (rect.width === 0 && rect.height === 0)) {
        if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
        return;
      }

      if (!bubble) {
        bubble = el(doc, 'div', 'tm-selection-bubble tm-section-bubble') as HTMLElement;
        doc.body.appendChild(bubble);
      }
      bubble.textContent = '';

      const mkB = (lbl: string, icon: string, onClick: () => void) => {
        const btn = el(doc, 'button', 'tm-selection-bubble-btn', `${icon} ${lbl}`);
        btn.addEventListener('mousedown', (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        });
        return btn;
      };

      bubble.appendChild(mkB('摘录', '✂️', () => actionExtract(win)));
      bubble.appendChild(mkB('挖空', '🧩', () => actionCloze(win)));
      bubble.appendChild(mkB('问答', '❓', () => actionQA(win)));

      const scrollX = win.scrollX || win.pageXOffset || 0;
      const scrollY = win.scrollY || win.pageYOffset || 0;
      bubble.style.left = `${rect.left + rect.width / 2 + scrollX}px`;
      bubble.style.top = `${rect.top + scrollY}px`;
    }

    build() {
      const doc = this.document;
      const win = (doc as any).defaultView || globalThis; // 服务器/无头环境兜底
      const wiki = this.wiki;
      const title = this._title;
      const docId = this._docId;
      const t = wiki.getTiddler(title);
      if (!t) return;
      const fields = t.fields;
      const root = this._root;
      root.textContent = '';

      const mkBtn = (label: string, variant: string, tip: string, disabled = false, onClick?: () => void, icon?: string) => {
        const b = el(doc, 'button', variant ? `tm-sec-btn tm-sec-btn--${variant}` : 'tm-sec-btn', label);
        b.title = tip;
        if (disabled) b.setAttribute('disabled', 'true');
        if (onClick) b.addEventListener('click', onClick);
        if (icon) {
          const svg = iconSvgOf(wiki, icon);
          if (svg) {
            b.innerHTML = svg + label;
            b.classList.add('tm-sec-btn-icon');
          }
        }
        return b;
      };

      // 两行布局：第一行信息，第二行按钮
      const infoRow = el(doc, 'div', 'tm-section-row tm-section-info');
      const btnRow = el(doc, 'div', 'tm-section-row tm-section-btns');
      const sep = () => btnRow.appendChild(el(doc, 'span', 'tm-bar-sep'));
      const gotoSection = (target: string) => {
        this._flushReadTime?.();
        saveReadPoint(wiki, docId, { t: target, s: '' });
        this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
        this.dispatchEvent({ type: 'tm-navigate', navigateTo: target });
      };

      const removeTitleFromSession = (targetTitle: string) => {
        sessionMod.removeFromSession(wiki, targetTitle);
      };
      /**
       * 调度判定（统一走 core/scheduler）：
       * 未完成/未忽略/未搁置且 due ≤ now（sched.isDueNow）——
       * 顺延/评分写出的未来排期卡不被"下一张/已读后推进"提前重放。
       */
      const learnable = (t: string): boolean => sched.isDueNow(wiki.getTiddler(t)?.fields);
      /**
       * 下一张可调度卡（阅读流统一决策 = core/scheduler.nextSchedulable）：
       * 1. 全局学习会话（若当前卡在其中）→ 2. 本文档 topic 顺序。
       * section-bar 的 ▶/已读/稍后/忽略 全部经此推进，无分散重复实现。
       */
      const getScheduledNext = (): string | null => {
        const sess = sessionMod.getSession(wiki);
        if (sess && sess.list.indexOf(title) !== -1) {
          const n = sched.nextSchedulable(sess.list, title, learnable);
          if (n) return n;
        }
        return sched.nextSchedulable(topicsOfDoc(wiki, docId), title, learnable);
      };
      /** 出队后离开当前卡：移出会话 + 关闭 +（有下一张时）记录续读点并跳转 */
      const leaveTo = (nxt: string | null) => {
        removeTitleFromSession(title);
        this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
        if (nxt) {
          docOps.prepareCardFold(wiki, nxt);
          saveReadPoint(wiki, docId, { t: nxt, s: '' });
          this.dispatchEvent({ type: 'tm-navigate', navigateTo: nxt });
        }
      };
      /** ▶ 下一节：走统一调度引擎 getScheduledNext（学习会话优先 → 本文档回退）。
       * 开始学习发起的交错会话中，▶ 会推进到会话下一卡（可能是知识卡），
       * 避免用户一直困在阅读材料里；无会话时则在同一文档内跳下一可读节。 */
      const gotoNextDoc = () => {
        const nxt = getScheduledNext();
        if (!nxt) return;
        // ▶ 会话中 = 明确"跳过本卡"：移出会话，避免滞留卡被复习流"下一张"
        // （从会话头找）反复拉回 → 摘录↔词卡 1:1 死循环。
        removeTitleFromSession(title);
        docOps.prepareCardFold(wiki, nxt);
        saveReadPoint(wiki, docId, { t: nxt, s: '' });
        this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
        this.dispatchEvent({ type: 'tm-navigate', navigateTo: nxt });
      };

      // 1. 测试卡 (Item：挖空卡 / 问答卡)
      const subkind = fields['tidme.subkind'];
      if (subkind === 'cloze' || subkind === 'qa') {
        const kindName = subkind === 'cloze' ? '挖空卡' : '问答卡';
        const span = el(doc, 'span', 'tm-import-muted');
        span.appendChild(doc.createTextNode(`${kindName} · 源自 `));
        const link = el(doc, 'a', 'tc-tiddlylink', String(fields['tidme.parent'] || ''));
        link.href = '#';
        link.addEventListener('click', (e: Event) => {
          e.preventDefault();
          this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
          this.dispatchEvent({ type: 'tm-navigate', navigateTo: String(fields['tidme.parent']) });
        });
        span.appendChild(link);
        infoRow.appendChild(span);
        root.appendChild(infoRow);

        const anchor = parseAnchor(fields['tidme.anchor']);
        if (anchor) {
          btnRow.appendChild(mkBtn('↩ 回原文', 'rp', '跳回原文并高亮此片段', false, () => {
            this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
            this.dispatchEvent({ type: 'tm-navigate', navigateTo: anchor.section });
            highlightSnippetLater(doc, anchor.section, anchor.snippet);
          }));
        }

        btnRow.appendChild(mkBtn('完成', 'done', '读完此卡：移出队列并关闭', false, () => {
          this._flushReadTime?.();
          wiki.addTiddler(sched.doneCard(fields));
          const backTo = fields['tidme.parent'] || '';
          this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
          if (backTo) this.dispatchEvent({ type: 'tm-navigate', navigateTo: backTo });
          notify('done');
        }));
        btnRow.appendChild(mkBtn('删除', 'del', '彻底删除此卡', false, () => {
          this._flushSave();
          this._flushReadTime?.();
          wiki.deleteTiddler(title);
          const backTo = fields['tidme.parent'] || '';
          this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
          if (backTo) this.dispatchEvent({ type: 'tm-navigate', navigateTo: backTo });
        }));
        root.appendChild(btnRow);
        return;
      }

      // 2. 阅读主体 (Topic：普通阅读节 + 摘录卡 Extract)
      const fullList = topicsOfDoc(wiki, docId);
      // 过滤出在待读队列中的 Topic（或当前打开卡），使 ◀ / ▶ 导航自动跳过已完成已读的卡片
      const queueList = fullList.filter((x) => !sched.isCardDone(wiki.getTiddler(x)?.fields) || x === title);
      const { prev, next } = parse.neighborsOf(queueList, title);
      const index = fullList.indexOf(title);
      // ▶ 下一节目标 = 统一调度（会话优先，与已读后推进一致；无会话=本文档内下一可读）
      const schedNext = getScheduledNext();
      const rp = parseReadPoint(wiki, docId);
      const left = fullList.filter((x) => !sched.isCardDone(wiki.getTiddler(x)?.fields)).length;

      // 第一行：摘录源提示（若为摘录卡）· 面包屑 · 位置 · 本书剩余 · 优先级 · 已读状态 · 自动保存指示
      if (subkind === 'extract') {
        const span = el(doc, 'span', 'tm-import-muted');
        span.appendChild(doc.createTextNode(`摘录卡 · 源自 `));
        const link = el(doc, 'a', 'tc-tiddlylink', String(fields['tidme.parent'] || ''));
        link.href = '#';
        link.addEventListener('click', (e: Event) => {
          e.preventDefault();
          this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
          this.dispatchEvent({ type: 'tm-navigate', navigateTo: String(fields['tidme.parent']) });
        });
        span.appendChild(link);
        infoRow.appendChild(span);
      }

      // 面包屑点击跳到本书汇总页：真实 doc tiddler title（folder 冲突时含 ~docId 后缀）。
      // 优先卡上已落的 tidme.docpage，其次按 docId 查库，最后才回退重算（B1：不在 UI 重算派生路径）
      const crumbBreadcrumb = String(fields['tidme.breadcrumb'] || '');
      const crumbBook = crumbBreadcrumb.split(ns.CRUMB_SEP)[0] || '';
      const crumbDoc = String(fields['tidme.doc'] || '');
      const crumbDocTitle = String(fields['tidme.docpage'] || '') ||
        docOps.docPageOfDoc(wiki, crumbDoc) ||
        (crumbBook && crumbDoc ? paths.bookRoot(crumbBook, crumbDoc) : crumbBook);
      const crumb = el(doc, 'span', 'tm-section-crumb tm-import-muted', crumbBreadcrumb);
      crumb.title = '点击打开本书汇总页';
      crumb.addEventListener('click', () => {
        this._flushSave();
        this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
        this.dispatchEvent({ type: 'tm-navigate', navigateTo: crumbDocTitle });
      });
      infoRow.appendChild(crumb);

      if (fullList.length > 0 && index >= 0) {
        infoRow.appendChild(el(doc, 'span', 'tm-section-pos tm-import-muted', `　${index + 1} / ${fullList.length}`));
        infoRow.appendChild(el(doc, 'span', 'tm-section-load tm-import-muted', `· 本书剩 ${left} 张待学`));
      }

      const priVal = sched.normalizePriority(fields['tidme.priority']);
      infoRow.appendChild(el(doc, 'span', 'tm-section-pri tm-import-muted', `p${String(priVal).padStart(2, '0')}`));

      if (sched.isCardDone(fields)) {
        infoRow.appendChild(el(doc, 'span', 'tm-section-state', '✓ 已读'));
      }

      // 自动保存状态微标
      this._saveIndicatorEl = el(doc, 'span', 'tm-save-indicator tm-save-indicator--saved', '✓ 已自动保存');
      infoRow.appendChild(this._saveIndicatorEl);
      root.appendChild(infoRow);

      // 第二行：全部按钮
      // 若为摘录卡，包含 ↩ 回原文
      const anchor = parseAnchor(fields['tidme.anchor']);
      if (anchor) {
        btnRow.appendChild(mkBtn('↩ 回原文', 'rp', '跳回原文并高亮此片段', false, () => {
          this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
          this.dispatchEvent({ type: 'tm-navigate', navigateTo: anchor.section });
          highlightSnippetLater(doc, anchor.section, anchor.snippet);
        }));
      }

      btnRow.appendChild(mkBtn('', 'nav', '上一节', !prev, () => {
        if (prev) gotoSection(prev);
      }, 'chevron-left'));
      btnRow.appendChild(mkBtn('', 'nav', '下一节', !schedNext, () => {
        if (schedNext) gotoNextDoc();
      }, 'chevron-right'));

      sep();

      btnRow.appendChild(mkBtn('⏸', 'rp', '设续读点 (Ctrl+F7)：以当前选中文字为锚', false, () => actionSetReadPoint(win)));
      if (rp) {
        if (rp.t !== title) {
          btnRow.appendChild(mkBtn('⏮ ' + (rp.s ? '「' + rp.s.slice(0, 10) + '…」' : rp.t.slice(0, 14)), 'rp', '转到续读点 (Alt+F7)', false, () => actionGotoReadPoint(win)));
        }
        btnRow.appendChild(mkBtn('✕ 清除', 'rpclear', '清除续读点 (Ctrl+Shift+F7)', false, () => actionClearReadPoint(win)));
      }

      sep();

      if (sched.isCardDone(fields)) {
        btnRow.appendChild(mkBtn('重新加入', 'undo', '恢复到学习队列', false, () => {
          this._flushSave();
          wiki.addTiddler(sched.restoreCard(fields));
        }));
      } else {
        btnRow.appendChild(mkBtn('已读', 'done', 'Done！读完此节/摘录，移出学习队列', false, () => {
          this._flushSave();
          this._flushReadTime?.();
          wiki.addTiddler(sched.doneCard(fields));
          leaveTo(getScheduledNext());
          notify('done');
        }));
        btnRow.appendChild(mkBtn('稍后', 'later', '稍后再看 (SM A-Factor)：按优先级指数顺延展期', false, () => {
          this._flushSave();
          this._flushReadTime?.();
          const patch = sched.postponeTopicByAFactor(fields);
          wiki.addTiddler({ ...fields, ...patch });
          leaveTo(getScheduledNext());
          notify('later');
        }));
        btnRow.appendChild(mkBtn('提前', 'advance', '今日抢占排期 (SM Topic 提前)：强行加入今日队列并提升优先级', false, () => {
          this._flushSave();
          const patch = sched.advanceCard();
          const newPri = sched.shiftPriority(fields['tidme.priority'], -10);
          wiki.addTiddler({ ...fields, ...patch, 'tidme.priority': newPri });
          this.build();
        }));
        btnRow.appendChild(mkBtn('忽略', 'ignore', '标记不重要：移出阅读队列', false, () => {
          this._flushSave();
          this._flushReadTime?.();
          leaveTo(getScheduledNext());
          notify('done');
        }));
      }

      sep();

      // 制卡与调控按钮
      const extractBtn = mkBtn('摘录', 'extract', '摘录制卡 (Alt+X)：先选中文字', true, () => actionExtract(win));
      const clozeBtn = mkBtn('挖空', 'cloze', '挖空制卡 (Alt+Z)：先选中文字', true, () => actionCloze(win));
      const qaBtn = mkBtn('问答', 'qa', '问答制卡 (Alt+Q)：先选中文字', true, () => actionQA(win));
      this._pickBtns = [extractBtn, clozeBtn, qaBtn];
      btnRow.appendChild(extractBtn);
      btnRow.appendChild(clozeBtn);
      btnRow.appendChild(qaBtn);

      // —— 低频调控收进「更多」菜单（主行只留高频动作） ——
      const more = el(doc, 'details', 'tm-sec-more');
      more.appendChild(el(doc, 'summary', 'tm-sec-more-summary', '更多'));
      const moreBox = el(doc, 'div', 'tm-sec-more-box');
      more.appendChild(moreBox);
      btnRow.appendChild(more);
      const moreBtn = (label: string, variant: string, tip: string, onClick: () => void) => {
        moreBox.appendChild(mkBtn(label, variant, tip, false, onClick));
      };
      moreBtn('优先↑', 'pri', `提高优先级（当前 p${String(priVal).padStart(2, '0')}，提升 5）`, () => {
        this._flushSave();
        wiki.addTiddler({ ...fields, 'tidme.priority': sched.shiftPriority(priVal, -5) });
        this.build();
      });
      moreBtn('优先↓', 'pri', `降低优先级（当前 p${String(priVal).padStart(2, '0')}，降低 5）`, () => {
        this._flushSave();
        wiki.addTiddler({ ...fields, 'tidme.priority': sched.shiftPriority(priVal, 5) });
        this.build();
      });
      // SM 对齐：A-Factor 可手动修改（Topics：下一次间隔 = 当前间隔 × A-Factor）
      const afVal = sched.normalizeAFactor(fields['tidme.afactor'], sched.afactorForText(Number(fields['tidme.chars'])));
      moreBtn('A×↓', 'pri', `降低 A-Factor（当前 ${afVal.toFixed(1)}：间隔增长更平缓，适合长文/书）`, () => {
        this._flushSave();
        const next = Math.max(1.1, Math.round((afVal - 0.1) * 10) / 10);
        wiki.addTiddler({ ...fields, 'tidme.afactor': String(next) });
        this.build();
      });
      moreBtn(`A×${afVal.toFixed(1)}`, 'pri', `当前 A-Factor（点击重置为按篇幅启发式：短文 2.0 / 长文 1.3）`, () => {
        this._flushSave();
        const fresh = sched.afactorForText(Number(fields['tidme.chars']));
        wiki.addTiddler({ ...fields, 'tidme.afactor': String(fresh) });
        this.build();
      });
      moreBtn('A×↑', 'pri', `提高 A-Factor（当前 ${afVal.toFixed(1)}：间隔增长更快，适合短文快速消化）`, () => {
        this._flushSave();
        const next2 = Math.min(3.0, Math.round((afVal + 0.1) * 10) / 10);
        wiki.addTiddler({ ...fields, 'tidme.afactor': String(next2) });
        this.build();
      });
      // SM 对齐 'Delete processed text'：删除已提取/已挖空/已问答的文本片段（衍生卡保留）
      const snips = processedSnippets(wiki, title);
      if (snips.length) {
        moreBtn('清提取', 'clean', `从本卡原文删除 ${snips.length} 段已被摘录/挖空的文本（衍生卡保留）`, async () => {
          this._flushSave();
          if (
            await dialog.confirmDialog(doc, {
              title: '清提取',
              message: `从本卡原文中删除 ${snips.length} 段已被摘录/挖空的文本？

（摘录/挖空/问答卡本身不受影响）`,
              confirmLabel: '删除',
              danger: true,
            })
          ) {
            cleanProcessedText(wiki, title);
            this.build();
          }
        });
      }
      if (subkind === 'extract') {
        moreBtn('删除摘录', 'del', '彻底删除此摘录卡', () => {
          this._flushSave();
          this._flushReadTime?.();
          wiki.deleteTiddler(title);
          const backTo = fields['tidme.parent'] || '';
          this.dispatchEvent({ type: 'tm-close-tiddler', param: title, tiddlerTitle: title });
          if (backTo) this.dispatchEvent({ type: 'tm-navigate', navigateTo: backTo });
        });
      }

      btnRow.appendChild(mkBtn('学习数据', 'stats', '展开/收起本卡与学习相关的数据', false, () => {
        this._showStats = !this._showStats;
        this.build();
      }));

      btnRow.appendChild(mkBtn('', 'help', '快捷键与用法帮助', false, () => {
        this.dispatchEvent({ type: 'tm-navigate', navigateTo: ns.PAGE_HELP_SHORTCUTS });
      }, 'info-button'));

      root.appendChild(btnRow);

      if (this._showStats) this.buildStatsBox(root, fields, priVal, docId);
    }

    /** 「学习数据」展开面板：本卡 FSRS/优先级/阅读耗时统计（纯展示，无业务写入） */
    buildStatsBox(root: HTMLElement, fields: Record<string, any>, priVal: number, docId: string) {
      const doc = this.document;
      const wiki = this.wiki;
      const statsBox = el(doc, 'div', 'tm-section-stats-box');
      statsBox.style.cssText =
        'margin-top:8px;padding:8px 12px;background:var(--tm-surface-2);color:var(--tm-text-1);border-radius:6px;font-size:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px 12px;border:1px solid var(--tm-border);';
      const addStat = (lbl: string, val: string) => {
        const item = el(doc, 'div', 'tm-stat-item');
        item.appendChild(el(doc, 'strong', '', `${lbl}: `));
        item.appendChild(doc.createTextNode(val));
        statsBox.appendChild(item);
      };

      const stateMap: Record<string, string> = { '0': '新卡 (New)', '1': '学习中 (Learning)', '2': '复习中 (Review)', '3': '重学中 (Relearning)' };
      const stateText = stateMap[String(fields.state || '0')] || '新卡';
      const priLevel = priVal <= 33 ? '高' : priVal <= 66 ? '中' : '低';
      const rtStats = stats.getReadTimeStats(wiki);
      const docSec = rtStats.docSeconds[docId] || 0;

      addStat('优先级', `p${String(priVal).padStart(2, '0')} (${priLevel})`);
      addStat('A-Factor', `${sched.normalizeAFactor(fields['tidme.afactor'], sched.afactorForText(Number(fields['tidme.chars']))).toFixed(2)}（间隔 ×A-Factor）`);
      addStat('卡片类型', String(fields['tidme.kind'] || 'item'));
      addStat('FSRS 状态', stateText);
      // 新卡（state 0/未调度）的 due 只是 FSRS 占位（导入时刻），并非"到期"——不展示为到期时间
      const rawState = String(fields.state || '0');
      addStat('到期时间', rawState === '0' ? '首评后排期' : fields.due ? sched.parseTwDate(fields.due).toLocaleString() : '未排期');
      addStat('稳定性 (S)', fields.stability ? Number(fields.stability).toFixed(2) : '未设置');
      addStat('难度 (D)', fields.difficulty ? Number(fields.difficulty).toFixed(2) : '未设置');
      addStat('复习次数', String(fields.reps || 0));
      addStat('遗忘次数', String(fields.lapses || 0));
      addStat('本书阅读耗时', stats.formatDuration(docSec));
      addStat('今日总阅读', stats.formatDuration(rtStats.todaySeconds));

      root.appendChild(statsBox);
    }

    refresh(changedTiddlers: Record<string, any>) {
      if (active.body?._isSelfSaving) {
        return false;
      }
      // 即时刷新：本文档任何卡 / 本卡 / 续读点 变化 → 重建条栏（信息与按钮保持最新）
      if (!this._root || !this._title || !this._docId) return false;
      let need = false;
      for (const title of Object.keys(changedTiddlers || {})) {
        if (title === this._title || title === READPOINT_PREFIX + this._docId) {
          need = true;
          break;
        }
        const f = this.wiki.getTiddler(title)?.fields;
        if (f && (f['tidme.doc'] === this._docId || f['tidme.parent'] === this._title)) {
          need = true;
          break;
        }
      }
      if (need) {
        this.build();
        return true;
      }
      return false;
    }
  }
  return SectionBarWidget as any;
}

/** 文档页横幅区：进度（大数字 + 进度条）+ 继续阅读 + 复习本书（子集牌组）+ 清理阅读材料 */
function appendDocBanner(widget: any, doc: Document, wiki: any, wrap: HTMLElement, title: string, docId: string, all: string[]) {
  // 进度横幅（卡片化）：大数字 + 进度条 + 主按钮
  const done = all.filter((x) => sched.isCardDone(wiki.getTiddler(x)?.fields)).length;
  const left = all.length - done;
  const banner = el(doc, 'div', 'tm-doc-banner');
  // 左侧：进度数字 + 进度条
  const prog = el(doc, 'div', 'tm-doc-prog');
  const progNum = el(doc, 'div', 'tm-doc-prog-num', '');
  progNum.appendChild(el(doc, 'span', 'tm-doc-prog-done', String(done)));
  progNum.appendChild(el(doc, 'span', 'tm-doc-prog-total', ` / ${all.length}`));
  prog.appendChild(progNum);
  prog.appendChild(el(doc, 'div', 'tm-doc-prog-label', `剩余 ${left} 节待学`));
  const barWrap = el(doc, 'div', 'tm-stat-bar tm-stat-bar-lg', '');
  const bar = el(doc, 'span', 'tm-stat-bar-fill', '');
  bar.style.width = all.length ? `${Math.round((done / all.length) * 100)}%` : '0%';
  barWrap.appendChild(bar);
  prog.appendChild(barWrap);
  banner.appendChild(prog);
  // 右侧：主按钮
  const actions = el(doc, 'div', 'tm-doc-banner-actions');
  const btn = el(doc, 'button', 'tm-btn tm-btn--primary', '继续阅读');
  btn.addEventListener('click', () => {
    const rp = parseReadPoint(wiki, docId);
    const list = all.filter((x) => !sched.isCardDone(wiki.getTiddler(x)?.fields));
    // 优先跳到续读点（须当前可读），否则第一张 due≤now 的卡；全未来排期退回 list[0]
    const readable = list.filter((x) => sched.isDueNow(wiki.getTiddler(x)?.fields));
    const target = (rp && readable.includes(rp.t) ? rp.t : null) || readable[0] || list[0];
    if (target) {
      widget.dispatchEvent({ type: 'tm-close-tiddler' }); // 关闭文档页，进入阅读
      widget.dispatchEvent({ type: 'tm-navigate', navigateTo: target });
    }
  });
  actions.appendChild(btn);
  banner.appendChild(actions);
  wrap.appendChild(banner);

  // 子集复习：按本书强制复习 item（临时子集 deck → 复用 fsrs4tw 学习流）。
  // 分类对齐 SuperMemo：只测本书测试卡（item），节卡与摘录（topic）走阅读流。
  const itemFilter = docItemFilter(wiki, docId);
  const inQueueCount = wiki.filterTiddlers(itemFilter).length;
  if (inQueueCount > 0) {
    const subsetBtn = el(doc, 'button', 'tm-btn tm-btn--primary', '复习本书');
    subsetBtn.title = `子集复习：仅复习本书 ${inQueueCount} 张挖空/问答卡（临时牌组，复习完可删除）`;
    subsetBtn.addEventListener('click', () => {
      // 子集牌组放"文档页所在 folder 的 Decks 镜像"（folder 冲突带 ~docId 后缀时亦准确）：
      // 文档页 title == folder 根（含后缀），Books→Decks 即 decks 根（镜像推导见 core/ns）
      const deckRoot = ns.booksToDecksRoot(String(title)) || `${ns.NS_DECKS}${paths.leafIdOf(title)}`;
      const deckTitle = `${deckRoot}/复习本书`;
      const docFields = wiki.getTiddler(title)?.fields || {};
      // 统一走 core/deck（低层 fsrs4tw 字段由 configToFields 生成；重复点击 = 刷新 card）
      const cfg: any = {
        name: deckTitle,
        kind: 'subset',
        sourceDoc: docId,
        card: itemFilter,
        caption: `复习：${display.displayTitle(docFields, title)}`,
        description: '临时子集牌组（复习本书测试卡）——复习完可删除',
      };
      if (deckMod.getDeck(wiki, deckTitle)) deckMod.updateDeck(wiki, deckTitle, deckMod.configToFields(wiki, cfg));
      else deckMod.createDeck(wiki, cfg);
      widget.dispatchEvent({ type: 'tm-navigate', navigateTo: deckTitle });
    });
    // 并入横幅右侧操作区
    const bannerActions = wrap.querySelector('.tm-doc-banner-actions');
    if (bannerActions) bannerActions.appendChild(subsetBtn);
    else wrap.appendChild(subsetBtn);
  }

  // 清理阅读材料（文档页 + 节卡/大纲新节）→ 摘录/挖空/问答/手动散卡等知识产物保留 → 跳回阅读列表
  const docLabel = display.displayTitle(wiki.getTiddler(title)?.fields, title);
  const delBook = el(doc, 'button', 'tm-btn tm-btn--ghost', '清理阅读材料');
  delBook.title = '删除文档页与全部普通节卡；已提取的知识（摘录/挖空/问答）保留在复习流';
  delBook.addEventListener('click', async () => {
    if (
      await dialog.confirmDialog(doc, {
        title: '清理阅读材料',
        message: `删除《${docLabel}》的阅读材料？

将删除文档页与全部普通节卡（含大纲手动插入的新节）。
已提取的知识（摘录/挖空/问答/手动卡）会保留，不受影响。
此操作不可恢复。`,
        confirmLabel: '删除',
        danger: true,
      })
    ) {
      docOps.deleteDocContent(wiki, docId);
      widget.dispatchEvent({ type: 'tm-navigate', navigateTo: ns.PAGE_READING_LIST });
    }
  });
  const cleanActions = wrap.querySelector('.tm-doc-banner-actions');
  if (cleanActions) cleanActions.appendChild(delBook);
  else wrap.appendChild(delBook);
}

/** 已读区：列出已读节，可"重新加入"队列（恢复可逆性，替代 8 秒撤销窗口） */
function appendDocDoneSection(doc: Document, wiki: any, wrap: HTMLElement, all: string[]) {
  const doneTitles = all.filter((x) => sched.isCardDone(wiki.getTiddler(x)?.fields));
  if (!doneTitles.length) return;
  const doneBox = el(doc, 'details', 'tm-doc-done');
  const summary = el(doc, 'summary', 'tm-import-muted', `已读卡（${doneTitles.length}）—— 可重新加入`);
  doneBox.appendChild(summary);
  const table = el(doc, 'table', 'tm-doc-table tm-doc-done-table');
  const thead = el(doc, 'thead', '');
  const htr = el(doc, 'tr', '');
  for (const h of ['名称', '操作']) htr.appendChild(el(doc, 'th', '', h));
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = el(doc, 'tbody', '');
  for (const dt of doneTitles) {
    const tr = el(doc, 'tr', 'tm-doc-done-row');
    const doneFields = wiki.getTiddler(dt)?.fields || {};
    tr.appendChild(el(doc, 'td', 'tm-cb-name', display.displayTitle(doneFields, dt)));
    const actTd = el(doc, 'td', 'tm-cb-actions', '');
    const back = el(doc, 'button', 'tm-btn tm-btn--ghost', '重新加入');
    back.title = '恢复到学习队列';
    back.addEventListener('click', () => {
      const f = wiki.getTiddler(dt)?.fields;
      if (f) wiki.addTiddler(sched.restoreCard(f));
    });
    actTd.appendChild(back);
    tr.appendChild(actTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const doneScroll = el(doc, 'div', 'tm-scroll-sm');
  doneScroll.appendChild(table);
  doneBox.appendChild(doneScroll);
  wrap.appendChild(doneBox);
}

/** 摘录收件箱：聚合本书全部摘录/挖空卡（加工路径：可回原文、挖空、删除）。
 *  分类：subkind extract/cloze（摘录=阅读材料待加工；挖空=测试卡） */
function appendDerivedInbox(widget: any, doc: Document, wiki: any, wrap: HTMLElement, docId: string) {
  const derived = wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.doc[${docId}]!is[draft]]`)
    .map((t: string) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }))
    .filter((c: any) => c.fields['tidme.subkind'] === 'extract' || c.fields['tidme.subkind'] === 'cloze');
  if (!derived.length) return;
  const box = el(doc, 'details', 'tm-doc-derived');
  const summary = el(doc, 'summary', 'tm-import-muted', `摘录/挖空（${derived.length}）—— 摘录可挖空成卡片`);
  box.appendChild(summary);
  const sorted = [...derived].sort((a: any, b: any) => {
    const pa = String(a.fields['tidme.breadcrumb'] || a.title);
    const pb = String(b.fields['tidme.breadcrumb'] || b.title);
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });
  const clozeChildrenOf = (t: string): number => wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.parent[${t.replace(/\]/g, '')}]tidme.subkind[cloze]]`).length;
  const table = el(doc, 'table', 'tm-doc-table tm-doc-derived-table');
  const thead = el(doc, 'thead', '');
  const htr = el(doc, 'tr', '');
  for (const h of ['', '名称', '加工', '操作']) htr.appendChild(el(doc, 'th', '', h));
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = el(doc, 'tbody', '');
  for (const c of sorted) {
    const tr = el(doc, 'tr', 'tm-doc-done-row');
    const kindTd = el(doc, 'td', '', '');
    const kindMark = c.fields['tidme.subkind'] === 'cloze' ? '挖' : '摘';
    kindTd.appendChild(el(doc, 'span', 'tm-cb-kind', kindMark));
    tr.appendChild(kindTd);
    tr.appendChild(el(doc, 'td', 'tm-cb-name', display.displayTitle(c.fields, c.title)));
    // 摘录加工状态（可挖空/已挖空）
    const stateTd = el(doc, 'td', '', '');
    if (c.fields['tidme.subkind'] === 'extract') {
      const hasCloze = clozeChildrenOf(c.title) > 0;
      const state = el(doc, 'span', hasCloze ? 'tm-cb-state tm-cb-state-done' : 'tm-cb-state', hasCloze ? '已挖空' : '可挖空');
      state.title = hasCloze ? '已在此摘录上挖空成卡片' : '选中文字按 Alt+Z 挖空成卡片';
      stateTd.appendChild(state);
    }
    tr.appendChild(stateTd);
    const actTd = el(doc, 'td', 'tm-cb-actions', '');
    const open = el(doc, 'button', 'tm-btn tm-btn--ghost', '打开');
    open.title = '打开此卡';
    open.addEventListener('click', () => {
      widget.dispatchEvent({ type: 'tm-navigate', navigateTo: c.title });
    });
    actTd.appendChild(open);
    const back = el(doc, 'button', 'tm-btn tm-btn--ghost', '回原文');
    back.title = '跳回原文并高亮';
    back.addEventListener('click', () => {
      const anchor = parseAnchor(c.fields['tidme.anchor']);
      const target = anchor?.section || c.fields['tidme.parent'] || '';
      if (target) {
        widget.dispatchEvent({ type: 'tm-navigate', navigateTo: target });
        if (anchor?.snippet) highlightSnippetLater(doc, target, anchor.snippet);
      }
    });
    actTd.appendChild(back);
    const del = el(doc, 'button', 'tm-btn tm-btn--ghost tm-cb-del', '删除');
    del.title = '删除此卡';
    del.addEventListener('click', () => {
      wiki.deleteTiddler(c.title);
      widget.dispatchEvent({ type: 'tm-tidme-queue-changed' });
    });
    actTd.appendChild(del);
    tr.appendChild(actTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const scrollBox = el(doc, 'div', 'tm-scroll');
  scrollBox.appendChild(table);
  box.appendChild(scrollBox);
  wrap.appendChild(box);
}

function makeDocResume(): WidgetCtor {
  class DocResumeWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const title = this.getVariable('currentTiddler');
      const t = title && this.wiki.getTiddler(title);
      if (!t || !t.fields['tidme.doc']) return;
      active.dispatch = this;
      const docId = String(t.fields['tidme.doc']);

      this._title = title;
      this._docId = docId;
      const wrap = el(doc, 'div', 'tm-doc-resume');
      this._root = wrap;

      this.build();

      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }

    build() {
      const doc = this.document;
      const wiki = this.wiki;
      const wrap = this._root;
      wrap.textContent = '';

      const all = sectionsOfDoc(wiki, this._docId);
      appendDocBanner(this, doc, wiki, wrap, this._title, this._docId, all);
      appendDocDoneSection(doc, wiki, wrap, all);
      appendDerivedInbox(this, doc, wiki, wrap, this._docId);
    }

    refresh(changedTiddlers: Record<string, any>) {
      // 即时刷新：本文档任何卡变化 → 重建进度与已读区
      if (!this._root || !this._title || !this._docId) return false;
      let need = false;
      for (const title of Object.keys(changedTiddlers || {})) {
        if (title === READPOINT_PREFIX + this._docId) {
          need = true;
          break;
        }
        const f = this.wiki.getTiddler(title)?.fields;
        if (f && f['tidme.doc'] === this._docId) {
          need = true;
          break;
        }
      }
      if (need) {
        this.build();
        return true;
      }
      return false;
    }
  }
  return DocResumeWidget as any;
}

function makeSectionBody(): WidgetCtor {
  class SectionBodyWidget extends Widget {
    _saveTimer: any = null;
    _dirtyText: string | null = null;
    _editor: TidmeLiveEditor | null = null;
    _isSelfSaving: boolean = false;

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const title = this.getVariable('currentTiddler');
      const t = title && this.wiki.getTiddler(title);
      if (!t) return;

      active.dispatch = this;
      active.body = this;
      this._title = title;

      const editorContainer = el(doc, 'div', 'tm-live-wysiwyg-container');
      parent.insertBefore(editorContainer, nextSibling);
      this.domNodes.push(editorContainer);

      const rawText = String(t.fields.text || '');
      const initialWikiText = cleanContaminatedHtmlToWikiText(rawText);
      if (rawText !== initialWikiText) {
        // 自动修复历史污染的数据并标记需要保存
        this._dirtyText = initialWikiText;
        this._flushSave();
      } else {
        this._dirtyText = null;
      }

      // 实例化 CodeMirror 6 Obsidian 风格 Live Preview 编辑器
      this._editor = new TidmeLiveEditor({
        parent: editorContainer,
        initialText: initialWikiText,
        onInput: (newText: string) => {
          if (newText === initialWikiText) return;
          this._dirtyText = newText;
          if (active.sectionBar && active.sectionBar._saveIndicatorEl) {
            active.sectionBar._saveIndicatorEl.textContent = '💾 保存中...';
            active.sectionBar._saveIndicatorEl.className = 'tm-save-indicator tm-save-indicator--saving';
          }
          if (this._saveTimer) clearTimeout(this._saveTimer);
          this._saveTimer = setTimeout(() => {
            this._flushSave();
          }, 1200);
        },
        onBlur: () => {
          this._flushSave();
        },
      });

      highlightCardAnchors(this.wiki, doc, title);
    }

    _flushSave() {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      if (this._dirtyText !== null && this._title && this.wiki) {
        const tiddler = this.wiki.getTiddler(this._title);
        if (tiddler) {
          this._isSelfSaving = true;
          // 100% 保持原始 WikiText 格式与条目类型不变，无缝落盘
          this.wiki.addTiddler({ ...tiddler.fields, text: this._dirtyText });
        }
        this._dirtyText = null;
        if (active.sectionBar && active.sectionBar._saveIndicatorEl) {
          active.sectionBar._saveIndicatorEl.textContent = '✓ 已自动保存';
          active.sectionBar._saveIndicatorEl.className = 'tm-save-indicator tm-save-indicator--saved';
        }
      }
    }

    refresh(changedTiddlers: Record<string, any>) {
      if (this._isSelfSaving) {
        this._isSelfSaving = false;
        return false;
      }
      if (this._title && changedTiddlers[this._title]) {
        this.refreshSelf();
        return true;
      }
      return false;
    }
  }
  return SectionBodyWidget as any;
}

exports['section-bar'] = makeSectionBar();
exports['section-body'] = makeSectionBody();
exports['doc-resume'] = makeDocResume();
