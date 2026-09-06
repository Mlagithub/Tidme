/*
widgets/pdf-reader.ts — PDF 阅读器（tidme-pdf-reader）

数据：currentTiddler 字段 tidme.pdf（二进制标题）/ tidme.pages（"起-止"）/ tidme.doc。
- pdf.js CDN 按需加载；canvas 渲染当前页 + 文本层（选中文字 → 既有 Alt+X/Z/Q 制卡
  链路直接复用：文本层容器带 data-tiddler-title 指向当前节卡/文档页）
- 翻页/页码跳转/续读点：$:/state/tidme-pdf/page/<docId> 记录当前页，打开时若落在
  本书范围则恢复；节卡打开时落到起始页
- 框选图片制卡：拖拽矩形 → 裁剪 PNG → buildQA 图片问答卡（openCardModal 填答案）
- OCR 本页：扫描页（无文本层）→ 页面 PNG → LLM-OCR（设置页启用）→ Markdown 文本层，
  结果持久化到 <文档页>/ocr-p<页>（清理阅读材料时级联删除）
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/core/dom.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const cardFactory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const parsePdf = require('$:/plugins/keepone/tidme/import/parse/pdf.js');
const pdfjsMod = require('$:/plugins/keepone/tidme/import/widgets/pdfjs.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;

function makeReader(): any {
  class PdfReaderWidget extends Widget {
    _root: any = null;
    _canvas: any = null;
    _textLayer: any = null;
    _status: any = null;
    _pageInput: any = null;
    _total: any = null;
    _pdf: any = null;
    _page: number = 1;
    _numPages: number = 0;
    _renderSeq: number = 0;
    _selMode: boolean = false;
    _selStart: { x: number; y: number } | null = null;
    _pdfTitle: string = '';
    _docId: string = '';
    _docPageTitle: string = '';

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const t = this.getVariable('currentTiddler') || '';
      const f = wiki.getTiddler(t)?.fields || {};
      this._pdfTitle = String(f['tidme.pdf'] || '');
      this._docId = String(f['tidme.doc'] || '');
      const range = parsePdf.parsePagesField(String(f['tidme.pages'] || ''));
      this._page = range.start;
      this._numPages = range.end || 0;
      // 文档页标题（OCR 转写 tiddler 前缀）：不切分时当前卡即文档页
      this._docPageTitle = String(f['tidme.type'] || '') === 'pdf' && !f['tidme.subkind'] ? t : docOps.docPageOfDoc(wiki, this._docId);
      const ocrEnabled = config.readOcrConfig(wiki).enable === true;

      const root = el(doc, 'div', 'tm-pdf');
      this._root = root;
      const bar = el(doc, 'div', 'tm-pdf-bar');
      const prevBtn = el(doc, 'button', 'tm-btn tm-btn--sm', '◀ 上一页');
      this._pageInput = doc.createElement('input');
      this._pageInput.type = 'number';
      this._pageInput.min = '1';
      this._pageInput.className = 'tm-pdf-page';
      this._pageInput.value = String(this._page);
      this._total = el(doc, 'span', 'tm-pdf-total', '');
      const nextBtn = el(doc, 'button', 'tm-btn tm-btn--sm', '下一页 ▶');
      bar.appendChild(prevBtn);
      bar.appendChild(this._pageInput);
      bar.appendChild(this._total);
      bar.appendChild(nextBtn);
      const selBtn = el(doc, 'button', 'tm-btn tm-btn--sm', '框选图片制卡');
      bar.appendChild(selBtn);
      if (ocrEnabled) {
        const ocrBtn = el(doc, 'button', 'tm-btn tm-btn--sm', 'OCR 本页');
        ocrBtn.title = '扫描页识别：页面转图片后用视觉模型转写为文本（设置 → PDF 与 OCR）';
        ocrBtn.addEventListener('click', () => this._ocrPage(ocrBtn));
        bar.appendChild(ocrBtn);
      }
      this._status = el(doc, 'div', 'tm-pdf-status', '正在加载 pdf.js…');
      bar.appendChild(this._status);
      root.appendChild(bar);

      const viewer = el(doc, 'div', 'tm-pdf-viewer');
      this._canvas = doc.createElement('canvas');
      this._canvas.className = 'tm-pdf-canvas';
      this._textLayer = el(doc, 'div', 'tm-pdf-textlayer', '');
      this._textLayer.setAttribute('data-tiddler-title', t);
      const selRect = el(doc, 'div', 'tm-pdf-rect', '');
      viewer.appendChild(this._canvas);
      viewer.appendChild(this._textLayer);
      viewer.appendChild(selRect);
      root.appendChild(viewer);

      // 框选图片制卡
      this._wireRectSelect(selBtn, viewer, selRect, t);

      prevBtn.addEventListener('click', () => this._setPage(this._page - 1));
      nextBtn.addEventListener('click', () => this._setPage(this._page + 1));
      this._pageInput.addEventListener('change', () => this._setPage(Number(this._pageInput.value) || 1));

      parent.insertBefore(root, nextSibling);
      this.domNodes.push(root);

      // 异步加载（pdf.js CDN + 二进制 tiddler）
      (async () => {
        try {
          const b64 = wiki.getTiddlerText(this._pdfTitle, '');
          if (!b64) {
            this._status.textContent = '缺少 PDF 数据';
            return;
          }
          this._pdf = await pdfjsMod.loadPdfBytes(pdfjsMod.base64ToBytes(b64));
          this._numPages = Number(this._pdf.numPages) || 0;
          this._total.textContent = ` / ${this._numPages}`;
          // 起始页：节卡起始页；本书续读点页码若在范围内则恢复
          let start = range.start;
          if (this._docId) {
            const saved = Number(wiki.getTiddlerText('$:/state/tidme-pdf/page/' + this._docId, ''));
            if (Number.isFinite(saved) && saved >= 1 && saved <= this._numPages) start = saved;
          }
          this._setPage(start, false);
        } catch (e: any) {
          this._status.textContent = '加载失败：' + String(e?.message || e);
        }
      })();
    }

    _setPage(n: number, save = true) {
      const max = this._numPages || this._page;
      this._page = Math.min(Math.max(1, Math.floor(n) || 1), max || 1);
      this._pageInput.value = String(this._page);
      if (save && this._docId) {
        this.wiki.addTiddler({ title: '$:/state/tidme-pdf/page/' + this._docId, text: String(this._page) });
      }
      void this._renderPage();
    }

    async _renderPage() {
      if (!this._pdf) return;
      const seq = ++this._renderSeq;
      this._status.textContent = '渲染中…';
      try {
        const viewport = await pdfjsMod.renderPageToCanvas(this._pdf, this._page, this._canvas);
        if (seq !== this._renderSeq) return;
        this._canvas.style.maxWidth = '100%';
        await this._fillTextLayer(viewport);
        if (seq !== this._renderSeq) return;
        this._status.textContent = '';
      } catch (e: any) {
        this._status.textContent = '渲染失败：' + String(e?.message || e);
      }
    }

    async _fillTextLayer(viewport: any) {
      const doc = this.document;
      const t = this.getVariable('currentTiddler') || '';
      const layer = this._textLayer;
      layer.textContent = '';
      layer.setAttribute('data-tiddler-title', t);
      // OCR 转写优先（扫描页）：整段纯文本，选中即可制卡
      const ocrTitle = parsePdf.ocrTiddlerTitle(this._docPageTitle, this._page);
      const ocrText = this.wiki.getTiddlerText(ocrTitle, '');
      if (ocrText) {
        const box = el(doc, 'div', 'tm-pdf-ocr-text', ocrText);
        box.setAttribute('data-tiddler-title', t);
        layer.appendChild(box);
        return;
      }
      const items = await pdfjsMod.pageTextItems(this._pdf, this._page);
      if (parsePdf.isScannedPageText(items.map((it: any) => it.str).join(' '))) {
        layer.appendChild(el(doc, 'div', 'tm-pdf-hint', '扫描页（无文本层）——可点「OCR 本页」识别文字'));
        return;
      }
      for (const it of items) {
        if (!it.str) continue;
        const st = pdfjsMod.itemStyle(viewport, it);
        const span = doc.createElement('span');
        span.textContent = it.str;
        span.style.left = `${st.left}px`;
        span.style.top = `${st.top}px`;
        span.style.fontSize = `${st.fontSize}px`;
        layer.appendChild(span);
      }
    }

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
        selBtn.classList.toggle('tm-pdf-sel-on', this._selMode);
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
