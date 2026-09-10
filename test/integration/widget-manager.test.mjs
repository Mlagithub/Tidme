/*
widget-manager.test.mjs — 管理侧 widget（queue-ops / stats-panel / card-manager / deck-ui）

每用例 reset + 重建标准书夹具（helpers/fixtures.makeBookFixture），测试间零共享状态。
断言为渲染冒烟（结构/关键文案）。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectButtons, collectText, fakeDocument, renderWidget as renderWidgetBase } from '../helpers/fake-dom.mjs';
import { makeBookFixture } from '../helpers/fixtures.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-wgt-mgr-' });
const parseMod = mod('import/parse.js');
const queueOps = mod('manager/widgets/queue-ops.js');
const statsPanel = mod('import/widgets/stats-panel.js');
const cardManager = mod('manager/widgets/card-manager.js');
const sched = mod('core/scheduler.js');
const deckUi = mod('manager/widgets/deck-ui.js');

/** 渲染并返回根节点（冒烟断言用） */
function renderWidget(wiki, mod_, name, opts = {}) {
  return renderWidgetBase(wiki, mod_, name, opts).root;
}

function collectElementsByClass(node, className, out = []) {
  if (!node) return out;
  if (node.className && String(node.className).includes(className)) out.push(node);
  for (const c of node.childNodes || []) collectElementsByClass(c, className, out);
  return out;
}

let F; // 标准书夹具引用（docTitle/sectionTitle/extractTitle/clozeTitle）
test.beforeEach(async () => {
  reset();
  F = await makeBookFixture(wiki, parseMod);
});

/** 无 kind 手动散卡（模拟用户手动建卡，按 item 兜底进复习流） */
function addLooseCard() {
  wiki.addTiddler({ title: '手动散卡甲', state: '0', due: '20261231000000000', reps: '0', lapses: '0', stability: '0', difficulty: '0' });
}

test('queue-ops: 每牌组渲染批量操作按钮（只剩默认牌组）', () => {
  const decks = wiki.filterTiddlers('[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]]');
  assert.equal(decks.length, 1, '牌组库只剩默认牌组（topic 不进牌组）');
  const root = renderWidget(wiki, queueOps, 'queue-ops');
  const text = collectText(root);
  assert.ok(text.includes('顺延7d'), '应有顺延按钮');
  assert.ok(text.includes('遗忘'), '应有遗忘按钮');
  assert.ok(text.includes('立即顺延'), '应有手动 auto-postpone 按钮');
});

test('stats-panel: 渲染负载/文档进度/漏斗', () => {
  const root = renderWidget(wiki, statsPanel, 'stats-panel');
  const text = collectText(root);
  assert.ok(text.includes('牌组负载'), '应有负载区');
  assert.ok(text.includes('书名甲'), '应含文档进度');
  assert.ok(text.includes('漏斗'), '应有漏斗');
  assert.ok(text.includes('保留率'), '应有保留率');
});

test('stats-panel: 支持连续型文档（PDF 等）页码进度展示', () => {
  wiki.addTiddler({
    title: 'Tidme/Docs/手册PDF',
    tags: ['tidme-doc'],
    'tidme.doc': 'docPdfManual',
    'tidme.format': 'pdf',
    'tidme.structure': 'continuous',
    'tidme.kind': 'topic',
    'tidme.pages-total': '80',
    state: '0',
    due: twDate(),
  });
  wiki.addTiddler({
    title: '$:/config/tidme/readpoint/docPdfManual',
    type: 'application/json',
    text: JSON.stringify({ t: 'Tidme/Docs/手册PDF', s: 'p20' }),
  });
  const root = renderWidget(wiki, statsPanel, 'stats-panel');
  const text = collectText(root);
  assert.ok(text.includes('手册PDF'), '文档表格应含连续型 PDF 文档');
  assert.ok(text.includes('p.20/80'), '应显示连续型文档的页码进度');
});

test('card-manager: 渲染视图过滤/树/批量工具条', () => {
  const root = renderWidget(wiki, cardManager, 'card-manager');
  const text = collectText(root);
  assert.ok(text.includes('全部'), '应有视图过滤');
  assert.ok(text.includes('顺延7d'), '应有批量操作');
  assert.ok(text.includes('顺延过载'), '应有顺延过载按钮');
  assert.ok(text.includes('优先↑') && text.includes('设高'), '批量优先级操作');
  assert.ok(text.includes('书名甲'), '应含文档');
  assert.ok(text.includes('小节乙'), '应含节');
});

test('card-manager: 批量选择交互与全选', () => {
  const root = renderWidget(wiki, cardManager, 'card-manager');
  const groupCbs = collectElementsByClass(root, 'tm-cm-group-cb');
  assert.ok(groupCbs.length > 0, '应渲染分组/全选复选框');

  const text = collectText(root);
  assert.ok(text.includes('已选'), '已选信息应在工具条展示');
});

test('card-manager: doneFields 置 tidme.done，restoreCard 可逆恢复（kind 决定归属）', () => {
  const done = cardManager.doneFields({ title: '节', 'tidme.kind': 'topic', state: '0' });
  assert.equal(done['tidme.done'], 'yes');
  assert.equal(done['tidme.kind'], 'topic', 'kind 保留');
  // 恢复（「回」按钮路径 = restoreCard 整体替换）：清除 done/ignored/suspended，kind 决定归属
  const resumed = sched.restoreCard({ ...done });
  assert.equal(resumed['tidme.done'], undefined, '恢复删除 tidme.done');
  assert.equal(resumed['tidme.kind'], 'topic', 'topic 保留（阅读流）');
  assert.ok(!sched.isCardOutOfQueue(resumed), '恢复后不在完成态');
});

test('card-manager: resumePatch 是合并式补丁（三键显式 undefined）', () => {
  // 批量恢复是合并式补丁：三键显式 undefined（TW addTiddler = 删除字段），
  // 回归防护——曾因返回"删除键后的完整字段集"导致 {...fields, ...patch} 合并下恢复静默失效
  const done = cardManager.doneFields({ title: '节', 'tidme.kind': 'topic', state: '0' });
  const resumePatch = cardManager.resumePatch();
  assert.equal(resumePatch['tidme.done'], undefined);
  assert.equal(resumePatch['tidme.ignored'], undefined);
  assert.equal(resumePatch['tidme.suspended'], undefined);
  assert.ok(!sched.isCardOutOfQueue({ ...done, ...resumePatch, 'tidme.kind': 'item' }), '合并写回后应脱离完成态');
  assert.ok(!sched.isCardOutOfQueue({ ...done, ...resumePatch, 'tidme.kind': 'item', 'tidme.suspended': 'yes' }), '合并可覆盖旧搁置值');
});

test('card-manager: 全部卡片可见（含已读卡与手动散卡）', () => {
  addLooseCard();
  // 已读一张节卡（模拟其他入口的 Done）
  const secTitle = wiki.filterTiddlers('[has[tidme.kind]tidme.kind[topic]tidme.subkind[section]]')[0];
  wiki.addTiddler({ ...wiki.getTiddler(secTitle).fields, 'tidme.done': 'yes' });

  const root = renderWidget(wiki, cardManager, 'card-manager'); // 默认按文档（全量）
  const text = collectText(root);
  assert.ok(text.includes('未分组'), '手动散卡归入未分组（按文档默认）');
  assert.ok(text.includes('手动散卡甲'), '手动散卡可见');
  assert.ok(text.includes('按文档') && text.includes('按牌组') && text.includes('列表'), '组织切换按钮存在');
  const secTail = String(wiki.getTiddler(secTitle).fields['tidme.breadcrumb'] || secTitle).split(' › ').pop();
  assert.ok(text.includes(secTail), '已读节卡仍在树中（按文档组织全量）');
});

test('card-manager: 按牌组组织含「未入组」兜底分支', () => {
  addLooseCard();
  const root = renderWidget(wiki, cardManager, 'card-manager', { attributes: { org: 'deck' } });
  const text = collectText(root);
  assert.ok(text.includes('未入组'), '未入组兜底分支存在');
  assert.ok(text.includes('手动散卡甲'), '散卡在未入组分支');
});

test('card-manager: 列表视图（Browser 式）平铺所有卡', () => {
  addLooseCard();
  const root = renderWidget(wiki, cardManager, 'card-manager', { attributes: { org: 'list' } });
  const text = collectText(root);
  assert.ok(text.includes('标题'), '排序表头-标题');
  assert.ok(text.includes('牌组'), '排序表头-牌组');
  assert.ok(text.includes('到期'), '排序表头-到期');
  assert.ok(text.includes('间隔'), '信息列表头-间隔（Element data）');
  assert.ok(text.includes('重复'), '信息列表头-重复');
  assert.ok(text.includes('难度'), '信息列表头-难度');
  assert.ok(text.includes('手动散卡甲'), '列表包含手动散卡');
  assert.ok(text.includes('书名甲'), '列表包含书内卡');
});

test('card-manager: 信息标签（Element data 显示层）', () => {
  const L = cardManager.labels;
  assert.equal(L.dueLabel({ state: '2', due: '20261231000000000' }), '2026-12-31');
  assert.equal(L.dueLabel({ state: '0' }), '—', '非到期态无日期');
  assert.ok(L.intervalLabel({ scheduled_days: '7' }) === '7天' || L.intervalLabel({ scheduled_days: '7' }) === '7d');
  assert.equal(L.intervalLabel({}), '—');
  assert.equal(L.repsLabel({ reps: '5' }), '5');
  assert.equal(L.lapsesLabel({ lapses: '2' }), '2');
  assert.equal(L.diffLabel({ difficulty: '0.45' }), '45%');
  assert.equal(L.dateLabel('20261231000000000'), '2026-12-31');
  assert.equal(L.dateLabel(undefined), '—');
});

test('deck-ui: 新建牌组折叠表单渲染（tm 风格）；默认牌组删除按钮禁用', () => {
  const root = renderWidget(wiki, deckUi, 'deck-create');
  const text = collectText(root);
  assert.ok(text.includes('新建牌组'), 'deck-create 有「＋ 新建牌组」入口');
  assert.ok(text.includes('成员来源'), '表单含成员来源选择');
  // deck-delete：默认牌组 → 禁用（不可删）
  const delRoot = renderWidget(wiki, deckUi, 'deck-delete', { attributes: { deck: '$:/Deck/default' } });
  const btns = collectButtons(delRoot);
  assert.ok(btns.length >= 1, 'deck-delete 渲染按钮');
  if (btns[0]) {
    assert.equal(btns[0].getAttribute('disabled'), 'true', '默认牌组删除按钮禁用');
  }
  // deck-delete：普通（不存在的）牌组也禁用
  const delMissing = renderWidget(wiki, deckUi, 'deck-delete', { attributes: { deck: '$:/Deck/不存在' } });
  assert.equal(collectButtons(delMissing)[0]?.getAttribute('disabled'), 'true', '不存在牌组删除禁用');
});

// ---------- 牌组视图语义（筛选视图而非容器：重叠可见、角色标注） ----------

test('deck: previewMembership —— 命中数与跨牌组重叠数（创建前预览）', () => {
  const deckMod = mod('core/deck.js');
  wiki.addTiddler({ title: '预览甲', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '0', due: '20261231000000000', text: 'x' });
  wiki.addTiddler({ title: '预览乙', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '0', due: '20261231000000000', text: 'x' });
  deckMod.createDeck(wiki, { name: '词书X', card: '[all[]match[预览甲]] [all[]match[预览乙]]' });
  const r = deckMod.previewMembership(wiki, '[all[]match[预览甲]] [all[]match[预览乙]]');
  assert.equal(r.hits, 2);
  assert.equal(r.overlap, 2, '两张都与既有牌组（default 兜底）重叠');
  deckMod.createDeck(wiki, { name: '词书Y', card: '[all[]match[预览甲]]' });
  const r2 = deckMod.previewMembership(wiki, '[all[]match[预览丙]]');
  assert.deepEqual([r2.hits, r2.overlap], [0, 0], '无命中即无重叠');
});

test('deck-ui: 新建牌组成员预览 —— 默认来源改为自定义过滤器，命中数创建前可见', () => {
  const root = renderWidget(wiki, deckUi, 'deck-create');
  const text = collectText(root);
  assert.ok(text.includes('自定义过滤器'), '默认来源 = 自定义过滤器（不再默认全库）');
  assert.ok(text.includes('通常无需另建'), '全库测试卡选项保留但标注与默认牌组相同');
  assert.ok(text.includes('命中'), '成员命中预览创建前可见');
});

test('today-deck-row: Default 牌组行带兜底视图徽章，用户牌组不带', () => {
  const deckMod = mod('core/deck.js');
  // 注意：{{模板}} 转插会把 currentTiddler 覆盖为模板自身——必须解析模板文本并以父变量传牌组
  const tplText = wiki.getTiddler('$:/plugins/keepone/tidme/review/ui/viewtemplate/today-deck-row').fields.text;
  const renderRow = (deckTitle) => {
    const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
    parent.setVariable('currentTiddler', deckTitle);
    const w = wiki.makeWidget(wiki.parseText('text/vnd.tiddlywiki', tplText, {}), { parentWidget: parent, document: fakeDocument });
    const root = fakeDocument.createElement('div');
    w.render(root);
    return collectText(root);
  };
  assert.ok(renderRow('$:/Deck/default').includes('全部'), 'Default 行带兜底视图徽章');
  const userDeck = deckMod.createDeck(wiki, { name: '行徽章书', card: '[all[]match[预览甲]]' });
  assert.ok(!renderRow(userDeck).includes('全部'), '用户牌组行不带兜底徽章');
});
