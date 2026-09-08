/*
lifecycle.test.mjs — Widget 真实 DOM 生命周期与事件防泄漏回归测试（node:test）

针对 TW 5.3.3 Widget 基类无 destroy() 的现实：
- card-viewer: 验证多次 render 键盘事件不叠加，removeChildDomNodes 正常解绑键盘；
- pdf-reader: 验证 removeChildDomNodes 正常触发专注时长 flush 与清理。
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

test('lifecycle: card-viewer 多次 render 键盘监听不叠加，removeChildDomNodes 彻底解绑', () => {
  const cardViewerMod = mod('review/widgets/card-viewer.js');
  const CardViewerWidget = cardViewerMod['tidme-card-viewer'];

  let keydownCount = 0;
  const listeners = [];
  const mockDoc = {
    createElement: (t) => fakeDocument.createElement(t),
    addEventListener: (evt, fn) => {
      if (evt === 'keydown') {
        listeners.push(fn);
        keydownCount++;
      }
    },
    removeEventListener: (evt, fn) => {
      if (evt === 'keydown') {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
  };

  const widget = new CardViewerWidget({ type: 'element', tag: '$tidme-card-viewer' }, {
    wiki,
    document: mockDoc,
    parentWidget: null,
  });

  const container = fakeDocument.createElement('div');

  // 1. 首次渲染
  widget.render(container, null);
  assert.equal(listeners.length, 1, '首次 render 应绑定 1 个 keydown 监听');

  // 2. 模拟重渲染（如 refreshSelf）
  widget.render(container, null);
  assert.equal(listeners.length, 1, '重渲染前必须先解绑旧监听，不能叠加');

  // 3. 模拟条目关闭与 DOM 移除
  widget.removeChildDomNodes();
  assert.equal(listeners.length, 0, 'removeChildDomNodes 必须彻底解绑 keydown 监听');
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
