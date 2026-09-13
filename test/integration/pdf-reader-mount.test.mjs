/*
pdf-reader-mount.test.mjs — PDF 阅读器挂载计数契约测试（node:test，独立进程保证模块级计数从 0 开始）

- isPdfReaderMounted：render 后为真、destroy 后复位；refreshSelf（重复 render 经 _cleanup）不重复计数
- 该判定是 section.ts 全局 ←/→ 快捷键的让路依据（阅读器挂载时方向键归阅读器翻页）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDocument, renderWidget } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-pdf-mount-' });
const pdfOps = mod('core/pdf-ops.js');
const readerMod = mod('read/widgets/pdf-reader.js');

function b64() {
  // 非法 PDF 亦可：本用例不依赖 pdf.js 加载成功，只验证挂载计数
  return Buffer.from('%PDF-1.4\n', 'binary').toString('base64');
}

test('isPdfReaderMounted: render 置真 / destroy 复位 / 重建不重复计数', async () => {
  assert.equal(readerMod.isPdfReaderMounted(), false, '初始无挂载');
  wiki.addTiddler({
    title: 'Tidme/Docs/挂载书',
    tags: ['tidme-doc'],
    'tidme.kind': 'topic',
    'tidme.format': 'pdf',
    'tidme.asset': 'Tidme/Assets/挂载书',
    'tidme.structure': 'continuous',
    'tidme.doc': 'dmount1',
    text: '<$tidme-pdf-reader/>',
  });
  wiki.addTiddler({ title: 'Tidme/Assets/挂载书', type: 'application/pdf', text: b64() });

  const { w } = renderWidget(wiki, readerMod, 'tidme-pdf-reader', { variables: { currentTiddler: 'Tidme/Docs/挂载书' } });
  assert.equal(readerMod.isPdfReaderMounted(), true, 'render 后挂载');

  // refreshSelf 路径：再次 render 前会经 _cleanup，计数保持 1 不虚增
  w.render(fakeDocument.createElement('div'), null);
  assert.equal(readerMod.isPdfReaderMounted(), true, '重建后仍为一次挂载');

  w.destroy?.();
  assert.equal(readerMod.isPdfReaderMounted(), false, 'destroy 后复位');

  // 再渲染再销毁：计数可重入
  const { w: w2 } = renderWidget(wiki, readerMod, 'tidme-pdf-reader', { variables: { currentTiddler: 'Tidme/Docs/挂载书' } });
  assert.equal(readerMod.isPdfReaderMounted(), true, '重新渲染再挂载');
  w2.destroy?.();
  assert.equal(readerMod.isPdfReaderMounted(), false, '再次销毁复位');
});
