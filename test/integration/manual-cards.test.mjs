/*
manual-cards.test.mjs — 手动制卡触发点测试

- selection 共享工具（划词定位/选区信息，假 DOM 节点）
- 全局划词气泡 pick-bubble 模块装载
- 编辑器真制卡操作（tidme-make-cloze 用桩 EditTextWidget；qa 在无头环境守卫）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDocument } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

// tw.modules.execute 在测试体内直接使用，故保留 tw
const { tw, wiki } = bootPlugin({ prefix: 'tidme-manual-' });

// === selection 共享工具（纯函数，假 DOM 节点） ===

const selection = await import('../../src/tidme/import/widgets/selection.ts');

function fakeNode(attrs = {}, parent = null) {
  return {
    _attrs: attrs,
    parentNode: parent,
    getAttribute(k) {
      return k in this._attrs ? this._attrs[k] : null;
    },
  };
}

test('selection: frameTitleOfSelection 沿父链找 data-tiddler-title，找不到回退 fallback', () => {
  const frame = fakeNode({ 'data-tiddler-title': '书 › 章' });
  const textNode = fakeNode({}, frame);
  const win = { getSelection: () => ({ anchorNode: textNode }) };
  assert.equal(selection.frameTitleOfSelection(win), '书 › 章');
  assert.equal(selection.frameTitleOfSelection({ getSelection: () => ({ anchorNode: null }) }, () => 'CTX 回退卡'), 'CTX 回退卡');
  assert.equal(selection.frameTitleOfSelection({}), null);
});

test('selection: getSelectionInfo 原生选区提取 + 块定位回退选区本身', () => {
  const span = fakeNode({}, fakeNode({ 'data-tiddler-title': '笔记' }));
  span.tagName = 'SPAN';
  span.textContent = ' 间隔重复 是记忆的核心。';
  const range = { startContainer: span };
  const win = { getSelection: () => ({ isCollapsed: false, rangeCount: 1, toString: () => '间隔重复', getRangeAt: () => range }) };
  const info = selection.getSelectionInfo(win);
  assert.equal(info.selected, '间隔重复');
  assert.equal(info.block, '间隔重复 是记忆的核心。');
  // 无选区
  assert.deepEqual([...Object.values(selection.getSelectionInfo({ getSelection: () => ({ isCollapsed: true }) }))], ['', '']);
});

// === pick-bubble / 编辑器操作模块 ===

test('pick-bubble: 模块装载并注册 tidme-pick-bubble widget', () => {
  const mod = tw.modules.execute('$:/plugins/keepone/tidme/import/widgets/pick-bubble.js');
  assert.ok(typeof mod['tidme-pick-bubble'] === 'function', 'widget 构造器已注册');
});

test('编辑器真制卡: tidme-make-cloze 从选区建卡（draft.of 解析 + commitCard 全链路）', () => {
  // 草稿态：编辑器里 currentTiddler 是 "Draft of '…'"
  wiki.addTiddler({ title: "Draft of '我的笔记'", 'draft.of': '我的笔记', text: '记忆的核心是 间隔重复。' });
  const opMod = tw.modules.execute('$:/plugins/keepone/tidme/editor/operations/make-cloze-card');
  const editWidget = { wiki, editTitle: "Draft of '我的笔记'", dispatchEvent() {} };
  const operation = { text: 'x', selStart: 0, selEnd: 4, selection: '间隔重复' };
  opMod['tidme-make-cloze'].call(editWidget, {}, operation);

  const cardTitle = 'Tidme/Decks/standalone/我的笔记--cloze';
  const card = wiki.getTiddler(cardTitle);
  assert.ok(card, '挖空卡已写库（父卡解析自 draft.of）');
  assert.equal(card.fields['tidme.kind'], 'item');
  assert.equal(card.fields['tidme.subkind'], 'cloze');
  assert.equal(card.fields['tidme.parent'], '我的笔记');
  assert.equal(card.fields.caption.includes('间隔重复'), true, 'caption 含挖空宏与选区');
  assert.equal(wiki.getTiddler('$:/state/folded/' + cardTitle).fields.text, 'hide', '折叠态已预备');
  // 无变更变换：replacement 保持 undefined（引擎 replacement===null/undefined 走原生不改写路径）
  assert.equal(operation.replacement, undefined);
});

test('编辑器真制卡: 空选区 / qa 无头守卫', () => {
  const common = tw.modules.execute('$:/plugins/keepone/tidme/editor/operations/make-card-common');
  const editWidget = { wiki, editTitle: '我的笔记', dispatchEvent() {} };
  // 空选区：cloze 不建卡
  const before = wiki.filterTiddlers('[tidme.kind[item]]').length;
  common.makeCard(editWidget, { selection: '  ' }, 'cloze');
  assert.equal(wiki.filterTiddlers('[tidme.kind[item]]').length, before, '空选区不建卡');
  // qa 需要模态（DOM）——无头环境守卫不抛错、不建卡
  common.makeCard(editWidget, { selection: '答案' }, 'qa');
  assert.equal(wiki.filterTiddlers('[tidme.kind[item]]').length, before);
});

test('气泡类名契约: section-bar 只查自己的气泡类（运行时观察 querySelector 实参）', () => {
  const dom = tw.modules.execute('$:/plugins/keepone/tidme/ui/base/dom.js');
  assert.notEqual(dom.SECTION_BUBBLE_CLASS, dom.PICK_BUBBLE_CLASS, '两个气泡类名必须不同（否则会互相删除）');
  assert.equal(dom.BUBBLE_STYLE_CLASS, 'tm-selection-bubble', '共享样式类单一产地');

  // 运行时观察：用记录型 document 渲染 section-bar，触发其选区同步，
  // 断言它查询的是自己的类、从不查询全局气泡类（曾按共享类名查询 → 误删全局气泡）
  const sectionMod = tw.modules.execute('$:/plugins/keepone/tidme/import/widgets/section.js');
  const queries = [];
  const recordDoc = {
    createElement: (t) => fakeDocument.createElement(t),
    body: fakeDocument.createElement('body'),
    defaultView: { getSelection: () => null },
    querySelector: (sel) => {
      queries.push(sel);
      return null;
    },
    querySelectorAll: () => [],
  };
  const holder = fakeDocument.createElement('div');
  const w = new sectionMod['section-bar']({ attributes: {} }, {
    wiki,
    document: recordDoc,
    parentWidget: {
      variables: { currentTiddler: { value: '普通笔记', params: [] } },
      getVariable: (n) => (n === 'currentTiddler' ? '普通笔记' : ''),
      getAncestorCount: () => 0,
      dispatchEvent: () => false,
    },
    variables: {},
  });
  w.render(holder, null);
  w._updateSelectionBubble_?.();
  const bubbleQueries = queries.filter((s) => String(s).includes('bubble'));
  assert.ok(bubbleQueries.length > 0, `触发了气泡查询（实际 ${JSON.stringify(queries)}）`);
  assert.ok(
    bubbleQueries.every((s) => String(s).includes(dom.SECTION_BUBBLE_CLASS)),
    `只查自己的气泡类（实际 ${JSON.stringify(bubbleQueries)}）`,
  );
  assert.ok(
    !bubbleQueries.some((s) => String(s).includes(dom.PICK_BUBBLE_CLASS)),
    '绝不查询全局制卡气泡类（越过此线即会误删全局气泡）',
  );
});
