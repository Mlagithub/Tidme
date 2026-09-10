/*
widget-review.test.mjs — 复习流视图契约（视图互斥 / study 视图模板 / startstudy / workflow）

核心不变量：topic（阅读材料）与 item（知识卡）双轨分流——阅读模式无评分条，复习帧不接管阅读卡。
每用例 reset + 重建标准书夹具（helpers/fixtures.makeBookFixture）。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectButtons, collectText, fakeDocument, renderWidget as renderWidgetBase } from '../helpers/fake-dom.mjs';
import { makeBookFixture } from '../helpers/fixtures.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { FUTURE, PAST, twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-wgt-rev-' });
const parseMod = mod('import/parse.js');
const nsMod = mod('core/ns.js');
const schemaMod = mod('core/schema.js');

/** 渲染并返回根节点（冒烟断言用） */
function renderWidget(wiki, mod_, name, opts = {}) {
  return renderWidgetBase(wiki, mod_, name, opts).root;
}

let F;
test.beforeEach(async () => {
  reset();
  F = await makeBookFixture(wiki, parseMod);
});

test('双轨分类: 默认牌组只装 item（含挖空，不含节卡/摘录）；topic 不进任何牌组', () => {
  // 手动制的散卡 = 标准 item 卡（制卡工厂产物形态）
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
  // 无 kind 的 tiddler 不是卡：即使带 FSRS 字段也不进任何队列（卡片一律带 kind）
  wiki.addTiddler({ title: '无kind散落', state: '0', due: '20261231000000000' });
  const deck = wiki.getTiddler('$:/Deck/default');
  assert.ok(deck, '默认牌组存在');
  const queue = wiki.filterTiddlers(String(deck.fields.card));
  assert.ok(queue.includes(F.clozeTitle), '挖空卡（item）进复习流');
  assert.ok(!queue.includes(F.extractTitle), '摘录卡（topic）不进复习流');
  assert.ok(!queue.some((t) => wiki.getTiddler(t)?.fields?.['tidme.kind'] === 'topic'), '节卡（topic）不进复习流');
  assert.ok(queue.includes('手动散卡甲'), '手动制的 item 卡进复习流');
  assert.ok(!queue.includes('无kind散落'), '无 kind 的 tiddler 不是卡，不入队');
  // topic（阅读材料）不进任何 TidmeDeck：不生成自动阅读牌组，也不出现在牌组库
  const autoDeck = wiki.getTiddler('$:/Deck/read/书名甲');
  assert.equal(autoDeck, undefined, '不生成自动阅读牌组（书只出现在阅读列表）');
  const decks = wiki.filterTiddlers('[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]]');
  assert.equal(decks.length, 1, '牌组库只剩默认牌组（item 复习流）');
  assert.equal(decks[0], '$:/Deck/default');
  // 补一张未读节卡：它只在阅读列表（kind[topic]），不进入任何牌组队列
  const docId = wiki.getTiddler(F.extractTitle).fields['tidme.doc'];
  const newSection = `${F.docTitle}/新节-${Date.now().toString(36)}`;
  wiki.addTiddler({ title: newSection, 'tidme.doc': docId, 'tidme.kind': 'topic', 'tidme.subkind': 'section', state: '0' });
  const deckIds = wiki.filterTiddlers('[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]]');
  const anyDeckMatches = deckIds.some((d) => wiki.filterTiddlers(String(wiki.getTiddler(d).fields.card)).includes(newSection));
  assert.equal(anyDeckMatches, false, '未读节卡不在任何牌组');
});

test('视图互斥: 阅读条栏只显示 topic，复习帧只接管 item', () => {
  // section-nav.tid（阅读条栏）只匹配 kind=topic
  const secNav = wiki.getTiddler('$:/plugins/keepone/tidme/import/ui/section-nav').fields.text;
  assert.ok(secNav.includes('tidme.kind[topic]'), '阅读条栏只显示 topic 卡');
  assert.ok(!secNav.includes('has[tidme.doc]!tag[tidme-doc]'), '不再按 doc 判定（避免 item 卡混入）');
  // card.tid（复习帧）排除 topic
  const cardFilter = wiki.getTiddler('$:/config/Tidme/StoryTiddlerTemplateFilters/card').fields.text;
  assert.ok(cardFilter.includes('!tidme.kind[topic]'), '复习帧不接管 topic 卡');
  // 视图互斥效果：topic 卡不在默认牌组复习帧、item 卡无阅读条栏
  const topic = wiki.filterTiddlers('[tidme.kind[topic]!has[tidme.done]]')[0];
  const item = wiki.filterTiddlers('[tidme.kind[item]]')[0];
  assert.ok(topic, '存在未读 topic 卡');
  assert.ok(item, '存在 item 卡');
});

test('视图互斥: 复习帧故事级联对 topic 卡落回默认帧（阅读模式无评分条）', () => {
  // 复刻 $:/core/ui/StoryTiddlerTemplate 的真实级联：topic 卡必须得到 $:/core/ui/ViewTemplate
  // （否则复习帧接管 → study.tid 评分条出现在阅读模式）
  const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
  const topic = wiki.filterTiddlers('[tidme.kind[topic]tidme.subkind[section]]')[0];
  assert.ok(topic, '存在节卡');
  parent.setVariable('currentTiddler', topic);
  const w = wiki.makeWidget({ tree: [] }, { parentWidget: parent, document: fakeDocument });
  const cascade = '[<currentTiddler>] :cascade[all[shadows+tiddlers]tag[$:/tags/StoryTiddlerTemplateFilter]!is[draft]get[text]] :and[has[title]else[$:/core/ui/ViewTemplate]]';
  const tpl = wiki.filterTiddlers(cascade, w);
  assert.ok(Array.isArray(tpl) && tpl.length > 0, '级联应有结果');
  assert.equal(tpl[0], '$:/core/ui/ViewTemplate', 'topic 卡故事级联 = 默认帧（复习帧不接管）');
});

test('视图互斥: 会话进行中 topic 卡也不得落入复习帧（修复 subfilter 绕过 kind 过滤）', () => {
  // 回归：startGlobalLearning 会把 topic 卡列入 $:/Deck/default/study（list 字段），
  // 旧 card.tid 的 subfilter 重新对 currentTiddler 求值绕过 !tidme.kind[topic] → 阅读卡显示评分条。
  const topic = wiki.filterTiddlers('[tidme.kind[topic]tidme.subkind[section]]')[0];
  assert.ok(topic, '存在节卡');
  // 模拟会话：topic 卡列入默认牌组 study 列表
  wiki.addTiddler({ title: '$:/Deck/default/study', list: [topic] });
  wiki.addTiddler({ title: '$:/state/tidme/learning-session', list: [topic], current_index: '0' });

  const cardFilter = wiki.getTiddler('$:/config/Tidme/StoryTiddlerTemplateFilters/card').fields.text;
  const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
  parent.setVariable('currentTiddler', topic);
  const w = wiki.makeWidget({ tree: [] }, { parentWidget: parent, document: fakeDocument });
  const res = wiki.filterTiddlers(cardFilter, w);
  assert.deepStrictEqual([...res], [], '会话中 topic 卡不得匹配复习帧（阅读模式无评分条）');

  // item 卡在会话中仍应落入复习帧
  const item = wiki.filterTiddlers('[tidme.kind[item]]')[0];
  assert.ok(item, '存在 item 卡');
  const p2 = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
  p2.setVariable('currentTiddler', item);
  const w2 = wiki.makeWidget({ tree: [] }, { parentWidget: p2, document: fakeDocument });
  const res2 = wiki.filterTiddlers(cardFilter, w2);
  assert.deepStrictEqual([...res2], ['$:/plugins/keepone/tidme/review/ui/ViewTemplate/tiddler'], 'item 卡仍走复习帧');
});

test('study 视图: topic 阅读卡不渲染评分界面，item 卡渲染（渲染断言，不看模板源码）', () => {
  const schemaMod = mod('core/schema.js');
  const mk = (title, kind) =>
    wiki.addTiddler({
      title,
      'tidme.kind': kind,
      'tidme.subkind': kind === 'item' ? 'qa' : 'section',
      caption: title,
      text: kind === 'item' ? '答' : '正文',
      ...schemaMod.initialFsrsFields(new Date()),
    });
  mk('评分子卡', 'item');
  mk('阅读节卡', 'topic');
  const filterQueue = '[subfilter{$:/Deck/default!!card}]';
  const renderStudy = (card) => {
    const sim =
      `<$let deckTiddler="$:/Deck/default" studyTiddler="${card}" filter_learn="${filterQueue}" filter_due="${filterQueue}" filter_new="${filterQueue}" filter_unfold="[]" filter_queue="${filterQueue}" currentTiddler="${card}"><$transclude tiddler="$:/plugins/keepone/tidme/review/ui/ViewTemplate/study"/></$let>`;
    wiki.addTiddler({ title: `SimStudy_${card}`, text: sim });
    return wiki.renderTiddler('text/html', `SimStudy_${card}`);
  };
  const itemOut = renderStudy('评分子卡');
  assert.ok(itemOut.includes('tmc-study-bar'), `item 卡渲染评分条（实际 ${itemOut.slice(0, 120)}）`);
  // 注：四档按钮本身由全局 `\widget $fsrs4tw.repeat` 提供，该宏在无 PageTemplate 的
  // renderTiddler 环境里不注册（"Undefined widget"），故这里只断言评分条的渲染门控——
  // 门控正是本用例的回归对象（topic 阅读卡不得出现复习界面）。
  const topicOut = renderStudy('阅读节卡');
  assert.ok(!topicOut.includes('tmc-study-bar'), 'topic 阅读卡不渲染评分条（阅读卡不显示复习界面）');
  assert.ok(!topicOut.includes('tmc-repeat-wrapper'), 'topic 阅读卡不渲染评分按钮容器');
});

test('study 视图: folded=hide 时评分条仍可见（regression：被 hide reveal 包裹则无法评分）', () => {
  const schemaMod = mod('core/schema.js');
  wiki.addTiddler({
    title: '折叠评分卡',
    'tidme.kind': 'item',
    'tidme.subkind': 'cloze',
    caption: '卡',
    text: '',
    ...schemaMod.initialFsrsFields(new Date()),
  });
  wiki.addTiddler({ title: '$:/state/folded/折叠评分卡', text: 'hide' }); // startstudy 设的折叠态
  const filterQueue = '[subfilter{$:/Deck/default!!card}]';
  const sim =
    `<$let deckTiddler="$:/Deck/default" studyTiddler="折叠评分卡" filter_learn="${filterQueue}" filter_due="${filterQueue}" filter_new="${filterQueue}" filter_unfold="[]" filter_queue="${filterQueue}" currentTiddler="折叠评分卡"><$transclude tiddler="$:/plugins/keepone/tidme/review/ui/ViewTemplate/study"/></$let>`;
  wiki.addTiddler({ title: 'SimStudyFolded', text: sim });
  const out = wiki.renderTiddler('text/html', 'SimStudyFolded');
  assert.ok(out.includes('tmc-study-bar'), `折叠态下评分条仍渲染（实际 ${out.slice(0, 120)}）`);
});

test('调度: 默认牌组 state_learn 使用正确的 UTC 日期格式（修复 <now> 损坏格式）', () => {
  const deck = wiki.getTiddler('$:/Deck/default');
  const stateLearn = String(deck.fields.state_learn);
  assert.ok(!stateLearn.includes('[UTC]YYYY0MMDD0hh0mm0ss0XXX'), '不得使用损坏格式（解析为未来日期 → 未来排期卡提前重放）');
  assert.ok(stateLearn.includes('compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>'), 'state_learn 使用 TW 核心 UTC 格式');
});

test('deckfilter: 队列过滤器组合只有一个真源（模板不再手抄组合，按钮上下文能解析出卡）', () => {
  // 回归：过滤器组合曾同时存在于两处 ViewTemplate 的 $let 与 core/deck-engine，
  // 谁改了另一侧就静默漂移（队列错一半看不出来）。现在模板只经 deckfilter 取字符串。
  for (const t of ['deck', 'tiddler']) {
    const text = wiki.getTiddler(`$:/plugins/keepone/tidme/review/ui/ViewTemplate/${t}`).fields.text;
    assert.ok(text.includes('deckfilter['), `${t} 模板经 deckfilter 取过滤器字符串`);
    // 队列分段字段（state_*/order_*）不得出现在模板里——那是组合逻辑，只能来自 deck-engine
    assert.ok(!/(state_learn|state_due|state_new|order_due|order_new|sortrandom)/.test(text), `${t} 模板不得手抄队列组合`);
    assert.ok(!text.includes('[subfilter{!!card}]'), `${t} 模板不得用隐式 {!!card}（transclude 上下文会取空）`);
  }
  wiki.addTiddler({
    title: '按钮队列测试卡',
    'tidme.kind': 'item',
    'tidme.subkind': 'cloze',
    caption: 'B',
    state: '0',
    due: '20261231000000000',
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    last_review: '20261231000000000',
  });
  const deckEngine = mod('core/deck-engine.js');
  // 1) 操作符输出 = composeDeckFilters 的输出（模板与 JS 同一真源的机器证明）
  const fromOp = wiki.filterTiddlers('[[$:/Deck/default]deckfilter[queue]]');
  assert.equal(fromOp.length, 1, 'deckfilter 产出单段过滤器字符串');
  assert.equal(fromOp[0], deckEngine.composeDeckFilters('$:/Deck/default', wiki.getTiddler('$:/Deck/default').fields).queue);
  // 2) 在真实渲染里按模板写法取用 → 能解析出在队卡（按钮 transclude 上下文同构）
  const sim = `<$let
    deckTiddler="$:/Deck/default"
    filter_queue=\`\${ [<deckTiddler>deckfilter[queue]] }\$\`
>
NEXT: {{{ [subfilter<filter_queue>first[]] }}}
</$let>`;
  wiki.addTiddler({ title: 'StartStudySim', text: sim });
  const out = wiki.renderTiddler('text/html', 'StartStudySim');
  assert.ok(out.includes('按钮队列测试卡'), 'nextTiddler 在按钮上下文能解析出在队卡');
});

test('workflow: 开始学习 startGlobalLearning 直达默认牌组第一张在队卡', () => {
  const wf = mod('review/widgets/workflow.js');
  const deckEngine = mod('core/deck-engine.js');
  // 用与 startGlobalLearning 相同的队列组合器计算期望的第一张卡
  const df = wiki.getTiddler('$:/Deck/default').fields;
  const expected = wiki.filterTiddlers(deckEngine.composeDeckFilters('$:/Deck/default', df).queue)[0];
  assert.ok(expected, '默认牌组应有在队卡');

  const events = [];
  const fakeWidget = { dispatchEvent: (e) => events.push(e) };
  wf.startGlobalLearning(wiki, fakeWidget);

  const studyList = wiki.getTiddler('$:/Deck/default/study');
  assert.ok(studyList, '学习会话 tiddler 已写入');
  assert.ok(String(studyList.fields.list || '').includes(expected), 'study list = 队列第一张卡');
  const nav = events.find((e) => e.type === 'tm-navigate');
  assert.ok(nav && nav.navigateTo === expected, '导航到队列第一张卡');
  const folded = wiki.getTiddler('$:/state/folded/' + expected);
  assert.ok(folded && ['show', 'hide'].includes(folded.fields.text), '折叠态已设置（show/hide）');

  // 无在队卡 → 恭喜分支（不导航、不写 study list）。用**真实** wiki 清空到空状态，
  // 不写退化桩——桩只对"仓库为空"这一种调用序列成立，掩盖真实过滤链的行为
  reset({ alsoSystem: ['$:/Deck/'] });
  const ev2 = [];
  wf.startGlobalLearning(wiki, { dispatchEvent: (e) => ev2.push(e) });
  assert.ok(!ev2.some((e) => e.type === 'tm-navigate'), '空队列不导航');
  assert.ok(ev2.some((e) => e.type === 'tm-notify'), '空队列弹恭喜');
  assert.equal(wiki.getTiddler('$:/Deck/default/study'), undefined, '空队列不写 study list');
});

test('workflow: $:/Decks 工作流中心（全局交错学习流 + 阅读目标）', () => {
  const wf = mod('review/widgets/workflow.js');
  // 渲染：主按钮
  const root = renderWidget(wiki, wf, 'tidme-workflow');
  const text = collectText(root);
  assert.ok(text.includes('开始学习'), '开始学习按钮');
  // 主色按钮 class 链 + SVG 图标（设计系统生效的 DOM 层验证）
  const btns = collectButtons(root);
  const learnBtn = btns.find((b) => collectText(b).includes('开始学习'));
  assert.ok(learnBtn, '找到开始学习按钮');
  assert.ok(String(learnBtn.className).includes('tm-btn--primary'), '开始学习是主色按钮（tm-btn--primary）');
  const iconSpan = learnBtn.childNodes.find((n) => String(n.className || '').includes('tm-icon'));
  assert.ok(iconSpan, '开始学习按钮含图标容器（.tm-icon；icons.iconButton 产物）');
  // 开始阅读目标：无全局续读点 → 第一待读节卡
  const target1 = wf.globalReadingTarget(wiki);
  assert.ok(target1 && wiki.getTiddler(target1), '开始阅读跳到一张存在节卡');
  // 有全局续读点 → 用它（用命名空间化的 extract 路径）
  wiki.addTiddler({ title: '$:/config/tidme/readpoint/global', text: F.extractTitle });
  const target2 = wf.globalReadingTarget(wiki);
  assert.equal(target2, F.extractTitle, '有续读点则跳续读点卡');
  // 全无 → 阅读列表页（真实空 wiki：清空后再问，断言的是真过滤链的兜底分支）
  reset({ alsoSystem: ['$:/Deck/', '$:/config/tidme/readpoint/'] });
  assert.equal(wf.globalReadingTarget(wiki), '$:/plugins/keepone/tidme/import/ui/reading-list', '全无跳阅读列表');
});

// ---------- 继续阅读目标（globalReadingTarget：续读点出队顺延 + 真实队列口径） ----------

test('workflow: 继续阅读目标 —— 续读点卡已读/忽略/搁置时按本书顺序顺延到下一张在队卡', () => {
  const wf = mod('review/widgets/workflow.js');
  const mk = (title, order, extra = {}) =>
    wiki.addTiddler({
      title,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': 'dseq',
      'tidme.order': order,
      'tidme.breadcrumb': `书 › ${title}`,
      state: '0',
      due: twDate(),
      text: 'x',
      ...extra,
    });
  mk('顺延S1', '000001', { 'tidme.done': 'yes' });
  mk('顺延S2', '000002', { 'tidme.ignored': 'yes' });
  mk('顺延S3', '000003', { 'tidme.suspended': 'yes' });
  mk('顺延S4', '000004');
  wiki.addTiddler({ title: '$:/config/tidme/readpoint/global', text: '顺延S1' });
  assert.equal(wf.globalReadingTarget(wiki), '顺延S4', '已读/忽略/搁置的续读点不回跳，按本书顺序顺延');
});

test('workflow: 继续阅读目标 —— 续读点所在文档读完时回退全局阅读队列', () => {
  const wf = mod('review/widgets/workflow.js');
  const mk = (title, order, extra = {}) =>
    wiki.addTiddler({
      title,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': 'dfin',
      'tidme.order': order,
      'tidme.breadcrumb': `书 › ${title}`,
      state: '2',
      due: twDate(),
      text: 'x',
      ...extra,
    });
  mk('读完S1', '000001', { 'tidme.done': 'yes' });
  mk('读完S2', '000002', { 'tidme.done': 'yes' });
  wiki.addTiddler({
    title: '他书待读卡',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'dother',
    'tidme.order': '000001',
    'tidme.priority': '5',
    state: '0',
    due: twDate(),
  });
  wiki.addTiddler({ title: '$:/config/tidme/readpoint/global', text: '读完S1' });
  assert.equal(wf.globalReadingTarget(wiki), '他书待读卡', '本书读完 → 落入全局队列（不再跳回已读卡）');
});

test('workflow: 继续阅读目标 —— 无续读点时当前可读卡优先于高优先级未来排期卡', () => {
  const wf = mod('review/widgets/workflow.js');
  reset(); // 丢弃标准书夹具，隔离优先级对比
  wiki.deleteTiddler('$:/config/tidme/readpoint/global');
  wiki.addTiddler({ title: '高优未来', 'tidme.kind': 'topic', 'tidme.subkind': 'section', 'tidme.priority': '5', due: FUTURE(), state: '0' });
  wiki.addTiddler({ title: '低优可读', 'tidme.kind': 'topic', 'tidme.subkind': 'section', 'tidme.priority': '90', due: PAST(), state: '0' });
  assert.equal(wf.globalReadingTarget(wiki), '低优可读', '真实队列口径：当前可读（due≤now）优先，而非单纯 priority');
});

test('workflow: 继续阅读目标 —— 全部未来排期时回退排序第一张（允许显式打开）', () => {
  const wf = mod('review/widgets/workflow.js');
  reset();
  wiki.deleteTiddler('$:/config/tidme/readpoint/global');
  wiki.addTiddler({ title: '未来卡乙', 'tidme.kind': 'topic', 'tidme.subkind': 'section', 'tidme.priority': '50', due: FUTURE(), state: '0' });
  wiki.addTiddler({ title: '未来卡甲', 'tidme.kind': 'topic', 'tidme.subkind': 'section', 'tidme.priority': '5', due: FUTURE(), state: '0' });
  assert.equal(wf.globalReadingTarget(wiki), '未来卡甲');
});

// ---------- 单本书阅读入口（docReadingTarget：最近阅读行内「继续」与全局入口同源） ----------

test('doc-ops: docReadingTarget —— 续读点在队返回续读点；出队/缺失时按本书顺序取第一张在队卡', () => {
  const docOps = mod('core/doc-ops.js');
  const mk = (title, order, extra = {}) =>
    wiki.addTiddler({
      title,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': 'dtgt',
      'tidme.order': order,
      'tidme.breadcrumb': `书 › ${title}`,
      state: '0',
      due: twDate(),
      text: 'x',
      ...extra,
    });
  mk('定位S1', '000001', { 'tidme.done': 'yes' });
  mk('定位S2', '000002');
  // 续读点指向已读卡 → 本书顺序第一张在队卡
  docOps.saveReadPoint(wiki, 'dtgt', { t: '定位S1', s: '' });
  assert.equal(docOps.docReadingTarget(wiki, 'dtgt'), '定位S2');
  // 续读点在队 → 返回续读点本身
  docOps.saveReadPoint(wiki, 'dtgt', { t: '定位S2', s: '' });
  assert.equal(docOps.docReadingTarget(wiki, 'dtgt'), '定位S2');
  // 无续读点 → 第一张在队卡
  docOps.clearReadPoint(wiki, 'dtgt');
  assert.equal(docOps.docReadingTarget(wiki, 'dtgt'), '定位S2');
});

test('doc-ops: docReadingTarget —— 续读点被忽略/搁置视为出队；全书读完返回空串', () => {
  const docOps = mod('core/doc-ops.js');
  const mk = (title, order, extra = {}) =>
    wiki.addTiddler({
      title,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': 'dtgt2',
      'tidme.order': order,
      'tidme.breadcrumb': `书 › ${title}`,
      state: '0',
      due: twDate(),
      text: 'x',
      ...extra,
    });
  mk('忽略S1', '000001', { 'tidme.ignored': 'yes' });
  mk('搁置S2', '000002', { 'tidme.suspended': 'yes' });
  mk('可读S3', '000003');
  // 文档页（宿主页）必须存在：否则「全书读完返回空串」的断言会被 docPageOfDoc 回退掩盖
  wiki.addTiddler({
    title: 'Tidme/Docs/定位书2',
    tags: ['tidme-doc'],
    'tidme.kind': 'topic',
    'tidme.doc': 'dtgt2',
    'tidme.structure': 'sectioned',
    caption: '定位书2',
    text: '',
  });
  docOps.saveReadPoint(wiki, 'dtgt2', { t: '忽略S1', s: '' });
  assert.equal(docOps.docReadingTarget(wiki, 'dtgt2'), '可读S3', '被忽略的续读点出队，顺延到第一张在队卡');
  // 全部出队 → 空串（即使存在文档页也不回退到宿主页；由调用方自行回退）
  docOps.saveReadPoint(wiki, 'dtgt2', { t: '可读S3', s: '' });
  const f = wiki.getTiddler('可读S3').fields;
  wiki.addTiddler({ ...f, title: '可读S3', 'tidme.done': 'yes' });
  assert.equal(docOps.docReadingTarget(wiki, 'dtgt2'), '', '全书读完返回空串（不回退文档页）');
});

test('doc-ops: 续读点写入携带 modified（最近阅读排序的时间源）', () => {
  const docOps = mod('core/doc-ops.js');
  docOps.saveReadPoint(wiki, 'dmod', { t: '某卡', s: '' });
  const m = wiki.getTiddler(docOps.READPOINT_PREFIX + 'dmod')?.fields?.modified;
  assert.ok(m && !Number.isNaN(new Date(m).getTime()), 'per-doc 续读点带 modified');
  docOps.saveGlobalReadPoint(wiki, '某卡');
  const g = wiki.getTiddler('$:/config/tidme/readpoint/global');
  assert.equal(g?.fields?.text, '某卡');
  assert.ok(g?.fields?.modified && !Number.isNaN(new Date(g.fields.modified).getTime()), '全局续读点带 modified');
});

test('today-recent: 最近阅读按最近打开排序，全局续读点所属书置顶（与主 CTA 同书）', () => {
  const docOps = mod('core/doc-ops.js');
  const todayMod = mod('review/widgets/today.js');
  reset(); // 丢弃标准书夹具，自建两本可控的书
  const mkBook = (docId, bookLabel, prefix) => {
    wiki.addTiddler({ title: `Tidme/Docs/${bookLabel}`, tags: ['tidme-doc'], 'tidme.doc': docId });
    wiki.addTiddler({
      title: `${prefix}1`,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': docId,
      'tidme.order': '000001',
      'tidme.breadcrumb': `${bookLabel} › 一`,
      state: '0',
      due: twDate(),
    });
    wiki.addTiddler({
      title: `${prefix}2`,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': docId,
      'tidme.order': '000002',
      'tidme.breadcrumb': `${bookLabel} › 二`,
      state: '0',
      due: twDate(),
    });
  };
  mkBook('docA', '书甲', '甲节');
  mkBook('docB', '书乙', '乙节');
  // 书甲：续读点写于一小时前；书乙：全局续读点（最近打开）
  wiki.addTiddler({ title: '$:/config/tidme/readpoint/docA', type: 'application/json', text: JSON.stringify({ t: '甲节1' }), modified: new Date(Date.now() - 3600000) });
  wiki.addTiddler({ title: '$:/config/tidme/readpoint/global', text: '乙节1', modified: new Date() });
  // 主 CTA 与列表第一行同书：全局续读点在队 → 目标即乙节1（书乙）
  assert.equal(docOps.globalReadingTarget(wiki), '乙节1');
  const root = renderWidget(wiki, todayMod, 'tidme-today-recent');
  const text = collectText(root);
  assert.ok(text.indexOf('书乙') < text.indexOf('书甲'), '最近打开的书排在前（乙先于甲）');
});

test('today-recent: 项目书名渲染为超链接并支持点击导航到文档页且同步阅读点', () => {
  const todayMod = mod('review/widgets/today.js');
  reset();
  wiki.addTiddler({ title: 'Tidme/Docs/测试书', tags: ['tidme-doc'], 'tidme.doc': 'docTest' });
  wiki.addTiddler({
    title: '测试节1',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'docTest',
    'tidme.order': '000001',
    'tidme.breadcrumb': '测试书 › 第一节',
    state: '0',
    due: twDate(),
  });
  wiki.addTiddler({
    title: '$:/config/tidme/readpoint/docTest',
    type: 'application/json',
    text: JSON.stringify({ t: '测试节1', s: 'p5' }),
  });

  let clickHandler = null;
  const origCreateElement = fakeDocument.createElement;
  fakeDocument.createElement = (t) => {
    const el = origCreateElement(t);
    el.addEventListener = (evt, fn) => {
      if (evt === 'click' && t === 'a') clickHandler = fn;
    };
    return el;
  };

  try {
    const { root, w } = renderWidgetBase(wiki, todayMod, 'tidme-today-recent');
    const findAnchor = (n) => {
      if (!n) return null;
      if (String(n.tagName) === 'A') return n;
      for (const c of n.childNodes || []) {
        const f = findAnchor(c);
        if (f) return f;
      }
      return null;
    };
    const link = findAnchor(root);
    assert.ok(link, '书名应渲染为 a 超链接');
    assert.equal(link.textContent, '测试书');
    assert.equal(link.getAttribute('title'), '打开文档：测试书');

    let navTarget = null;
    w.dispatchEvent = (event) => {
      if (event.type === 'tm-navigate') {
        navTarget = event.navigateTo;
      }
    };
    assert.ok(clickHandler, '应绑定点击事件');
    clickHandler({ preventDefault() {}, stopPropagation() {} });
    assert.equal(wiki.getTiddlerText(nsMod.pdfPageStateTitle('docTest')), '5');
    assert.equal(navTarget, 'Tidme/Docs/测试书');
  } finally {
    fakeDocument.createElement = origCreateElement;
  }
});

test('today-hero: 今日专注时长如实回显统计值（不再为 0 秒补假时间）', () => {
  const todayMod = mod('review/widgets/today.js');
  const statsMod = mod('core/stats.js');
  reset();
  const logData = {};
  const todayK = schemaMod.todayKey();
  for (let i = 0; i < 45; i++) {
    logData[`${todayK}00000${String(i).padStart(4, '0')}`] = { rating: 1 };
  }
  wiki.addTiddler({
    title: '$:/Deck/default/log',
    type: 'application/json',
    text: JSON.stringify(logData),
  });
  // 专注时长来自记录侧（core/session 的锚点结算：快刷保底 1 秒 / 超上限整段丢弃），
  // 展示侧只回显；45 卡但确实没有时长记录时显示 0（曾按卡数补假时间，掩盖了记录侧为 0 的根因）
  statsMod.recordReadTime(wiki, 'docY', 270);

  const { root } = renderWidgetBase(wiki, todayMod, 'tidme-today-hero');
  const text = collectText(root);
  assert.ok(text.includes('今日已复习 45 卡'), '正确统计今日复习卡数');
  assert.ok(text.includes('4 m 30 s'), `如实显示已记录的 270 秒（实际：${text}）`);
});

test('today-recent: 支持连续型文档（PDF 等）展示页码进度与跳转', () => {
  const todayMod = mod('review/widgets/today.js');
  reset();
  wiki.addTiddler({
    title: 'Tidme/Docs/测试PDF',
    tags: ['tidme-doc'],
    'tidme.doc': 'docPdf',
    'tidme.format': 'pdf',
    'tidme.structure': 'continuous',
    'tidme.kind': 'topic',
    'tidme.pages-total': '100',
    state: '0',
    due: twDate(),
  });
  wiki.addTiddler({
    title: '$:/config/tidme/readpoint/docPdf',
    type: 'application/json',
    text: JSON.stringify({ t: 'Tidme/Docs/测试PDF', s: 'p35' }),
  });

  const root = renderWidget(wiki, todayMod, 'tidme-today-recent');
  const text = collectText(root);
  assert.ok(text.includes('测试PDF'), '最近阅读应包含连续型 PDF 文档');
  assert.ok(text.includes('p.35/100'), '进度应显示页码进度 p.35/100');
});
