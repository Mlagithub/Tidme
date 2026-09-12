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
import { learningDayInstant, twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-wgt-mgr-' });
const parseMod = mod('import/parse.js');
const queueOps = mod('manager/widgets/queue-ops.js');
const statsPanel = mod('import/widgets/stats-panel.js');
const cardManager = mod('manager/widgets/card-manager.js');
const sched = mod('core/scheduler.js');
const deckUi = mod('manager/widgets/deck-ui.js');
const nsMod = mod('core/ns.js');

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

/** 手动制的散卡 = 标准 item 卡（制卡工厂产物形态：kind=item + FSRS 字段） */
function addLooseCard() {
  wiki.addTiddler({
    title: '手动散卡甲',
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    state: '0',
    due: '20261231000000000',
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
  });
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

test('queue-ops: 上次自动顺延记录被展示（写/读两侧闭环，不再是只写标记）', () => {
  const nsMod = mod('core/ns.js');
  reset();
  // 无记录 → 不渲染该行
  let root = renderWidget(wiki, queueOps, 'queue-ops');
  assert.ok(!collectText(root).includes('上次运行'), '无记录时不渲染');
  // 任务写入记录 → 展示时间与顺延张数
  wiki.addTiddler({
    title: nsMod.AUTOPOSTPONE_LAST_TITLE,
    text: JSON.stringify({ at: '2026-09-10T01:02:03.456Z', overdue: 9, postponed: 5, kept: 4 }),
  });
  root = renderWidget(wiki, queueOps, 'queue-ops');
  const text = collectText(root);
  assert.ok(text.includes('2026-09-10 01:02:03'), `展示上次运行时刻（实际：${text}）`);
  assert.ok(text.includes('5'), '展示顺延张数');
});

test('stats-panel: 渲染负载/文档进度/漏斗', () => {
  const root = renderWidget(wiki, statsPanel, 'stats-panel');
  const text = collectText(root);
  assert.ok(text.includes('牌组负载'), '应有负载区');
  assert.ok(text.includes('书名甲'), '应含文档进度');
  assert.ok(text.includes('漏斗'), '应有漏斗');
  assert.ok(text.includes('保留率'), '应有保留率');
});

test('stats-panel: 「今日复习」显示的是今日学习日计数，不是全部时间累计（标签与数字必须一致）', () => {
  const nsMod = mod('core/ns.js');
  const schedMod = mod('core/scheduler.js');
  const statsMod = mod('core/stats.js');
  reset();
  const ctx = schedMod.learningDayContext(wiki);
  // 今日学习日：2 条；上周：3 条（同一日志文件）
  const today = learningDayInstant(ctx.learningDay, ctx.rolloverHour);
  const old = new Date(today.getTime() - 7 * 86400000);
  wiki.addTiddler({
    title: nsMod.deckLogTitle('$:/Deck/default'),
    type: 'application/json',
    text: JSON.stringify({
      [twDate(today)]: { rating: 3, state: '2', elapsed_days: 30 },
      [twDate(new Date(today.getTime() + 60000))]: { rating: 1, state: '2', elapsed_days: 30 },
      [twDate(old)]: { rating: 1, state: '0' },
      [twDate(new Date(old.getTime() + 60000))]: { rating: 1, state: '0' },
      [twDate(new Date(old.getTime() + 120000))]: { rating: 1, state: '0' },
    }),
  });

  // 口径真源：今日 2 / 累计 5（其中 4 次 Again → 保留率 20%）
  assert.equal(statsMod.reviewCountToday(wiki), 2);
  assert.equal(statsMod.collectReviewLogs(wiki).length, 5, '日志行必须被收集到（曾因 JSON.parse(String(对象)) 静默全丢）');

  const text = collectText(renderWidget(wiki, statsPanel, 'stats-panel'));
  const m = text.match(/(\d+)今日复习/);
  assert.ok(m, `应渲染「今日复习」指标卡（实际：${text.slice(0, 200)}）`);
  assert.equal(m[1], '2', '今日复习 = 今日学习日计数（曾错用全部时间累计 5）');
  assert.ok(text.includes('累计 5'), `副标题应给出累计次数作上下文（实际：${text.slice(0, 240)}）`);
  assert.ok(text.includes('保留率 20%'), '保留率必须由真实日志算出（曾恒为 100%）');
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

test('card-manager: 工具条含 Unbury 与 Reset Leech（重置必须能真正回到队列）', () => {
  const nsMod = mod('core/ns.js');
  // 典型 leech 现场：默认 leech_action=exclude 已把它写出队，且当日被搁置
  const title = '手动散卡甲';
  addLooseCard();
  wiki.addTiddler({
    ...wiki.getTiddler(title).fields,
    lapses: '9',
    'tidme.leech': 'yes',
    'tidme.ignored': 'yes',
    [nsMod.BURIED_FIELD]: '20261231',
  });

  const root = renderWidget(wiki, cardManager, 'card-manager');
  const text = collectText(root);
  assert.ok(text.includes('取消搁置'), '应有 Unbury 入口');
  assert.ok(text.includes('重置难点'), '应有 Reset Leech 入口');

  // 重置补丁落到该卡后必须回队（这是"重置"的意义，也是曾经失效的地方）
  const patch = sched.resetLeechCard();
  const updated = { ...wiki.getTiddler(title).fields };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete updated[k];
    else updated[k] = v;
  }
  wiki.addTiddler(updated);
  assert.equal(sched.isInQueue(wiki.getTiddler(title).fields), true, '重置后回到队列');
});

test('card-manager: Leech 视图按牌组 leech_threshold 判定（不再写死默认 8）', () => {
  const card = '阈值卡';
  wiki.addTiddler({
    title: card,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    state: '0',
    due: '20261231000000000',
    reps: '0',
    lapses: '4',
    stability: '0',
    difficulty: '0',
  });
  // 把默认牌组的阈值改成 4：lapses=4 的卡应出现在 Leech 视图
  const deck = '$:/Deck/default';
  wiki.addTiddler({ ...wiki.getTiddler(deck).fields, leech_threshold: '4' });
  const root = renderWidget(wiki, cardManager, 'card-manager');
  const leechBtn = collectButtons(root).find((b) => collectText(b).startsWith('难点'));
  assert.ok(leechBtn, '应有难点视图按钮');
  assert.ok(collectText(leechBtn).includes('(1)'), `难点视图计数按牌组阈值（实际 ${collectText(leechBtn)}）`);
});

test('card-manager: 搜索语法（tag:/is:/lapses:/due:）驱动视图过滤', () => {
  const cx = mod('core/config.js');
  reset({ alsoSystem: [nsMod.SAVED_SEARCHES_TITLE] });
  const F2 = makeBookFixture(wiki, parseMod); // 夹具重建（上面的 reset 清掉了）
  void F2;
  wiki.addTiddler({
    title: '语法卡甲',
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    state: '2',
    due: twDate(new Date(Date.now() - 86400000)),
    lapses: '9',
    scheduled_days: '10',
    tags: ['语法'],
  });
  wiki.addTiddler({
    title: '语法卡乙',
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    state: '2',
    due: twDate(new Date(Date.now() + 30 * 86400000)),
    lapses: '1',
    scheduled_days: '30',
    tags: ['语法'],
  });
  void cx;

  // 直接在 core 层面断言查询语义在真实字段上生效（视图渲染只是消费它）
  const queryMod = mod('core/card-query.js');
  const m = (text, fields, title) => queryMod.matchCardQuery(fields, title, queryMod.parseCardQuery(text), { now: new Date() });
  assert.equal(m('tag:语法 is:due', wiki.getTiddler('语法卡甲').fields, '语法卡甲'), true);
  assert.equal(m('tag:语法 is:due', wiki.getTiddler('语法卡乙').fields, '语法卡乙'), false, '未到期');
  assert.equal(m('lapses:>=8', wiki.getTiddler('语法卡甲').fields, '语法卡甲'), true);
  assert.equal(m('lapses:>=8', wiki.getTiddler('语法卡乙').fields, '语法卡乙'), false);
});

test('card-manager: 保存的搜索（config 往返 + 同名覆盖 + 删除）', () => {
  const cx = mod('core/config.js');
  reset({ alsoSystem: [nsMod.SAVED_SEARCHES_TITLE] });
  assert.deepEqual([...cx.readSavedSearches(wiki)], []);
  cx.saveSearch(wiki, '难点', 'is:leech lapses:>=8');
  cx.saveSearch(wiki, '今日到期', 'is:due');
  assert.deepEqual([...cx.readSavedSearches(wiki)].map((s) => s.name), ['难点', '今日到期']);
  cx.saveSearch(wiki, '难点', 'is:leech'); // 同名覆盖
  const after = [...cx.readSavedSearches(wiki)];
  assert.equal(after.length, 2);
  assert.equal(after.find((s) => s.name === '难点').query, 'is:leech');
  cx.removeSavedSearch(wiki, '难点');
  assert.deepEqual([...cx.readSavedSearches(wiki)].map((s) => s.name), ['今日到期']);
  // 坏 JSON 宽容
  wiki.addTiddler({ title: nsMod.SAVED_SEARCHES_TITLE, type: 'application/json', text: '{oops' });
  assert.deepEqual([...cx.readSavedSearches(wiki)], []);
});

test('card-manager: 工具条含 设定到期/间隔/难度 与保存搜索入口', () => {
  const root = renderWidget(wiki, cardManager, 'card-manager');
  const text = collectText(root);
  assert.ok(text.includes('设定到期日'), '应有设定到期日');
  assert.ok(text.includes('设定间隔'), '应有设定间隔');
  assert.ok(text.includes('设定难度'), '应有设定难度');
  assert.ok(text.includes('保存搜索'), '应有保存搜索');
  const searchInputs = collectElementsByClass(root, 'tm-cm-search').filter((e) => String(e.className).split(/\s+/).includes('tm-cm-search'));
  assert.ok(searchInputs.length >= 1, '应有搜索输入框');
  const lingoMod = mod('core/lingo.js');
  const ph = String(lingoMod.lingo(wiki, 'manager.search.placeholder', ''));
  assert.ok(ph.includes('tag:') && ph.includes('is:'), `搜索框提示应说明语法（实际：${ph}）`);
});

test('display: 难度按 1–10 量纲显示为百分比（曾把 5 显示成 500%）', () => {
  const display = mod('core/display.js');
  assert.equal(display.diffLabel({ difficulty: '5' }), '50%');
  assert.equal(display.diffLabel({ difficulty: '4.9993' }), '50%');
  assert.equal(display.diffLabel({ difficulty: '8.5' }), '85%');
  assert.equal(display.diffLabel({ difficulty: '0.8' }), '80%', '兼容 0–1 比例型历史数据');
  assert.equal(display.diffLabel({ difficulty: '0' }), '—');
  assert.equal(display.stabilityLabel({ stability: '15.47' }), '15.5d');
  assert.equal(display.stabilityLabel({}), '—');
});

test('card-manager: 列表视图表头与数据逐列对齐（曾表头 14 列 / 每行 10 格，整表错位）', () => {
  reset();
  wiki.addTiddler({
    title: '对齐卡',
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    'tidme.breadcrumb': '书甲/节乙/对齐卡',
    state: '2',
    due: twDate(new Date(Date.now() - 86400000)),
    scheduled_days: '13',
    stability: '15.47',
    reps: '7',
    lapses: '3',
    difficulty: '5',
    'tidme.priority': '20',
  });
  // 切到列表组织方式（Browser 式表格）
  const root = renderWidget(wiki, cardManager, 'card-manager');
  const orgBtn = collectButtons(root).find((b) => collectText(b) === '列表');
  orgBtn.dispatchEvent({ type: 'click' });

  const tables = [];
  const walk = (node) => {
    if (!node) return;
    if (node.tagName === 'TABLE') tables.push(node);
    for (const c of node.childNodes || []) walk(c);
  };
  walk(root);
  assert.equal(tables.length, 1, '列表视图应只有一张表');
  const table = tables[0];
  const ths = [];
  const trs = [];
  for (const child of table.childNodes || []) {
    if (child.tagName === 'THEAD') for (const tr of child.childNodes || []) for (const th of tr.childNodes || []) ths.push(th);
    if (child.tagName === 'TBODY') for (const tr of child.childNodes || []) trs.push(tr);
  }
  assert.ok(ths.length > 0 && trs.length > 0, '应有表头与数据行');
  assert.equal(ths.length, 14, `列表表头列数固定为 14（实际 ${ths.length}）`);
  for (const tr of trs) {
    const tds = (tr.childNodes || []).filter((n) => n.tagName === 'TD');
    assert.equal(tds.length, ths.length, `每行单元格数必须等于表头列数（表头 ${ths.length} / 本行 ${tds.length}）`);
  }

  // 逐列取值：找到「稳定度」「遗忘次数」「到期」三列的下标，用同一行验证值落在正确的列
  const headerText = ths.map((th) => collectText(th));
  const idx = (label) => headerText.findIndex((t) => t.includes(label));
  const row = trs[trs.length - 1]; // 末行 = 夹具里最后一张卡（对齐卡）
  const tds = (row.childNodes || []).filter((n) => n.tagName === 'TD');
  assert.ok(idx('稳定度') >= 0 && idx('遗忘次数') >= 0 && idx('到期') >= 0, `表头应含稳定度/遗忘次数/到期（实际 ${headerText.join('|')}）`);
  const cellText = (label) => collectText(tds[idx(label)]);
  assert.equal(cellText('到期').length > 0, true, '到期列有值');
  assert.ok(/d$/.test(cellText('稳定度')) || cellText('稳定度') === '—', `稳定度列应是天数（实际 ${cellText('稳定度')}）`);
  assert.equal(cellText('遗忘次数'), '3', `遗忘次数列应显示 lapses（实际 ${cellText('遗忘次数')}）`);
  assert.equal(cellText('重复'), '7', `重复列应显示 reps（实际 ${cellText('重复')}）`);
  assert.equal(cellText('难度'), '50%', `难度列按 1–10 量纲显示百分比（实际 ${cellText('难度')}）`);
  assert.equal(cellText('间隔'), '13d', `间隔列显示 scheduled_days（实际 ${cellText('间隔')}）`);
});

test('card-manager: doneFields/resumePatch 都是补丁，合并写库可逆恢复', () => {
  const fields = { title: '节', 'tidme.kind': 'topic', state: '0' };
  const done = cardManager.doneFields();
  assert.equal(done['tidme.done'], 'yes');
  assert.ok(!('title' in done), '只返回补丁');
  // 恢复（「回」按钮路径）：core/resumePatch 同源，三键显式 undefined 经合并清除标记
  const resumed = { ...fields, ...done, ...cardManager.resumePatch() };
  assert.equal(resumed['tidme.done'], undefined, '恢复删除 tidme.done');
  assert.equal(resumed['tidme.kind'], 'topic', 'topic 保留（阅读流）');
  assert.ok(!sched.isCardOutOfQueue(resumed), '恢复后不在完成态');
});

test('card-manager: resumePatch 与 core/scheduler.restoreCard 同源（不再各写一份）', () => {
  const patch = cardManager.resumePatch();
  assert.deepEqual({ ...patch }, { ...sched.restoreCard() }, '三键补丁与 core 完全一致');
  const done = cardManager.doneFields();
  assert.ok(!sched.isCardOutOfQueue({ 'tidme.kind': 'item', ...done, ...patch }), '合并写回后应脱离完成态');
  assert.ok(!sched.isCardOutOfQueue({ ...done, ...patch, 'tidme.kind': 'item', 'tidme.suspended': 'yes' }), '合并可覆盖旧搁置值');
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
  // 表单走设置页同款 tm-setting 行结构（展开态占满整行的类挂在外层 wrap 上）
  assert.ok(collectElementsByClass(root, 'tm-setting-card').length === 1, '表单容器 = tm-setting-card');
  assert.ok(collectElementsByClass(root, 'tm-setting-row').length >= 4, '字段行复用 tm-setting-row');
  assert.ok(collectElementsByClass(root, 'tm-decks-create-actions').length === 1, '动作行独立成行（无内联样式）');
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

test('today-deck-row: 行内「选项」按钮 —— 用户牌组有、默认牌组无（其参数入口在设置页）', () => {
  const deckMod = mod('core/deck.js');
  // {{模板}} 转插会把 currentTiddler 覆盖为模板自身——解析模板文本并以父变量传牌组（同上方徽章用例）
  const tplText = wiki.getTiddler('$:/plugins/keepone/tidme/review/ui/viewtemplate/today-deck-row').fields.text;
  const rowButtons = (deckTitle) => {
    const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
    parent.setVariable('currentTiddler', deckTitle);
    const w = wiki.makeWidget(wiki.parseText('text/vnd.tiddlywiki', tplText, {}), { parentWidget: parent, document: fakeDocument });
    const root = fakeDocument.createElement('div');
    w.render(root);
    return collectButtons(root);
  };

  const userDeck = deckMod.createDeck(wiki, { name: '行内选项牌组', card: '[all[]match[预览乙]]' });
  const userBtns = rowButtons(userDeck);
  assert.ok(userBtns.length >= 1, '用户牌组行渲染出行内按钮');
  // 选项按钮由 options 动作 tiddler 经 ViewTemplate/button 渲染，tooltip 即其 description 文案
  assert.ok(
    userBtns.some((b) => String(b.getAttribute('title') || '').includes('选项')),
    `行内按钮应带「选项」提示（实际 title：${userBtns.map((b) => b.getAttribute('title')).join(' / ')}）`,
  );
  assert.equal(rowButtons('$:/Deck/default').length, 0, '默认牌组行无任何按钮（options 的 condition 显式排除 default）');
});

test('card-manager: 搜索输入只重建卡片区 —— 输入框 DOM 身份稳定（每键丢光标的回归）', () => {
  // 两张可区分的散卡：搜「散卡乙」时甲被过滤、清空后两张都在
  const addCard = (title) =>
    wiki.addTiddler({
      title,
      'tidme.kind': 'item',
      'tidme.subkind': 'qa',
      state: '0',
      due: '20261231000000000',
      reps: '0',
      lapses: '0',
      stability: '0',
      difficulty: '0',
    });
  addCard('手动散卡甲');
  addCard('手动散卡乙');
  const root = renderWidget(wiki, cardManager, 'card-manager');
  // 注意 collectElementsByClass 是子串匹配（tm-cm-search-row 也命中），必须按 tagName 取到 input 本体
  const findInput = () => collectElementsByClass(root, 'tm-cm-search').find((n) => n.tagName === 'INPUT');
  const input = findInput();
  assert.ok(input, '搜索框存在');
  // 模拟用户键入：写 value + 派发 input 事件（fake-dom 的监听器会真实执行）
  input.value = '散卡乙';
  input.dispatchEvent({ type: 'input' });
  assert.equal(findInput(), input, '输入后搜索框必须是同一 DOM 节点（整组件重建 = 光标丢失）');
  const text = collectText(root);
  assert.ok(text.includes('手动散卡乙'), '命中卡在列表中');
  assert.ok(!text.includes('手动散卡甲'), '不匹配的卡被过滤出列表');
  // ✕ 清空：列表恢复全量，输入框同步清空
  const clear = collectElementsByClass(root, 'tm-cm-clear').find((n) => n.tagName === 'BUTTON');
  assert.ok(clear, '清空按钮常驻存在');
  assert.equal(clear.style.display, '', '有输入时 ✕ 可见');
  clear.dispatchEvent({ type: 'click' });
  assert.equal(input.value, '', '清空后输入框同步为空');
  const restored = collectText(root);
  assert.ok(restored.includes('手动散卡甲') && restored.includes('手动散卡乙'), '清空后列表恢复全量');
  assert.equal(clear.style.display, 'none', '无输入时 ✕ 隐藏');
});

test('card-manager: 逾期视图与 is:due 搜索同口径（曾视图 9 条搜索 0 条）', () => {
  const schema = mod('core/schema.js');
  const today = schema.learningDayOf(new Date(), 4);
  const yesterday = schema.learningDayOf(new Date(Date.now() - 86400000), 4);
  const dueYesterday = twDate(new Date(Date.now() - 86400000));
  const add = (title, extra = {}) =>
    wiki.addTiddler({
      title,
      'tidme.kind': 'item',
      'tidme.subkind': 'qa',
      state: '2',
      due: dueYesterday,
      reps: '2',
      lapses: '0',
      stability: '5',
      difficulty: '6',
      ...extra,
    });
  add('逾期基准卡');
  add('逾期过期埋卡', { 'tidme.buried': yesterday }); // 埋卡次日失效 → 应照常算逾期
  add('逾期当日埋卡', { 'tidme.buried': today }); // 当日埋 = 今日不可见
  add('逾期已读卡', { 'tidme.done': 'yes' });

  // 1) 逾期视图：委托 is:due 单一实现
  const rootView = renderWidget(wiki, cardManager, 'card-manager', { attributes: { view: 'overdue' } });
  const viewText = collectText(rootView);
  assert.ok(viewText.includes('逾期基准卡'), '到期复习卡在逾期视图');
  assert.ok(viewText.includes('逾期过期埋卡'), '过期埋卡（已回队）必须在逾期视图——曾按「字段存在即埋着」永久排除');
  assert.ok(!viewText.includes('逾期当日埋卡'), '当日埋卡不可见');
  assert.ok(!viewText.includes('逾期已读卡'), '已读卡不算逾期');

  // 2) is:due 搜索与视图同口径
  const rootSearch = renderWidget(wiki, cardManager, 'card-manager');
  const input = collectElementsByClass(rootSearch, 'tm-cm-search').find((n) => n.tagName === 'INPUT');
  input.value = 'is:due';
  input.dispatchEvent({ type: 'input' });
  const searchText = collectText(rootSearch);
  assert.ok(searchText.includes('逾期基准卡') && searchText.includes('逾期过期埋卡'), 'is:due 命中视图内全部逾期卡');
  assert.ok(!searchText.includes('逾期当日埋卡') && !searchText.includes('逾期已读卡'), 'is:due 不含视图外的卡');
});
