/*
widgets/pdf-reader.ts — PDF 阅读器（tidme-pdf-reader）

数据：currentTiddler 字段 tidme.pdf（二进制标题）/ tidme.pages（"起-止"）/ tidme.doc。
- pdf.js CDN 按需加载；canvas 渲染当前页 + 文本层（选中文字 → 既有 Alt+X/Z/Q 制卡
  链路直接复用：文本层容器带 data-tiddler-title 指向当前节卡/文档页）
- 界面仿桌面阅读器：深色工具栏（目录/翻页/缩放/框选/OCR/全屏）+ 灰色工作区 + 居中纸页，
  缩放默认「适合页面」，档位步进与自适应见 pdf-zoom.ts
- 翻页/页码跳转/续读点：$:/state/tidme-pdf/page/<docId> 记录当前页，打开时若落在
  本书范围则恢复；节卡打开时落到起始页
- 目录抽屉：本书节卡（docOps.sectionsOfDoc），点击跳到起始页
- 框选图片制卡：拖拽矩形 → 裁剪 PNG → buildQA 图片问答卡（openCardModal 填答案）
- OCR 本页：扫描页（无文本层）→ 页面 PNG → LLM-OCR（设置页启用）→ Markdown 文本，
  结果持久化到 <文档页>/ocr-p<页>（清理阅读材料时级联删除），显示在页下方可选区
*/

import * as zoomMod from './pdf-zoom';

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const cardFactory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const parsePdf = require('$:/plugins/keepone/tidme/import/parse/pdf.js');
const pdfjsMod = require('$:/plugins/keepone/tidme/import/widgets/pdfjs.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;

/** 工具栏全屏图标（内联 SVG，字体无关） */
const FS_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** 智能解析 PDF 上下文（二进制标题、docId、文档页标题，带路径/书名/库内候选多级回退） */
function resolvePdfContext(
  wiki: any,
  currentTitle: string,
): { pdfTitle: string; docId: string; docPageTitle: string } {
  if (!wiki || !currentTitle) return { pdfTitle: '', docId: '', docPageTitle: '' };
  const f = wiki.getTiddler(currentTitle)?.fields || {};
  let docId = String(f['tidme.doc'] || '');
  let pdfTitle = String(f['tidme.pdf'] || '');
  let docPageTitle = '';

  // 1. 若当前卡是文档页
  if (String(f['tidme.type'] || '') === 'pdf' && !f['tidme.subkind']) {
    docPageTitle = currentTitle;
  }

  // 2. 若无 pdfTitle，通过 docId 找文档页
  if (!pdfTitle && docId) {
    const docPage = docOps.docPageOfDoc(wiki, docId);
    if (docPage) {
      docPageTitle = docPageTitle || docPage;
      pdfTitle = String(wiki.getTiddler(docPage)?.fields?.['tidme.pdf'] || '');
    }
  }

  // 3. 若仍无，尝试从当前路径父级推断文档页（如 Tidme/Books/书名/01 章节 -> Tidme/Books/书名）
  if (!docPageTitle && currentTitle.includes('/')) {
    const parentCandidate = currentTitle.slice(0, currentTitle.lastIndexOf('/'));
    docPageTitle = parentCandidate;
    const parentTiddler = wiki.getTiddler(parentCandidate);
    if (parentTiddler) {
      if (!docId) docId = String(parentTiddler.fields['tidme.doc'] || '');
      if (!pdfTitle) pdfTitle = String(parentTiddler.fields['tidme.pdf'] || '');
    }
  }

  // 4. 若仍未找到有效 pdfTitle，从书名或全局库中匹配 PDF 二进制条目
  if (!pdfTitle || !wiki.getTiddler(pdfTitle)) {
    const breadcrumbFirst = String(f['tidme.breadcrumb'] || '').split('›')[0].trim();
    const caption = String(f.caption || '');
    let bookFromPath = '';
    if (currentTitle.startsWith(ns.NS_BOOKS)) {
      bookFromPath = currentTitle.slice(ns.NS_BOOKS.length).split('/')[0];
    } else if (docPageTitle && docPageTitle.startsWith(ns.NS_BOOKS)) {
      bookFromPath = docPageTitle.slice(ns.NS_BOOKS.length).split('/')[0];
    }
    const candidates = [breadcrumbFirst, caption, bookFromPath].filter((x) => x && x.length > 0);

    for (const name of candidates) {
      const direct = ns.NS_PDFS + name;
      if (wiki.getTiddler(direct)) {
        pdfTitle = direct;
        break;
      }
    }

    if (!pdfTitle || !wiki.getTiddler(pdfTitle)) {
      const allPdfs = typeof wiki.filterTiddlers === 'function' ? wiki.filterTiddlers('[type[application/pdf]]') : [];
      if (allPdfs.length === 1) {
        pdfTitle = allPdfs[0];
      } else if (allPdfs.length > 1) {
        for (const p of allPdfs) {
          const stripped = p.replace(ns.NS_PDFS, '');
          if (candidates.some((c) => p.includes(c) || c.includes(stripped))) {
            pdfTitle = p;
            break;
          }
        }
      }
    }
  }

  return {
    pdfTitle,
    docId,
    docPageTitle: docPageTitle || (docId ? docOps.docPageOfDoc(wiki, docId) : ''),
  };
}

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
    onStatus?.('正在从服务端加载 PDF 数据…');
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
    onStatus?.('正在请求外部 PDF 文件…');
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
  return pdfjsMod.base64ToBytes(cleanB64);
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
    _tocEl: any = null;
    _tocBtn: any = null;
    _tocItems: Array<{ el: any; start: number; end: number }> = [];
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
    _ocrBusy = false;
    _mode: zoomMod.ZoomMode = 'fit-page';
    _effScale = 0;
    _resizeTimer: any = null;
    _resizeObs: any = null;
    _ocrEnabled = false;
    _onFsChange: () => void = () => {};

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const t = this.getVariable('currentTiddler') || '';
      const f = wiki.getTiddler(t)?.fields || {};
      const ctx = resolvePdfContext(wiki, t);
      this._docId = ctx.docId;
      this._pdfTitle = ctx.pdfTitle;
      this._docPageTitle = ctx.docPageTitle;
      const range = parsePdf.parsePagesField(String(f['tidme.pages'] || ''));
      this._page = range.start;
      this._numPages = range.end || 0;
      this._ocrEnabled = config.readOcrConfig(wiki).enable === true;

      const root = el(doc, 'div', 'tm-pdf');
      this._root = root;

      // ── 工具栏：左=目录+翻页，中=缩放，右=框选/OCR/全屏 ──
      const bar = el(doc, 'div', 'tm-pdf-bar');
      const gNav = el(doc, 'div', 'tm-pdf-bar-group');
      this._tocBtn = el(doc, 'button', 'tm-pdf-ico', '☰');
      this._tocBtn.title = '目录（本书章节）';
      this._tocBtn.setAttribute('aria-label', '目录');
      const firstBtn = el(doc, 'button', 'tm-pdf-ico', '«');
      firstBtn.title = '第一页';
      const prevBtn = el(doc, 'button', 'tm-pdf-ico', '‹');
      prevBtn.title = '上一页';
      this._pageInput = doc.createElement('input');
      this._pageInput.type = 'number';
      this._pageInput.min = '1';
      this._pageInput.className = 'tm-pdf-page';
      this._pageInput.setAttribute('aria-label', '页码');
      this._pageInput.value = String(this._page);
      this._total = el(doc, 'span', 'tm-pdf-total', ' / …');
      const nextBtn = el(doc, 'button', 'tm-pdf-ico', '›');
      nextBtn.title = '下一页';
      const lastBtn = el(doc, 'button', 'tm-pdf-ico', '»');
      lastBtn.title = '最后一页';
      for (const n of [this._tocBtn, firstBtn, prevBtn, this._pageInput, this._total, nextBtn, lastBtn]) gNav.appendChild(n);

      const gZoom = el(doc, 'div', 'tm-pdf-bar-group tm-pdf-bar-center');
      const zoomOutBtn = el(doc, 'button', 'tm-pdf-ico', '−');
      zoomOutBtn.title = '缩小';
      this._zoomSel = doc.createElement('select');
      this._zoomSel.className = 'tm-pdf-zoom';
      this._zoomSel.setAttribute('aria-label', '缩放');
      for (
        const opt of [
          { value: 'fit-page', label: '适合页面' },
          { value: 'fit-width', label: '适合宽度' },
          { value: 'actual', label: '实际大小' },
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
      zoomInBtn.title = '放大';
      // 与桌面阅读器一致：− + 相邻，其后为缩放模式下拉
      for (const n of [zoomOutBtn, zoomInBtn, this._zoomSel]) gZoom.appendChild(n);

      const gTools = el(doc, 'div', 'tm-pdf-bar-group');
      this._selBtn = el(doc, 'button', 'tm-pdf-ico', '框选');
      this._selBtn.title = '框选图片制卡：在页面上拖拽矩形生成图片问答卡';
      if (this._ocrEnabled) {
        const ocrBtn = el(doc, 'button', 'tm-pdf-ico', 'OCR');
        ocrBtn.title = '扫描页识别：页面转图片后用视觉模型转写为文本（设置 → PDF 与 OCR）';
        ocrBtn.addEventListener('click', () => this._ocrPage(ocrBtn));
        gTools.appendChild(ocrBtn);
      }
      this._fsBtn = el(doc, 'button', 'tm-pdf-ico', '');
      this._fsBtn.innerHTML = FS_SVG;
      this._fsBtn.title = '全屏阅读';
      for (const n of [this._selBtn, this._fsBtn]) gTools.appendChild(n);

      bar.appendChild(gNav);
      bar.appendChild(gZoom);
      bar.appendChild(gTools);

      const activeStudy = sessionMod.getActiveStudy(wiki);
      if (activeStudy) {
        const gStudy = el(doc, 'div', 'tm-pdf-bar-group tm-pdf-bar-study');
        const nextBtn = el(doc, 'button', 'tm-pdf-btn-study-next', '✓ 读完继续 ›');
        nextBtn.title = '保存当前阅读进度，继续复习后续卡片';
        nextBtn.addEventListener('click', () => {
          if (this._docId && this._page) {
            docOps.saveReadPoint(wiki, this._docId, { t, s: `p${this._page}` });
            wiki.addTiddler({ title: `$:/state/tidme-pdf/page/${this._docId}`, text: String(this._page) });
          }
          let list = Array.isArray(activeStudy.list) ? [...activeStudy.list] : [];
          list = list.filter((x: string) => x !== t);
          const sessT = wiki.getTiddler(sessionMod.SESSION_TIDDLER);
          wiki.addTiddler({ ...(sessT?.fields || { title: sessionMod.SESSION_TIDDLER }), list });
          dom.closeTiddler(this, t);
          if (list.length > 0) {
            const nextCard = list[0];
            docOps.prepareCardFold(wiki, nextCard);
            dom.navigateTo(this, nextCard);
          } else {
            this.dispatchEvent({ type: 'tm-confetti-launch' });
            dom.notify(this, ns.NOTIFY_CONGRATULATION);
            dom.navigateTo(this, ns.PAGE_TODAY);
          }
        });
        gStudy.appendChild(nextBtn);
        bar.appendChild(gStudy);
      }

      root.appendChild(bar);

      // ── 工作区：目录抽屉 + 灰底滚动区 + 居中纸页（canvas/文本层/框选矩形）+ 悬浮提示 ──
      const body = el(doc, 'div', 'tm-pdf-body');
      this._tocEl = el(doc, 'div', 'tm-pdf-toc');
      const tocHead = el(doc, 'div', 'tm-pdf-toc-head', '目录');
      const tocClose = el(doc, 'button', 'tm-pdf-ico', '✕');
      tocClose.title = '收起目录';
      tocHead.appendChild(tocClose);
      const tocList = el(doc, 'div', 'tm-pdf-toc-list');
      this._tocEl.appendChild(tocHead);
      this._tocEl.appendChild(tocList);
      this._buildToc(tocList, doc);

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
      this._status = el(doc, 'div', 'tm-pdf-status', '正在加载 pdf.js…');
      body.appendChild(this._tocEl);
      body.appendChild(this._viewer);
      body.appendChild(this._hint);
      body.appendChild(this._status);
      root.appendChild(body);

      // OCR 转写文本（扫描页）：纸页下方的可见可选区
      this._ocrBox = el(doc, 'div', 'tm-pdf-ocr-text', '');
      this._ocrBox.setAttribute('data-tiddler-title', t);
      root.appendChild(this._ocrBox);

      // ── 事件 ──
      this._tocBtn.addEventListener('click', () => this._toggleToc());
      tocClose.addEventListener('click', () => this._toggleToc(false));
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
          this._status.textContent = `缺少 PDF 数据（条目：${this._pdfTitle || '未找到关联 PDF'}）`;
          return;
        }
        this._pdf = await pdfjsMod.loadPdfBytes(bytes);
        this._numPages = Number(this._pdf.numPages) || 0;
        this._total.textContent = ` / ${this._numPages}`;
        let start = r.start;
        if (this._docId) {
          const saved = Number(wiki.getTiddlerText('$:/state/tidme-pdf/page/' + this._docId, ''));
          if (Number.isFinite(saved) && saved >= 1 && saved <= this._numPages) start = saved;
        }
        this._setPage(start, false);
      } catch (e: any) {
        this._status.textContent = '加载失败：' + String(e?.message || e);
      }
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
      return false;
    }

    destroy() {
      if (this._resizeObs) this._resizeObs.disconnect();
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      if (this._onFsChange && typeof this.document.removeEventListener === 'function') {
        this.document.removeEventListener('fullscreenchange', this._onFsChange);
      }
      super.destroy?.();
    }

    // ---------- 翻页与渲染 ----------

    _setPage(n: number, save = true) {
      const max = this._numPages || this._page;
      this._page = Math.min(Math.max(1, Math.floor(n) || 1), max || 1);
      this._pageInput.value = String(this._page);
      if (save && this._docId) {
        this.wiki.addTiddler({ title: '$:/state/tidme-pdf/page/' + this._docId, text: String(this._page) });
      }
      this._updateTocCurrent();
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
      this._status.textContent = '渲染中…';
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
        await this._fillTextLayer(viewport, dpr);
        if (seq !== this._renderSeq) return;
        this._status.textContent = '';
      } catch (e: any) {
        this._status.textContent = '渲染失败：' + String(e?.message || e);
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

    // ---------- 目录抽屉 ----------

    _buildToc(tocList: any, doc: any) {
      // sectionsOfDoc 含文档页本体（kind topic 无 subkind）；目录只列带页区间的真节卡，
      // 整本不切分（仅文档页）→ 无目录可列，按钮隐藏
      const secs = (this._docId ? docOps.sectionsOfDoc(this.wiki, this._docId) : [])
        .filter((t: string) => this.wiki.getTiddler(t)?.fields?.['tidme.pages']);
      if (!secs.length) {
        this._tocBtn.style.display = 'none';
        return;
      }
      for (const title of secs) {
        const sf = this.wiki.getTiddler(title)?.fields || {};
        const r = parsePdf.parsePagesField(String(sf['tidme.pages'] || ''));
        const label = String(sf.caption || title).trim() || title;
        const item = el(doc, 'button', 'tm-pdf-toc-item');
        item.appendChild(el(doc, 'span', 'tm-pdf-toc-name', label));
        item.appendChild(el(doc, 'span', 'tm-pdf-toc-page', String(r.start)));
        item.title = `${label}（第 ${r.start} 页）`;
        item.addEventListener('click', () => {
          this._toggleToc(false);
          this._setPage(r.start);
        });
        tocList.appendChild(item);
        this._tocItems.push({ el: item, start: r.start, end: r.end || this._numPages });
      }
    }

    _toggleToc(open?: boolean) {
      const willOpen = open === undefined ? !this._tocEl.classList.contains('tm-pdf-toc--open') : open;
      this._tocEl.classList.toggle('tm-pdf-toc--open', willOpen);
      this._tocBtn.classList.toggle('tm-pdf-ico--on', willOpen);
      if (willOpen) this._updateTocCurrent();
    }

    _updateTocCurrent() {
      for (const it of this._tocItems) {
        it.el.classList.toggle('tm-pdf-toc-cur', this._page >= it.start && this._page <= it.end);
      }
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
          ? '扫描页（无文本层）——点工具栏「OCR」识别文字'
          : '扫描页（无文本层）——设置页开启「PDF 与 OCR」后可识别文字';
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
        layer.appendChild(span);
      }
    }

    /** OCR 本页：页面 PNG → LLM 视觉模型转写 Markdown → 持久化 <文档页>/ocr-p<页> */
    async _ocrPage(btn: any) {
      if (this._ocrBusy || !this._pdf) return;
      const cfg = config.readOcrConfig(this.wiki);
      if (!cfg.apiKey) {
        this._status.textContent = 'OCR 未配置 API Key（设置 → PDF 与 OCR）';
        return;
      }
      this._ocrBusy = true;
      btn.disabled = true;
      const pageNum = this._page;
      try {
        this._status.textContent = 'OCR：页面转图片…';
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
        this._status.textContent = 'OCR：识别中…';
        const req = parsePdf.buildOcrRequest(cfg, imageB64, `第 ${pageNum} 页`);
        const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = parsePdf.parseOcrResponse(await res.json());
        if (!text) throw new Error('识别结果为空');
        // 识别期间翻页也照常按原页落库；仅停在原页时刷新文本层
        this.wiki.addTiddler({
          title: parsePdf.ocrTiddlerTitle(this._docPageTitle, pageNum),
          text,
          'tidme.doc': this._docId,
        });
        if (this._page === pageNum) {
          this._status.textContent = 'OCR 完成';
          await this._renderPage();
        } else {
          this._status.textContent = `OCR 完成（第 ${pageNum} 页，翻回即可查看）`;
        }
      } catch (e: any) {
        this._status.textContent = 'OCR 失败：' + String(e?.message || e);
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
        this._status.textContent = this._selMode ? '框选模式：在页面上拖拽矩形，松开后生成图片问答卡' : '';
      });
      viewer.addEventListener('mousedown', (e: MouseEvent) => {
        if (!this._selMode || e.button !== 0) return;
        const cr = this._canvas.getBoundingClientRect();
        this._selStart = { x: e.clientX - cr.left, y: e.clientY - cr.top };
        setRect(this._selStart.x, this._selStart.y, 0, 0);
        const move = (ev: MouseEvent) => {
          if (!this._selStart) return;
          const x2 = ev.clientX - cr.left;
          const y2 = ev.clientY - cr.top;
          setRect(Math.min(this._selStart.x, x2), Math.min(this._selStart.y, y2), Math.abs(x2 - this._selStart.x), Math.abs(y2 - this._selStart.y));
        };
        const up = (ev: MouseEvent) => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          const x2 = ev.clientX - cr.left;
          const y2 = ev.clientY - cr.top;
          const x = Math.min(this._selStart.x, x2);
          const y = Math.min(this._selStart.y, y2);
          const w = Math.abs(x2 - this._selStart.x);
          const h = Math.abs(y2 - this._selStart.y);
          this._selStart = null;
          setRect(0, 0, 0, 0);
          if (w < 12 || h < 12) return; // 误触
          this._createImageCard(sectionTitle, x, y, w, h);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }

    _createImageCard(sectionTitle: string, x: number, y: number, w: number, h: number) {
      const scale = this._canvas.width / (this._canvas.clientWidth || this._canvas.width);
      const crop = this.document.createElement('canvas');
      crop.width = Math.round(w * scale);
      crop.height = Math.round(h * scale);
      crop.getContext('2d').drawImage(this._canvas, x * scale, y * scale, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const dataUrl = crop.toDataURL('image/png');
      // 图片问答卡：问题面 = 截图；答案先占位，卡片内可编辑
      const qa = cardFactory.buildQA(this.wiki, sectionTitle, `<img src="${dataUrl}" style="max-width:100%">`, '（答案待补充）');
      cardFactory.commitCard(this.wiki, qa, this);
      this._status.textContent = '已创建图片问答卡（进入复习或卡片管理可补充答案）';
    }
  }
  return PdfReaderWidget as any;
}

exports['tidme-pdf-reader'] = makeReader();
exports.resolvePdfContext = resolvePdfContext;
exports.loadPdfBytesWithWait = loadPdfBytesWithWait;
