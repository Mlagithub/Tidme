/*
pdf-import.test.mjs — PDF 导入编排端到端测试（node:test + 真实 pdf.js 引擎）

- globalThis.pdfjsLib 注入 Node 版 pdf.js（pdfjs-dist legacy CJS，与 CDN 同版本）→
  importPdfFile 走完整真实流程
- 回归锁定：导入后 PDF 二进制 tiddler 必须非空（pdf.js getDocument 默认会转移
  底层 buffer，base64 编码时序错误时会得到空二进制 → 阅读器报「缺少 PDF 数据」）
- PDF 不切分：整本一张阅读卡（文档页），无节卡
*/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { renderWidget } from '../helpers/fake-dom.mjs';
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

test('pdf-import: 端到端 —— 整本落库且 PDF 二进制非空（不切分）', async () => {
  await injectPdfJs();
  const bytes = buildMinimalPdfBytes();
  const file = { name: '未来简史.pdf', arrayBuffer: async () => bytes.buffer };
  const r = await pdfImport.importPdfFile(wiki, file, null);
  assert.equal(r.pages, 2, 'pdf.js 解析出 2 页');

  // 回归主断言：二进制非空（base64 编码时序错误时为空 → 阅读器报「缺少 PDF 数据」）
  const bin = wiki.getTiddler('Tidme/Assets/未来简史');
  assert.ok(bin, 'PDF 二进制 tiddler 存在');
  assert.equal(bin.fields.type, 'application/pdf');
  assert.ok(String(bin.fields.text).length > 100, `二进制非空（实际 ${String(bin.fields.text).length} 字符）`);

  // 文档页 = 整本阅读卡；不切分 → 无节卡
  const doc = wiki.getTiddler(r.docTitle).fields;
  assert.equal(doc['tidme.format'], 'pdf');
  assert.equal(doc['tidme.asset'], 'Tidme/Assets/未来简史');
  assert.equal(doc['tidme.structure'], 'continuous');
  assert.ok((doc.tags || []).includes('tidme-doc'), '文档页带 tidme-doc');
  assert.ok(/^\d{17}$/.test(String(doc.due)), 'due=now 进入阅读队列');
  const sections = wiki.filterTiddlers(`[tidme.doc[${doc['tidme.doc']}]tidme.subkind[section]]`);
  assert.equal(sections.length, 0, '不切分：无节卡');
  // 阅读队列：继续阅读落到整本文档页
  assert.equal(workflow.globalReadingTarget(wiki), r.docTitle);
});

test('pdf-import: 进度回调 —— encode/parse/store 三阶段，百分比单调不减收于 100', async () => {
  await injectPdfJs();
  const bytes = buildMinimalPdfBytes();
  const file = { name: '进度测试书.pdf', arrayBuffer: async () => bytes.buffer };
  const events = [];
  await pdfImport.importPdfFile(wiki, file, null, (p) => events.push({ ...p }));
  assert.ok(events.length >= 3, '至少每个阶段各一次回调');
  assert.deepEqual([...new Set(events.map((e) => e.phase))].sort(), ['encode', 'parse', 'store'], '三阶段全覆盖');
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i].percent >= events[i - 1].percent, `百分比单调不减（#${i - 1}:${events[i - 1].percent} -> #${i}:${events[i].percent}）`);
  }
  assert.equal(events[0].phase, 'encode', '首回调为编码阶段');
  const last = events[events.length - 1];
  assert.equal(last.phase, 'store', '末回调为落库阶段');
  assert.equal(last.percent, 100, '收尾 100%');
  // 回调本身不得破坏导入结果
  const bin = wiki.getTiddler('Tidme/Assets/进度测试书');
  assert.ok(bin && String(bin.fields.text).length > 100, '带进度回调时二进制仍非空');
});

test('pdf-import: 进度条可见性 —— 选择 PDF 后预览卡立即亮出（回归：previewCard 默认 display:none）', () => {
  // PDF 直传不走 pending 队列：此前进度/摘要行渲染在隐藏容器中，用户全程看不到反馈
  const { root, w } = renderWidget(wiki, mod('import/widgets/import.js'), 'import-file', {});
  const findNodes = (node, pred, out = []) => {
    if (!node) return out;
    if (pred(node)) out.push(node);
    for (const c of node.childNodes || []) findNodes(c, pred, out);
    return out;
  };
  const rowsBox = findNodes(root, (el) => String(el.className || '').includes('tm-import-rows'))[0];
  assert.ok(rowsBox, '待导队列容器存在');
  const previewCard = rowsBox.parentNode;
  assert.ok(String(previewCard.className || '').includes('tm-dashboard-card'), 'rowsBox 位于预览卡内');
  assert.equal(previewCard.style.display, 'none', '初始隐藏');

  const input = findNodes(root, (el) => el.tagName === 'INPUT' && el.type === 'file')[0];
  assert.ok(input, '文件输入存在');
  const bytes = buildMinimalPdfBytes();
  input.files = [new File([bytes], '可见性回归书.pdf')];
  input.dispatchEvent({ type: 'change' });

  assert.equal(previewCard.style.display, '', '选择 PDF 后预览卡立即亮出（进度条对用户可见）');
  const progressMounted = findNodes(rowsBox, (el) => String(el.className || '').includes('tm-import-progress-track')).length > 0;
  assert.ok(progressMounted, '进度条挂载于 rowsBox');
  const fill = findNodes(rowsBox, (el) => String(el.className || '').includes('tm-import-progress-fill'))[0];
  assert.equal(fill.style.width, '0%', '进度条挂载即有初始宽度（首个百分比随 arrayBuffer 微任务到达）');
  w.destroy?.(); // import-file widget 未定义 destroy（无清理需求）
});
