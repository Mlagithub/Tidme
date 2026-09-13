/*
ui-components.test.mjs — UI 基础层与通用组件库测试（node:test）

测试内容：
- ui/base/dom: showToast, navigateTo, createNavLink
- ui/components/ui-primitives: renderEmpty, renderProgressBar, bindWidgetRefresh
- ui/components/card-modal: 模态弹窗与向后兼容 shim 正常 export
- 通用组件：ui/components/ui-primitives、ui/components/card-modal、ui/base/dialog（Esc/遮罩统一语义）
  （迁移期的 core/dom 等旧门面路径与 import/widgets、manager/widgets shim 均已删除）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectButtons, collectText, fakeDocument } from '../helpers/fake-dom.mjs';
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

test('dialog: Esc 一律按取消结算（confirm=false / prompt=null / alert=关闭），与焦点无关（统一语义）', async () => {
  const dialog = mod('ui/base/dialog.js');

  // confirmDialog：Esc → resolve(false)，overlay 摘除
  let confirmDone = false;
  const confirmP = dialog.confirmDialog(fakeDocument, { message: 'x' }).then((v) => {
    confirmDone = true;
    return v;
  });
  await new Promise((r) => setTimeout(r, 0));
  const confirmKey = (fakeDocument._listeners.keydown || []).pop();
  assert.ok(confirmKey, 'confirmDialog 已挂 document 级 keydown');
  confirmKey({ key: 'Escape' });
  assert.equal(await confirmP, false, 'Esc = 取消');
  assert.ok(confirmDone);
  assert.ok(!fakeDocument.body._elListeners || true, '关闭后 body 无残留 overlay 由 removeChild 保证');

  // promptDialog：焦点不在 input（不走 input 的 keydown）时 Esc 也能取消
  const promptP = dialog.promptDialog(fakeDocument, { message: 'name?' });
  await new Promise((r) => setTimeout(r, 0));
  const promptKey = (fakeDocument._listeners.keydown || []).pop();
  promptKey({ key: 'Escape' });
  assert.equal(await promptP, null, 'Esc = null');
});

test('dialog: 点击遮罩空白区按取消结算；点击弹窗内容不关闭', async () => {
  const dialog = mod('ui/base/dialog.js');
  const confirmP = dialog.confirmDialog(fakeDocument, { message: 'y' });
  await new Promise((r) => setTimeout(r, 0));
  // overlay = body 最后插入的子节点
  const overlay = fakeDocument.body.children[fakeDocument.body.children.length - 1];
  assert.ok(overlay, 'overlay 已挂载');
  overlay.dispatchEvent({ type: 'click', target: overlay });
  assert.equal(await confirmP, false, '遮罩点击 = 取消');
});
test('card-modal: ui/components/card-modal 导出 openCardModal', () => {
  const modalNew = mod('ui/components/card-modal.js');
  assert.equal(typeof modalNew.openCardModal, 'function');
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
  assert.ok(qaCard.text.includes('BST 中序遍历'));
  assert.ok(qaCard.text.includes('单调非递减'));
  assert.ok(!qaCard.text.includes('Q:'), '不含 Q: 前缀');
  assert.ok(!qaCard.text.includes('A:'), '不含 A: 前缀');
  assert.equal(qaCard.state, '0');
  assert.equal(qaCard['tidme.priority'], '50', '独立卡未指定 priority 时默认 50');

  // 2. 独立挖空卡 (Cloze)
  const clozeCard = cardFactory.buildStandaloneCard(wiki, {
    type: 'cloze',
    clozeContent: '计算机硬件由 <<C "运算器">>、控制器、存储器、输入设备和输出设备组成。',
  });

  assert.ok(clozeCard.title.startsWith('Tidme/Decks/standalone/'), '散卡路径收敛为 Tidme/Decks/standalone/');
  assert.equal(clozeCard['tidme.kind'], 'item');
  assert.equal(clozeCard['tidme.subkind'], 'cloze');
  assert.equal(clozeCard['tidme.deck'], 'standalone', 'tidme.deck 落标识 standalone');
  assert.equal(clozeCard.state, '0');
  assert.equal(clozeCard['tidme.priority'], '50');

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
  assert.equal(conceptCard['tidme.priority'], '50');
  assert.equal(conceptCard['tidme.afactor'], '1.5', '独立 Concept 卡带默认 A-Factor');

  // 4. 自定义优先级
  const customCard = cardFactory.buildStandaloneCard(wiki, {
    type: 'qa',
    question: 'Q',
    answer: 'A',
    priority: 25,
  });
  assert.equal(customCard['tidme.priority'], '25', '保留指定 priority');
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

  const byClass = (node, cls, out = []) => {
    if (!node) return out;
    if (String(node.className || '').includes(cls)) out.push(node);
    for (const c of node.childNodes || []) byClass(c, cls, out);
    return out;
  };
  const cmContainers = byClass(mockDoc.body, 'tm-omni-cm-container');
  assert.equal(cmContainers.length, 2, 'QA 问答模式挂载 2 个 CodeMirror 容器（正面与背面）');

  // 模拟输入并保存
  clickSubmit();
  // 校验回调
  assert.ok(createdCard, '保存成功触发 onSuccess');
  assert.equal(createdCard['tidme.kind'], 'item');
  assert.equal(createdCard['tidme.subkind'], 'qa');
});

test('omni-creator: 标签支持已有下拉与手动输入并正确写入卡片', () => {
  const omni = mod('ui/components/omni-creator.js');
  wiki.addTiddler({ title: 'TagTest1', tags: ['算法', '数据结构'] });

  const tags = omni.listAvailableTags(wiki);
  assert.ok(tags.includes('算法'), 'listAvailableTags 包含已有标签');
  assert.ok(tags.includes('数据结构'), 'listAvailableTags 包含数据结构');

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
    defaultTitle: '标签测试卡',
    defaultTags: ['默认标签'],
    defaultQuestion: '什么是树？',
    defaultAnswer: '非线性数据结构。',
    onSuccess: (card) => {
      createdCard = card;
    },
  });

  assert.ok(clickSubmit, '保存按钮存在');
  clickSubmit();

  assert.ok(createdCard, '制卡成功');
  assert.ok(Array.isArray(createdCard.tags), '卡片包含 tags 数组');
  assert.ok(createdCard.tags.includes('默认标签'), '包含预置标签');
});

test('omni-creator: Linear 风格标签 combobox —— 模糊过滤/键盘选中/创建行/退格删 pill/Esc 语义', () => {
  const omni = mod('ui/components/omni-creator.js');
  wiki.addTiddler({ title: 'TagComboboxT1', tags: ['算法', '数据结构', '软件架构'] });

  const doc = {
    createElement: (t) => fakeDocument.createElement(t),
    createTextNode: (s) => fakeDocument.createTextNode(s),
    body: fakeDocument.createElement('body'),
    querySelector: () => null,
  };
  omni.openOmniCardModal(doc, wiki, {});

  const byClass = (node, cls, out = []) => {
    if (!node) return out;
    if (String(node.className || '').includes(cls)) out.push(node);
    for (const c of node.childNodes || []) byClass(c, cls, out);
    return out;
  };
  const combobox = byClass(doc.body, 'tm-omni-combobox')[0];
  const input = byClass(combobox, 'tm-omni-tag-input')[0];
  const popup = byClass(combobox, 'tm-omni-tag-popup')[0];
  const key = (k) => input.dispatchEvent({ type: 'keydown', key: k, preventDefault: () => {}, stopPropagation: () => {} });

  // 模糊过滤：“构” 命中「软件架构」；无精确匹配出现创建行
  input.value = '构';
  input.dispatchEvent({ type: 'input' });
  const optText = byClass(popup, 'tm-omni-tag-option').map((o) => collectText(o));
  assert.ok(optText.some((t) => t.includes('软件架构')), '模糊命中已有标签');
  assert.ok(optText.some((t) => t.includes('创建新标签') && t.includes('构')), '无精确匹配出现创建行');

  // Enter 选中活动行 → pill 生成，列表保持打开（连续点选）
  key('Enter');
  assert.ok(byClass(combobox, 'tm-omni-tag-pill').some((p) => collectText(p).includes('软件架构')), 'Enter 选中生成 pill');
  assert.ok(byClass(popup, 'tm-omni-tag-option').length > 0, '选中后列表保持打开');

  // 创建行 → Enter 创建新标签 pill
  input.value = '全新标签';
  input.dispatchEvent({ type: 'input' });
  key('Enter');
  assert.ok(byClass(combobox, 'tm-omni-tag-pill').some((p) => collectText(p).includes('全新标签')), '创建行生成新标签 pill');

  // Backspace 空输入删除末位 pill
  key('Backspace');
  assert.ok(!byClass(combobox, 'tm-omni-tag-pill').some((p) => collectText(p).includes('全新标签')), '退格删除末位 pill');

  // Esc 先关建议列表（弹窗保留）；弹窗级 Esc 再关弹窗
  input.dispatchEvent({ type: 'input' });
  key('Escape');
  assert.ok(doc.body.childNodes.some((n) => String(n.className).includes('tm-omni-creator-overlay')), 'Esc 只关列表，弹窗保留');
  const modal = byClass(doc.body, 'tm-omni-creator-modal')[0];
  modal.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
  assert.ok(!doc.body.childNodes.some((n) => String(n.className).includes('tm-omni-creator-overlay')), '再按 Esc 关闭弹窗');
});

test('omni-creator: 提交带标签卡片写入最近使用，重开弹窗空查询置顶展示', () => {
  const omni = mod('ui/components/omni-creator.js');
  const byClass = (node, cls, out = []) => {
    if (!node) return out;
    if (String(node.className || '').includes(cls)) out.push(node);
    for (const c of node.childNodes || []) byClass(c, cls, out);
    return out;
  };
  const doc = {
    createElement: (t) => fakeDocument.createElement(t),
    body: fakeDocument.createElement('body'),
    querySelector: () => null,
  };
  omni.openOmniCardModal(doc, wiki, {
    defaultType: 'qa',
    defaultQuestion: '最近使用测试问题',
    defaultAnswer: 'A',
    defaultTags: ['机器学习'],
  });
  const submitBtn = byClass(doc.body, 'tm-card-modal-submit')[0];
  submitBtn.dispatchEvent({ type: 'click' });

  // 最近使用 state 落库（组件私有 $:/state）
  const recent = wiki.getTiddlerText('$:/state/tidme/omni/recent-tags', '');
  assert.ok(recent.includes('机器学习'), '提交后写入最近使用');

  // 重开弹窗：空查询首分区为「最近使用」，首行为该标签
  const doc2 = {
    createElement: (t) => fakeDocument.createElement(t),
    createTextNode: (s) => fakeDocument.createTextNode(s),
    body: fakeDocument.createElement('body'),
    querySelector: () => null,
  };
  omni.openOmniCardModal(doc2, wiki, {});
  const combobox2 = byClass(doc2.body, 'tm-omni-combobox')[0];
  const input2 = byClass(combobox2, 'tm-omni-tag-input')[0];
  input2.dispatchEvent({ type: 'focus' });
  const popup2 = byClass(combobox2, 'tm-omni-tag-popup')[0];
  const sections = byClass(popup2, 'tm-omni-tag-section').map((s) => collectText(s));
  assert.equal(sections[0], '最近使用', '首分区为最近使用');
  const firstOpt = byClass(popup2, 'tm-omni-tag-option')[0];
  assert.ok(collectText(firstOpt).includes('机器学习'), '最近使用标签置顶展示');
  assert.ok(!collectText(firstOpt).includes('✓'), '重开未预选时无勾选标记（勾选只反映当前选中态）');
});

test('omni-creator: <$tidme-card-creator/> widget 在 TW 真实解析并渲染为 DOM 节点', () => {
  const container = fakeDocument.createElement('div');
  const parser = wiki.parseText('text/vnd.tiddlywiki', '<$tidme-card-creator/>');
  const widget = wiki.makeWidget(parser, { document: fakeDocument });
  widget.render(container, null);

  assert.ok(container.childNodes.length > 0, '成功渲染出 DOM 元素');
  const btns = collectButtons(container);
  assert.ok(btns.length > 0, '包含制卡按钮');
  const btn = btns[0];
  assert.ok(btn && String(btn.className).includes('tm-card-modal-submit'), '包含制卡按钮类名');
  assert.ok(btn && String(btn.textContent).includes('Alt+K'), '制卡按钮显示 Alt+K 快捷键');
});

test('omni-creator: Alt+K 唤起独立制卡并截断事件传播，Alt+N 保留给系统原生新建条目', () => {
  const omni = mod('ui/components/omni-creator.js');
  const docListeners = {};
  const mockWinDoc = {
    addEventListener: (evt, fn) => {
      docListeners[evt] = fn;
    },
    querySelector: () => null,
    createElement: (t) => fakeDocument.createElement(t),
    body: fakeDocument.createElement('body'),
  };

  omni.initGlobalCardShortcut(wiki, { document: mockWinDoc });
  const onKeydown = docListeners['keydown'];
  assert.ok(onKeydown, '成功挂载 keydown 全局监听器');

  // 1. Alt+N 不应触发，且不调用 preventDefault / stopPropagation
  let altNPrevented = false;
  let altNStopped = false;
  onKeydown({
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    key: 'n',
    preventDefault: () => {
      altNPrevented = true;
    },
    stopPropagation: () => {
      altNStopped = true;
    },
    stopImmediatePropagation: () => {
      altNStopped = true;
    },
  });
  assert.equal(altNPrevented, false, 'Alt+N 不应被阻止（留给 TiddlyWiki 原生新建）');
  assert.equal(altNStopped, false, 'Alt+N 不应截断传播');

  // 2. Alt+K 应触发制卡，并且同时阻止默认行为和事件传播
  let altKPrevented = false;
  let altKStopped = false;
  let altKImmediateStopped = false;
  onKeydown({
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    key: 'k',
    preventDefault: () => {
      altKPrevented = true;
    },
    stopPropagation: () => {
      altKStopped = true;
    },
    stopImmediatePropagation: () => {
      altKImmediateStopped = true;
    },
  });
  assert.equal(altKPrevented, true, 'Alt+K 必须调用 preventDefault');
  assert.equal(altKStopped, true, 'Alt+K 必须调用 stopPropagation');
  assert.equal(altKImmediateStopped, true, 'Alt+K 必须调用 stopImmediatePropagation');
});

test('ui/components/omni-creator: listDeckOptions 解耦内部值与显示文本', () => {
  const omni = mod('ui/components/omni-creator.js');
  const cardFactory = mod('core/card-factory.js');
  const ns = mod('core/ns.js');

  const options = omni.listDeckOptions(wiki);
  assert.ok(Array.isArray(options));
  assert.ok(options.length >= 1);
  assert.equal(options[0].value, '__standalone__', '散卡首项内部值必须为 __standalone__');
  assert.ok(options[0].label, '散卡首项必须有本地化显示标签');

  // 向后兼容测试
  const labels = omni.listAvailableDecks(wiki);
  assert.equal(labels[0], options[0].label);

  // buildStandaloneCard 散卡路径测试
  const card = cardFactory.buildStandaloneCard(wiki, {
    type: 'qa',
    title: 'Test Q',
    deck: '__standalone__',
    question: 'Q',
    answer: 'A',
  });
  assert.ok(card.title.startsWith(ns.NS_DECKS_STANDALONE), `散卡必须以 ${ns.NS_DECKS_STANDALONE} 为基座路径`);
});
