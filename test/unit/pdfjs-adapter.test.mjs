/*
pdfjs-adapter.test.mjs — pdf.js 适配层 loadPdfBytes 选项契约单元测试（node:test）

- getDocument 必须携带 cMapUrl/cMapPacked/standardFontDataUrl：中文书 CID 字体
  （预定义 CMap 编码）缺 CMap 数据时文本解码为空 → 页面空白（回归锁定）
- data 传副本：原字节不被 pdf.js detach 破坏（导入流程 base64 编码仍需可用）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const pdfjs = await import('../../src/tidme/import/widgets/pdfjs.ts');

test('loadPdfBytes: 携带 CMap 与标准字体回退配置（中文书空白页回归锁定）', async () => {
  const captured = [];
  pdfjs.setPdfJsLib({
    getDocument(opts) {
      captured.push(opts);
      return { promise: Promise.resolve({ numPages: 1, destroy() {} }) };
    },
  });
  const bytes = new Uint8Array([1, 2, 3]);
  const doc = await pdfjs.loadPdfBytes(bytes);
  assert.equal(doc.numPages, 1);
  assert.equal(captured.length, 1);
  const opts = captured[0];
  assert.ok(opts.cMapUrl.endsWith('/cmaps/'), `cMapUrl 指向 CMap 目录（实际 ${opts.cMapUrl}）`);
  assert.equal(opts.cMapPacked, true, 'CMap 为打包 bcmap 格式');
  assert.ok(opts.standardFontDataUrl.includes('standard_fonts'), 'standardFontDataUrl 指向标准字体目录');
  assert.ok(opts.data instanceof Uint8Array, 'data 为字节数组');
  assert.deepEqual([...bytes], [1, 2, 3], '原字节未被转移（传副本）');
});
