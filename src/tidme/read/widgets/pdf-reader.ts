/*
widgets/pdf-reader.ts — PDF 阅读器（tidme-pdf-reader）

数据：currentTiddler 字段 tidme.asset（二进制标题）/ tidme.pages（"起-止"，仅存量
分节书籍携带）/ tidme.doc。
- 二进制缺失/为空（服务端 0 字节 .pdf 等）→ 状态条提供「重新绑定 PDF」原位恢复，
  选原始文件覆写二进制条目，续读点/进度全保留
- pdf.js CDN 按需加载；canvas 渲染 + 文本层（选中文字 → 既有 Alt+X/Z/Q 制卡
  链路直接复用：文本层容器带 data-tiddler-title 指向当前卡/文档页）
- 界面仿桌面阅读器：深色工具栏（翻页/缩放/视图/框选/OCR/全屏）+ 灰色工作区 + 居中纸页；
  缩放菜单仿 Firefox pdf.js（自动缩放/实际大小/适合页面/适合页宽 + 50%–400% 档位，见 pdf-zoom.ts）；
  视图菜单仿桌面阅读器视图面板：单页/双页/书籍布局 × 页面/垂直/水平/平铺/无限滚动
  （单元切分与 fit 折算见 pdf-view.ts）
- 渲染：工作区内每个单元（单页或双页对）一个 tm-pdf-spread，页盒（canvas+文本层）全量建占位，
  懒渲染——页面滚动模式只渲染当前单元；连续滚动模式经 IntersectionObserver 进入视口才渲染、
  离开即释放（无 IO 环境退化为当前单元 ±1 主动渲染）
- 翻页/页码跳转/续读点：打开时优先恢复续读点绝对页码（不切分，阅读连续跨节）；
  $:/state/tidme-pdf/page/<docId> 有两个写入方：「回原文」一次性页码交接（消费即清理）与
  本阅读器每次翻页的持久保存；加载期消费时才删除（经实有页数校验）。
  页码/续读点以单元首页为基准（双页单元内跳转到成员页时原样持久化该页码，
  恢复期经 unitStart 归一到单元首页——页码可指单元内任一页，导航后落首页）；
  连续滚动模式下当前单元跟随滚动位置
- 视图偏好（布局/滚动/缩放）持久化在 $:/state/tidme-pdf/view（全局共享，跨文档记忆）
- 框选图片制卡：拖拽矩形 → 裁剪 PNG → buildQA 图片问答卡（openCardModal 填答案），逐页盒生效
- OCR 本页：扫描页（无文本层）→ 页面 PNG → LLM-OCR（设置页启用）→ Markdown 文本，
  结果持久化到 <文档页>/ocr-p<页>（清理阅读材料时级联删除），显示在页下方可选区
*/

import * as pdfView from './pdf-view';
import * as zoomMod from './pdf-zoom';

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const binaryMod = require('$:/plugins/keepone/tidme/core/binary.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const cardFactory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const pdfOps = require('$:/plugins/keepone/tidme/core/pdf-ops.js');
const cardModal = require('$:/plugins/keepone/tidme/ui/components/card-modal.js');
const parsePdf = require('$:/plugins/keepone/tidme/import/parse/pdf.js');
const pdfjsMod = require('$:/plugins/keepone/tidme/import/widgets/pdfjs.js');
const stats = require('$:/plugins/keepone/tidme/core/stats.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const studyMode = require('$:/plugins/keepone/tidme/review/widgets/study-mode.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

// 文案查询唯一实现 = core/lingo（require 结果恒真值，无死防御分支）
const lingo = lingoMod.lingo;

const el = dom.el;

/** 工具栏全屏图标（内联 SVG，字体无关） */
const FS_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** 工具栏视图菜单按钮图标（仿桌面阅读器视图面板入口） */
const VIEW_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

/** 视图菜单项图标（内联 SVG，14px 线性风格；与截图菜单逐项对应） */
const VIEW_ICONS: Record<string, string> = {
  single: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7.5" y="4" width="9" height="16" rx="1"/></svg>',
  dual:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="7.5" height="16" rx="1"/><rect x="13" y="4" width="7.5" height="16" rx="1"/></svg>',
  book:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.2C10.2 4.9 7.5 4.2 4 4.2v13.6c3.5 0 6.2.7 8 2 1.8-1.3 4.5-2 8-2V4.2c-3.5 0-6.2.7-8 2z"/><path d="M12 6.2v13.4"/></svg>',
  pageScroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="3.5" width="8" height="17" rx="1"/><path d="M10.5 12h3"/></svg>',
  vertical:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="4.5" rx="1"/><rect x="9" y="9.8" width="6" height="4.5" rx="1"/><rect x="9" y="16.5" width="6" height="4.5" rx="1"/></svg>',
  horizontal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="9" width="4.5" height="6" rx="1"/><rect x="9.8" y="9" width="4.5" height="6" rx="1"/><rect x="16.5" y="9" width="4.5" height="6" rx="1"/></svg>',
  wrapped:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  infinite:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6.2 15.5C4.4 15.5 3 14 3 12s1.4-3.5 3.2-3.5c3.6 0 8 7 11.6 7 1.8 0 3.2-1.5 3.2-3.5s-1.4-3.5-3.2-3.5c-3.6 0-8 7-11.6 7z"/></svg>',
  bookmode:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.2C10.2 4.9 7.5 4.2 4 4.2v13.6c3.5 0 6.2.7 8 2 1.8-1.3 4.5-2 8-2V4.2c-3.5 0-6.2.7-8 2z"/><path d="M12 6.2v13.4"/><path d="M8 4.5v5l1.6-1.2L11.2 9.5V4.9"/></svg>',
};

const resolvePdfContext = pdfOps.resolvePdfContext;

// ---------- 滚轮翻页手感（页面滚动模式） ----------
const WHEEL_FLIP_THRESHOLD = 100; // 单次手势累计像素阈值（≈一个滚轮齿）
const WHEEL_COOLDOWN_MS = 250; // 翻页后冷却窗：窗内增量丢弃（抑制触摸板惯性连翻）
const WHEEL_GESTURE_GAP_MS = 600; // 距上次滚轮超过该间隔视为新手势，累计清零

/** 获取 PDF 字节数组（支持 base64、服务端懒加载 _is_skinny 轮询等待、_canonical_uri fetch） */
async function loadPdfBytesWithWait(
  wiki: any,
  pdfTitle: string,
  onStatus?: (msg: string) => void,
): Promise<Uint8Array | null> {
  if (!wiki || !pdfTitle) return null;

  let tiddler = wiki.getTiddler(pdfTitle);
  if (!tiddler) return null;

  let b64 = wiki.getTiddlerText(pdfTitle, '');
  // 当条目处于懒加载状态（getTiddlerText 返回 null 或 text 为空且有 _is_skinny）
  if (b64 === null || (b64 === '' && tiddler.hasField?.('_is_skinny'))) {
    onStatus?.(lingoMod.lingo(wiki, 'pdf.loading.server', 'Loading PDF data from server...'));
    for (let i = 0; i < 50; i++) {
      await new Promise((res) => setTimeout(res, 200));
      b64 = wiki.getTiddlerText(pdfTitle, '');
      tiddler = wiki.getTiddler(pdfTitle);
      if (b64 && b64 !== '') break;
      if (tiddler && !tiddler.hasField?.('_is_skinny') && tiddler.fields.text) {
        b64 = tiddler.fields.text;
        break;
      }
    }
  }

  // 外部链接 _canonical_uri 支持
  if ((!b64 || b64 === '') && tiddler?.fields?._canonical_uri && typeof fetch === 'function') {
    onStatus?.(lingoMod.lingo(wiki, 'pdf.loading.external', 'Requesting external PDF file...'));
    const resp = await fetch(tiddler.fields._canonical_uri);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  }

  if (!b64) return null;
  // dataURL 前缀 / 折行 / URL-safe 字母表 / 非法字符拒绝统一在 core/binary（唯一解码入口）
  return binaryMod.base64ToBytes(b64);
}

function makeReader(): any {
  class PdfReaderWidget extends Widget {
    _root: any = null;
    _viewer: any = null;
    _flow: any = null;
    /** 页码 → 页盒（sheet/canvas/layer/rect + 渲染状态） */
    _sheets = new Map<number, any>();
    /** 页码 → scale1 原始尺寸（占位盒纵横比与 fit 计算基准） */
    _pageSizes = new Map<number, { w: number; h: number }>();
    _hint: any = null;
    _status: any = null;
    _ocrBox: any = null;
    _pageInput: any = null;
    _total: any = null;
    _zoomSel: any = null;
    _viewBtn: any = null;
    _menuAnchor: any = null;
    _menuEl: any = null;
    _menuCloser: (() => void) | null = null;
    /** 菜单键盘导航状态：可见项按钮缓存 + 活动下标 */
    _menuBtns: any[] = [];
    _menuActiveIdx = 0;
    _selBtn: any = null;
    _fsBtn: any = null;
    _pdf: any = null;
    _page: number = 1;
    _numPages: number = 0;
    _renderSeq: number = 0;
    /** 加载序号：_loadPdf 无并发守卫时，旧加载后完成会用旧文档覆盖新文档 */
    _loadSeq: number = 0;
    /** destroy 置位：销毁后防抖定时器不再落库 */
    _destroyed: boolean = false;
    _selMode: boolean = false;
    _selStart: { x: number; y: number } | null = null;
    _pdfTitle: string = '';
    _docId: string = '';
    _docPageTitle: string = '';
    _reattachBtn: any = null;
    _ocrBusy = false;
    _mode: zoomMod.ZoomMode = 'fit-page';
    /** 布局 × 滚动（视图菜单两项；持久化 $:/state/tidme-pdf/view） */
    _layout: pdfView.PdfLayout = 'single';
    _scroll: pdfView.PdfScroll = 'page';
    /** 连续滚动懒渲染观察者（页面滚动模式不建） */
    _io: any = null;
    /** 程序滚动时间锁：scrollToUnit 引发的 scroll 事件不回写页码 */
    _scrollLockUntil = 0;
    _scrollTimer: any = null;
    /** 页面滚动模式滚轮翻单元的状态：像素累计 / 上次手势时刻 / 冷却窗（抑制惯性连翻） */
    _wheelAcc = 0;
    _wheelLastAt = 0;
    _wheelCooldownUntil = 0;
    _effScale = 0;
    _resizeTimer: any = null;
    _resizeObs: any = null;
    _ocrEnabled = false;
    _onFsChange: () => void = () => {};
    _onDocPointerDown: (e: any) => void = () => {};
    _onViewerWheel: (e: WheelEvent) => void = () => {};
    /** 视图偏好持久化防抖（缩放 ± 连按不逐键写库） */
    _persistViewStateTimer: any = null;
    _savePageTimer: any = null;
    _startTime: number = 0;

    _flushReadTime() {
      if (this._startTime && this.wiki) {
        const elapsedSec = (Date.now() - this._startTime) / 1000;
        this._startTime = Date.now();
        // 上限唯一产地 = stats.FOCUS_SEGMENT_MAX_SECONDS（session.recordFocus 同源）
        if (elapsedSec >= 1 && elapsedSec <= stats.FOCUS_SEGMENT_MAX_SECONDS) {
          stats.recordReadTime(this.wiki, this._docId || '', elapsedSec);
        }
      }
    }

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      this._cleanup();
      this._startTime = Date.now();
      const doc = this.document;
      const wiki = this.wiki;
      const t = this.getVariable('currentTiddler') || '';
      const f = wiki.getTiddler(t)?.fields || {};
      const ctx = resolvePdfContext(wiki, t);
      this._docId = ctx.docId;
      this._pdfTitle = ctx.pdfTitle;
      this._docPageTitle = ctx.docPageTitle;
      const range = parsePdf.parsePagesField(String(f['tidme.pages'] || ''));
      // 视图偏好（布局/滚动/缩放）全局记忆，跨文档恢复上次阅读方式
      const viewState = pdfView.parseViewState(wiki.getTiddlerText(ns.PDF_VIEW_STATE_TITLE, ''));
      this._layout = viewState.layout;
      this._scroll = viewState.scroll;
      this._mode = viewState.zoom;
      this._page = this._resolveInitialPage(range, 0);
      this._numPages = 0;
      this._ocrEnabled = config.readOcrConfig(wiki).enable === true;

      const root = el(doc, 'div', 'tm-pdf');
      this._root = root;

      // ── 工具栏：左=翻页，中=缩放，右=视图/框选/OCR/全屏 ──
      const bar = el(doc, 'div', 'tm-pdf-bar');
      const gNav = el(doc, 'div', 'tm-pdf-bar-group');
      const firstBtn = el(doc, 'button', 'tm-pdf-ico', '«');
      firstBtn.title = lingoMod.lingo(wiki, 'pdf.firstpage', 'First Page');
      const prevBtn = el(doc, 'button', 'tm-pdf-ico', '‹');
      prevBtn.title = lingoMod.lingo(wiki, 'pdf.prevpage', 'Previous Page');
      this._pageInput = doc.createElement('input');
      this._pageInput.type = 'number';
      this._pageInput.min = '1';
      this._pageInput.className = 'tm-pdf-page';
      this._pageInput.setAttribute('aria-label', lingoMod.lingo(wiki, 'read.page', 'Page'));
      this._pageInput.value = String(this._page);
      this._total = el(doc, 'span', 'tm-pdf-total', ' / …');
      const nextBtn = el(doc, 'button', 'tm-pdf-ico', '›');
      nextBtn.title = lingoMod.lingo(wiki, 'pdf.nextpage', 'Next Page');
      const lastBtn = el(doc, 'button', 'tm-pdf-ico', '»');
      lastBtn.title = lingoMod.lingo(wiki, 'pdf.lastpage', 'Last Page');
      for (const n of [firstBtn, prevBtn, this._pageInput, this._total, nextBtn, lastBtn]) gNav.appendChild(n);

      // 缩放组（仿 Firefox pdf.js：− + 与模式/档位下拉相邻）
      const gZoom = el(doc, 'div', 'tm-pdf-bar-group');
      const zoomOutBtn = el(doc, 'button', 'tm-pdf-ico', '−');
      zoomOutBtn.title = lingoMod.lingo(wiki, 'read.zoom.out', 'Zoom Out');
      this._zoomSel = doc.createElement('select');
      this._zoomSel.className = 'tm-pdf-zoom';
      this._zoomSel.setAttribute('aria-label', lingoMod.lingo(wiki, 'read.zoom', 'Zoom'));
      this._zoomSel.title = lingoMod.lingo(wiki, 'read.zoom.tip', 'Automatic Zoom caps at 100%; Fit Page also shrinks to fit page height');
      for (
        const opt of [
          { value: 'auto', label: lingoMod.lingo(wiki, 'read.zoom.auto', 'Automatic Zoom') },
          { value: 'actual', label: lingoMod.lingo(wiki, 'read.zoom.actual', 'Actual Size') },
          { value: 'fit-page', label: lingoMod.lingo(wiki, 'read.zoom.fitpage', 'Fit Page') },
          { value: 'fit-width', label: lingoMod.lingo(wiki, 'read.zoom.fitwidth', 'Fit Width') },
          ...zoomMod.ladderOptions(),
        ]
      ) {
        const o = doc.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        this._zoomSel.appendChild(o);
      }
      this._zoomSel.value = String(this._mode);
      const zoomInBtn = el(doc, 'button', 'tm-pdf-ico', '+');
      zoomInBtn.title = lingoMod.lingo(wiki, 'read.zoom.in', 'Zoom In');
      // 与桌面阅读器一致：− + 相邻，其后为缩放模式下拉
      for (const n of [zoomOutBtn, zoomInBtn, this._zoomSel]) gZoom.appendChild(n);

      const gTools = el(doc, 'div', 'tm-pdf-bar-group');
      // 视图菜单（布局 × 滚动方式），按钮锚点供弹出菜单定位
      const viewAnchor = el(doc, 'span', 'tm-pdf-menu-anchor');
      this._viewBtn = el(doc, 'button', 'tm-pdf-ico', '');
      this._viewBtn.innerHTML = VIEW_SVG;
      this._viewBtn.title = lingoMod.lingo(wiki, 'pdf.view', 'View');
      viewAnchor.appendChild(this._viewBtn);
      gTools.appendChild(viewAnchor);
      this._selBtn = el(doc, 'button', 'tm-pdf-ico', lingoMod.lingo(wiki, 'pdf.select', 'Select'));
      this._selBtn.title = lingoMod.lingo(wiki, 'pdf.select.tip', 'Select image area to create Image QA card');
      if (this._ocrEnabled) {
        const ocrBtn = el(doc, 'button', 'tm-pdf-ico', 'OCR');
        ocrBtn.title = lingoMod.lingo(wiki, 'pdf.ocr.tip', 'Recognize scanned page text via vision model');
        ocrBtn.addEventListener('click', () => this._ocrPage(ocrBtn));
        gTools.appendChild(ocrBtn);
      }
      this._fsBtn = el(doc, 'button', 'tm-pdf-ico', '');
      this._fsBtn.innerHTML = FS_SVG;
      this._fsBtn.title = lingoMod.lingo(wiki, 'pdf.fullscreen', 'Fullscreen');
      for (const n of [this._selBtn, this._fsBtn]) gTools.appendChild(n);

      // 弹性 spacer 把缩放组钉在正中、工具组钉在最右（学习模式「读完继续」再其右）
      const spacerL = el(doc, 'span', 'tm-pdf-bar-spacer');
      const spacerR = el(doc, 'span', 'tm-pdf-bar-spacer');
      bar.appendChild(gNav);
      bar.appendChild(spacerL);
      bar.appendChild(gZoom);
      bar.appendChild(spacerR);
      bar.appendChild(gTools);

      const activeStudy = sessionMod.getActiveStudy(wiki);
      if (activeStudy) {
        const gStudy = el(doc, 'div', 'tm-pdf-bar-group tm-pdf-bar-study');
        const studyNextBtn = el(doc, 'button', 'tm-pdf-btn-study-next', lingoMod.lingo(wiki, 'pdf.study.next', '✓ Done & Continue ›'));
        studyNextBtn.title = lingoMod.lingo(wiki, 'pdf.study.next.tip', 'Save reading progress and continue study flow');
        studyNextBtn.addEventListener('click', () => {
          if (this._docId && this._page) {
            docOps.saveReadPoint(wiki, this._docId, { t, s: docOps.formatPagePosition(this._page) });
            wiki.addTiddler({ title: ns.pdfPageStateTitle(this._docId), text: String(this._page) });
          }
          const f = wiki.getTiddler(t)?.fields;
          if (f && f['tidme.kind'] === 'topic') {
            wiki.addTiddler({ ...f, ...sched.postponeTopicByAFactor(f) });
          }
          // 推进决策统一走 session.advanceSession（nextSchedulable + isDueNow）：
          // 先在当前卡之后找下一张可学卡（会话快照中被顺延的卡不提前重放），再移出当前卡
          const nextCard = sessionMod.advanceSession(wiki, t);
          sessionMod.removeFromSession(wiki, t); // 会话唯一读写口，勿手写 SESSION_TIDDLER
          dom.closeTiddler(this, t);
          if (nextCard) {
            sessionMod.enterCard(wiki, nextCard);
            dom.navigateTo(this, nextCard);
          } else {
            // 队尾收尾唯一出口 = study-mode.finishStudySession（庆祝 + endSession 清场 +
            // 导航 + 结束通知 + 经模式条刷新关闭遗留复习卡）——此前本分支只庆祝导航
            // 不结束会话，学习模式条残留激活
            studyMode.finishStudySession(this);
          }
        });
        gStudy.appendChild(studyNextBtn);
        bar.appendChild(gStudy);
      }

      root.appendChild(bar);

      // ── 工作区：灰底滚动区 + 单元流（tm-pdf-spread × 页盒）+ 悬浮提示 ──
      const body = el(doc, 'div', 'tm-pdf-body');

      this._viewer = el(doc, 'div', 'tm-pdf-viewer');
      this._viewer.setAttribute('tabindex', '0');
      this._viewer.setAttribute('data-scroll', this._scroll);
      this._flow = el(doc, 'div', 'tm-pdf-flow');
      this._viewer.appendChild(this._flow);

      this._hint = el(doc, 'div', 'tm-pdf-hint', '');
      this._status = el(doc, 'div', 'tm-pdf-status', lingo(this.wiki, 'pdf/loading-pdfjs', 'Loading pdf.js...'));
      body.appendChild(this._viewer);
      body.appendChild(this._hint);
      body.appendChild(this._status);
      root.appendChild(body);

      // OCR 转写文本（扫描页）：纸页下方的可见可选区
      this._ocrBox = el(doc, 'div', 'tm-pdf-ocr-text', '');
      this._ocrBox.setAttribute('data-tiddler-title', t);
      root.appendChild(this._ocrBox);

      // ── 事件 ──
      firstBtn.addEventListener('click', () => this._setPage(1));
      lastBtn.addEventListener('click', () => this._setPage(this._numPages));
      prevBtn.addEventListener('click', () => this._stepUnit(-1));
      nextBtn.addEventListener('click', () => this._stepUnit(1));
      this._pageInput.addEventListener('change', () => this._setPage(Number(this._pageInput.value) || 1));
      zoomOutBtn.addEventListener('click', () => this._zoomStep(-1));
      zoomInBtn.addEventListener('click', () => this._zoomStep(1));
      this._zoomSel.addEventListener('change', () => this._onZoomSelect());
      this._viewBtn.addEventListener('click', () => this._toggleViewMenu(viewAnchor));
      this._fsBtn.addEventListener('click', () => this._toggleFullscreen());
      this._wireRectSelect(this._selBtn, this._viewer, t);
      this._viewer.addEventListener('scroll', () => this._onViewerScroll());
      // 滚轮：页面滚动模式翻单元（阈值累计 + 冷却抑制触摸板惯性）；水平滚动模式纵向滚轮
      // 转横向；连续滚动族（垂直/无限/平铺）原生滚动即支持。页面滚动下放大超视口时
      // 仍走原生滚动看页内细节，到边不再翻页。元素级 wheel 监听默认非 passive，无需 options。
      this._onViewerWheel = (e: WheelEvent) => {
        if (!this._viewer) return;
        const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY; // 行模式（Firefox）换算像素
        if (this._scroll === 'page') {
          if (!dy) return;
          if (this._viewer.scrollHeight - this._viewer.clientHeight > 2) return; // 有纵向溢出：原生滚动
          e.preventDefault();
          this._wheelFlip(dy);
          return;
        }
        if (this._scroll === 'horizontal') {
          if (!dy || e.deltaX) return; // deltaX 与 shift+滚轮浏览器原生已横向，不重复处理
          e.preventDefault();
          this._viewer.scrollLeft += dy;
        }
      };
      this._viewer.addEventListener('wheel', this._onViewerWheel);
      // 键盘仲裁：document 级 keydown 全模块只绑一次（bindGlobalKeyboard），分发给
      // activeReader —— 多实例不再双跳；本实例持有焦点归属（见 _onDocPointerDown）。
      bindGlobalKeyboard(doc);
      this._onDocPointerDown = (e: any) => {
        const target = e && e.target;
        const insideRoot = target && this._root && typeof this._root.contains === 'function' && this._root.contains(target);
        if (insideRoot) {
          activeReader = this; // 点击进入本阅读器 → 获得键盘归属
        } else if (activeReader === this) {
          activeReader = null; // 点击其它区域 → 释放归属（阅读条栏方向键恢复）
        }
        if (!this._menuCloser) return;
        if (target && this._menuAnchor && typeof this._menuAnchor.contains === 'function' && this._menuAnchor.contains(target)) return;
        this._closeMenu();
      };
      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('pointerdown', this._onDocPointerDown);
      }

      // 全屏切换后视口尺寸变化 → fit 重算（destroy 时随 widget 一并注销）
      this._onFsChange = () => this._relayout();
      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('fullscreenchange', this._onFsChange);
      }
      // 容器尺寸变化 → fit 模式防抖重排
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObs = new ResizeObserver(() => this._onResize());
        this._resizeObs.observe(this._viewer);
      }

      parent.insertBefore(root, nextSibling);
      this.domNodes.push(root);
      // 打开即持有键盘归属（最新打开/重建者获胜；点击归属转移见 _onDocPointerDown）
      activeReader = this;

      void this._loadPdf(range);
    }

    _resolveInitialPage(range: { start: number; end: number }, numPages = 0): number {
      const wiki = this.wiki;
      const t = this.getVariable('currentTiddler') || '';
      let target = range.start;
      if (this._docId) {
        const rp = docOps.parseReadPoint(wiki, this._docId);
        const rpPage = rp ? docOps.parsePagePosition(rp.s) : null;
        const statePage = Number(wiki.getTiddlerText(ns.pdfPageStateTitle(this._docId), ''));

        // 1. 当前卡 = 续读点卡 → 恢复其记录的绝对页码。阅读本就连续跨节（页间防抖
        //    续存与学习模式「读完继续」都以当前卡记绝对页），页码允许越出本节
        //    tidme.pages 区间；仅当超过实有页数（如书籍重导入变小）时回退节起始
        if (rp?.t === t && Number.isFinite(rpPage) && rpPage >= 1) {
          if (numPages > 0 && rpPage > numPages) return target;
          return rpPage;
        }

        // 2. 若外部指定了有效页码（如「回原文」临时溯源），且落在本节区间内 → 采用该页并消费清理。
        //    消费必须发生在能对实有页数校验的加载期（numPages>0）：渲染期首次调用尚不知页数，
        //    只预览不删——此前渲染期就删除状态 tiddler，加载期二次解析时页码已丢
        if (Number.isFinite(statePage) && statePage >= 1) {
          const inRange = !range.end || (statePage >= range.start && statePage <= range.end);
          if (inRange && numPages > 0) {
            // 消费即清理，防止误劫持后续打开的其他节卡
            this.wiki.deleteTiddler(ns.pdfPageStateTitle(this._docId));
            return statePage > numPages ? target : statePage;
          }
          if (inRange) return statePage;
        }

        // 3. 全书无区间（单文档页）回退
        if (!range.end) {
          const fallback = Number.isFinite(rpPage) && rpPage >= 1 ? rpPage : statePage;
          if (Number.isFinite(fallback) && fallback >= 1) {
            return numPages > 0 && fallback > numPages ? target : fallback;
          }
        }
      }
      return target;
    }

    async _loadPdf(range?: { start: number; end: number }) {
      const wiki = this.wiki;
      const t = this.getVariable('currentTiddler') || '';
      const f = wiki.getTiddler(t)?.fields || {};
      const r = range || parsePdf.parsePagesField(String(f['tidme.pages'] || ''));
      // 加载序号：refresh/重绑会再次触发 _loadPdf，旧加载后完成不得覆盖新文档
      // （_renderSeq 只护页渲染，这里用独立序号护文档对象与页码初始化）
      const seq = ++this._loadSeq;
      try {
        const bytes = await loadPdfBytesWithWait(wiki, this._pdfTitle, (msg) => {
          if (this._status) this._status.textContent = msg;
        });
        if (seq !== this._loadSeq) return;
        if (!bytes || bytes.length === 0) {
          this._status.textContent = lingoMod.lingo(wiki, 'pdf.missing', `Missing PDF data (${this._pdfTitle || 'No associated PDF found'})`);
          this._wireReattach();
          return;
        }
        // 阅读器路径：base64 解码产物用后即弃，免全量拷贝（大书省一次 28MB 级复制）
        const pdf = await pdfjsMod.loadPdfBytes(bytes, { keepBytes: false });
        if (seq !== this._loadSeq) {
          // 过期加载：立即销毁新拿到的文档，避免 pdfjs 文档对象泄漏
          try {
            pdf.destroy?.();
          } catch (_) {}
          return;
        }
        // 重载前销毁旧文档（此前只有 _cleanup 会销毁，每次重载泄漏一个 pdfjs 文档）
        if (this._pdf && typeof this._pdf.destroy === 'function') {
          try {
            this._pdf.destroy();
          } catch (_) {}
        }
        this._pdf = pdf;
        this._numPages = Number(this._pdf.numPages) || 0;
        this._total.textContent = ` / ${this._numPages}`;
        if (this._docPageTitle && this._numPages > 0) {
          const docT = wiki.getTiddler(this._docPageTitle);
          if (docT && !docT.fields['tidme.pages-total']) {
            wiki.addTiddler({ ...docT.fields, 'tidme.pages-total': String(this._numPages) });
          }
        }
        const start = this._resolveInitialPage(r, this._numPages);
        // 当前单元各页先取原始尺寸，首帧即真实纵横比（其余页后台补全）
        for (const p of pdfView.unitOf(start, this._layout, this._scroll, this._numPages)) {
          try {
            const s = await pdfjsMod.pageSize(pdf, p);
            if (seq !== this._loadSeq) return;
            this._pageSizes.set(p, { w: Number(s.width) || 612, h: Number(s.height) || 792 });
          } catch (_) {}
        }
        this._rebuildFlow();
        this._setPage(start, false);
        void this._ensurePageSizes();
      } catch (e: any) {
        if (seq === this._loadSeq) {
          this._status.textContent = lingoMod.lingo(wiki, 'pdf.load.failed', 'Failed to load: ') + String(e?.message || e);
        }
      }
    }

    /** 后台补全全部页面的原始尺寸（分批并发，每批后重排占位盒） */
    async _ensurePageSizes() {
      const pdf = this._pdf;
      const n = this._numPages;
      const seq = this._loadSeq;
      if (!pdf || !n) return;
      const BATCH = 16;
      for (let p = 1; p <= n; p += BATCH) {
        const tasks: Promise<void>[] = [];
        for (let q = p; q <= Math.min(p + BATCH - 1, n); q++) {
          if (this._pageSizes.has(q)) continue;
          tasks.push(
            Promise.resolve(pdfjsMod.pageSize(pdf, q)).then(
              (s: any) => {
                this._pageSizes.set(q, { w: Number(s.width) || 612, h: Number(s.height) || 792 });
              },
              () => {
                this._pageSizes.set(q, { w: 612, h: 792 });
              },
            ),
          );
        }
        await Promise.all(tasks);
        if (this._destroyed || seq !== this._loadSeq) return;
        if (tasks.length) {
          // 增量：scale 由当前页尺寸决定（首批已就位），后续批次只补本批盒尺寸，
          // 不再每批全量重排（大文档 O(n²/batch) 样式写）；新盒渲染仍由 want/IO 驱动
          const batchPages = new Set<number>();
          for (let q = p; q <= Math.min(p + BATCH - 1, n); q++) batchPages.add(q);
          this._applySizes(batchPages);
          for (const q of batchPages) {
            const box = this._sheets.get(q);
            if (box && box.want) void this._renderSheet(box, false);
          }
        }
      }
    }

    /** 二进制缺失/为空时的原位恢复入口：选择原始 PDF 文件覆写二进制条目
     *  （服务端曾把空二进制写成 0 字节 .pdf；重绑不清空节卡/续读点/复习进度） */
    _wireReattach() {
      if (!this._pdfTitle || !this._status) return;
      if (this._reattachBtn && this._reattachBtn.parentNode) return; // 重复加载失败不叠加按钮
      const btn = el(this.document, 'button', 'tm-pdf-reattach', lingoMod.lingo(this.wiki, 'pdf.reattach', 'Re-attach PDF'));
      this._reattachBtn = btn;
      btn.title = lingoMod.lingo(this.wiki, 'pdf.reattach.tip', 'Select the original PDF file to restore it in place (sections and reading progress kept)');
      btn.addEventListener('click', () => {
        const input = this.document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,application/pdf';
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            // 大文件编码耗时数秒：状态条实时显示百分比（textContent 会移除按钮，需清引用）
            this._reattachBtn = null;
            const encodingTip = lingoMod.lingo(this.wiki, 'pdf.reattach.encoding', 'Encoding PDF');
            const dataB64 = await binaryMod.bytesToBase64Async(bytes, (done, total) => {
              this._status.textContent = `${encodingTip} ${Math.round((done / Math.max(total, 1)) * 100)}%`;
            });
            if (!binaryMod.base64RoundtripValid(dataB64, bytes.length)) {
              throw new Error(lingoMod.lingo(this.wiki, 'pdf.import.corrupt', 'PDF data integrity check failed; import aborted'));
            }
            pdfOps.reattachPdfBinary(this.wiki, this._pdfTitle, dataB64);
            this._status.textContent = lingoMod.lingo(this.wiki, 'pdf.reattach.done', 'PDF restored, loading...');
            void this._loadPdf();
          } catch (e: any) {
            this._status.textContent = lingoMod.lingo(this.wiki, 'pdf.reattach.failed', 'Re-attach failed: ') + String(e?.message || e);
          }
        });
        input.click();
      });
      this._status.appendChild(btn);
    }

    refresh(changedTiddlers: Record<string, any>) {
      const cur = this.getVariable('currentTiddler');
      if (cur && changedTiddlers[cur]) {
        if (this.parentWidget && Array.isArray(this.parentWidget.children)) {
          this.refreshSelf();
        } else {
          void this._loadPdf();
        }
        return true;
      }
      if (this._pdfTitle && changedTiddlers[this._pdfTitle]) {
        void this._loadPdf();
        return true;
      }
      const pageStateTitle = this._docId ? ns.pdfPageStateTitle(this._docId) : '';
      if (pageStateTitle && changedTiddlers[pageStateTitle]) {
        const p = Number(this.wiki.getTiddlerText(pageStateTitle, ''));
        const curT = this.getVariable('currentTiddler') || '';
        const f = this.wiki.getTiddler(curT)?.fields || {};
        const range = parsePdf.parsePagesField(String(f['tidme.pages'] || ''));
        const inRange = !range.end || (p >= range.start && p <= range.end);
        if (inRange && Number.isFinite(p) && p >= 1 && p !== this._page) {
          this._setPage(p, false);
          return true;
        }
      }
      return false;
    }

    _cleanup() {
      this._flushReadTime();
      this._reattachBtn = null;
      if (this._savePageTimer) {
        clearTimeout(this._savePageTimer);
        this._savePageTimer = null;
      }
      if (this._scrollTimer) {
        clearTimeout(this._scrollTimer);
        this._scrollTimer = null;
      }
      if (this._persistViewStateTimer) {
        clearTimeout(this._persistViewStateTimer);
        this._persistViewStateTimer = null;
      }
      if (this._io) {
        this._io.disconnect();
        this._io = null;
      }
      this._closeMenu();
      if (this._onDocPointerDown && this.document && typeof this.document.removeEventListener === 'function') {
        this.document.removeEventListener('pointerdown', this._onDocPointerDown);
        this._onDocPointerDown = () => {};
      }
      if (activeReader === this) activeReader = null; // 释放键盘归属（document 级绑定由 keyboardBinds 托管）
      if (this._resizeObs) {
        this._resizeObs.disconnect();
        this._resizeObs = null;
      }
      if (this._resizeTimer) {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = null;
      }
      if (this._onFsChange && this.document && typeof this.document.removeEventListener === 'function') {
        this.document.removeEventListener('fullscreenchange', this._onFsChange);
        this._onFsChange = () => {};
      }
      this._renderSeq++;
      this._loadSeq++; // 在途 _loadPdf 全部作废（其完成后会自销毁拿到的文档）
      for (const box of this._sheets.values()) this._unrenderSheet(box);
      this._sheets.clear();
      if (this._pdf && typeof this._pdf.destroy === 'function') {
        try {
          this._pdf.destroy();
        } catch (_) {}
        this._pdf = null;
      }
    }

    removeChildDomNodes() {
      this._cleanup();
      super.removeChildDomNodes?.();
    }

    destroy() {
      this._destroyed = true;
      this._cleanup();
      super.destroy?.();
    }

    // ---------- 翻页与导航（单元口径：页码/续读点记录单元首页） ----------

    _setPage(n: number, save = true) {
      this._flushReadTime();
      const max = this._numPages > 0 ? this._numPages : Infinity;
      this._page = Math.min(Math.max(1, Math.floor(n) || 1), max || 1);
      this._pageInput.value = String(this._page);
      if (save) this._persistPage();
      this._goCurrent();
    }

    /** 上一/下一单元（单页布局等价于逐页翻页） */
    _stepUnit(dir: 1 | -1) {
      this._setPage(pdfView.unitStep(this._page, this._layout, this._scroll, dir, this._numPages));
    }

    /** 页面滚动模式滚轮翻单元：纵向像素累计过阈值翻一单元；翻后进入冷却窗，
     *  窗内增量丢弃（触摸板惯性不再连翻）；距上次滚轮过久则重新累计 */
    _wheelFlip(deltaY: number) {
      const now = Date.now();
      if (now < this._wheelCooldownUntil) return;
      if (now - this._wheelLastAt > WHEEL_GESTURE_GAP_MS) this._wheelAcc = 0;
      this._wheelLastAt = now;
      this._wheelAcc += deltaY;
      if (Math.abs(this._wheelAcc) >= WHEEL_FLIP_THRESHOLD) {
        const dir: 1 | -1 = this._wheelAcc > 0 ? 1 : -1;
        this._wheelAcc = 0;
        this._wheelCooldownUntil = now + WHEEL_COOLDOWN_MS;
        this._stepUnit(dir);
      }
    }

    _persistPage() {
      if (!this._docId) return;
      this.wiki.addTiddler({ title: ns.pdfPageStateTitle(this._docId), text: String(this._page) });
      // 防抖持久化续读点与全局续读点（章节跨越自动感知）
      if (this._savePageTimer) clearTimeout(this._savePageTimer);
      this._savePageTimer = setTimeout(() => {
        this._savePageTimer = null;
        if (this._destroyed) return; // widget 已销毁：续读点落库无意义
        const curT = this.getVariable('currentTiddler') || '';
        const matchedSection = docOps.sectionOfDocByPage ? docOps.sectionOfDocByPage(this.wiki, this._docId, this._page) : null;
        const targetCard = matchedSection || curT || this._docPageTitle;
        if (targetCard) {
          docOps.saveReadPoint(this.wiki, this._docId, { t: targetCard, s: docOps.formatPagePosition(this._page) });
          docOps.saveGlobalReadPoint(this.wiki, targetCard);
        }
      }, 300);
    }

    _onKeydown(e: KeyboardEvent) {
      // 视图菜单打开时：↑↓/Enter/空格/Esc 归菜单，其余键吞掉（菜单开着不在背后翻页缩放）
      if (this._menuCloser) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          this._menuMove(e.key === 'ArrowDown' ? 1 : -1);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          this._menuActivate();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this._closeMenu();
          return;
        }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this._stepUnit(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this._stepUnit(1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this._zoomStep(1);
      } else if (e.key === '-') {
        e.preventDefault();
        this._zoomStep(-1);
      }
    }

    /** 当前定位落到 this._page：页面滚动 = 渲染当前单元；连续滚动 = 滚动到当前单元 */
    _goCurrent() {
      if (!this._pdf) return;
      if (this._scroll === 'page') {
        void this._renderCurrent();
        return;
      }
      this._syncOcrBox();
      this._updateUnitVisibility();
      this._scrollToUnit(this._page);
      this._renderSweep();
    }

    _onResize() {
      if (!this._pdf || typeof this._mode === 'number') return;
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null;
        this._relayout();
      }, 180);
    }

    // ---------- 单元流构建与懒渲染 ----------

    /** 重建单元流：全部页盒占位（按当前布局配对成单元）+ 尺寸 + 懒渲染观察 */
    _rebuildFlow() {
      if (!this._flow) return;
      this._closeMenu();
      for (const box of this._sheets.values()) this._unrenderSheet(box);
      this._sheets.clear();
      this._flow.textContent = '';
      if (this._io) {
        this._io.disconnect();
        this._io = null;
      }
      if (!this._pdf) return;
      const doc = this.document;
      const n = this._numPages;
      const count = pdfView.unitCount(n, this._layout, this._scroll);
      for (let ui = 0; ui < count; ui++) {
        const spread = el(doc, 'div', 'tm-pdf-spread');
        spread.setAttribute('data-unit', String(ui));
        const start = pdfView.unitStartByIndex(ui, this._layout, this._scroll, n);
        for (const p of pdfView.unitOf(start, this._layout, this._scroll, n)) {
          const box = this._makeSheet(doc, p);
          this._sheets.set(p, box);
          spread.appendChild(box.sheet);
        }
        this._flow.appendChild(spread);
      }
      this._applySizes();
      // 懒渲染：连续滚动模式经 IntersectionObserver 进入视口附近才渲染、离开即释放；
      // 页面滚动模式只渲染当前单元（无需观察者）。无 IO 环境（无头测试/旧内核）退化为
      // 当前单元 ±1 主动渲染（见 _updateUnitVisibility）
      if (typeof IntersectionObserver !== 'undefined' && this._scroll !== 'page') {
        this._io = new IntersectionObserver(
          (entries: any[]) => {
            for (const en of entries || []) {
              const page = Number(en.target?.getAttribute?.('data-page'));
              const box = this._sheets.get(page);
              if (!box) continue;
              box.want = !!en.isIntersecting;
              if (box.want) void this._renderSheet(box, false);
              else this._unrenderSheet(box);
            }
          },
          { root: this._viewer, rootMargin: '600px' },
        );
        for (const box of this._sheets.values()) this._io.observe(box.sheet);
      }
      this._updateUnitVisibility();
    }

    _makeSheet(doc: any, page: number) {
      const sheet = el(doc, 'div', 'tm-pdf-sheet');
      sheet.setAttribute('data-page', String(page));
      sheet.setAttribute('data-pending', '1');
      const canvas = doc.createElement('canvas');
      canvas.className = 'tm-pdf-canvas';
      const layer = el(doc, 'div', 'tm-pdf-textlayer', '');
      layer.setAttribute('data-tiddler-title', this.getVariable('currentTiddler') || '');
      const rect = el(doc, 'div', 'tm-pdf-rect', '');
      sheet.appendChild(canvas);
      sheet.appendChild(layer);
      sheet.appendChild(rect);
      return { page, sheet, canvas, layer, rect, seq: 0, want: false, renderedKey: '' };
    }

    /** scale 统一重算并应用到页盒（fit 依赖容器与布局，一次算好全视图共用）。
     *  only 传页码集合时只更新这些盒（后台补尺寸分批增量应用，避免大文档全量重排）。 */
    _applySizes(only?: Set<number>) {
      if (!this._pdf || !this._flow) return;
      const gutter = 48;
      const vw = Math.max(200, (Number(this._viewer.clientWidth) || 0) - gutter);
      const vh = Math.max(200, (Number(this._viewer.clientHeight) || 0) - gutter);
      const s1 = this._pageSizeAt1(this._page);
      const scale = pdfView.resolveViewScale(this._mode, s1.w, s1.h, vw, vh, this._layout, this._scroll);
      this._effScale = scale;
      this._syncZoomSelect();
      for (const box of this._sheets.values()) {
        if (only && !only.has(box.page)) continue;
        const size = this._pageSizeAt1(box.page);
        const w = Math.max(1, Math.round(size.w * scale));
        const h = Math.max(1, Math.round(size.h * scale));
        box.sheet.style.width = `${w}px`;
        box.sheet.style.height = `${h}px`;
        box.layer.style.width = `${w}px`;
        box.layer.style.height = `${h}px`;
      }
    }

    _pageSizeAt1(page: number): { w: number; h: number } {
      return this._pageSizes.get(page) || { w: 612, h: 792 };
    }

    /** 单元显示与渲染意愿：页面滚动只显示/渲染当前单元；无 IO 的连续滚动渲染当前 ±1 单元 */
    _updateUnitVisibility() {
      if (!this._flow) return;
      const curIdx = pdfView.unitIndexOf(this._page, this._layout, this._scroll, this._numPages);
      const spreads = this._flow.children || [];
      for (const spread of spreads) {
        const idx = Number(spread.getAttribute?.('data-unit'));
        const on = this._scroll !== 'page' || idx === curIdx;
        spread.style.display = on ? '' : 'none';
      }
      if (this._scroll === 'page') {
        const pages = new Set(pdfView.unitOf(this._page, this._layout, this._scroll, this._numPages));
        for (const box of this._sheets.values()) {
          box.want = pages.has(box.page);
          if (!box.want) this._unrenderSheet(box);
        }
      } else if (!this._io) {
        for (const spread of spreads) {
          const idx = Number(spread.getAttribute?.('data-unit'));
          const near = Math.abs(idx - curIdx) <= 1;
          for (const sheetEl of spread.childNodes || []) {
            const box = this._sheets.get(Number(sheetEl.getAttribute?.('data-page')));
            if (box) box.want = near;
          }
        }
      }
    }

    /** 按渲染意愿清扫：want 的（重）渲染，不 want 的释放（renderedKey 防重复渲染） */
    _renderSweep() {
      for (const box of this._sheets.values()) {
        if (box.want) void this._renderSheet(box, false);
        else this._unrenderSheet(box);
      }
    }

    /** 页面滚动模式：渲染当前单元（状态条跟随首/末完成；双页时逐盒串行） */
    async _renderCurrent() {
      if (!this._pdf) return;
      const seq = ++this._renderSeq;
      this._syncOcrBox();
      this._updateUnitVisibility();
      this._status.textContent = lingoMod.lingo(this.wiki, 'pdf.rendering', 'Rendering...');
      try {
        for (const p of pdfView.unitOf(this._page, this._layout, this._scroll, this._numPages)) {
          const box = this._sheets.get(p);
          if (!box) continue;
          await this._renderSheet(box, true);
          if (seq !== this._renderSeq) return;
        }
        if (seq === this._renderSeq) this._status.textContent = '';
      } catch (e: any) {
        if (seq === this._renderSeq) {
          this._status.textContent = lingoMod.lingo(this.wiki, 'pdf.render.failed', 'Render failed: ') + String(e?.message || e);
        }
      }
    }

    /** 渲染单个页盒（canvas + 文本层）；box.seq 使过期渲染自弃 */
    async _renderSheet(box: any, report: boolean) {
      if (!this._pdf || !box) return;
      const dpr = Math.min(Number((typeof window !== 'undefined' && (window as any).devicePixelRatio) || 1) || 1, 2);
      const scale = this._effScale || 1;
      const key = `${box.page}:${scale}:${dpr}`;
      if (box.renderedKey === key && Number(box.canvas.width) > 1) return;
      const seq = ++box.seq;
      box.renderedKey = '';
      box.sheet.setAttribute('data-pending', '1');
      try {
        const viewport = await pdfjsMod.renderPageToCanvas(this._pdf, box.page, box.canvas, { cssScale: scale, dpr });
        if (seq !== box.seq || !box.want) return;
        box.renderedKey = key;
        box.sheet.removeAttribute('data-pending');
        box.sheet.removeAttribute('data-error');
        await this._fillSheetText(box, viewport, dpr, seq);
      } catch (e: any) {
        // 失败可见化：占位盒转错误态（红边），后台预渲染失败不再无差别静默——
        // 用户能区分"未加载"与"渲染失败"；当前单元失败仍上报状态条
        box.sheet.removeAttribute('data-pending');
        box.sheet.setAttribute('data-error', '1');
        if (report && seq === box.seq) {
          this._status.textContent = lingoMod.lingo(this.wiki, 'pdf.render.failed', 'Render failed: ') + String(e?.message || e);
        }
      }
    }

    _unrenderSheet(box: any) {
      if (!box) return;
      box.seq++;
      box.want = false;
      box.renderedKey = '';
      box.sheet.setAttribute('data-pending', '1');
      box.sheet.removeAttribute('data-error');
      try {
        box.canvas.width = 0;
        box.canvas.height = 0;
      } catch (_) {}
      box.layer.textContent = '';
    }

    /** 缩放/视口变化后的统一重排：重算 scale → 失效渲染缓存 → 按意愿清扫 */
    _relayout() {
      if (!this._pdf) return;
      this._applySizes();
      for (const box of this._sheets.values()) box.renderedKey = '';
      if (this._scroll === 'page') void this._renderCurrent();
      else this._renderSweep();
    }

    // ---------- 连续滚动：滚动位置 ↔ 当前单元 ----------

    _onViewerScroll() {
      if (this._scroll === 'page' || !this._pdf || this._destroyed) return;
      if (Date.now() < this._scrollLockUntil) return;
      if (this._scrollTimer) return; // 已有待处理防抖，合并后续滚动
      this._scrollTimer = setTimeout(() => {
        this._scrollTimer = null;
        if (this._destroyed || !this._pdf || this._scroll === 'page') return;
        const p = this._nearestUnitPage();
        if (p !== this._page) {
          this._page = p;
          this._pageInput.value = String(p);
          this._persistPage();
          this._syncOcrBox();
        }
      }, 150);
    }

    /** 视口中心最近的单元首页（水平按横向距离，平铺按平面距离，其余按纵向距离） */
    /** 页盒几何测量：真实 DOM 读 offset*，无布局环境（fake DOM）回退 style 值 */
    _sheetMetrics(el: any): { w: number; h: number; left: number; top: number } {
      return {
        w: Number(el.offsetWidth) || parseFloat(el.style.width) || 0,
        h: Number(el.offsetHeight) || parseFloat(el.style.height) || 0,
        left: Number(el.offsetLeft) || 0,
        top: Number(el.offsetTop) || 0,
      };
    }

    _nearestUnitPage(): number {
      const viewer = this._viewer;
      const vw = Number(viewer.clientWidth) || 0;
      const vh = Number(viewer.clientHeight) || 0;
      const cx = (Number(viewer.scrollLeft) || 0) + vw / 2;
      const cy = (Number(viewer.scrollTop) || 0) + vh / 2;
      let best = 0;
      let bestDist = Infinity;
      for (const box of this._sheets.values()) {
        const m = this._sheetMetrics(box.sheet);
        const d = this._scroll === 'horizontal'
          ? Math.abs(m.left + m.w / 2 - cx)
          : this._scroll === 'wrapped'
          ? Math.hypot(m.left + m.w / 2 - cx, m.top + m.h / 2 - cy)
          : Math.abs(m.top + m.h / 2 - cy);
        if (Number.isFinite(d) && d < bestDist) {
          bestDist = d;
          best = box.page;
        }
      }
      return best || this._page;
    }

    _scrollToUnit(page: number) {
      const start = pdfView.unitStart(page, this._layout, this._scroll, this._numPages);
      const box = this._sheets.get(start);
      if (!box || !this._viewer) return;
      this._scrollLockUntil = Date.now() + 500;
      const vw = Number(this._viewer.clientWidth) || 0;
      const vh = Number(this._viewer.clientHeight) || 0;
      const m = this._sheetMetrics(box.sheet);
      if (this._scroll !== 'horizontal') {
        this._viewer.scrollTop = Math.max(0, m.top - (vh - m.h) / 2);
      }
      if (this._scroll === 'horizontal' || this._scroll === 'wrapped') {
        this._viewer.scrollLeft = Math.max(0, m.left - (vw - m.w) / 2);
      }
    }

    // ---------- 缩放（模式/档位见 pdf-zoom.ts，视图折算见 pdf-view.ts） ----------

    _zoomStep(dir: 1 | -1) {
      const base = typeof this._mode === 'number' ? this._mode : this._effScale || 1;
      this._mode = zoomMod.stepLadder(base, dir);
      this._persistViewState();
      this._relayout();
    }

    _onZoomSelect() {
      const v = String(this._zoomSel.value || 'fit-page');
      this._mode = v === 'auto' || v === 'fit-page' || v === 'fit-width' || v === 'actual' ? v : Number(v) || 'fit-page';
      this._persistViewState();
      this._relayout();
    }

    /** 数字档渲染后回写下拉（clamp 端点可能不在档位列表，找不到则保持原显示） */
    _syncZoomSelect() {
      const v = typeof this._mode === 'number' ? String(this._mode) : this._mode;
      for (const o of this._zoomSel.options || []) {
        if (String(o.value) === v) {
          this._zoomSel.value = v;
          return;
        }
      }
    }

    /** 视图偏好防抖持久化：缩放 ± 连按不逐键写库（滚动回写同理有 150ms 防抖） */
    _persistViewState() {
      if (!this.wiki) return;
      if (this._persistViewStateTimer) clearTimeout(this._persistViewStateTimer);
      this._persistViewStateTimer = setTimeout(() => {
        this._persistViewStateTimer = null;
        if (this._destroyed || !this.wiki) return;
        this.wiki.addTiddler({ title: ns.PDF_VIEW_STATE_TITLE, text: pdfView.viewStateText(this._layout, this._scroll, this._mode) });
      }, 200);
    }

    // ---------- 视图菜单（布局 × 滚动方式） ----------

    _toggleViewMenu(anchor: any) {
      if (this._menuCloser) {
        this._closeMenu();
        return;
      }
      this._openMenu(anchor, this._buildViewItems());
    }

    _buildViewItems(): any[] {
      const L = (k: string, fb: string) => lingoMod.lingo(this.wiki, k, fb);
      return [
        {
          label: L('pdf.layout.single', 'Single Page View'),
          icon: VIEW_ICONS.single,
          on: this._layout === 'single' && this._scroll !== 'infinite',
          click: () => this._setView('single'),
        },
        { label: L('pdf.layout.dual', 'Two Page View'), icon: VIEW_ICONS.dual, on: this._layout === 'dual' && this._scroll !== 'infinite', click: () => this._setView('dual') },
        { label: L('pdf.layout.book', 'Book View'), icon: VIEW_ICONS.book, on: this._layout === 'book' && this._scroll !== 'infinite', click: () => this._setView('book') },
        { label: L('pdf.scroll.page', 'Page Scrolling'), icon: VIEW_ICONS.pageScroll, on: this._scroll === 'page', click: () => this._setView(undefined, 'page') },
        { label: L('pdf.scroll.vertical', 'Vertical Scrolling'), icon: VIEW_ICONS.vertical, on: this._scroll === 'vertical', click: () => this._setView(undefined, 'vertical') },
        {
          label: L('pdf.scroll.horizontal', 'Horizontal Scrolling'),
          icon: VIEW_ICONS.horizontal,
          on: this._scroll === 'horizontal',
          click: () => this._setView(undefined, 'horizontal'),
        },
        { label: L('pdf.scroll.wrapped', 'Wrapped Scrolling'), icon: VIEW_ICONS.wrapped, on: this._scroll === 'wrapped', click: () => this._setView(undefined, 'wrapped') },
        { label: L('pdf.scroll.infinite', 'Infinite Scroll'), icon: VIEW_ICONS.infinite, on: this._scroll === 'infinite', click: () => this._setView(undefined, 'infinite') },
        {
          label: L('pdf.view.bookmode', 'Book Mode'),
          icon: VIEW_ICONS.bookmode,
          on: this._layout === 'book' && this._scroll === 'page',
          click: () => this._setView('book', 'page'),
        },
      ];
    }

    /** 在锚点按钮下方弹出深色菜单（截图样式：当前项高亮）；同一时刻至多一个 */
    _openMenu(anchor: any, items: any[]) {
      this._closeMenu();
      const doc = this.document;
      const menu = el(doc, 'div', 'tm-pdf-menu');
      menu.setAttribute('role', 'menu');
      // 键盘导航状态：菜单项按钮缓存 + 活动下标（默认落在当前生效项上，Linear 式）
      this._menuBtns = [];
      this._menuActiveIdx = Math.max(
        0,
        items.findIndex((it) => it.on),
      );
      items.forEach((it, idx) => {
        if (it.sep) {
          menu.appendChild(el(doc, 'div', 'tm-pdf-menu-sep'));
          return;
        }
        const b = el(doc, 'button', 'tm-pdf-menu-item' + (it.on ? ' tm-pdf-menu-item--on' : ''));
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        if (idx === this._menuActiveIdx) b.classList.add('tm-pdf-menu-item--active');
        if (it.icon) {
          const ico = el(doc, 'span', 'tm-pdf-menu-ico');
          ico.innerHTML = it.icon;
          b.appendChild(ico);
        }
        b.appendChild(el(doc, 'span', 'tm-pdf-menu-label', it.label));
        b.addEventListener('click', () => {
          this._closeMenu();
          it.click();
        });
        this._menuBtns.push(b);
        menu.appendChild(b);
      });
      anchor.appendChild(menu);
      this._menuAnchor = anchor;
      this._menuEl = menu;
      this._menuCloser = () => {
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        this._menuAnchor = null;
        this._menuEl = null;
        this._menuBtns = [];
      };
    }

    /** 菜单键盘导航：↑↓ 移动高亮，Enter/空格激活（不改列表内容，只切高亮类） */
    _menuMove(dir: 1 | -1) {
      const btns = this._menuBtns.filter(Boolean);
      if (!btns.length) return;
      this._menuActiveIdx = (this._menuActiveIdx + dir + btns.length) % btns.length;
      btns.forEach((b, i) => b.classList.toggle('tm-pdf-menu-item--active', i === this._menuActiveIdx));
    }

    _menuActivate() {
      const b = this._menuBtns[this._menuActiveIdx];
      if (b) b.click();
    }

    _closeMenu() {
      if (this._menuCloser) {
        const close = this._menuCloser;
        this._menuCloser = null;
        close();
      }
    }

    _setView(layout?: pdfView.PdfLayout, scroll?: pdfView.PdfScroll) {
      if (layout) this._layout = layout;
      if (scroll) this._scroll = scroll;
      this._persistViewState();
      if (this._viewer) this._viewer.setAttribute('data-scroll', this._scroll);
      this._rebuildFlow();
      this._goCurrent();
    }

    _toggleFullscreen() {
      const d = this.document as any;
      try {
        if (d.fullscreenElement) void d.exitFullscreen();
        else if (this._root.requestFullscreen) void this._root.requestFullscreen();
      } catch { /* 浏览器不支持全屏则忽略 */ }
    }

    // ---------- 文本层 / OCR ----------

    /** 单个页盒的透明文本层（当前单元的页同步扫描页提示） */
    async _fillSheetText(box: any, viewport: any, dpr: number, seq: number) {
      const doc = this.document;
      const t = this.getVariable('currentTiddler') || '';
      const items = await pdfjsMod.pageTextItems(this._pdf, box.page);
      if (seq !== box.seq || !box.want) return;
      const layer = box.layer;
      layer.textContent = '';
      layer.setAttribute('data-tiddler-title', t);
      const isCurrent = pdfView.unitOf(this._page, this._layout, this._scroll, this._numPages).includes(box.page);
      // CID 字体 CMap 数据拉取失败（离线/CDN 不可达）时文本解码为空：画布字形渲染不出，
      // 文本层也近空——给一次性联网提示，不再与"修复前"不可区分地静默空白（每会话只提示一次）
      if (items.length > 0 && !items.some((it: any) => it.str && it.str.trim()) && !pdfjsMod.isTextDecodeWarned()) {
        pdfjsMod.markTextDecodeWarned();
        if (isCurrent) {
          this._hint.textContent = lingo(
            this.wiki,
            'pdf/cmap-offline-hint',
            'Text cannot be decoded (font CMap data needs network access to cdn.jsdelivr.net) — pages may render as images only',
          );
        }
      }
      if (parsePdf.isScannedPageText(items.map((it: any) => it.str).join(' '))) {
        if (isCurrent) {
          this._hint.textContent = this._ocrEnabled
            ? lingo(this.wiki, 'pdf/scanned-hint-ocr', 'Scanned page (no text layer) — Click "OCR" in toolbar to recognize text')
            : lingo(this.wiki, 'pdf/scanned-hint-settings', 'Scanned page (no text layer) — Enable OCR in Settings > PDF & OCR to recognize text');
        }
        return;
      }
      if (isCurrent) this._hint.textContent = '';
      for (const it of items) {
        if (!it.str) continue;
        const st = pdfjsMod.itemStyle(viewport, it);
        const span = doc.createElement('span');
        span.textContent = it.str;
        // 渲染坐标在 cssScale×dpr 空间，除回 dpr 得 CSS 像素
        span.style.left = `${st.left / dpr}px`;
        span.style.top = `${st.top / dpr}px`;
        span.style.fontSize = `${st.fontSize / dpr}px`;
        span.style.color = 'transparent';
        layer.appendChild(span);
      }
    }

    /** OCR 转写区跟随当前页（扫描页转写显示在纸页下方可选区） */
    _syncOcrBox() {
      if (!this._ocrBox) return;
      this._ocrBox.setAttribute('data-tiddler-title', this.getVariable('currentTiddler') || '');
      const ocrText = this._docPageTitle
        ? this.wiki.getTiddlerText(parsePdf.ocrTiddlerTitle(this._docPageTitle, this._page), '')
        : '';
      this._ocrBox.textContent = ocrText || '';
    }

    /** OCR 本页：页面 PNG → LLM 视觉模型转写 Markdown → 持久化 <文档页>/ocr-p<页> */
    async _ocrPage(btn: any) {
      if (this._ocrBusy || !this._pdf) return;
      const cfg = config.readOcrConfig(this.wiki);
      if (!cfg.apiKey) {
        this._status.textContent = lingo(this.wiki, 'pdf/ocr-no-key', 'OCR API key not configured (Settings > PDF & OCR)');
        return;
      }
      this._ocrBusy = true;
      btn.disabled = true;
      const pageNum = this._page;
      try {
        this._status.textContent = lingo(this.wiki, 'pdf/ocr-rendering', 'OCR: Converting page to image...');
        // 离屏渲染（宽上限 1400px，控制请求体大小）
        const page = await this._pdf.getPage(pageNum);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1400 / base.width, 2) });
        const off = this.document.createElement('canvas');
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        await page.render({ canvasContext: off.getContext('2d'), viewport }).promise;
        const dataUrl = off.toDataURL('image/png');
        const imageB64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        this._status.textContent = lingo(this.wiki, 'pdf/ocr-recognizing', 'OCR: Recognizing text...');
        const req = parsePdf.buildOcrRequest(cfg, imageB64, `Page ${pageNum}`);
        const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = parsePdf.parseOcrResponse(await res.json());
        if (!text) throw new Error(lingo(this.wiki, 'pdf/ocr-empty', 'OCR recognition result is empty'));
        // 识别期间翻页也照常按原页落库；仅停在原页时刷新转写区
        this.wiki.addTiddler({
          title: parsePdf.ocrTiddlerTitle(this._docPageTitle, pageNum),
          text,
          'tidme.doc': this._docId,
        });
        if (this._page === pageNum) {
          this._status.textContent = lingo(this.wiki, 'pdf/ocr-done', 'OCR completed');
          this._syncOcrBox();
        } else {
          this._status.textContent = `${lingo(this.wiki, 'pdf/ocr-done', 'OCR completed')} (${lingo(this.wiki, 'pdf/page-prefix', 'p.')} ${pageNum})`;
        }
      } catch (e: any) {
        this._status.textContent = `${lingo(this.wiki, 'pdf/ocr-failed', 'OCR failed:')} ${String(e?.message || e)}`;
      } finally {
        this._ocrBusy = false;
        btn.disabled = false;
      }
    }

    // ---------- 框选图片制卡（逐页盒：拖拽发生在哪个页盒就裁哪个 canvas） ----------

    _closestSheet(target: any): any {
      let n = target;
      while (n) {
        if (typeof n.getAttribute === 'function' && n.getAttribute('data-page')) return n;
        n = n.parentNode;
      }
      return null;
    }

    _wireRectSelect(selBtn: any, viewer: any, sectionTitle: string) {
      selBtn.addEventListener('click', () => {
        this._selMode = !this._selMode;
        selBtn.classList.toggle('tm-pdf-ico--on', this._selMode);
        viewer.classList.toggle('tm-pdf-selecting', this._selMode);
        this._status.textContent = this._selMode
          ? lingo(this.wiki, 'pdf/box-select-hint', 'Box select mode: Drag a rectangle on the page, release to create Image Q&A card')
          : '';
      });
      viewer.addEventListener('mousedown', (e: MouseEvent) => {
        if (!this._selMode || e.button !== 0) return;
        const doc = this.document || document;
        const sheetEl = this._closestSheet(e.target);
        const page = Number(sheetEl?.getAttribute?.('data-page')) || 0;
        const box = page ? this._sheets.get(page) : null;
        if (!box) return;
        const selRect = box.rect;
        const canvas = box.canvas;
        const setRect = (x: number, y: number, w: number, h: number) => {
          selRect.style.left = `${x}px`;
          selRect.style.top = `${y}px`;
          selRect.style.width = `${w}px`;
          selRect.style.height = `${h}px`;
          selRect.style.display = w > 2 && h > 2 ? 'block' : 'none';
        };
        const cr = canvas.getBoundingClientRect();
        this._selStart = { x: e.clientX - cr.left, y: e.clientY - cr.top };
        setRect(this._selStart.x, this._selStart.y, 0, 0);
        const move = (ev: MouseEvent) => {
          if (!this._selStart) return;
          const currentCr = canvas.getBoundingClientRect();
          const x2 = ev.clientX - currentCr.left;
          const y2 = ev.clientY - currentCr.top;
          setRect(Math.min(this._selStart.x, x2), Math.min(this._selStart.y, y2), Math.abs(x2 - this._selStart.x), Math.abs(y2 - this._selStart.y));
        };
        const up = (ev: MouseEvent) => {
          doc.removeEventListener('mousemove', move);
          doc.removeEventListener('mouseup', up);
          const currentCr = canvas.getBoundingClientRect();
          const x2 = ev.clientX - currentCr.left;
          const y2 = ev.clientY - currentCr.top;
          const x = Math.min(this._selStart!.x, x2);
          const y = Math.min(this._selStart!.y, y2);
          const w = Math.abs(x2 - this._selStart!.x);
          const h = Math.abs(y2 - this._selStart!.y);
          this._selStart = null;
          setRect(0, 0, 0, 0);
          if (w < 12 || h < 12) return; // 误触
          this._createImageCard(sectionTitle, page, x, y, w, h, canvas);
        };
        doc.addEventListener('mousemove', move);
        doc.addEventListener('mouseup', up);
      });
    }

    _createImageCard(sectionTitle: string, page: number, x: number, y: number, w: number, h: number, canvas: any) {
      const scale = canvas.width / (canvas.clientWidth || canvas.width);
      const crop = this.document.createElement('canvas');
      crop.width = Math.round(w * scale);
      crop.height = Math.round(h * scale);
      crop.getContext('2d').drawImage(canvas, x * scale, y * scale, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const dataUrl = crop.toDataURL('image/png');

      // 弹出即时制卡弹窗：显示截图预览，直接录入答案与可选简短标题
      cardModal.openCardModal(this.document, {
        type: 'image-qa',
        imageUrl: dataUrl,
        page,
        onSave: (res: any) => {
          const answer = (res.answerOrCloze || '').trim();
          const label = (res.label || '').trim();
          const matchedSection = docOps.sectionOfDocByPage && this._docId ? docOps.sectionOfDocByPage(this.wiki, this._docId, page) : null;
          const targetSection = matchedSection || sectionTitle || this.getVariable('currentTiddler') || this._docPageTitle;
          const defaultPending = lingo(this.wiki, 'pdf/pending-answer', '(Answer pending)');
          const qa = cardFactory.buildImageQA
            ? cardFactory.buildImageQA(this.wiki, targetSection, { dataUrl, answer, label, page })
            : cardFactory.buildQA(this.wiki, targetSection, `<img src="${dataUrl}" style="max-width:100%">`, answer || defaultPending);
          cardFactory.commitCard(this.wiki, qa);
          this._status.textContent = lingo(this.wiki, 'pdf/image-card-created', 'Image Q&A card created');
          if (this._selMode) {
            this._selMode = false;
            this._selBtn?.classList.remove('tm-pdf-ico--on');
            this._viewer?.classList.remove('tm-pdf-selecting');
          }
        },
      });
    }
  }
  return PdfReaderWidget as any;
}

exports['tidme-pdf-reader'] = makeReader();
exports.resolvePdfContext = resolvePdfContext;
exports.loadPdfBytesWithWait = loadPdfBytesWithWait;
exports.isPdfReaderActive = isPdfReaderActive;

// ---------- 全局键盘仲裁：同一时刻只有「最近交互的阅读器」响应翻页键 ----------
// - document 级 keydown 每个 doc 只绑一次（keyboardBinds），分发给 activeReader ——
//   此前按实例各绑一份，故事河同时挂两个 PDF 时一次按键双跳、页码 state 互相覆盖。
// - activeReader 归属：render / 在 root 内按下指针 时获得；点击 root 外、销毁 时失去。
//   折叠的 tiddler 在被重新点击前不再抢占方向键（此前"挂载即拥有"会永久压制阅读条栏）。
// - section.ts 的全局 ←/→ 快捷键（阅读条栏跨卡导航）在 isPdfReaderActive() 为真时让路。
// 注意：本模块的对外导出统一走 exports.*（与文件内 ESM import 混用 export 语句
// 会改变 esbuild 的模块格式判定，导致上方 exports.* 导出全部丢失）。
let activeReader: any = null;
const keyboardBinds = new WeakMap<object, (e: KeyboardEvent) => void>();

function bindGlobalKeyboard(doc: Document): void {
  if (keyboardBinds.has(doc)) return;
  const handler = (e: KeyboardEvent) => {
    if (!activeReader || activeReader._destroyed) return;
    // 编辑控件聚焦时让路（与实例内 _onKeydown 同一口径）
    const target = (e && e.target) as any;
    const tag = String(target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
    activeReader._onKeydown(e);
  };
  keyboardBinds.set(doc, handler);
  if (typeof doc.addEventListener === 'function') doc.addEventListener('keydown', handler);
}

function isPdfReaderActive(): boolean {
  return !!activeReader && !activeReader._destroyed;
}
