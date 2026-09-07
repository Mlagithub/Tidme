/*
pdf-import.test.mjs — PDF 导入编排端到端测试（node:test + 真实 pdf.js 引擎）

- globalThis.pdfjsLib 注入 Node 版 pdf.js（pdfjs-dist legacy CJS，与 CDN 同版本）→
  importPdfFile 走完整真实流程（此前导入编排零 pdf.js 覆盖）
- 回归锁定：导入后 PDF 二进制 tiddler 必须非空（pdf.js getDocument 默认会转移
  底层 buffer，base64 编码时序错误时会得到空二进制 → 阅读器报「缺少 PDF 数据」）
*/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const nodeRequire = createRequire(import.meta.url);
const { wiki, mod } = bootPlugin({ prefix: 'tidme-pdfimp-' });
const pdfImport = mod('import/widgets/pdf-import.js');
const workflow = mod('review/widgets/workflow.js');

/** 注入 Node 版 pdf.js 引擎（pdfjs.ts 的 ensurePdfJs 优先读 globalThis.pdfjsLib） */
async function injectPdfJs() {
  mod('import/widgets/pdfjs.js').setPdfJsLib(nodeRequire('pdfjs-dist/legacy/build/pdf.js'));
}

/** 最小合法 PDF（1.4）：两页 + 两个大纲项分别指向两页（xref 偏移程序化计算） */
function buildMinimalPdfBytes() {
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>';
  objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';
  objs[4] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';
  objs[5] = '<< /Type /Outlines /First 6 0 R /Last 7 0 R /Count 2 >>';
  objs[6] = '<< /Title (Chapter One) /Parent 5 0 R /Next 7 0 R /Dest [3 0 R /XYZ null null null] >>';
  objs[7] = '<< /Title (Chapter Two) /Parent 5 0 R /Prev 6 0 R /Dest [4 0 R /XYZ null null null] >>';
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = body.length;
    body += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = body.length;
  let xref = 'xref\n0 8\n0000000000 65535 f \n';
  for (let i = 1; i < 8; i++) xref += String(offsets[i] ?? 0).padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return new TextEncoder().encode(body + xref + trailer);
}

test('pdf-import: 端到端 —— 大纲切分落库且 PDF 二进制非空', async () => {
  await injectPdfJs();
  const bytes = buildMinimalPdfBytes();
  const file = { name: '未来简史.pdf', arrayBuffer: async () => bytes.buffer };
  const r = await pdfImport.importPdfFile(wiki, file, null);
  assert.equal(r.pages, 2, 'pdf.js 解析出 2 页');

  // 回归主断言：二进制非空（base64 编码时序错误时为空 → 阅读器报「缺少 PDF 数据」）
  const bin = wiki.getTiddler('Tidme/PDFs/未来简史');
  assert.ok(bin, 'PDF 二进制 tiddler 存在');
  assert.equal(bin.fields.type, 'application/pdf');
  assert.ok(String(bin.fields.text).length > 100, `二进制非空（实际 ${String(bin.fields.text).length} 字符）`);

  // 文档页 + 大纲节卡（文档页本身也是 kind topic，节卡按 subkind=section 区分）
  const doc = wiki.getTiddler(r.docTitle).fields;
  assert.equal(doc['tidme.type'], 'pdf');
  assert.equal(doc['tidme.pdf'], 'Tidme/PDFs/未来简史');
  const sections = wiki.filterTiddlers(`[tidme.doc[${doc['tidme.doc']}]tidme.kind[topic]tidme.subkind[section]]`);
  assert.equal(sections.length, 2, '大纲切出两节');
  // 阅读队列：继续阅读落到第一节
  assert.equal(workflow.globalReadingTarget(wiki), sections[0]);
});

test('pdf-import: 配置 none —— 整本不切分（单节覆盖全范围）', async () => {
  await injectPdfJs();
  const config = mod('core/config.js');
  config.writePdfOptions(wiki, { split: 'none' });
  try {
    const bytes = buildMinimalPdfBytes();
    const file = { name: '整本.pdf', arrayBuffer: async () => bytes.buffer };
    const r = await pdfImport.importPdfFile(wiki, file, null);
    const docId = wiki.getTiddler(r.docTitle).fields['tidme.doc'];
    const secs = wiki.filterTiddlers(`[tidme.doc[${docId}]tidme.subkind[section]]`);
    assert.equal(secs.length, 1, '整本单节');
    const f = wiki.getTiddler(secs[0]).fields;
    assert.equal(f['tidme.pages'], '1-2', '单节覆盖全部页');
  } finally {
    wiki.deleteTiddler('$:/config/Tidme/PdfImport'); // 恢复默认按大纲
  }
});
