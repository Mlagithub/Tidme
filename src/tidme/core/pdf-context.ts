/*
core/pdf-context.ts — PDF 上下文解析（唯一逻辑实现）

纯 wiki 操作，无 DOM。负责解析 currentTiddler 对应的 PDF 二进制条目标题、
docId 以及文档页标题。带书名/路径/多级回退与防护。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');

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
