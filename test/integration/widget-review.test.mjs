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
  // 无 kind 手动散卡（模拟用户手动建卡，按 item 兜底）
  wiki.addTiddler({ title: '手动散卡甲', state: '0', due: '20261231000000000', reps: '0', lapses: '0', stability: '0', difficulty: '0' });
  const deck = wiki.getTiddler('$:/Deck/default');
  assert.ok(deck, '默认牌组存在');
  const queue = wiki.filterTiddlers(String(deck.fields.card));
  assert.ok(queue.includes(F.clozeTitle), '挖空卡（item）进复习流');
  assert.ok(!queue.includes(F.extractTitle), '摘录卡（topic）不进复习流');
  assert.ok(!queue.some((t) => wiki.getTiddler(t)?.fields?.['tidme.kind'] === 'topic'), '节卡（topic）不进复习流');
  assert.ok(queue.includes('手动散卡甲'), '无 kind 手动卡按 item 进复习流');
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
  assert.ok(!secNav.includes('has[tidme.doc]!tag[tidme-import-doc]'), '不再按 doc 判定（避免 item 卡混入）');
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

test('study 视图: 评分条/快捷键/卡片正面均对 topic 卡禁显（!tidme.kind[topic]）', () => {
  for (const t of ['study', 'shortcut', 'front']) {
    const text = wiki.getTiddler('$:/plugins/keepone/tidme/review/ui/ViewTemplate/' + t).fields.text;
    assert.ok(text.includes('!is[blank]!tidme.kind[topic]'), t + ' 模板必须排除 topic 卡（阅读卡不显示评分/复习界面）');
  }
});

test('study 视图: 评分条始终可见（不随 folded 隐藏）', () => {
  // 回归：startstudy/开始复习对 cloze/qa 卡设 folded=hide（非 unfold），
  // 若评分条被 text="hide" 的 reveal 包裹则评分条消失 → 复习无法评分。
  const study = wiki.getTiddler('$:/plugins/keepone/tidme/review/ui/ViewTemplate/study').fields.text;
  const barIdx = study.indexOf('tmc-study-bar');
  const repeatIdx = study.indexOf('fsrs4tw.repeat');
  assert.ok(barIdx !== -1 && repeatIdx > barIdx, '评分条在 sticky 条栏内');
  assert.ok(!study.includes('text="hide"'), '评分条不再被 hide reveal 包裹（folded=hide 时也可见）');
});

test('调度: 默认牌组 state_learn 使用正确的 UTC 日期格式（修复 <now> 损坏格式）', () => {
  const deck = wiki.getTiddler('$:/Deck/default');
  const stateLearn = String(deck.fields.state_learn);
  assert.ok(!stateLearn.includes('[UTC]YYYY0MMDD0hh0mm0ss0XXX'), '不得使用损坏格式（解析为未来日期 → 未来排期卡提前重放）');
  assert.ok(stateLearn.includes('compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>'), 'state_learn 使用 TW 核心 UTC 格式');
});

test('startstudy: 队列过滤器在按钮 transclude 上下文显式解析（$(deckTiddler)$）', () => {
  // 回归：2658977 曾把视图模板的队列过滤器从显式 {$(deckTiddler)$!!card} 改成隐式 {!!card}，
  // 导致「开始学习」按钮经 <$transclude> 渲染时 currentTiddler=按钮自身，{!!card} 取空 → 永远"无新卡"。
  // 1) 视图模板必须使用显式 $(deckTiddler)$ 引用（不依赖 currentTiddler）
  // （tr.tid 已随 $:/Decks 页退役——今天页的 today-deck-row 接替其行渲染职责）
  for (const t of ['deck', 'tiddler']) {
    const text = wiki.getTiddler(`$:/plugins/keepone/tidme/review/ui/ViewTemplate/${t}`).fields.text;
    assert.ok(text.includes('$(deckTiddler)$!!card'), `${t} 模板用显式 $(deckTiddler)$ 引用`);
    assert.ok(!text.includes('[subfilter{!!card}]'), `${t} 模板不得用隐式 {!!card}`);
  }
  // 2) 模拟 tr 行 let + 按钮上下文：filter_queue 应解析出在队卡（而非空）
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
  const sim = `<$let
    deckTiddler="$:/Deck/default"
    filter_learn=\`[subfilter{$(deckTiddler)$!!card}] -[subfilter{$(deckTiddler)$!!card_exclude}] +[subfilter{$(deckTiddler)$!!state_learn}] +[sort[due]]\`
    filter_due=\`[subfilter{$(deckTiddler)$!!card}] -[subfilter{$(deckTiddler)$!!card_exclude}] +[subfilter{$(deckTiddler)$!!state_due}] +[subfilter{$(deckTiddler)$!!order_due}]\`
    filter_new=\`[subfilter{$(deckTiddler)$!!card}] -[subfilter{$(deckTiddler)$!!card_exclude}] +[subfilter{$(deckTiddler)$!!state_new}] +[subfilter{$(deckTiddler)$!!order_new}]\`
    filter_unfold=\`[subfilter{$(deckTiddler)$!!card_unfold}]\`
    due-new=\`$(filter_learn)$ $(filter_due)$ $(filter_new)$\`
    new-due=\`$(filter_learn)$ $(filter_new)$ $(filter_due)$\`
    random=\`$(filter_learn)$ [subfilter<filter_random>]\`
    filter_queue=\`\${ [<deckTiddler>get[order]match[new-due]then<new-due>] [<deckTiddler>get[order]match[random]then<random>] ~[<due-new>] }\$\`
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

  // 无在队卡 → 恭喜分支（不导航、不写 study list）
  const empty = { filterTiddlers: () => [], getTiddler: () => null };
  const ev2 = [];
  wf.startGlobalLearning(empty, { dispatchEvent: (e) => ev2.push(e) });
  assert.ok(!ev2.some((e) => e.type === 'tm-navigate'), '空队列不导航');
  assert.ok(ev2.some((e) => e.type === 'tm-notify'), '空队列弹恭喜');
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
  wiki.addTiddler({ title: '$:/state/tidme-import/readpoint/global', text: F.extractTitle });
  const target2 = wf.globalReadingTarget(wiki);
  assert.equal(target2, F.extractTitle, '有续读点则跳续读点卡');
  // 全无 → 阅读列表页
  const emptyWiki = { filterTiddlers: () => [], getTiddler: () => null };
  assert.equal(wf.globalReadingTarget(emptyWiki), '$:/plugins/keepone/tidme/import/ui/reading-list', '全无跳阅读列表');
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
  wiki.addTiddler({ title: '$:/state/tidme-import/readpoint/global', text: '顺延S1' });
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
  wiki.addTiddler({ title: '$:/state/tidme-import/readpoint/global', text: '读完S1' });
  assert.equal(wf.globalReadingTarget(wiki), '他书待读卡', '本书读完 → 落入全局队列（不再跳回已读卡）');
});

test('workflow: 继续阅读目标 —— 无续读点时当前可读卡优先于高优先级未来排期卡', () => {
  const wf = mod('review/widgets/workflow.js');
  reset(); // 丢弃标准书夹具，隔离优先级对比
  wiki.deleteTiddler('$:/state/tidme-import/readpoint/global');
  wiki.addTiddler({ title: '高优未来', 'tidme.kind': 'topic', 'tidme.subkind': 'section', 'tidme.priority': '5', due: FUTURE(), state: '0' });
  wiki.addTiddler({ title: '低优可读', 'tidme.kind': 'topic', 'tidme.subkind': 'section', 'tidme.priority': '90', due: PAST(), state: '0' });
  assert.equal(wf.globalReadingTarget(wiki), '低优可读', '真实队列口径：当前可读（due≤now）优先，而非单纯 priority');
});

test('workflow: 继续阅读目标 —— 全部未来排期时回退排序第一张（允许显式打开）', () => {
  const wf = mod('review/widgets/workflow.js');
  reset();
  wiki.deleteTiddler('$:/state/tidme-import/readpoint/global');
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
  docOps.saveReadPoint(wiki, 'dtgt2', { t: '忽略S1', s: '' });
  assert.equal(docOps.docReadingTarget(wiki, 'dtgt2'), '可读S3', '被忽略的续读点出队，顺延到第一张在队卡');
  // 全部出队 → 空串（调用方回退文档页）
  docOps.saveReadPoint(wiki, 'dtgt2', { t: '可读S3', s: '' });
  const f = wiki.getTiddler('可读S3').fields;
  wiki.addTiddler({ ...f, title: '可读S3', 'tidme.done': 'yes' });
  assert.equal(docOps.docReadingTarget(wiki, 'dtgt2'), '');
});

test('doc-ops: 续读点写入携带 modified（最近阅读排序的时间源）', () => {
  const docOps = mod('core/doc-ops.js');
  docOps.saveReadPoint(wiki, 'dmod', { t: '某卡', s: '' });
  const m = wiki.getTiddler('$:/state/tidme-import/readpoint/dmod')?.fields?.modified;
  assert.ok(m && !Number.isNaN(new Date(m).getTime()), 'per-doc 续读点带 modified');
  docOps.saveGlobalReadPoint(wiki, '某卡');
  const g = wiki.getTiddler('$:/state/tidme-import/readpoint/global');
  assert.equal(g?.fields?.text, '某卡');
  assert.ok(g?.fields?.modified && !Number.isNaN(new Date(g.fields.modified).getTime()), '全局续读点带 modified');
});

test('today-recent: 最近阅读按最近打开排序，全局续读点所属书置顶（与主 CTA 同书）', () => {
  const docOps = mod('core/doc-ops.js');
  const todayMod = mod('review/widgets/today.js');
  reset(); // 丢弃标准书夹具，自建两本可控的书
  const mkBook = (docId, bookLabel, prefix) => {
    wiki.addTiddler({ title: `Tidme/Books/${bookLabel}`, tags: ['tidme-import-doc'], 'tidme.doc': docId });
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
  wiki.addTiddler({ title: '$:/state/tidme-import/readpoint/docA', type: 'application/json', text: JSON.stringify({ t: '甲节1' }), modified: new Date(Date.now() - 3600000) });
  wiki.addTiddler({ title: '$:/state/tidme-import/readpoint/global', text: '乙节1', modified: new Date() });
  // 主 CTA 与列表第一行同书：全局续读点在队 → 目标即乙节1（书乙）
  assert.equal(docOps.globalReadingTarget(wiki), '乙节1');
  const root = renderWidget(wiki, todayMod, 'tidme-today-recent');
  const text = collectText(root);
  assert.ok(text.indexOf('书乙') < text.indexOf('书甲'), '最近打开的书排在前（乙先于甲）');
});

test('today-recent: 项目书名渲染为超链接并支持点击导航到文档页且同步阅读点', () => {
  const todayMod = mod('review/widgets/today.js');
  reset();
  wiki.addTiddler({ title: 'Tidme/Books/测试书', tags: ['tidme-import-doc'], 'tidme.doc': 'docTest' });
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
    assert.equal(wiki.getTiddlerText('$:/state/tidme-pdf/page/docTest'), '5');
    assert.equal(navTarget, 'Tidme/Books/测试书');
  } finally {
    fakeDocument.createElement = origCreateElement;
  }
});

test('today-hero: 已复习卡片时专注时间保底不为 0 秒', () => {
  const todayMod = mod('review/widgets/today.js');
  const nsMod = mod('core/ns.js');
  reset();
  const logData = {};
  const todayK = nsMod.todayKey();
  for (let i = 0; i < 45; i++) {
    logData[`${todayK}00000${String(i).padStart(4, '0')}`] = { rating: 1 };
  }
  wiki.addTiddler({
    title: '$:/Deck/default/log',
    type: 'application/json',
    text: JSON.stringify(logData),
  });

  const { root } = renderWidgetBase(wiki, todayMod, 'tidme-today-hero');
  const text = collectText(root);
  assert.ok(text.includes('今日已复习 45 卡'), '正确统计今日复习卡数');
  assert.ok(!text.includes('专注 0 秒'), '已复习 45 卡时绝不显示专注 0 秒');
  assert.ok(text.includes('45 秒'), '获得 45 秒基础保底时长');
});
