/*
widgets/pdf-import.ts — PDF 导入编排（import.ts 的 .pdf 分支入口）

流程：pdf.js（CDN 按需）解析 → 大纲（可解析项）→ 按「设置 → PDF 导入方式」切分
（outline=按大纲，无大纲自动退回整本；none=整本不切分）→ core/pdf-ops.createPdfBook
落库 → 导航到文档页。PDF 直传入库不走预览行（PDF 的预览就是阅读器本身）。
*/

declare function require(module: string): any;
const config = require('$:/plugins/keepone/tidme/core/config.js');
const pdfOps = require('$:/plugins/keepone/tidme/core/pdf-ops.js');
const pdfjsMod = require('$:/plugins/keepone/tidme/import/widgets/pdfjs.js');
const parsePdf = require('$:/plugins/keepone/tidme/import/parse/pdf.js');

/**
 * 导入一个 PDF 文件：解析大纲 → 切分 → 落库 → 返回文档页标题与页数。
 * 抛错由调用方（import.ts）呈现。
 */
export async function importPdfFile(
  wiki: any,
  file: File,
  widget: any,
): Promise<{ docTitle: string; pages: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsMod.loadPdfBytes(bytes);
  const numPages = Number(pdf.numPages) || 0;

  // 大纲：可解析项 → {title, page}（嵌套拍平在适配层完成）
  let nodes: Array<{ title: string; page: number }> = [];
  try {
    nodes = await pdfjsMod.extractOutlineNodes(pdf);
  } catch {
    nodes = []; // 大纲读取失败 → 退回整本
  }

  const split = config.readPdfOptions(wiki).split;
  const ranges = split === 'outline' && nodes.length ? parsePdf.splitByOutline(nodes, numPages) : parsePdf.singleSection(numPages);

  const bookTitle = String(file.name || '').replace(/\.pdf$/i, '');
  const r = await pdfOps.createPdfBook(wiki, {
    bookTitle,
    dataB64: pdfjsMod.bytesToBase64(bytes),
    sections: ranges.map((s) => ({ title: s.title, startPage: s.startPage, endPage: s.endPage })),
  });

  widget?.dispatchEvent?.({ type: 'tm-navigate', navigateTo: r.docTitle });
  return { docTitle: r.docTitle, pages: numPages };
}
