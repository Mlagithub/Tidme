/*
ui-components.test.mjs — UI 基础层与通用组件库测试（node:test）

测试内容：
- ui/base/dom: showToast, navigateTo, createNavLink
- ui/components/ui-primitives: renderEmpty, renderProgressBar, bindWidgetRefresh
- ui/components/card-modal: 模态弹窗与向后兼容 shim 正常 export
- 架构兼容门面：core/dom, core/icons, core/dialog, import/widgets/nav, manager/widgets/ui-primitives
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectText, fakeDocument } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-ui-test-' });

test('ui/base/dom: showToast 创建并正确插入 toast 元素', () => {
  const dom = mod('ui/base/dom.js');
  const doc = fakeDocument;
  const container = doc.createElement('div');

  const toast = dom.showToast(doc, container, '操作成功', 'ok', 10);
  assert.ok(toast);
  assert.equal(toast.className, 'tm-toast tm-toast--ok');
  assert.equal(toast.textContent, '操作成功');
  assert.equal(container.childNodes[0], toast);
});

test('ui/base/dom: createNavLink 生成带 tm-navigate 派发的链接', () => {
  const dom = mod('ui/base/dom.js');
  let clickHandler = null;
  const mockDoc = {
    createElement: (t) => {
      const el = fakeDocument.createElement(t);
      el.addEventListener = (evt, fn) => {
        if (evt === 'click') clickHandler = fn;
      };
      return el;
    },
  };
  let dispatched = null;
  const mockWidget = {
    dispatchEvent: (e) => {
      dispatched = e;
    },
  };

  const a = dom.createNavLink(mockDoc, mockWidget, {
    text: '跳转测试',
    target: 'MyTargetTiddler',
    cls: 'my-custom-link',
  });

  assert.equal(a.tagName, 'A');
  assert.equal(a.textContent, '跳转测试');
  assert.equal(a.className, 'my-custom-link');

  assert.ok(clickHandler);
  clickHandler({ preventDefault: () => {} });
  assert.equal(dispatched?.type, 'tm-navigate');
  assert.equal(dispatched?.navigateTo, 'MyTargetTiddler');
});

test('ui/components/ui-primitives: renderEmpty 生成结构规范的空状态 DOM', () => {
  const primitives = mod('ui/components/ui-primitives.js');

  // 1. 纯文字
  const e1 = primitives.renderEmpty(fakeDocument, '没有卡片');
  assert.ok(e1.className.includes('tm-empty'));
  assert.ok(collectText(e1).includes('没有卡片'));

  // 2. 带图标与操作引导
  let actionTriggered = false;
  let clickHandler = null;
  const mockDoc = {
    createElement: (t) => {
      const el = fakeDocument.createElement(t);
      el.addEventListener = (evt, fn) => {
        if (evt === 'click') clickHandler = fn;
      };
      return el;
    },
  };

  const e2 = primitives.renderEmpty(mockDoc, {
    text: '暂无数据',
    icon: '📦',
    actionText: '立即创建',
    onAction: () => {
      actionTriggered = true;
    },
  });
  assert.ok(collectText(e2).includes('📦'));
  assert.ok(collectText(e2).includes('暂无数据'));
  assert.ok(collectText(e2).includes('立即创建'));

  assert.ok(clickHandler);
  clickHandler({ preventDefault: () => {} });
  assert.equal(actionTriggered, true);
});

test('ui/components/ui-primitives: renderProgressBar 计算百分比与文本', () => {
  const primitives = mod('ui/components/ui-primitives.js');
  const doc = fakeDocument;

  // 1. 基础百分比
  const bar1 = primitives.renderProgressBar(doc, 3, 10);
  assert.ok(bar1.className.includes('tm-progress'));
  const fill1 = bar1.childNodes.find((n) => n.className?.includes('tm-progress-fill'));
  assert.equal(fill1.style.width, '30%');

  // 2. 携带文字说明与溢出保护
  const bar2 = primitives.renderProgressBar(doc, 15, 10, { showText: true });
  const fill2 = bar2.childNodes.find((n) => n.className?.includes('tm-progress-fill'));
  assert.equal(fill2.style.width, '100%');
  assert.ok(collectText(bar2).includes('15/10 (100%)'));
});

test('ui/components/ui-primitives: bindWidgetRefresh 属性变动优先刷新', () => {
  const primitives = mod('ui/components/ui-primitives.js');
  let refreshedSelf = false;
  const mockWidget = {
    wiki,
    computeAttributes: () => ({ changedAttr: true }),
    refreshSelf: () => {
      refreshedSelf = true;
    },
  };

  const res = primitives.bindWidgetRefresh(mockWidget, {}, () => {});
  assert.equal(res, true);
  assert.equal(refreshedSelf, true);
});

test('card-modal: 新路径与向后兼容 shim 均能导出 openCardModal', () => {
  const modalNew = mod('ui/components/card-modal.js');
  assert.equal(typeof modalNew.openCardModal, 'function');

  const modalOld = mod('import/widgets/card-modal.js');
  assert.equal(typeof modalOld.openCardModal, 'function');
});

test('向下兼容转发桩 (Shims) 完整性验证', () => {
  // core shims
  const coreDom = mod('core/dom.js');
  assert.equal(typeof coreDom.el, 'function');
  assert.equal(typeof coreDom.showToast, 'function');

  const coreIcons = mod('core/icons.js');
  assert.equal(typeof coreIcons.iconSvg, 'function');

  const coreDialog = mod('core/dialog.js');
  assert.equal(typeof coreDialog.confirmDialog, 'function');

  // manager & import shims
  const managerPrim = mod('manager/widgets/ui-primitives.js');
  assert.equal(typeof managerPrim.renderEmpty, 'function');

  const managerForm = mod('manager/widgets/setting-form.js');
  assert.equal(typeof managerForm.renderSettingGroups, 'function');

  const importNav = mod('import/widgets/nav.js');
  assert.ok(importNav['tidme-nav']);
});

test('card-factory: buildStandaloneCard 全局独立制卡构建（QA / Cloze / Concept 与牌组归属）', () => {
  const cardFactory = mod('core/card-factory.js');

  // 1. 独立问答卡 (QA)
  const qaCard = cardFactory.buildStandaloneCard(wiki, {
    type: 'qa',
    title: '二叉查找树性质',
    deck: '算法',
    question: 'BST 中序遍历的输出特征是什么？',
    answer: '单调非递减有序序列。',
  });

  assert.equal(qaCard.title, 'Tidme/Decks/算法/二叉查找树性质');
  assert.equal(qaCard['tidme.kind'], 'item');
  assert.equal(qaCard['tidme.subkind'], 'qa');
  assert.equal(qaCard['tidme.deck'], '算法');
  assert.equal(qaCard.caption, '二叉查找树性质');
  assert.ok(qaCard.text.includes('Q: BST 中序遍历'));
  assert.ok(qaCard.text.includes('A: 单调非递减'));
  assert.equal(qaCard.state, '0');

  // 2. 独立挖空卡 (Cloze)
  const clozeCard = cardFactory.buildStandaloneCard(wiki, {
    type: 'cloze',
    clozeContent: '计算机硬件由 <<C "运算器">>、控制器、存储器、输入设备和输出设备组成。',
  });

  assert.ok(clozeCard.title.startsWith('Tidme/Decks/散卡/'));
  assert.equal(clozeCard['tidme.kind'], 'item');
  assert.equal(clozeCard['tidme.subkind'], 'cloze');
  assert.equal(clozeCard['tidme.deck'], '散卡');
  assert.equal(clozeCard.state, '0');

  // 3. 独立概念/知识卡 (Concept -> Topic 材料流)
  const conceptCard = cardFactory.buildStandaloneCard(wiki, {
    type: 'concept',
    title: '李代数基础',
    deck: '数学',
    conceptContent: '李代数是一个在数域上的向量空间，带有一个双线性二元运算（李括号）...',
  });

  assert.equal(conceptCard.title, 'Tidme/Decks/数学/李代数基础');
  assert.equal(conceptCard['tidme.kind'], 'topic');
  assert.equal(conceptCard['tidme.subkind'], 'concept');
  assert.equal(conceptCard.caption, '李代数基础');
  assert.ok(conceptCard.text.includes('李代数是一个在数域上的向量空间'));
});

test('omni-creator: 全局制卡模态弹窗与 Widget 结构导出', () => {
  const omni = mod('ui/components/omni-creator.js');
  assert.equal(typeof omni.openOmniCardModal, 'function');
  assert.equal(typeof omni.listAvailableDecks, 'function');
  assert.ok(omni['tidme-card-creator'], 'Widget 已导出');

  const decks = omni.listAvailableDecks(wiki);
  assert.ok(decks.includes('散卡'), '默认包含散卡桶');

  let clickSubmit = null;
  const mockDoc = {
    createElement: (t) => {
      const el = fakeDocument.createElement(t);
      el.addEventListener = (evt, fn) => {
        if (evt === 'click' && String(el.className).includes('tm-card-modal-submit')) {
          clickSubmit = fn;
        }
      };
      return el;
    },
    body: fakeDocument.createElement('body'),
    querySelector: () => null,
  };

  let createdCard = null;
  omni.openOmniCardModal(mockDoc, wiki, {
    defaultType: 'qa',
    defaultTitle: '快速问答',
    defaultQuestion: '什么是闭包？',
    defaultAnswer: '闭包是函数与其词法环境的组合。',
    onSuccess: (card) => {
      createdCard = card;
    },
  });

  assert.ok(mockDoc.body.childNodes.length > 0, '全局模态窗成功挂载');
  assert.ok(clickSubmit, '保存按钮成功绑定');

  // 模拟输入并保存
  clickSubmit();
  // 校验回调
  assert.ok(createdCard, '保存成功触发 onSuccess');
  assert.equal(createdCard['tidme.kind'], 'item');
  assert.equal(createdCard['tidme.subkind'], 'qa');
});
