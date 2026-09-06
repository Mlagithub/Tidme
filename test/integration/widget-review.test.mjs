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
