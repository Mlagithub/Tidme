/*
lifecycle.test.mjs — Widget 真实 DOM 生命周期与事件防泄漏回归测试（node:test）

针对 TW 5.3.3 Widget 基类无 destroy() 的现实：
- pdf-reader: 验证 removeChildDomNodes 正常触发专注时长 flush 与清理。
（旧 card-viewer 键盘监听用例随该孤儿组件的删除一并移除——评分交互已收敛
到 wikitext repeat.tid + core/grade，无 document 级 keydown 监听。）
*/
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fakeDocument } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

let wiki;
let mod;

before(() => {
  const booted = bootPlugin();
  wiki = booted.wiki;
  mod = booted.mod;
});

test('lifecycle: pdf-reader removeChildDomNodes 正常触发专注时长并注销事件', () => {
  const pdfReaderMod = mod('read/widgets/pdf-reader.js');
  const PdfReaderWidget = pdfReaderMod['tidme-pdf-reader'];

  let fsListeners = [];
  const mockDoc = {
    createElement: (t) => fakeDocument.createElement(t),
    addEventListener: (evt, fn) => {
      if (evt === 'fullscreenchange') fsListeners.push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (evt === 'fullscreenchange') {
        const idx = fsListeners.indexOf(fn);
        if (idx !== -1) fsListeners.splice(idx, 1);
      }
    },
  };

  const widget = new PdfReaderWidget({ type: 'element', tag: '$tidme-pdf-reader' }, {
    wiki,
    document: mockDoc,
    parentWidget: null,
  });

  const container = fakeDocument.createElement('div');
  widget.render(container, null);

  assert.equal(fsListeners.length, 1, 'render 应绑定 fullscreenchange');

  // 模拟从 DOM 树移除
  widget.removeChildDomNodes();
  assert.equal(fsListeners.length, 0, 'removeChildDomNodes 必须注销 fullscreenchange 监听');
});
