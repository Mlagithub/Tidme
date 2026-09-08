/*
core/pdf-ops.ts — PDF 书籍落库收口（二进制 + 文档页阅读卡）

- 二进制：Tidme/PDFs/<书名>（type application/pdf，base64；ns.NS_PDFS）
- 文档页：Tidme/Books/<书名>（kind topic + tag tidme-import-doc + tidme.type=pdf +
  tidme.pdf=二进制标题），text = <$tidme-pdf-reader/>，due=now → 作为整本阅读卡
  进入阅读/学习队列。PDF 不再切分节卡：阅读位置由续读点绝对页码表达。
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

export interface CreatePdfBookResult {
  docId: string;
  docTitle: string;
  pdfTitle: string;
}

/**
 * PDF 书籍落库：二进制 + 文档页阅读卡（不切分）。阅读位置由续读点绝对页码表达，
 * 文档页 due=now 进入阅读/学习队列。
 */
export async function createPdfBook(
  wiki: any,
  opts: { bookTitle: string; dataB64: string },
): Promise<CreatePdfBookResult> {
  if (!wiki || !opts || !opts.bookTitle) throw new Error('pdf-ops: 缺少参数');
  const bookTitle = String(opts.bookTitle);
  const dataB64 = String(opts.dataB64 || '').trim();
  if (!dataB64) throw new Error('pdf-ops: dataB64 为空，拒绝落库空 PDF 二进制');
  const docId = await ids.makeDocId({ title: bookTitle, creator: '', language: 'pdf' });
  const bookRoot = paths.bookRoot(bookTitle, docId);
  const pdfTitle = pdfBinaryTitle(bookTitle);
  const now = schema.twDateString(new Date());

  wiki.addTiddler({ title: pdfTitle, type: 'application/pdf', text: dataB64 });
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
  return { docId, docTitle: bookRoot, pdfTitle };
}
