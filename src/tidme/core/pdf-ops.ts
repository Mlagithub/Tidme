/*
core/pdf-ops.ts — PDF 书籍落库收口（二进制 + 文档页 + 大纲节卡）

- 二进制：Tidme/PDFs/<书名>（type application/pdf，base64；ns.NS_PDFS）
- 文档页：Tidme/Books/<书名>（kind topic + tag tidme-import-doc + tidme.type=pdf +
  tidme.pdf=二进制标题），text = <$tidme-pdf-reader/>（阅读面）
- 节卡：kind topic + tidme.pages（"起-止"）+ due=now → 进入阅读队列/阅读列表/复习本书
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const paths = require('$:/plugins/keepone/tidme/core/paths.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const ids = require('$:/plugins/keepone/tidme/core/ids.js');

export function pdfBinaryTitle(bookTitle: string): string {
  return ns.NS_PDFS + bookTitle;
}

export interface PdfSectionInput {
  title: string;
  startPage: number;
  endPage: number;
}

export interface CreatePdfBookResult {
  docId: string;
  docTitle: string;
  pdfTitle: string;
  sectionTitles: string[];
}

/**
 * PDF 书籍落库：二进制 + 文档页（阅读面）+ 大纲节卡（进入阅读队列）。
 * 节卡标题 = <bookRoot>/<序号> <大纲标题>（冲突追加序号）；阅读位置由节卡
 * tidme.pages 字段表达，阅读器打开时落到起始页。
 */
export async function createPdfBook(
  wiki: any,
  opts: { bookTitle: string; dataB64: string; sections: PdfSectionInput[] },
): Promise<CreatePdfBookResult> {
  if (!wiki || !opts || !opts.bookTitle) throw new Error('pdf-ops: 缺少参数');
  const bookTitle = String(opts.bookTitle);
  const docId = await ids.makeDocId({ title: bookTitle, creator: '', language: 'pdf' });
  const bookRoot = paths.bookRoot(bookTitle, docId);
  const pdfTitle = pdfBinaryTitle(bookTitle);
  const now = schema.twDateString(new Date());

  wiki.addTiddler({ title: pdfTitle, type: 'application/pdf', text: String(opts.dataB64 || '') });
  wiki.addTiddler({
    title: bookRoot,
    tags: ['tidme-import-doc'],
    'tidme.kind': 'topic',
    'tidme.doc': docId,
    'tidme.type': 'pdf',
    'tidme.pdf': pdfTitle,
    caption: bookTitle,
    'tidme.breadcrumb': bookTitle,
    text: '<$tidme-pdf-reader/>',
    due: now,
    state: '0',
  });

  const sectionTitles: string[] = [];
  const seen = new Set<string>();
  (opts.sections || []).forEach((s: PdfSectionInput, i: number) => {
    const leaf = String(s.title || `第 ${i + 1} 部分`).trim() || `第 ${i + 1} 部分`;
    let title = `${bookRoot}/${String(i + 1).padStart(2, '0')} ${leaf}`;
    while (seen.has(title)) title = `${title}·`;
    seen.add(title);
    sectionTitles.push(title);
    wiki.addTiddler({
      title,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': docId,
      'tidme.pdf': pdfTitle,
      'tidme.order': String(i + 1).padStart(6, '0'),
      'tidme.pages': `${s.startPage}-${s.endPage}`,
      'tidme.breadcrumb': `${bookTitle} › ${leaf}`,
      caption: leaf,
      text: '<$tidme-pdf-reader/>',
      due: now,
      state: '0',
    });
  });
  return { docId, docTitle: bookRoot, pdfTitle, sectionTitles };
}
