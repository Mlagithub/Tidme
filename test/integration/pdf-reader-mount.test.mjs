/*
pdf-reader-mount.test.mjs — PDF 阅读器挂载计数契约测试（node:test，独立进程保证模块级计数从 0 开始）

- isPdfReaderActive：render 后为真（键盘归属）、destroy 后释放；重复 render（refreshSelf 同路径）归属不丢
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

test('isPdfReaderActive: render 获得归属 / destroy 释放 / 重复 render 不丢归属', async () => {
  assert.equal(readerMod.isPdfReaderActive(), false, '初始无活跃阅读器');
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
  assert.equal(readerMod.isPdfReaderActive(), true, 'render 后获得键盘归属');

  // 重复 render（refreshSelf 走同一 _cleanup→render 路径）：归属不丢
  w.render(fakeDocument.createElement('div'), null);
  assert.equal(readerMod.isPdfReaderActive(), true, '重建后归属保持');

  w.destroy?.();
  assert.equal(readerMod.isPdfReaderActive(), false, 'destroy 后释放归属');

  // 再渲染再销毁：计数可重入
  const { w: w2 } = renderWidget(wiki, readerMod, 'tidme-pdf-reader', { variables: { currentTiddler: 'Tidme/Docs/挂载书' } });
  assert.equal(readerMod.isPdfReaderActive(), true, '重新渲染再获得归属');
  w2.destroy?.();
  assert.equal(readerMod.isPdfReaderActive(), false, '再次销毁释放');
});
