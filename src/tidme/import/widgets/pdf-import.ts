/*
widgets/pdf-import.ts — PDF 导入编排（import.ts 的 .pdf 分支入口）

流程：pdf.js（CDN 按需）解析页数 → core/pdf-ops.createPdfDoc 落库
（二进制 + 文档页阅读卡，不切分）→ 导航到文档页。PDF 直传入库不走预览行
（PDF 的预览就是阅读器本身）。onProgress 进度回调（编码/解析/落库三段百分比），
驱动导入中心的进度条。
*/

declare function require(module: string): any;
const binaryMod = require('$:/plugins/keepone/tidme/core/binary.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const pdfOps = require('$:/plugins/keepone/tidme/core/pdf-ops.js');
const pdfjsMod = require('$:/plugins/keepone/tidme/import/widgets/pdfjs.js');

/** 导入进度：phase 对应主耗时阶段；percent ∈ [0,100] 单调不减 */
export type PdfImportPhase = 'encode' | 'parse' | 'store';

export interface PdfImportProgress {
  phase: PdfImportPhase;
  percent: number;
}

/** 编码/解析/落库三段的进度权重：编码（含回程校验）占大头 */
const PHASE_PERCENT = { encode: [3, 63], parse: [63, 80], store: [80, 100] } as const;

/**
 * 导入一个 PDF 文件：解析页数 → 整本落库 → 返回文档页标题与页数。
 * onProgress 可选，用于驱动导入进度条（大文件编码 + 落库耗时数秒）。
 * 抛错由调用方（import.ts）呈现。
 */
export async function importPdfFile(
  wiki: any,
  file: File,
  widget: any,
  onProgress?: (p: PdfImportProgress) => void,
): Promise<{ docTitle: string; pages: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // 先编码 base64：pdf.js getDocument 默认会把底层 buffer 转移给 Worker（detach），
  // 之后再编码会得到空串 → 二进制落库为空。分片异步编码，进度条随片推进
  onProgress?.({ phase: 'encode', percent: PHASE_PERCENT.encode[0] });
  const encodeSpan = PHASE_PERCENT.encode[1] - PHASE_PERCENT.encode[0];
  const dataB64 = await binaryMod.bytesToBase64Async(bytes, (done, total) => {
    onProgress?.({
      phase: 'encode',
      percent: PHASE_PERCENT.encode[0] + Math.round((done / Math.max(total, 1)) * encodeSpan),
    });
  });
  // 回程校验：编码结果必须无损还原原字节数，否则拒绝落库。空/损坏二进制经同步层
  // 写到服务端即 0 字节 .pdf 文件，重载后阅读器将永久报「缺少 PDF 数据」
  if (!binaryMod.base64RoundtripValid(dataB64, bytes.length)) {
    throw new Error(lingoMod.lingo(wiki, 'pdf.import.corrupt', 'PDF data integrity check failed; import aborted'));
  }
  onProgress?.({ phase: 'parse', percent: PHASE_PERCENT.parse[0] });
  const pdf = await pdfjsMod.loadPdfBytes(bytes);
  const numPages = Number(pdf.numPages) || 0;

  onProgress?.({ phase: 'store', percent: PHASE_PERCENT.store[0] });
  const docTitle = String(file.name || '').replace(/\.pdf$/i, '');
  const r = await pdfOps.createPdfDoc(wiki, { docTitle, dataB64, pagesTotal: numPages });
  onProgress?.({ phase: 'store', percent: PHASE_PERCENT.store[1] });

  widget?.dispatchEvent?.({ type: 'tm-navigate', navigateTo: r.docTitle });
  return { docTitle: r.docTitle, pages: numPages };
}
