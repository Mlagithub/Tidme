const { lingo } = require('$:/plugins/keepone/tidme/core/lingo.js');
/*
widgets/import.ts — 自包含导入组件

<$import-file> 一个组件完成全部交互：
  拖放/选择 → 调用共享管线解析 → 就地渲染预览（含目录大纲折叠面板）→ 导入/清除。
不依赖 wikitext 响应式列表（规避状态刷新时序问题）；待导入产物随 pending 队列存活。
*/

declare function require(module: string): any;
const parse = require('$:/plugins/keepone/tidme/import/parse.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const binaryMod = require('$:/plugins/keepone/tidme/core/binary.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const commitMod = require('$:/plugins/keepone/tidme/core/import-commit.js');
const dialog = require('$:/plugins/keepone/tidme/ui/base/dialog.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const semMod = require('$:/plugins/keepone/tidme/core/server/semantic-split');
const pdfImport = require('$:/plugins/keepone/tidme/import/widgets/pdf-import.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

interface ImportResult {
  bookTitle: string;
  docId: string;
  format: string;
  sectionCount: number;
  stats: { hardSplitCount: number };
  tiddlers: Record<string, any>[];
  warnings: string[];
}

/** 导入临时区（$:/temp/tidme-import/*：会话级选项/待导队列/服务端 pending 契约；bag 见 ns.IMPORT_BAG_TITLE） */
const TEMP_IMPORT = '$:/temp/tidme-import/';

/** 预览条目 token：仅作 pending Map 键与 DOM 标识；产物生命周期随 pending，不另设模块级缓存 */
function makeToken(): string {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getOptions(wiki: any): { maxChars?: number; minChars?: number; bag: string; semanticSplitCfg?: any } {
  const num = (t: string) => {
    const v = parseInt(wiki.getTiddlerText(t, '').trim(), 10);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const bag = (wiki.getTiddlerText(parse.IMPORT_BAG_TITLE, '') || '').trim();
  // 语义切分配置唯一读取口 = getSemanticSplitConfig（text JSON + apiKey/baseUrl/model 字段覆盖）
  const hasCfg = wiki.getTiddler(semMod.SEMANTIC_SPLIT_CONFIG_TITLE);
  return {
    maxChars: num(TEMP_IMPORT + 'max'),
    minChars: num(TEMP_IMPORT + 'min'),
    bag: bag || 'default', // TiddlyWeb server 版同步目标桶
    semanticSplitCfg: hasCfg ? getSemanticSplitConfig(wiki) : null,
  };
}

// 共享 DOM 工具（实现收敛于 core/ui-utils）
const el = dom.el;

function getSemanticSplitConfig(wiki: any): any {
  // 唯一实现 = core/config.readSemanticSplit（text JSON + 字段覆盖历史兼容）
  return config.readSemanticSplit(wiki);
}

/** 纯 LLM 语义二次切分：严格基于原文字符偏移切割，确保 100% 字数完整性 */
async function subSplitTiddlerWithLLM(tiddler: any, r: ImportResult, wiki: any): Promise<boolean> {
  const aiCfg = getSemanticSplitConfig(wiki);
  if (!aiCfg.apiKey) {
    await dialog.alertDialog(document, {
      title: lingo(this.wiki, 'ai.nokey.title', 'Missing API Key'),
      message: lingo(this.wiki, 'ai.nokey.msg', 'Please configure your API Key in Settings > AI Semantic Split before performing sub-splitting!'),
    });
    return false;
  }

  const origText = String(tiddler.text || '').trim();
  const subChunks: Array<{ title: string; text: string; chars: number }> = await semMod.splitSectionText(origText, aiCfg);
  if (!subChunks || subChunks.length <= 1) return false;

  // 100% 字数与原文完整性校验
  const sumChars = subChunks.reduce((n, c) => n + c.text.length, 0);
  const ratio = sumChars / (origText.length || 1);
  if (ratio < 0.95 || ratio > 1.05) {
    await dialog.alertDialog(document, {
      title: lingo(this.wiki, 'ai.splitfailed.title', 'Sub-split Validation Failed'),
      message: `切分后字数 (${sumChars}) 与原文 (${origText.length}) 偏差过大，已自动拦截以保护原文完整性。`,
    });
    return false;
  }

  const path = String(tiddler['tidme.breadcrumb'] || tiddler.caption || tiddler.title || '');
  const parts = path.split(ns.CRUMB_SEP);
  const rawShort = (parts.pop() || path).replace(/ \(\d+\)$/, '');
  const baseBreadcrumb = parts.length ? parts.join(ns.CRUMB_SEP) : r.bookTitle;

  const newTiddlers = subChunks.map((chunk, idx) => {
    const subCap = `${rawShort} (${chunk.title || (idx + 1)})`;
    const subTitle = `${r.bookTitle}${ns.CRUMB_SEP}${subCap}`;
    return {
      ...tiddler,
      title: subTitle,
      caption: subCap,
      text: chunk.text,
      'tidme.breadcrumb': `${baseBreadcrumb}${ns.CRUMB_SEP}${subCap}`,
      _renamed: true,
    };
  });

  const realIdx = r.tiddlers.indexOf(tiddler);
  if (realIdx >= 0) {
    r.tiddlers.splice(realIdx, 1, ...newTiddlers);
  }
  return true;
}

/** 单本书的预览卡片：标题行 + 状态 + 可在线微调大纲（改短/删/增） */
function buildRow(
  doc: Document,
  resultOrErr: { result?: ImportResult; error?: string; fileName: string; duplicate?: boolean },
  wiki: any,
): HTMLElement {
  const card = el(doc, 'div', 'tm-import-file-card');
  const err = resultOrErr.error;
  if (err) {
    card.classList.add('tm-import-file-card-err');
    card.appendChild(el(doc, 'div', 'tm-import-file-head', `✘ ${resultOrErr.fileName} — ${err}`));
    return card;
  }
  const r = resultOrErr.result!;

  // 标题行：书名 + 格式徽章 + 统计
  const head = el(doc, 'div', 'tm-import-file-head');
  const title = el(doc, 'span', 'tm-import-file-title', r.bookTitle);
  head.appendChild(title);
  head.appendChild(el(doc, 'span', 'tm-import-file-badge', r.format));
  const metaSpan = el(
    doc,
    'span',
    'tm-import-file-meta',
    `${r.sectionCount} ${lingo(this.wiki, 'today.sectionsleft', 'sections')} · ${r.stats.hardSplitCount} ${lingo(this.wiki, 'import.hardsplit', 'hard splits')}${
      r.warnings.length ? ' · ' + r.warnings.length + ' ' + lingo(this.wiki, 'import.dedup', 'deduplicated') : ''
    }`,
  );
  head.appendChild(metaSpan);
  card.appendChild(head);

  if (resultOrErr.duplicate) {
    card.appendChild(
      el(doc, 'div', 'tm-import-dup', lingo(this.wiki, 'import.duplicate', '⚠ Book exists in library - re-import will align unchanged sections and preserve SRS progress')),
    );
  }

  // 树形目录大纲（全套在线增、删、改、改短）
  const details = el(doc, 'details', 'tm-import-outline');
  const summaryEl = el(doc, 'summary', 'tm-import-muted', `${lingo(this.wiki, 'pdf/toc', 'Outline')} (${r.sectionCount})`);
  details.appendChild(summaryEl);

  const outlineBox = el(doc, 'div', 'tm-import-tree-box', '');
  details.appendChild(outlineBox);
  card.appendChild(details);

  let activeEditTitleIndex: number | null = null;
  let activeAddIndex: number | null = null;

  // 手动插卡 title 去重（同 caption 多次插入 → -N 后缀），会话内累积
  const manualUsed = new Set<string>(
    r.tiddlers
      .filter((t: any) => t['tidme.kind'] === 'topic' && String(t.title || '').includes('/manual-'))
      .map((t: any) => String(t.title)),
  );

  const makeAddForm = (insertAfterIdx: number) => {
    const form = el(doc, 'div', 'tm-split-add-form');
    const titleIn = doc.createElement('input');
    titleIn.className = 'tm-input';
    titleIn.placeholder = lingo(this.wiki, 'import.sectiontitle.placeholder', 'Section title (e.g. 01 Preface / Short Title)');
    const textIn = doc.createElement('textarea');
    textIn.className = 'tm-input';
    textIn.placeholder = lingo(this.wiki, 'import.content.placeholder', 'Content...');
    textIn.rows = 2;
    const confirmBtn = el(doc, 'button', 'tm-btn tm-btn--primary tm-btn-sm', lingo(this.wiki, 'import.insert', 'Insert Section'));
    confirmBtn.onclick = () => {
      const tVal = titleIn.value.trim();
      const cVal = textIn.value.trim();
      if (tVal && cVal) {
        // 手动插卡 title 走同一套命名空间/slug（paths.insertedSectionTitle），避免第三套转义；
        // 同 caption 冲突时追加 -N（manualUsed 会话内累积）
        const mBase = parse.insertedSectionTitle(r.bookTitle, tVal);
        let mTitle = mBase;
        let n = 2;
        while (manualUsed.has(mTitle)) mTitle = `${mBase}-${n++}`;
        manualUsed.add(mTitle);
        const nowFields = schema.initialFsrsFields(new Date());
        const newTiddler = {
          title: mTitle,
          caption: tVal,
          text: cVal,
          ...nowFields,
          'tidme.doc': r.docId,
          'tidme.kind': 'topic',
          'tidme.subkind': 'section',
          'tidme.chars': String(cVal.length),
          'tidme.priority': String(sched.PRIORITY_DEFAULT),
          'tidme.afactor': String(sched.afactorForText(cVal.length)),
          'tidme.breadcrumb': `${r.bookTitle}${ns.CRUMB_SEP}${tVal}`,
        };
        if (insertAfterIdx === -1) {
          r.tiddlers.splice(1, 0, newTiddler);
        } else {
          const sectionCards = r.tiddlers.filter((t) => t['tidme.kind'] === 'topic');
          const targetCard = sectionCards[insertAfterIdx];
          const realIdx = r.tiddlers.indexOf(targetCard);
          if (realIdx >= 0) r.tiddlers.splice(realIdx + 1, 0, newTiddler);
          else r.tiddlers.push(newTiddler);
        }
        activeAddIndex = null;
        renderTree();
      }
    };
    const cancelBtn = el(doc, 'button', 'tm-btn tm-btn--sm', lingo(this.wiki, 'action.cancel', 'Cancel'));
    cancelBtn.onclick = () => {
      activeAddIndex = null;
      renderTree();
    };
    form.appendChild(titleIn);
    form.appendChild(textIn);
    form.appendChild(confirmBtn);
    form.appendChild(cancelBtn);
    return form;
  };

  const renderTree = () => {
    outlineBox.textContent = '';
    const cardTiddlers = r.tiddlers.filter((t) => t['tidme.kind'] === 'topic' && !t._deleted);
    metaSpan.textContent = `${r.sectionCount} ${lingo(this.wiki, 'today.sectionsleft', 'sections')} · ${r.stats.hardSplitCount} ${
      lingo(this.wiki, 'import.hardsplit', 'hard splits')
    }${r.warnings.length ? ' · ' + r.warnings.length + ' ' + lingo(this.wiki, 'import.dedup', 'deduplicated') : ''}`;

    const allSections = r.tiddlers.filter((t) => t['tidme.kind'] === 'topic');
    summaryEl.textContent = `${lingo(this.wiki, 'pdf/toc', 'Outline')} (${allSections.length})`;

    // 顶部工具栏：一键提炼短标题
    const toolRow = el(doc, 'div', 'tm-import-actions', '');
    const cleanBtn = icons.iconButton(doc, 'tm-btn tm-btn--sm', 'sparkles', lingo(this.wiki, 'import.refinetitles', 'Refine Short Titles'));
    cleanBtn.title = lingo(this.wiki, 'import.refinetitlestip', 'Automatically strip marketing descriptions and subtitles');
    cleanBtn.onclick = () => {
      const cleanTitleFn = parse.cleanTitle || ((x: string) => x);
      for (const t of allSections) {
        const path = String(t['tidme.breadcrumb'] || t.caption || t.title || '');
        const parts = path.split(ns.CRUMB_SEP);
        const rawShort = parts.pop() || path;
        const cleaned = cleanTitleFn(rawShort);
        if (cleaned && cleaned !== rawShort) {
          parts.push(cleaned);
          t['tidme.breadcrumb'] = parts.join(ns.CRUMB_SEP);
          t.caption = cleaned;
          // 重建 namespace title：用 docRoot + paths.sectionLeaf(caption, id)
          // 保留稳定 id 避免覆盖/重切分时撞名；docRoot 已在 emitTiddlers 时写入 t["tidme.docpage"]
          const id = String(t['tidme.id'] || '');
          const docRoot = String(t['tidme.docpage'] || doc.title || r.bookTitle);
          if (id && parse.sectionLeaf && parse.joinPath) {
            t.title = parse.joinPath(docRoot, parse.sectionLeaf(cleaned, id));
          }
          t._renamed = true;
        }
      }
      renderTree();
    };
    toolRow.appendChild(cleanBtn);
    outlineBox.appendChild(toolRow);

    const tree = el(doc, 'div', 'tm-import-tree', '');
    allSections.forEach((t, idx) => {
      const path = String(t['tidme.breadcrumb'] || t.caption || t.title || '');
      const parts = path.split(ns.CRUMB_SEP);
      const shortTitle = parts.pop() || path;
      const level = Math.max(0, parts.length - 1);
      const isMerged = t['tidme.merged'] === 'yes';
      const isDeleted = !!t._deleted;
      const isRenamed = !!t._renamed;
      const charCount = String(t.text || '').length;
      const isOverlong = charCount >= 10000;

      const rowCls = 'tm-import-tree-row' +
        (isMerged ? ' tm-import-tree-merged' : '') +
        (isDeleted ? ' tm-split-row-deleted' : '') +
        (isRenamed ? ' tm-split-row-renamed' : '');
      const line = el(doc, 'div', rowCls);
      line.style.paddingLeft = `${level * 1.1}em`;

      // 状态与字数标记（字数 >= 10,000 字呈现偏长预警）
      if (isMerged) line.appendChild(el(doc, 'span', 'tm-import-tree-mark', lingo(this.wiki, 'import.merged', '⟵ Merged')));
      if (isRenamed) line.appendChild(el(doc, 'span', 'tm-split-done', lingo(this.wiki, 'import.renamed', '✏️ Shortened')));
      const charBadgeCls = 'tm-import-tree-mark' + (isOverlong ? ' tm-split-chars-warn' : '');
      line.appendChild(
        el(doc, 'span', charBadgeCls, `${charCount} ${lingo(this.wiki, 'import.chars', 'chars')}${isOverlong ? ' ⚠️' + lingo(this.wiki, 'import.overlong', 'Overlong') : ''}`),
      );

      // 标题编辑/显示
      if (activeEditTitleIndex === idx) {
        const editIn = doc.createElement('input');
        editIn.className = 'tm-split-title-input';
        editIn.value = shortTitle;
        const confirmBtn = el(doc, 'button', 'tm-btn tm-btn--sm', lingo(this.wiki, 'action.save', '✔ Save'));
        confirmBtn.onclick = () => {
          const newShort = editIn.value.trim();
          if (newShort && newShort !== shortTitle) {
            parts.push(newShort);
            const newPath = parts.join(ns.CRUMB_SEP);
            t['tidme.breadcrumb'] = newPath;
            t.caption = newShort;
            // 重建 namespace title：docRoot + sectionLeaf(caption, id) —— 稳定 id 保证唯一
            const id = String(t['tidme.id'] || '');
            const docRoot = String(t['tidme.docpage'] || doc.title || r.bookTitle);
            if (id && parse.sectionLeaf && parse.joinPath) {
              t.title = parse.joinPath(docRoot, parse.sectionLeaf(newShort, id));
            }
            t._renamed = true;
          }
          activeEditTitleIndex = null;
          renderTree();
        };
        line.appendChild(editIn);
        line.appendChild(confirmBtn);
      } else {
        const textSpan = el(doc, 'span', 'tm-import-tree-text', shortTitle);
        textSpan.title = lingo(this.wiki, 'import.edittitle.tip', 'Double click to edit title');
        textSpan.ondblclick = () => {
          activeEditTitleIndex = idx;
          renderTree();
        };
        line.appendChild(textSpan);
      }

      // 核心操作：针对偏长章节（>= 1万字）的“✂️ 二次切分”
      if (isOverlong || charCount >= 10000) {
        const subSplitBtn = icons.iconButton(doc, 'tm-btn tm-btn--sm tm-btn--primary', 'scissors', lingo(this.wiki, 'import.subsplit', 'Sub-split'));
        subSplitBtn.title = lingo(this.wiki, 'import.subsplittip', 'Use LLM semantic analysis to split this overlong chapter into sub-topics');
        subSplitBtn.onclick = async () => {
          subSplitBtn.textContent = lingo(this.wiki, 'import.splitting', '🤖 Splitting...');
          subSplitBtn.setAttribute('disabled', 'true');
          try {
            const ok = await subSplitTiddlerWithLLM(t, r, wiki);
            if (ok) renderTree();
            else {
              subSplitBtn.textContent = lingo(this.wiki, 'import.subsplit', '✂️ Sub-split');
              subSplitBtn.removeAttribute('disabled');
            }
          } catch (e: any) {
            await dialog.alertDialog(document, { title: lingo(this.wiki, 'ai.splitfailed.title', 'LLM Sub-split Failed'), message: String(e && e.message || e) });
            subSplitBtn.textContent = lingo(this.wiki, 'import.subsplit', '✂️ Sub-split');
            subSplitBtn.removeAttribute('disabled');
          }
        };
        line.appendChild(subSplitBtn);
      }

      // 辅助操作：移除 / 恢复
      if (isDeleted) {
        const restoreBtn = el(doc, 'button', 'tm-btn tm-btn-icon', lingo(this.wiki, 'action.restore', '↩ Restore'));
        restoreBtn.onclick = () => {
          delete t._deleted;
          renderTree();
        };
        line.appendChild(restoreBtn);
      } else {
        const delBtn = icons.iconButton(doc, 'tm-btn tm-btn--sm', 'trash', lingo(this.wiki, 'action.remove', 'Remove'));
        delBtn.onclick = () => {
          t._deleted = true;
          renderTree();
        };
        line.appendChild(delBtn);
      }

      tree.appendChild(line);
    });

    outlineBox.appendChild(tree);
  };

  renderTree();

  return card;
}

function makeFileWidget(): WidgetCtor {
  class ImportFileWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();

      const doc = this.document;
      const wrap = el(doc, 'div', 'tm-import-widget');

      // 选择文件上传按钮与说明
      const btnSelect = el(doc, 'button', 'tm-btn tm-btn--primary tm-import-select-btn', lingo(this.wiki, 'import.selectfile', 'Select File to Upload (.epub / .md / .txt)'));
      const input = doc.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.epub,.pdf,.md,.markdown,.txt';
      input.style.display = 'none';
      const hint = el(doc, 'div', 'tm-import-hint', lingo(this.wiki, 'import.dragdrop.hint', 'Or: Drag and drop files anywhere onto this page to import.'));

      // 全页面拖放覆盖层
      const overlay = el(doc, 'div', 'tm-import-drag-overlay', lingo(this.wiki, 'import.dragoverlay', 'Drop files to import into Tidme (.epub / .md / .txt)'));
      overlay.style.display = 'none';

      // 预览容器 + 操作按钮
      const rowsBox = el(doc, 'div', 'tm-import-rows');
      const actions = el(doc, 'div', 'tm-import-actions');
      actions.style.display = 'none';
      const btnImport = el(doc, 'button', 'tm-btn tm-btn--primary', lingo(this.wiki, 'import.importall', '✔ Import All'));
      const btnClear = el(doc, 'button', 'tm-btn', lingo(this.wiki, 'action.clear', 'Clear'));

      // 服务端处理选项（TiddlyWeb）：大文件上传 → 服务端后台解析，不阻塞页面
      const serverRow = el(doc, 'div', 'tm-import-server-row', '');
      const serverCheck = doc.createElement('input');
      serverCheck.type = 'checkbox';
      serverCheck.id = 'tm-import-server-mode';
      serverRow.appendChild(serverCheck);
      serverRow.appendChild(el(doc, 'label', 'tm-import-muted', lingo(this.wiki, 'import.serverprocess.desc', 'Upload to server for background processing (TiddlyWeb)')));
      const serverStatus = el(doc, 'div', 'tm-import-muted', '');

      // SM 对齐：导入时批量设定优先级（0 最高；高=10±8 / 中=50±8 / 低=90±8，同批分散避免挤队）
      const prioRow = el(doc, 'div', 'tm-import-actions', '');
      prioRow.appendChild(el(doc, 'span', 'tm-import-muted', lingo(this.wiki, 'import.priority', 'Import Priority: ')));
      const prioSel = doc.createElement('select');
      prioSel.className = 'tm-priority-select';
      for (
        const [label, value] of [[lingo(this.wiki, 'priority.high', 'High'), 'high'], [lingo(this.wiki, 'priority.med', 'Medium'), 'medium'], [
          lingo(this.wiki, 'priority.low', 'Low'),
          'low',
        ]] as const
      ) {
        const opt = doc.createElement('option');
        opt.value = value;
        opt.textContent = label;
        prioSel.appendChild(opt);
      }
      prioSel.value = 'medium';
      prioSel.title = lingo(this.wiki, 'import.prioritytip', '0 is highest; cards will be assigned distributed priorities based on this level');
      prioRow.appendChild(prioSel);
      prioRow.appendChild(el(doc, 'span', 'tm-import-muted', lingo(this.wiki, 'import.prioritynote', '(0 highest, randomly jittered +-8)')));
      const pending = new Map<string, { result?: ImportResult; error?: string; fileName: string; duplicate?: boolean }>();

      // 服务端上传：建 pending tiddler（server importer 契约）→ 轮询状态
      const serverUpload = (file: File) => {
        const row = el(doc, 'div', 'tm-import-row', '');
        row.appendChild(el(doc, 'strong', '', file.name));
        const statusEl = el(doc, 'span', 'tm-import-muted', lingo(this.wiki, 'import.queueing', 'Queueing...'));
        row.appendChild(statusEl);
        rowsBox.appendChild(row);
        refreshActions();
        file.arrayBuffer().then((buf) => {
          const b64 = binaryMod.bytesToBase64(new Uint8Array(buf));
          const title = `${TEMP_IMPORT}pending/${Date.now()}-${file.name.replace(/[\\/:*?"<>|]/g, '_')}`;
          this.wiki.addTiddler({
            title,
            tags: ['tidme-pending-import'],
            'tidme.file-name': file.name,
            'tidme.pending': 'yes',
            'tidme.priority': String(sched.tierRandom(prioSel.value as any)), // SM：导入时批量设优先级（服务端沿用）
            text: b64,
            bag: getOptions(this.wiki).bag,
          });
          statusEl.textContent = `${lingo(this.wiki, 'import.uploaded', 'Uploaded')} (${Math.round(b64.length / 1024)} KB), ${
            lingo(this.wiki, 'import.waitingserver', 'waiting for server...')
          }`;
          const timer = setInterval(() => {
            const t = this.wiki.getTiddler(title);
            if (!t) {
              clearInterval(timer);
              statusEl.textContent = lingo(this.wiki, 'import.tasklost', '⚠ Task tiddler lost');
              return;
            }
            if (t.fields['tidme.import-done']) {
              clearInterval(timer);
              const secs = t.fields['tidme.import-sections'];
              statusEl.textContent = `✓ ${lingo(this.wiki, 'import.done', 'Import completed')} (docId ${t.fields['tidme.import-docId'] || '?'}${
                secs ? ', ' + secs + ' ' + lingo(this.wiki, 'today.sectionsleft', 'sections') : ''
              })`;
            } else if (t.fields['tidme.import-error']) {
              clearInterval(timer);
              statusEl.textContent = `✕ ${lingo(this.wiki, 'import.failed', 'Failed:')} ${t.fields['tidme.import-error']}`;
            }
          }, 2000);
          setTimeout(() => clearInterval(timer), 20 * 60 * 1000); // 兜底超时
        }).catch((e) => {
          statusEl.textContent = lingo(this.wiki, 'import.filereadfailed', '✕ Failed to read file:') + ' ' + String(e.message || e);
        });
      };

      const refreshActions = () => {
        const hasPending = !!pending.size;
        // PDF 直传与服务端上传不入 pending：进度/摘要/错误行也挂在 rowsBox，
        // 预览卡可见性必须计入行数，否则导入反馈渲染在 display:none 的容器里
        const hasRows = hasPending || rowsBox.childNodes.length > 0;
        actions.style.display = hasPending ? '' : 'none';
        previewCard.style.display = hasRows ? '' : 'none';
        // 卡片语义随内容切换：有待导产物 = 队列；仅状态行 = 导入状态
        previewTitle.textContent = lingo(
          this.wiki,
          hasPending ? 'import.pendingqueue' : 'import.status',
          hasPending ? 'Pending Queue' : 'Import Status',
        );
      };

      // A：落库单个解析结果。写库统一走 core/import-commit：同 docId 已有旧卡 →
      // alignCards 增量（未变保 SRS 进度 / 修改重挂接 / 新增建卡 / 删除归档），否则全量写。
      // 返回 { created, updated, archived, aligned }。
      const commitResult = async (result: ImportResult): Promise<{ created: number; updated: number; archived: number }> => {
        const validTiddlers = result.tiddlers.filter((x: any) => !x._deleted);
        const [doc, ...cards] = validTiddlers;
        // 文档页复用旧标题（引用稳定）：已存在 docPage 时以其为最终 title
        const docPage = this.wiki.filterTiddlers(`[tag[tidme-doc]tidme.doc[${result.docId}]]`)[0] || '';
        const r = await commitMod.commitImportToWiki(this.wiki, {
          docId: result.docId,
          docTiddler: { ...doc, 'tidme.doc': result.docId },
          docTitle: docPage || doc.title,
          cards,
          rewriteDocPage: false,
        });
        return { created: r.created, updated: r.updated, archived: r.archived };
      };

      btnImport.addEventListener('click', async () => {
        let created = 0, updated = 0, archived = 0;
        let firstDocTitle = '';
        for (const [token, item] of pending) {
          if (!item.result) continue;
          const r = await commitResult(item.result);
          created += r.created;
          updated += r.updated;
          archived += r.archived;
          if (!firstDocTitle) {
            firstDocTitle = this.wiki.filterTiddlers(`[tag[tidme-doc]tidme.doc[${item.result.docId}]]`)[0] ||
              item.result.tiddlers[0]?.title || '';
          }
          pending.delete(token);
        }
        // 重绘预览区
        rowsBox.textContent = '';
        for (const [, item] of pending) rowsBox.appendChild(buildRow(doc, item, this.wiki));
        refreshActions();
        this.wiki.addTiddler({ title: TEMP_IMPORT + 'last-created', text: String(created) });
        this.dispatchEvent({ type: 'tm-notify', param: ns.NOTIFY_DONE });
        if (updated || archived) {
          rowsBox.appendChild(
            el(
              doc,
              'div',
              'tm-import-summary tm-import-muted',
              `-- ${lingo(this.wiki, 'import.alignsummary', 'Aligned: Added')} ${created}, ${lingo(this.wiki, 'import.updated', 'Updated')} ${updated}, ${
                lingo(this.wiki, 'import.archived', 'Archived')
              } ${archived} (${lingo(this.wiki, 'import.srspreserved', 'SRS preserved')})`,
            ),
          );
        }
        // 落点：导入完成跳到本书文档汇总页（从那里决定读哪张/继续提炼），而非停在空白队列
        if (created > 0 && firstDocTitle) {
          this.dispatchEvent({ type: 'tm-navigate', navigateTo: firstDocTitle });
        }
      });
      btnClear.addEventListener('click', () => {
        pending.clear();
        rowsBox.textContent = '';
        refreshActions();
      });

      const handleFiles = async (files: File[]) => {
        const accepted = files.filter((f) => /\.(epub|pdf|md|markdown|txt)$/i.test(f.name));
        if (!accepted.length) {
          this.dispatchEvent({ type: 'tm-notify', param: ns.NOTIFY_UNSUPPORTED });
          return;
        }
        // PDF：浏览器内直传入库（pdf.js 解析 + 阅读器），不经服务端与预览行
        const importLocalPdf = async (file: File) => {
          // 进度卡片：大 PDF 编码/落库耗时数秒，无可视反馈易被误认为导入失败
          const progressLabel = el(doc, 'div', 'tm-import-file-head', `${lingo(this.wiki, 'import.pdf.progress', 'Importing PDF')} — ${file.name}`);
          const fill = el(doc, 'div', 'tm-import-progress-fill');
          fill.style.width = '0%';
          const track = el(doc, 'div', 'tm-import-progress-track');
          track.appendChild(fill);
          const progressCard = el(doc, 'div', 'tm-import-file-card');
          progressCard.appendChild(progressLabel);
          progressCard.appendChild(track);
          rowsBox.appendChild(progressCard);
          refreshActions(); // 进度卡挂载即亮出预览卡（此前 display:none，进度条不可见）
          const phaseLabel = (phase: string) =>
            phase === 'encode'
              ? lingo(this.wiki, 'import.pdf.phase.encode', 'Encoding')
              : phase === 'parse'
              ? lingo(this.wiki, 'import.pdf.phase.parse', 'Parsing')
              : lingo(this.wiki, 'import.pdf.phase.store', 'Saving');
          try {
            const r = await pdfImport.importPdfFile(this.wiki, file, this, (p) => {
              fill.style.width = `${Math.min(100, Math.max(0, p.percent))}%`;
              progressLabel.textContent = `${phaseLabel(p.phase)} ${p.percent}% — ${file.name}`;
            });
            progressCard.parentNode?.removeChild(progressCard);
            rowsBox.appendChild(
              el(
                doc,
                'div',
                'tm-import-summary tm-import-muted',
                `-- PDF ${r.docTitle.split('/').pop()} ${lingo(this.wiki, 'import.pdfimported', 'imported')} (${r.pages} ${lingo(this.wiki, 'read.pages', 'pages')})`,
              ),
            );
            refreshActions();
            this.dispatchEvent({ type: 'tm-navigate', navigateTo: r.docTitle });
          } catch (err: any) {
            progressCard.parentNode?.removeChild(progressCard);
            rowsBox.appendChild(buildRow(doc, { error: String(err?.message || err), fileName: file.name }, this.wiki));
            refreshActions();
          }
        };
        // 服务端处理模式：上传 → 后台解析（不预览、不阻塞；PDF 仅本地处理）
        if (serverCheck.checked) {
          for (const file of accepted) {
            if (/\.pdf$/i.test(file.name)) await importLocalPdf(file);
            else serverUpload(file);
          }
          return;
        }
        let totalSections = 0;
        for (const file of accepted) {
          try {
            if (/\.pdf$/i.test(file.name)) {
              await importLocalPdf(file);
              continue;
            }
            const bytes = new Uint8Array(await file.arrayBuffer());
            // SM 对齐：导入时按所选档位批量设定优先级（同批随机分散 ±8）
            const result = await parse.runImport(bytes, file.name, {
              ...getOptions(this.wiki),
              priority: sched.tierRandom(prioSel.value as any),
              // 同名书 folder 唯一化探测（A1）：folder 已被其它 docId 占用 → 导入时加 ~docId 后缀
              folderOccupied: (base: string) => docOps.docFolderOwner(this.wiki, base),
            }) as ImportResult;
            // 重复导入检测：同 docId 已在库中
            const docId = result.docId;
            const existing = this.wiki.filterTiddlers(`[has[tidme.doc]]`).filter((t: string) => {
              return this.wiki.getTiddler(t)?.fields['tidme.doc'] === docId && t !== result.bookTitle;
            }).length;
            const token = makeToken();
            totalSections += result.sectionCount;
            pending.set(token, { result, fileName: file.name, duplicate: existing > 0 });
            rowsBox.appendChild(buildRow(doc, { result, fileName: file.name, duplicate: existing > 0 }, this.wiki));
          } catch (err: any) {
            console.error('[tidme-import] 解析失败:', file.name, err);
            rowsBox.appendChild(buildRow(doc, { error: String(err.message || err), fileName: file.name }, this.wiki));
          }
        }
        // 漏斗摘要（措辞：已安全存档，随时可学）
        if (totalSections > 0) {
          rowsBox.appendChild(
            el(
              doc,
              'div',
              'tm-import-summary tm-import-muted',
              `-- ${totalSections} ${lingo(this.wiki, 'import.sectionsadded', 'sections imported into default deck, ready to study.')}`,
            ),
          );
        }
        refreshActions();
      };

      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []) as File[];
        input.value = '';
        await handleFiles(files);
      });
      btnSelect.addEventListener('click', () => input.click());

      let dragCounter = 0;
      wrap.addEventListener('dragenter', (e: DragEvent) => {
        e.preventDefault();
        dragCounter++;
        overlay.style.display = '';
      });
      wrap.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
      });
      wrap.addEventListener('dragleave', (e: DragEvent) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
          overlay.style.display = 'none';
        }
      });
      wrap.addEventListener('drop', async (e: DragEvent) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.style.display = 'none';
        await handleFiles(Array.from(e.dataTransfer?.files || []) as File[]);
      });

      // 创建上传控制卡片
      const uploaderCard = el(doc, 'div', 'tm-dashboard-card');
      uploaderCard.appendChild(el(doc, 'div', 'tm-dashboard-card-title', lingo(this.wiki, 'import.uploadcontrol', 'Upload Control')));
      uploaderCard.appendChild(btnSelect);
      uploaderCard.appendChild(input);
      uploaderCard.appendChild(hint);
      uploaderCard.appendChild(prioRow);
      // 服务端处理属高级选项：默认折叠（本地导入为主路径，避免普通用户被 TiddlyWeb 选项打扰）
      const adv = el(doc, 'details', 'tm-import-advanced');
      const advSum = el(doc, 'summary', 'tm-import-muted', lingo(this.wiki, 'import.serverprocess', 'Advanced: Server-side Background Processing (TiddlyWeb)'));
      advSum.title = '适合大文件：解析在服务端后台执行，不阻塞页面；需要 TiddlyWeb 服务端';
      adv.appendChild(advSum);
      adv.appendChild(serverRow);
      adv.appendChild(serverStatus);
      uploaderCard.appendChild(adv);
      wrap.appendChild(uploaderCard);
      wrap.appendChild(overlay);

      // 创建待导预览队列卡片
      const previewCard = el(doc, 'div', 'tm-dashboard-card');
      const previewTitle = el(doc, 'div', 'tm-dashboard-card-title', lingo(this.wiki, 'import.pendingqueue', 'Pending Queue'));
      previewCard.appendChild(previewTitle);
      previewCard.appendChild(rowsBox);
      previewCard.appendChild(actions);
      previewCard.style.display = 'none';
      wrap.appendChild(previewCard);

      actions.appendChild(btnImport);
      actions.appendChild(btnClear);
      parent.insertBefore(wrap, nextSibling);
      this.domNodes.push(wrap);
    }
    refresh() {
      return false;
    }
  }
  return ImportFileWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports['import-file'] = makeFileWidget();
