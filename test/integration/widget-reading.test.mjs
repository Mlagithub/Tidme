/*
widget-reading.test.mjs — 阅读侧 widget（section-bar / doc-resume / reading-list / import-file）
+ 刷新机制嗅探 + 重复导入对齐不覆盖 SRS 进度

每用例 reset + 重建标准书夹具（helpers/fixtures.makeBookFixture），测试间零共享状态。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectButtons, collectText, renderWidget as renderWidgetBase } from '../helpers/fake-dom.mjs';
import { makeBookFixture } from '../helpers/fixtures.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-wgt-read-' });
const parseMod = mod('import/parse.js');
const sectionBar = mod('import/widgets/section.js');
const importFile = mod('import/widgets/import.js');

/** 渲染并返回根节点（冒烟断言用） */
function renderWidget(wiki, mod_, name, opts = {}) {
  return renderWidgetBase(wiki, mod_, name, opts).root;
}

/** 渲染并返回 {root, w}（需要 refresh 等实例方法时用） */
function renderWidgetEx(wiki, mod_, name, opts = {}) {
  return renderWidgetBase(wiki, mod_, name, opts);
}

let F;
test.beforeEach(async () => {
  reset();
  F = await makeBookFixture(wiki, parseMod);
});

test('section-bar: 两行布局 + 统一按钮风格', () => {
  const title = wiki.filterTiddlers('[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]!has[tidme.done]]')[0];
  const root = renderWidget(wiki, sectionBar, 'section-bar', { variables: { currentTiddler: title } });
  const bar = (root.children || [])[0];
  assert.ok(bar && String(bar.className || '').includes('tm-section-bar'), '条栏根节点');
  const rows = (bar.children || []).filter((c) => String(c.className || '').includes('tm-section-row'));
  assert.equal(rows.length, 2, '两行：信息 + 按钮');
  assert.ok(String(rows[0].className).includes('tm-section-info'), '第一行=信息（面包屑/位置/剩余）');
  assert.ok(String(rows[1].className).includes('tm-section-btns'), '第二行=按钮');
  assert.ok(collectText(rows[0]).includes('剩'), '信息行含剩余待学');
  assert.ok(collectText(rows[0]).includes('p'), '信息行含优先级');
  assert.ok(collectText(rows[1]).includes('优先↑') && collectText(rows[1]).includes('优先↓'), '优先级快速调整按钮');
  const btns = collectButtons(rows[1]);
  assert.ok(btns.length >= 6, '按钮行含导航/续读点/生命周期/制卡/帮助按钮');
  for (const b of btns) {
    assert.ok(String(b.className || '').startsWith('tm-sec-btn'), `按钮统一风格: ${b.className}`);
  }
});

test('section-bar: 即时刷新（本文档卡变化 → 重建）', () => {
  const title = wiki.filterTiddlers('[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]!has[tidme.done]]')[0];
  const { root, w } = renderWidgetEx(wiki, sectionBar, 'section-bar', { variables: { currentTiddler: title } });
  // 初始未读：有「已读」按钮，无「已读」完成状态
  assert.ok(collectText(root).includes('已读'), '初始为未读状态');
  // 外部把本卡标为已读（模拟文档页/管理器入口）
  const f = wiki.getTiddler(title).fields;
  wiki.addTiddler({ ...f, 'tidme.done': 'yes' });
  assert.equal(w.refresh({ [title]: { modified: true } }), true, 'refresh 处理了变化');
  const text2 = collectText(root);
  assert.ok(text2.includes('已读'), '重建后显示已读状态');
  assert.ok(text2.includes('重新加入'), '重建后显示重新加入按钮');
  assert.ok(!text2.includes('已读"'), '旧已读按钮消失');
  assert.ok(text2.includes('更多'), '低频调控收进「更多」菜单');
});

test('刷新机制: 数据变化 → refresh 嗅探重建（stats-panel）', async () => {
  const statsPanel = mod('import/widgets/stats-panel.js');
  // 先渲染统计面板
  const { root, w } = renderWidgetEx(wiki, statsPanel, 'stats-panel');
  // 新导入第二本书（直接写库，模拟切分/导入落库）
  const r = await parseMod.runSplit({ text: '# 第二本书\n\n第二章正文。', title: '第二本书', type: 'text/markdown', minChars: 0 });
  for (const t of r.tiddlers) wiki.addTiddler(t);
  // TW 原生刷新：把变更集喂给组件 refresh（等价真实环境的变化传播）
  const changed = {};
  for (const t of r.tiddlers) changed[t.title] = { modified: true };
  assert.equal(w.refresh(changed), true, '嗅探到 tidme 数据变化并重建');
  await new Promise((r) => setTimeout(r, 60)); // 重建合并到宏任务，等待延迟回调
  const text = collectText(root);
  assert.ok(text.includes('第二本书'), '刷新后统计面板出现新书进度');
});

test('doc-resume: 子集复习按钮（复习本书）', () => {
  // 一节已读（有阅读进度才有「已读」进度文案；旧共享夹具曾隐式依赖前序用例，此处显式化）
  const secTitle = wiki.filterTiddlers('[tidme.kind[topic]tidme.subkind[section]]')[0];
  wiki.addTiddler({ ...wiki.getTiddler(secTitle).fields, 'tidme.done': 'yes' });
  // 文档页渲染（书名甲有在队卡 → 显示「复习本书」）；currentTiddler 用新命名空间路径
  const root = renderWidget(wiki, sectionBar, 'doc-resume', { variables: { currentTiddler: F.docTitle } });
  const text = collectText(root);
  assert.ok(text.includes('继续阅读'), '继续阅读按钮');
  assert.ok(text.includes('复习本书'), '子集复习按钮');
  assert.ok(text.includes('清理阅读材料'), '清理阅读材料按钮');
  assert.ok(text.includes('已读'), '进度文案');
});

test('import-file: 服务端后台处理选项', () => {
  const root = renderWidget(wiki, importFile, 'import-file');
  const text = collectText(root);
  assert.ok(text.includes('服务端后台处理'), '服务端处理选项');
});

test('align: 重复导入（A）——同内容再导入不覆盖 SRS 进度', async () => {
  const align = mod('core/align.js');
  // 首次切分并写库（minChars=0 保持两节独立）
  const r1 = await parseMod.runSplit({ text: '# 重导书\n\n甲内容。\n\n## 乙\n\n乙内容。', title: '重导书', type: 'text/markdown', minChars: 0 });
  for (const t of r1.tiddlers) wiki.addTiddler(t);
  // 给「甲」节设 SRS 进度（第一节：面包屑 = 文档标题 › H1 标题）；节卡须排除文档页宿主
  const jia = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]!tag[tidme-doc]tidme.breadcrumb[重导书 › 重导书]]`)[0] ||
    wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]!tag[tidme-doc]]`)[0];
  assert.ok(jia, '找到甲节');
  wiki.addTiddler({ ...wiki.getTiddler(jia).fields, state: '2', reps: '5', due: '20261231000000000' });
  // 再次导入同一内容（模拟重复导入/剪藏更新）
  const r2 = await parseMod.runSplit({ text: '# 重导书\n\n甲内容。\n\n## 乙\n\n乙内容。', title: '重导书', type: 'text/markdown', minChars: 0 });
  const oldCards = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]!tag[tidme-doc]!is[draft]]`)
    .map((t) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
  const sectionCards = r2.tiddlers.filter((x) => x['tidme.kind'] === 'topic' && !(Array.isArray(x.tags) && x.tags.includes('tidme-doc')));
  const aligned = await align.alignCards(oldCards, '重导书', sectionCards.map((c) => ({ title: c.title, fields: c })));
  // 内容全同 → 全部 unchanged，不新增/不更新/不归档
  assert.equal(aligned.unchanged, 2, '两节全部未变');
  assert.equal(aligned.keep.length, 0);
  assert.equal(aligned.patches.length, 0);
  assert.equal(aligned.archives.length, 0);
  // SRS 进度保留（旧卡未被覆盖）
  const after = wiki.getTiddler(jia).fields;
  assert.equal(after.state, '2', 'SRS state 保留');
  assert.equal(after.reps, '5', 'SRS reps 保留');
});

test('doc-resume: 摘录收件箱聚合（加工标注）', () => {
  const root = renderWidget(wiki, sectionBar, 'doc-resume', { variables: { currentTiddler: F.docTitle } });
  const text = collectText(root);
  assert.ok(text.includes('摘录/挖空'), '摘录聚合区标题');
  assert.ok(text.includes('摘'), '摘录 kind 标记');
  assert.ok(text.includes('可挖空'), '无子挖空的摘录显示可挖空');
  assert.ok(text.includes('回原文'), '回原文操作');
  // 给摘录卡加一个子挖空 → 已挖空（命名空间化：进 decks 目录）
  const extExtractTitle = wiki.filterTiddlers('[tidme.subkind[extract]]')[0];
  const extFields = wiki.getTiddler(extExtractTitle).fields;
  const childCloze = extExtractTitle.replace(/^Tidme\/Books\//, 'Tidme/Decks/').replace(/--extract$/, '') + '--cloze';
  wiki.addTiddler({
    title: childCloze,
    state: '0',
    'tidme.doc': extFields['tidme.doc'],
    'tidme.parent': extExtractTitle,
    'tidme.kind': 'item',
    'tidme.subkind': 'cloze',
    'tidme.breadcrumb': `${extFields['tidme.breadcrumb']} › 挖空`,
  });
  const root2 = renderWidget(wiki, sectionBar, 'doc-resume', { variables: { currentTiddler: F.docTitle } });
  assert.ok(collectText(root2).includes('已挖空'), '有子挖空的摘录显示已挖空');
  // 问答卡也在收件箱（回归：subkind qa 曾被过滤，形成的问答在文档页不可见）
  wiki.addTiddler({
    title: childCloze.replace(/--cloze$/, '--qa'),
    state: '0',
    'tidme.doc': extFields['tidme.doc'],
    'tidme.parent': extExtractTitle,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    'tidme.breadcrumb': `${extFields['tidme.breadcrumb']} › 问答`,
  });
  const root3 = renderWidget(wiki, sectionBar, 'doc-resume', { variables: { currentTiddler: F.docTitle } });
  const text3 = collectText(root3);
  assert.ok(text3.includes('摘录/挖空/问答'), '收件箱标题含问答');
  assert.ok(text3.includes('问'), '问答卡出现问标记');
  // 收件箱默认展开（此前折叠导致形成了也看不见；fake DOM 无法模拟折叠，直接断言 open 属性）
  const findBox = (node) => {
    if (String(node.className || '').includes('tm-doc-derived')) return node;
    for (const c of node.childNodes || []) {
      const f = findBox(c);
      if (f) return f;
    }
    return null;
  };
  const box = findBox(root3);
  assert.ok(box && box.open === true, '收件箱默认展开');
});

test('section-bar: 摘录卡加工按钮（✂ 挖空）', () => {
  const extractTitle = wiki.filterTiddlers('[tidme.subkind[extract]]')[0];
  assert.ok(extractTitle, '测试数据应有摘录卡');
  const root = renderWidget(wiki, sectionBar, 'section-bar', { variables: { currentTiddler: extractTitle } });
  const text = collectText(root);
  assert.ok(text.includes('挖空'), '摘录卡显示挖空加工按钮');
  assert.ok(text.includes('源自'), '来源链接');
});

test('section-bar: 忽略按钮', () => {
  const title = wiki.filterTiddlers('[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]!has[tidme.done]]')[0];
  const root = renderWidget(wiki, sectionBar, 'section-bar', { variables: { currentTiddler: title } });
  const text = collectText(root);
  assert.ok(text.includes('忽略'), '未读节显示忽略按钮');
});

test('reading-list: 渲染 topic 队列（按文档分组 + 进度 + 继续阅读）', () => {
  const rl = mod('import/widgets/reading-list.js');
  // 纯函数：收集 + 分组
  const cards = rl.collectTopicCards(wiki);
  const groups = rl.groupByDoc(cards);
  const jia = groups.find((g) => g.cards.some((c) => c.breadcrumb.startsWith('书名甲')));
  assert.ok(jia, '书名甲分组存在');
  assert.ok(jia.cards.some((c) => c.kind === 'extract'), '摘录卡（topic）在阅读列表');
  assert.ok(!jia.cards.some((c) => c.kind === 'cloze'), '挖空卡（item）不在阅读列表');
  // 排序：高优先级在前
  const docId2 = wiki.getTiddler(F.extractTitle).fields['tidme.doc'];
  const highExtTitle = F.sectionTitle + '--extract-high';
  wiki.addTiddler({
    title: highExtTitle,
    'tidme.doc': docId2,
    'tidme.kind': 'topic',
    'tidme.subkind': 'extract',
    'tidme.priority': '5',
    'tidme.breadcrumb': '书名甲 › 高优摘录',
    state: '0',
  });
  const sorted = rl.sortTopicCards(rl.collectTopicCards(wiki).filter((c) => c.breadcrumb.startsWith('书名甲')));
  assert.equal(sorted[0].title, highExtTitle, '优先级 5 排在优先级 50 前');
  // 渲染 widget
  const root = renderWidget(wiki, rl, 'reading-list');
  const text = collectText(root);
  assert.ok(text.includes('阅读列表'), '标题');
  assert.ok(text.includes('待读'), '计数');
  assert.ok(text.includes('书名甲'), '文档名');
  function findByClass(node, cls) {
    if (!node) return null;
    if (typeof node.className === 'string' && node.className.split(/\s+/).includes(cls)) return node;
    for (const c of node.childNodes || []) {
      const res = findByClass(c, cls);
      if (res) return res;
    }
    return null;
  }

  assert.ok(findByClass(root, 'tm-rl-doc-info'), '头部包含标题容器 tm-rl-doc-info');
  assert.ok(findByClass(root, 'tm-rl-doc-meta'), '头部包含元数据容器 tm-rl-doc-meta');
  assert.ok(findByClass(root, 'tm-rl-doc-actions'), '头部包含操作按钮容器 tm-rl-doc-actions');
  // compact 模式（侧边栏）：文档分组折叠 + 不含页头"复习测试卡"与进度条
  const compactRoot = renderWidgetEx(wiki, rl, 'reading-list', { attributes: { compact: 'yes' } }).root;
  const ctext = collectText(compactRoot);
  assert.ok(ctext.includes('张待读'), 'compact 计数');
  assert.ok(!ctext.includes('去复习'), 'compact 不含去复习按钮');
  assert.ok(ctext.includes('书名甲'), 'compact 文档名');
  assert.ok(findByClass(compactRoot, 'tm-rl-doc-info'), 'compact 头部包含标题容器 tm-rl-doc-info');
  assert.ok(findByClass(compactRoot, 'tm-rl-doc-actions'), 'compact 头部包含操作按钮容器 tm-rl-doc-actions');
});
