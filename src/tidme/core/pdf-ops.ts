/*
core/pdf-ops.ts — PDF 文档落库收口（二进制 + 文档页阅读卡）

- 二进制：Tidme/Assets/<书名>（type application/pdf，base64；ns.NS_ASSETS）
- 文档页：Tidme/Docs/<书名>（kind topic + tag tidme-doc + tidme.format=pdf +
  tidme.asset=二进制标题 + tidme.structure=continuous），text = <$tidme-pdf-reader/>，due=now
  作为整本阅读卡进入阅读/学习队列。PDF 不再切分节卡：阅读位置由续读点绝对页码表达。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const paths = require('$:/plugins/keepone/tidme/core/paths.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const ids = require('$:/plugins/keepone/tidme/core/ids.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');

export function pdfBinaryTitle(bookTitle: string): string {
  return ns.NS_ASSETS + bookTitle;
}

/**
 * 原位恢复 PDF 二进制（阅读器「重新绑定」入口）：仅覆写二进制条目，
 * 文档页/节卡/续读点全部保留。空 base64 拒绝写入——空二进制经同步层
 * 落盘即 0 字节 .pdf，重载后阅读器将永久报「缺少 PDF 数据」。
 */
export function reattachPdfBinary(wiki: any, pdfTitle: string, dataB64: string): void {
  if (!wiki || !pdfTitle) throw new Error('pdf-ops: 缺少参数');
  const data = String(dataB64 || '').trim();
  if (!data) throw new Error('pdf-ops: dataB64 为空，拒绝恢复空 PDF 二进制');
  wiki.addTiddler({ title: pdfTitle, type: 'application/pdf', text: data });
}

export interface CreatePdfDocResult {
  docId: string;
  docTitle: string;
  pdfTitle: string;
}

/**
 * PDF 文档落库：二进制 + 文档页阅读卡（不切分）。阅读位置由续读点绝对页码表达，
 * 文档页 due=now 进入阅读/学习队列。
 */
export async function createPdfDoc(
  wiki: any,
  opts: { docTitle?: string; bookTitle?: string; dataB64: string; pagesTotal?: number },
): Promise<CreatePdfDocResult> {
  const docTitle = String(opts?.docTitle || opts?.bookTitle || '');
  if (!wiki || !opts || !docTitle) throw new Error('pdf-ops: 缺少参数');
  const dataB64 = String(opts.dataB64 || '').trim();
  if (!dataB64) throw new Error('pdf-ops: dataB64 为空，拒绝落库空 PDF 二进制');
  const docId = await ids.makeDocId({ title: docTitle, creator: '', language: 'pdf' });
  const docRootTitle = paths.docRoot(docTitle);
  const pdfTitle = pdfBinaryTitle(docTitle);
  const now = schema.twDateString(new Date());

  wiki.addTiddler({ title: pdfTitle, type: 'application/pdf', text: dataB64 });
  const nowFields = schema.initialFsrsFields(new Date());
  const docTiddler: Record<string, any> = {
    title: docRootTitle,
    tags: ['tidme-doc'],
    ...nowFields,
    'tidme.kind': 'topic',
    'tidme.doc': docId,
    'tidme.format': 'pdf',
    'tidme.asset': pdfTitle,
    'tidme.structure': 'continuous',
    'tidme.priority': String(sched.PRIORITY_DEFAULT),
    'tidme.afactor': '1.3',
    caption: docTitle,
    'tidme.breadcrumb': docTitle,
    text: '<$tidme-pdf-reader/>',
  };
  if (opts.pagesTotal && opts.pagesTotal > 0) {
    docTiddler['tidme.pages-total'] = String(opts.pagesTotal);
  }
  wiki.addTiddler(docTiddler);
  return { docId, docTitle: docRootTitle, pdfTitle };
}

export interface PdfContext {
  pdfTitle: string;
  docId: string;
  docPageTitle: string;
}

/** 解析 PDF 上下文（二进制标题、docId、文档页标题） */
export function resolvePdfContext(wiki: any, currentTitle: string): PdfContext {
  if (!wiki || !currentTitle) return { pdfTitle: '', docId: '', docPageTitle: '' };
  const f = wiki.getTiddler(currentTitle)?.fields || {};
  let docId = String(f['tidme.doc'] || '');
  let pdfTitle = String(f['tidme.asset'] || '');
  let docPageTitle = '';

  // 1. 若当前卡是文档页（连续阅读卡判定）
  if (docOps.isContinuousCard(f)) {
    docPageTitle = currentTitle;
  }

  // 2. 若无 pdfTitle 或 docPageTitle，通过 docId 找文档页
  if (docId) {
    const docPage = docOps.docPageOfDoc(wiki, docId);
    if (docPage) {
      docPageTitle = docPageTitle || docPage;
      if (!pdfTitle) {
        const df = wiki.getTiddler(docPage)?.fields || {};
        pdfTitle = String(df['tidme.asset'] || '');
      }
    }
  }

  // 3. 若仍无，尝试从当前路径父级推断文档页（如 Tidme/Docs/书名/01 章节 -> Tidme/Docs/书名）
  if (!docPageTitle && currentTitle.includes('/')) {
    const parentCandidate = currentTitle.slice(0, currentTitle.lastIndexOf('/'));
    const parentTiddler = wiki.getTiddler(parentCandidate);
    if (parentTiddler) {
      docPageTitle = parentCandidate;
      if (!docId) docId = String(parentTiddler.fields['tidme.doc'] || '');
      if (!pdfTitle) pdfTitle = String(parentTiddler.fields['tidme.asset'] || '');
    }
  }

  return {
    pdfTitle,
    docId,
    docPageTitle: docPageTitle || (docId ? docOps.docPageOfDoc(wiki, docId) : ''),
  };
}
