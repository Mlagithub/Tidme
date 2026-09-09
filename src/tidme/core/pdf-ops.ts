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
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');

export function pdfBinaryTitle(bookTitle: string): string {
  return ns.NS_PDFS + bookTitle;
}

/**
 * 整本不切分的 PDF 阅读卡判定：文档页自身即阅读卡（tidme.type=pdf 且无 subkind）。
 * 这类卡代表整个文件——「读完继续」只推进度不标 done（读几页 ≠ 读完整个文件），
 * 与分节书籍的节卡（读完即出队）相区分。
 */
export function isWholePdfCard(fields: Record<string, any> | null | undefined): boolean {
  return !!fields && String(fields['tidme.type'] || '') === 'pdf' && !fields['tidme.subkind'];
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
  const bookRoot = paths.bookRoot(bookTitle);
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

export interface PdfContext {
  pdfTitle: string;
  docId: string;
  docPageTitle: string;
}

/** 智能解析 PDF 上下文（二进制标题、docId、文档页标题） */
export function resolvePdfContext(wiki: any, currentTitle: string): PdfContext {
  if (!wiki || !currentTitle) return { pdfTitle: '', docId: '', docPageTitle: '' };
  const f = wiki.getTiddler(currentTitle)?.fields || {};
  let docId = String(f['tidme.doc'] || '');
  let pdfTitle = String(f['tidme.pdf'] || '');
  let docPageTitle = '';

  // 1. 若当前卡是文档页（整本 PDF 阅读卡判定）
  if (isWholePdfCard(f)) {
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

  // 3. 若仍无，尝试从当前路径父级推断文档页（如 Tidme/Books/书名/01 章节 -> Tidme/Books/书名）。
  //    仅当父级真实存在时才采信——否则会把不存在的路径当文档页返回给调用方导航
  if (!docPageTitle && currentTitle.includes('/')) {
    const parentCandidate = currentTitle.slice(0, currentTitle.lastIndexOf('/'));
    const parentTiddler = wiki.getTiddler(parentCandidate);
    if (parentTiddler) {
      docPageTitle = parentCandidate;
      if (!docId) docId = String(parentTiddler.fields['tidme.doc'] || '');
      if (!pdfTitle) pdfTitle = String(parentTiddler.fields['tidme.pdf'] || '');
    }
  }

  // 4. 若仍未找到有效 pdfTitle，且当前条目确属文档树范围内，从书名或全局库中匹配 PDF 二进制条目
  const isBookContext = currentTitle.startsWith(ns.NS_BOOKS) || Boolean(docId) || Boolean(f['tidme.pages']);
  if ((!pdfTitle || !wiki.getTiddler(pdfTitle)) && isBookContext) {
    const breadcrumbFirst = String(f['tidme.breadcrumb'] || '').split(ns.CRUMB_SEP || ' › ')[0].trim();
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
      if (allPdfs.length === 1 && (candidates.length > 0 || currentTitle.startsWith(ns.NS_BOOKS))) {
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
