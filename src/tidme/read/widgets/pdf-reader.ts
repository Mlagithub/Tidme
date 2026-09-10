/*
widgets/pdf-reader.ts — PDF 阅读器（tidme-pdf-reader）

数据：currentTiddler 字段 tidme.asset（二进制标题）/ tidme.pages（"起-止"，仅存量
分节书籍携带）/ tidme.doc。
- 二进制缺失/为空（服务端 0 字节 .pdf 等）→ 状态条提供「重新绑定 PDF」原位恢复，
  选原始文件覆写二进制条目，续读点/进度全保留
- pdf.js CDN 按需加载；canvas 渲染当前页 + 文本层（选中文字 → 既有 Alt+X/Z/Q 制卡
  链路直接复用：文本层容器带 data-tiddler-title 指向当前卡/文档页）
- 界面仿桌面阅读器：深色工具栏（翻页/缩放/框选/OCR/全屏）+ 灰色工作区 + 居中纸页，
  缩放默认「适合页面」，档位步进与自适应见 pdf-zoom.ts
- 翻页/页码跳转/续读点：打开时优先恢复续读点绝对页码（不切分，阅读连续跨节）；
  $:/state/tidme-pdf/page/<docId> 仅作「回原文」等一次性页码交接（消费即清理）
- 框选图片制卡：拖拽矩形 → 裁剪 PNG → buildQA 图片问答卡（openCardModal 填答案）
- OCR 本页：扫描页（无文本层）→ 页面 PNG → LLM-OCR（设置页启用）→ Markdown 文本，
  结果持久化到 <文档页>/ocr-p<页>（清理阅读材料时级联删除），显示在页下方可选区
*/

import * as zoomMod from './pdf-zoom';

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const binaryMod = require('$:/plugins/keepone/tidme/core/binary.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const cardFactory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const pdfOps = require('$:/plugins/keepone/tidme/core/pdf-ops.js');
const cardModal = require('$:/plugins/keepone/tidme/ui/components/card-modal.js');
const parsePdf = require('$:/plugins/keepone/tidme/import/parse/pdf.js');
const pdfjsMod = require('$:/plugins/keepone/tidme/import/widgets/pdfjs.js');
const stats = require('$:/plugins/keepone/tidme/core/stats.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

function lingo(wiki: any, key: string, fallback: string): string {
  return lingoMod ? lingoMod.lingo(wiki, key, fallback) : fallback;
}

const el = dom.el;

/** 工具栏全屏图标（内联 SVG，字体无关） */
const FS_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const resolvePdfContext = pdfOps.resolvePdfContext;

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

  let cleanB64 = b64;
  const commaIdx = b64.indexOf(',');
  if (b64.startsWith('data:') && commaIdx !== -1) {
    cleanB64 = b64.slice(commaIdx + 1);
  }
  return binaryMod.base64ToBytes(cleanB64);
}

function makeReader(): any {
  class PdfReaderWidget extends Widget {
    _root: any = null;
    _viewer: any = null;
    _pageBox: any = null;
    _canvas: any = null;
    _textLayer: any = null;
    _selRect: any = null;
    _hint: any = null;
    _status: any = null;
    _ocrBox: any = null;
    _pageInput: any = null;
    _total: any = null;
    _zoomSel: any = null;
    _selBtn: any = null;
    _fsBtn: any = null;
    _pdf: any = null;
    _page: number = 1;
    _numPages: number = 0;
    _renderSeq: number = 0;
    _selMode: boolean = false;
    _selStart: { x: number; y: number } | null = null;
    _pdfTitle: string = '';
    _docId: string = '';
    _docPageTitle: string = '';
    _reattachBtn: any = null;
    _ocrBusy = false;
    _mode: zoomMod.ZoomMode = 'fit-page';
    _effScale = 0;
    _resizeTimer: any = null;
    _resizeObs: any = null;
    _ocrEnabled = false;
    _onFsChange: () => void = () => {};
    _savePageTimer: any = null;
    _startTime: number = 0;

    _flushReadTime() {
      if (this._startTime && this.wiki) {
        const elapsedSec = (Date.now() - this._startTime) / 1000;
        this._startTime = Date.now();
        if (elapsedSec >= 1 && elapsedSec <= 7200) {
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
      this._page = this._resolveInitialPage(range, 0);
      this._numPages = 0;
      this._ocrEnabled = config.readOcrConfig(wiki).enable === true;

      const root = el(doc, 'div', 'tm-pdf');
      this._root = root;

      // ── 工具栏：左=翻页，中=缩放，右=框选/OCR/全屏 ──
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

      const gZoom = el(doc, 'div', 'tm-pdf-bar-group tm-pdf-bar-center');
      const zoomOutBtn = el(doc, 'button', 'tm-pdf-ico', '−');
      zoomOutBtn.title = lingoMod.lingo(wiki, 'read.zoom.out', 'Zoom Out');
      this._zoomSel = doc.createElement('select');
      this._zoomSel.className = 'tm-pdf-zoom';
      this._zoomSel.setAttribute('aria-label', lingoMod.lingo(wiki, 'read.zoom', 'Zoom'));
      for (
        const opt of [
          { value: 'fit-page', label: lingoMod.lingo(wiki, 'read.zoom.fitpage', 'Fit Page') },
          { value: 'fit-width', label: lingoMod.lingo(wiki, 'read.zoom.fitwidth', 'Fit Width') },
          { value: 'actual', label: lingoMod.lingo(wiki, 'read.zoom.actual', 'Actual Size') },
          ...zoomMod.ladderOptions(),
        ]
      ) {
        const o = doc.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        this._zoomSel.appendChild(o);
      }
      this._zoomSel.value = 'fit-page';
      const zoomInBtn = el(doc, 'button', 'tm-pdf-ico', '+');
      zoomInBtn.title = lingoMod.lingo(wiki, 'read.zoom.in', 'Zoom In');
      // 与桌面阅读器一致：− + 相邻，其后为缩放模式下拉
      for (const n of [zoomOutBtn, zoomInBtn, this._zoomSel]) gZoom.appendChild(n);

      const gTools = el(doc, 'div', 'tm-pdf-bar-group');
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

      bar.appendChild(gNav);
      bar.appendChild(gZoom);
      bar.appendChild(gTools);

      const activeStudy = sessionMod.getActiveStudy(wiki);
      if (activeStudy) {
        const gStudy = el(doc, 'div', 'tm-pdf-bar-group tm-pdf-bar-study');
        const studyNextBtn = el(doc, 'button', 'tm-pdf-btn-study-next', lingoMod.lingo(wiki, 'pdf.study.next', '✓ Done & Continue ›'));
        studyNextBtn.title = lingoMod.lingo(wiki, 'pdf.study.next.tip', 'Save reading progress and continue study flow');
        studyNextBtn.addEventListener('click', () => {
          if (this._docId && this._page) {
            docOps.saveReadPoint(wiki, this._docId, { t, s: `p${this._page}` });
            wiki.addTiddler({ title: ns.pdfPageStateTitle(this._docId), text: String(this._page) });
          }
          // 推进决策统一走 session.advanceSession（nextSchedulable + isDueNow）：
          // 先在当前卡之后找下一张可学卡（会话快照中被顺延的卡不提前重放），再移出当前卡
          const nextCard = sessionMod.advanceSession(wiki, t);
          sessionMod.removeFromSession(wiki, t); // 会话唯一读写口，勿手写 SESSION_TIDDLER
          dom.closeTiddler(this, t);
          if (nextCard) {
            sessionMod.prepareCardFold(wiki, nextCard);
            dom.navigateTo(this, nextCard);
          } else {
            this.dispatchEvent({ type: 'tm-confetti-launch' });
            dom.notify(this, ns.NOTIFY_CONGRATULATION);
            dom.navigateTo(this, ns.PAGE_TODAY);
          }
        });
        gStudy.appendChild(studyNextBtn);
        bar.appendChild(gStudy);
      }

      root.appendChild(bar);

      // ── 工作区：灰底滚动区 + 居中纸页（canvas/文本层/框选矩形）+ 悬浮提示 ──
      const body = el(doc, 'div', 'tm-pdf-body');

      this._viewer = el(doc, 'div', 'tm-pdf-viewer');
      this._viewer.setAttribute('tabindex', '0');
      this._pageBox = el(doc, 'div', 'tm-pdf-sheet');
      this._pageBox.style.display = 'none';
      this._canvas = doc.createElement('canvas');
      this._canvas.className = 'tm-pdf-canvas';
      this._textLayer = el(doc, 'div', 'tm-pdf-textlayer', '');
      this._textLayer.setAttribute('data-tiddler-title', t);
      this._selRect = el(doc, 'div', 'tm-pdf-rect', '');
      this._pageBox.appendChild(this._canvas);
      this._pageBox.appendChild(this._textLayer);
      this._pageBox.appendChild(this._selRect);
      this._viewer.appendChild(this._pageBox);

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
      prevBtn.addEventListener('click', () => this._setPage(this._page - 1));
      nextBtn.addEventListener('click', () => this._setPage(this._page + 1));
      this._pageInput.addEventListener('change', () => this._setPage(Number(this._pageInput.value) || 1));
      zoomOutBtn.addEventListener('click', () => this._zoomStep(-1));
      zoomInBtn.addEventListener('click', () => this._zoomStep(1));
      this._zoomSel.addEventListener('change', () => this._onZoomSelect());
      this._fsBtn.addEventListener('click', () => this._toggleFullscreen());
      this._wireRectSelect(this._selBtn, this._viewer, this._selRect, t);
      this._viewer.addEventListener('keydown', (e: KeyboardEvent) => this._onKeydown(e));

      // 全屏切换后视口尺寸变化 → fit 重算（destroy 时随 widget 一并注销）
      this._onFsChange = () => void this._renderPage();
      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('fullscreenchange', this._onFsChange);
      }
      // 容器尺寸变化 → fit 模式防抖重渲染
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObs = new ResizeObserver(() => this._onResize());
        this._resizeObs.observe(this._viewer);
      }

      parent.insertBefore(root, nextSibling);
      this.domNodes.push(root);

      void this._loadPdf(range);
    }

    _resolveInitialPage(range: { start: number; end: number }, numPages = 0): number {
      const wiki = this.wiki;
      const t = this.getVariable('currentTiddler') || '';
      let target = range.start;
      if (this._docId) {
        const rp = docOps.parseReadPoint(wiki, this._docId);
        const rpPage = rp?.s && /^p\d+$/.test(rp.s) ? Number(rp.s.slice(1)) : NaN;
        const statePage = Number(wiki.getTiddlerText(ns.pdfPageStateTitle(this._docId), ''));

        // 1. 当前卡 = 续读点卡 → 恢复其记录的绝对页码。阅读本就连续跨节（页间防抖
        //    续存与学习模式「读完继续」都以当前卡记绝对页），页码允许越出本节
        //    tidme.pages 区间；仅当超过实有页数（如书籍重导入变小）时回退节起始
        if (rp?.t === t && Number.isFinite(rpPage) && rpPage >= 1) {
          if (numPages > 0 && rpPage > numPages) return target;
          return rpPage;
        }

        // 2. 若外部指定了有效页码（如「回原文」临时溯源），且落在本节区间内 → 采用该页并消费清理
        if (Number.isFinite(statePage) && statePage >= 1) {
          const inRange = !range.end || (statePage >= range.start && statePage <= range.end);
          if (inRange) {
            // 消费即清理，防止误劫持后续打开的其他节卡
            this.wiki.deleteTiddler(ns.pdfPageStateTitle(this._docId));
            return numPages > 0 && statePage > numPages ? target : statePage;
          }
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
      try {
        const bytes = await loadPdfBytesWithWait(wiki, this._pdfTitle, (msg) => {
          if (this._status) this._status.textContent = msg;
        });
        if (!bytes || bytes.length === 0) {
          this._status.textContent = lingoMod.lingo(wiki, 'pdf.missing', `Missing PDF data (${this._pdfTitle || 'No associated PDF found'})`);
          this._wireReattach();
          return;
        }
        this._pdf = await pdfjsMod.loadPdfBytes(bytes);
        this._numPages = Number(this._pdf.numPages) || 0;
        this._total.textContent = ` / ${this._numPages}`;
        if (this._docPageTitle && this._numPages > 0) {
          const docT = wiki.getTiddler(this._docPageTitle);
          if (docT && !docT.fields['tidme.pages-total']) {
            wiki.addTiddler({ ...docT.fields, 'tidme.pages-total': String(this._numPages) });
          }
        }
        const start = this._resolveInitialPage(r, this._numPages);
        this._setPage(start, false);
      } catch (e: any) {
        this._status.textContent = lingoMod.lingo(wiki, 'pdf.load.failed', 'Failed to load: ') + String(e?.message || e);
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
      this._cleanup();
      super.destroy?.();
    }

    // ---------- 翻页与渲染 ----------

    _setPage(n: number, save = true) {
      this._flushReadTime();
      const max = this._numPages > 0 ? this._numPages : Infinity;
      this._page = Math.min(Math.max(1, Math.floor(n) || 1), max || 1);
      this._pageInput.value = String(this._page);
      if (save && this._docId) {
        this.wiki.addTiddler({ title: ns.pdfPageStateTitle(this._docId), text: String(this._page) });
        // 防抖持久化续读点与全局续读点（章节跨越自动感知）
        if (this._savePageTimer) clearTimeout(this._savePageTimer);
        this._savePageTimer = setTimeout(() => {
          this._savePageTimer = null;
          const curT = this.getVariable('currentTiddler') || '';
          const matchedSection = docOps.sectionOfDocByPage ? docOps.sectionOfDocByPage(this.wiki, this._docId, this._page) : null;
          const targetCard = matchedSection || curT || this._docPageTitle;
          if (targetCard) {
            docOps.saveReadPoint(this.wiki, this._docId, { t: targetCard, s: `p${this._page}` });
            docOps.saveGlobalReadPoint(this.wiki, targetCard);
          }
        }, 300);
      }

      void this._renderPage();
    }

    _onKeydown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this._setPage(this._page - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this._setPage(this._page + 1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this._zoomStep(1);
      } else if (e.key === '-') {
        e.preventDefault();
        this._zoomStep(-1);
      }
    }

    _onResize() {
      if (!this._pdf || typeof this._mode === 'number') return;
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null;
        void this._renderPage();
      }, 180);
    }

    async _renderPage() {
      if (!this._pdf) return;
      const seq = ++this._renderSeq;
      this._status.textContent = lingoMod.lingo(this.wiki, 'pdf.rendering', 'Rendering...');
      try {
        const dpr = Math.min(Number((typeof window !== 'undefined' && (window as any).devicePixelRatio) || 1) || 1, 2);
        const size = await pdfjsMod.pageSize(this._pdf, this._page);
        if (seq !== this._renderSeq) return;
        const scale = this._computeZoom(size.width, size.height);
        this._effScale = scale;
        this._syncZoomSelect();
        const viewport = await pdfjsMod.renderPageToCanvas(this._pdf, this._page, this._canvas, { cssScale: scale, dpr });
        if (seq !== this._renderSeq) return;
        // 纸页盒与文本层跟随 CSS 尺寸（画布像素 = CSS × dpr）
        const cssW = this._canvas.width / dpr;
        const cssH = this._canvas.height / dpr;
        this._pageBox.style.width = `${cssW}px`;
        this._pageBox.style.height = `${cssH}px`;
        this._pageBox.style.display = 'block';
        this._textLayer.style.width = `${cssW}px`;
        this._textLayer.style.height = `${cssH}px`;
        if (seq !== this._renderSeq) return;
        await this._fillTextLayer(viewport, dpr);
        if (seq !== this._renderSeq) return;
        this._status.textContent = '';
      } catch (e: any) {
        this._status.textContent = lingoMod.lingo(this.wiki, 'pdf.render.failed', 'Render failed: ') + String(e?.message || e);
      }
    }

    _computeZoom(pw: number, ph: number): number {
      const gutter = 48;
      const cw = Math.max(200, (Number(this._viewer.clientWidth) || 0) - gutter);
      const ch = Math.max(200, (Number(this._viewer.clientHeight) || 0) - gutter);
      return zoomMod.resolveScale(this._mode, pw, ph, cw, ch);
    }

    // ---------- 缩放 ----------

    _zoomStep(dir: 1 | -1) {
      const base = typeof this._mode === 'number' ? this._mode : this._effScale || 1;
      this._mode = zoomMod.stepLadder(base, dir);
      this._syncZoomSelect();
      void this._renderPage();
    }

    _onZoomSelect() {
      const v = String(this._zoomSel.value || 'fit-page');
      this._mode = v === 'fit-page' || v === 'fit-width' || v === 'actual' ? v : Number(v) || 'fit-page';
      void this._renderPage();
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

    _toggleFullscreen() {
      const d = this.document as any;
      try {
        if (d.fullscreenElement) void d.exitFullscreen();
        else if (this._root.requestFullscreen) void this._root.requestFullscreen();
      } catch { /* 浏览器不支持全屏则忽略 */ }
    }

    // ---------- 文本层 / OCR ----------

    async _fillTextLayer(viewport: any, dpr: number) {
      const doc = this.document;
      const t = this.getVariable('currentTiddler') || '';
      const layer = this._textLayer;
      layer.textContent = '';
      layer.setAttribute('data-tiddler-title', t);
      this._hint.textContent = '';
      // OCR 转写优先（扫描页）：转写文本显示在纸页下方的可选区
      const ocrTitle = parsePdf.ocrTiddlerTitle(this._docPageTitle, this._page);
      const ocrText = this.wiki.getTiddlerText(ocrTitle, '');
      this._ocrBox.textContent = '';
      this._ocrBox.setAttribute('data-tiddler-title', t);
      if (ocrText) {
        this._ocrBox.textContent = ocrText;
        return;
      }
      const items = await pdfjsMod.pageTextItems(this._pdf, this._page);
      if (parsePdf.isScannedPageText(items.map((it: any) => it.str).join(' '))) {
        this._hint.textContent = this._ocrEnabled
          ? lingo(this.wiki, 'pdf/scanned-hint-ocr', 'Scanned page (no text layer) — Click "OCR" in toolbar to recognize text')
          : lingo(this.wiki, 'pdf/scanned-hint-settings', 'Scanned page (no text layer) — Enable OCR in Settings > PDF & OCR to recognize text');
        return;
      }
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
        // 识别期间翻页也照常按原页落库；仅停在原页时刷新文本层
        this.wiki.addTiddler({
          title: parsePdf.ocrTiddlerTitle(this._docPageTitle, pageNum),
          text,
          'tidme.doc': this._docId,
        });
        if (this._page === pageNum) {
          this._status.textContent = lingo(this.wiki, 'pdf/ocr-done', 'OCR completed');
          await this._renderPage();
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

    // ---------- 框选图片制卡 ----------

    _wireRectSelect(selBtn: any, viewer: any, selRect: any, sectionTitle: string) {
      const setRect = (x: number, y: number, w: number, h: number) => {
        selRect.style.left = `${x}px`;
        selRect.style.top = `${y}px`;
        selRect.style.width = `${w}px`;
        selRect.style.height = `${h}px`;
        selRect.style.display = w > 2 && h > 2 ? 'block' : 'none';
      };
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
        const cr = this._canvas.getBoundingClientRect();
        this._selStart = { x: e.clientX - cr.left, y: e.clientY - cr.top };
        setRect(this._selStart.x, this._selStart.y, 0, 0);
        const move = (ev: MouseEvent) => {
          if (!this._selStart) return;
          const currentCr = this._canvas.getBoundingClientRect();
          const x2 = ev.clientX - currentCr.left;
          const y2 = ev.clientY - currentCr.top;
          setRect(Math.min(this._selStart.x, x2), Math.min(this._selStart.y, y2), Math.abs(x2 - this._selStart.x), Math.abs(y2 - this._selStart.y));
        };
        const up = (ev: MouseEvent) => {
          doc.removeEventListener('mousemove', move);
          doc.removeEventListener('mouseup', up);
          const currentCr = this._canvas.getBoundingClientRect();
          const x2 = ev.clientX - currentCr.left;
          const y2 = ev.clientY - currentCr.top;
          const x = Math.min(this._selStart.x, x2);
          const y = Math.min(this._selStart.y, y2);
          const w = Math.abs(x2 - this._selStart.x);
          const h = Math.abs(y2 - this._selStart.y);
          this._selStart = null;
          setRect(0, 0, 0, 0);
          if (w < 12 || h < 12) return; // 误触
          this._createImageCard(sectionTitle, x, y, w, h);
        };
        doc.addEventListener('mousemove', move);
        doc.addEventListener('mouseup', up);
      });
    }

    _createImageCard(sectionTitle: string, x: number, y: number, w: number, h: number) {
      const scale = this._canvas.width / (this._canvas.clientWidth || this._canvas.width);
      const crop = this.document.createElement('canvas');
      crop.width = Math.round(w * scale);
      crop.height = Math.round(h * scale);
      crop.getContext('2d').drawImage(this._canvas, x * scale, y * scale, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const dataUrl = crop.toDataURL('image/png');

      // 弹出即时制卡弹窗：显示截图预览，直接录入答案与可选简短标题
      cardModal.openCardModal(this.document, {
        type: 'image-qa',
        imageUrl: dataUrl,
        page: this._page,
        onSave: (res: any) => {
          const answer = (res.answerOrCloze || '').trim();
          const label = (res.label || '').trim();
          const matchedSection = docOps.sectionOfDocByPage && this._docId ? docOps.sectionOfDocByPage(this.wiki, this._docId, this._page) : null;
          const targetSection = matchedSection || sectionTitle || this.getVariable('currentTiddler') || this._docPageTitle;
          const defaultPending = lingo(this.wiki, 'pdf/pending-answer', '(Answer pending)');
          const qa = cardFactory.buildImageQA
            ? cardFactory.buildImageQA(this.wiki, targetSection, { dataUrl, answer, label, page: this._page })
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
