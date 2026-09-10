/*
grade.test.mjs — 评分写路径 core/grade（唯一实现）

- gradeCard：FSRS 写回 / <deck>/log / 优先级动态 / 会话推进（Again 挪队尾）/
  专注时长（计时锚点消费）/ 折叠态清理（子集牌组不在评分时清理——见 session/deck 用例）
- 防盲评与跨端契约：repeat.tid 经 <$tidme-grade/> 走唯一写路径且折叠态禁用；
  startstudy.tid 写同一计时锚点标题（ns.CARD_OPEN_AT_TITLE）
- widget 测试：<$tidme-grade> invokeAction 连通性与参数读取
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDocument, fakeElement } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-grade-' });
let grade, session, stats, deckMod, ns;
test.before(() => {
  grade = mod('core/grade.js');
  session = mod('core/session.js');
  stats = mod('core/stats.js');
  deckMod = mod('core/deck.js');
  ns = mod('core/ns.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: ['$:/Deck/', stats.READTIME_TIDDLER, ns.CARD_OPEN_AT_TITLE] });
});

/** 合成一张新卡（kind=item + FSRS 字段 → 默认牌组新卡队列） */
function mkCard(title) {
  wiki.addTiddler({
    title,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    caption: `${title}？`,
    text: '答案',
    state: '0',
    due: twDate(),
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    last_review: twDate(),
  });
}

/** 建立全局学习会话 + 首卡折叠态/计时锚点（对齐 startGlobalLearning 的导航前置） */
function startSession(list) {
  session.setSession(wiki, { list, mode: 'items-only' });
  session.prepareCardFold(wiki, list[0]);
}

test('gradeCard Good：FSRS 写回 + 日志 + 优先级 +5 + 会话推进 + 锚点消费 + 专注时长', () => {
  mkCard('卡甲');
  mkCard('卡乙');
  startSession(['卡甲', '卡乙']);
  assert.ok(wiki.getTiddler(ns.CARD_OPEN_AT_TITLE), 'prepareCardFold 已写专注计时锚点');
  assert.equal(wiki.getTiddler('$:/state/folded/卡甲').fields.text, 'hide', '首卡默认折叠');

  const r = grade.gradeCard(wiki, { title: '卡甲', deckTitle: '$:/Deck/default', rating: 'Good' });
  assert.equal(r.ok, true);
  const f = wiki.getTiddler('卡甲').fields;
  assert.equal(String(f.state), '1', '新卡 Good 进入学习态（State=1）');
  assert.equal(Number(f.reps), 1, 'reps 复习计数增加');
  assert.ok(/^\d{17}$/.test(String(f.due)), 'due 为 17 位 TW UTC 串');
  assert.equal(String(f['tidme.priority']), '55', 'Good 默认 +5（50→55）');
  assert.equal(String(f['annotate-colour']), 'green', 'annotate-colour 写库契约保留');

  const log = wiki.getTiddlerData(ns.deckLogTitle('$:/Deck/default'));
  const keys = Object.keys(log);
  assert.equal(keys.length, 1, '日志单文件一条记录');
  assert.ok(/^\d{17}$/.test(keys[0]), '日志键 = 17 位复习时刻');
  assert.equal(JSON.parse(log[keys[0]]).rating, 3, 'review_log.rating = Good');

  assert.deepEqual([...session.getSession(wiki).list], ['卡乙'], '评分卡移出会话');
  assert.equal(r.finished, false);
  assert.equal(r.next, '卡乙');
  assert.ok(r.due && /^\d{17}$/.test(String(r.due)), '结果携带下次到期');

  assert.ok(!wiki.getTiddler(ns.CARD_OPEN_AT_TITLE), '计时锚点读取后删除');
  assert.ok(!wiki.getTiddler('$:/state/folded/卡甲'), '折叠态标记已清理');
  assert.ok(stats.getReadTimeStats(wiki).totalSeconds >= 1, '专注时长已记录（锚点差值 clamp 下限 1s）');
});

test('gradeCard Again：当前卡挪队尾重学，优先级不动', () => {
  mkCard('卡甲');
  mkCard('卡乙');
  startSession(['卡甲', '卡乙']);
  const r = grade.gradeCard(wiki, { title: '卡甲', deckTitle: '$:/Deck/default', rating: 'Again' });
  assert.deepEqual([...session.getSession(wiki).list], ['卡乙', '卡甲'], 'Again 挪到队尾');
  assert.equal(String(wiki.getTiddler('卡甲').fields['tidme.priority']), '50', 'Again 默认 0 增量');
  assert.equal(String(wiki.getTiddler('卡甲').fields['annotate-colour']), 'red');
  assert.equal(r.next, '卡乙', 'next = 原队头');
});

test('gradeCard：会话最后一张 → finished；缺锚点不记专注时长', () => {
  mkCard('卡甲');
  session.setSession(wiki, { list: ['卡甲'], mode: 'items-only' }); // 不经 prepareCardFold：无锚点
  const r = grade.gradeCard(wiki, { title: '卡甲', deckTitle: '$:/Deck/default', rating: 'Good' });
  assert.equal(r.finished, true);
  assert.equal(r.next, null);
  assert.equal(stats.getReadTimeStats(wiki).totalSeconds, 0, '无锚点不记时长');
});

test('gradeCard：高 lapses 卡照常写库（leech 阈值判定留在 wikitext 渲染期，core 不做）', () => {
  // state=2 到期卡，lapses 8 = default 阈值；Good 不产生 lapse → 预测 lapses 仍 8
  wiki.addTiddler({
    title: '蠕虫卡',
    'tidme.kind': 'item',
    caption: '蠕虫？',
    text: '答',
    state: '2',
    due: twDate(new Date(Date.now() - 86400000)),
    reps: '12',
    lapses: '8',
    stability: '1',
    difficulty: '8',
    elapsed_days: '1',
    scheduled_days: '1',
    last_review: twDate(new Date(Date.now() - 86400000)),
  });
  const r = grade.gradeCard(wiki, { title: '蠕虫卡', deckTitle: '$:/Deck/default', rating: 'Good' });
  assert.equal(r.ok, true);
  // leech 判定依赖 lapses，但 leech_action 是 wikitext 动作、必须在渲染期挂载，
  // 故 core 不再返回无人消费的 leech 标记（旧实现算了又丢，属重复阈值实现）
  assert.equal('leech' in r, false, 'core 不再返回 leech 标记');
  const f = wiki.getTiddler('蠕虫卡').fields;
  assert.equal(Number(f.reps), 13, 'reps 照常递增（与 lapses 无关）');
  assert.ok(/^\d{17}$/.test(String(f.due)), 'due 照常写入');
});

test('gradeCard：无关评分不删子集牌组（评分不是子集生命周期的合法事件）', () => {
  mkCard('卡甲');
  const deckTitle = deckMod.createDeck(wiki, { name: '本书', kind: 'subset', sourceDoc: 'doc-x', card: '[tidme.kind[item]]' });
  session.setSession(wiki, { list: ['卡甲'], mode: 'items-only' });
  const r = grade.gradeCard(wiki, { title: '卡甲', deckTitle: '$:/Deck/default', rating: 'Good' });
  assert.equal(r.ok, true);
  assert.ok(deckMod.getDeck(wiki, deckTitle), '无关评分不删子集牌组——「复习本书」作用域在评分后存活');
  // 焚烧点在使用流程边界：startstudy 空队 / stopstudy / endSession（见 session/deck 测试）
});

test('gradeCard：缺卡/未知评分安全返回 ok=false', () => {
  assert.equal(grade.gradeCard(wiki, { title: '不存在', rating: 'Good' }).ok, false);
  mkCard('卡甲');
  assert.equal(grade.gradeCard(wiki, { title: '卡甲', rating: 'Bogus' }).ok, false);
});

test('widgets/grade: <$tidme-grade> invokeAction 驱动 core/grade 写库与变量兜底', () => {
  mkCard('Widget卡1');
  mkCard('Widget卡2');
  startSession(['Widget卡1', 'Widget卡2']);

  const gradeWidgetMod = mod('review/widgets/grade.js');
  const GradeWidget = gradeWidgetMod['tidme-grade'];

  // 1. 显式属性传参
  const w1 = new GradeWidget({
    type: 'tidme-grade',
    attributes: {
      tiddler: { type: 'string', value: 'Widget卡1' },
      deck: { type: 'string', value: '$:/Deck/default' },
      rating: { type: 'string', value: 'Good' },
    },
  }, { wiki, document: fakeDocument });
  w1.render();
  const ok1 = w1.invokeAction();
  assert.equal(ok1, true, 'invokeAction 返回 true');
  assert.equal(String(wiki.getTiddler('Widget卡1').fields.state), '1', '评分已写回卡片');

  // 2. 变量兜底传参（studyTiddler / deckTiddler）
  const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
  parent.setVariable('studyTiddler', 'Widget卡2');
  parent.setVariable('deckTiddler', '$:/Deck/default');
  const w2 = new GradeWidget({
    type: 'tidme-grade',
    attributes: {
      rating: { type: 'string', value: 'Good' },
    },
  }, { wiki, parentWidget: parent, document: fakeDocument });
  w2.render();
  const ok2 = w2.invokeAction();
  assert.equal(ok2, true);
  assert.equal(String(wiki.getTiddler('Widget卡2').fields.state), '1');
});

test('防盲评守卫求值验证：折叠态禁用按钮且拦截快捷键', () => {
  mkCard('守卫卡');
  const repeatTiddler = wiki.getTiddler('$:/plugins/keepone/tidme/review/buttons/action/repeat');
  const disFilter = String(repeatTiddler.fields['condition-disabled']);

  // 1. 未折叠（无 state 或 show）→ disabled 过滤器输出空（激活）
  const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
  parent.setVariable('studyTiddler', '守卫卡');
  const w = wiki.makeWidget({ tree: [] }, { parentWidget: parent, document: fakeDocument });

  assert.deepEqual([...wiki.filterTiddlers(disFilter, w)], [], '无折叠标记时按钮不禁用');

  wiki.addTiddler({ title: '$:/state/folded/守卫卡', text: 'show' });
  assert.deepEqual([...wiki.filterTiddlers(disFilter, w)], [], '展开态（show）按钮不禁用');

  // 2. 折叠态（hide）→ disabled 过滤器命中 hide（置灰禁用）
  wiki.addTiddler({ title: '$:/state/folded/守卫卡', text: 'hide' });
  assert.deepEqual([...wiki.filterTiddlers(disFilter, w)], ['hide'], '折叠态（hide）按钮条件禁用');

  // 3. 快捷键守卫求值：折叠态下过滤为空（不触发评分动作）
  const shortcutFilter = '[<studyTiddler>addprefix[$:/state/folded/]get[text]!match[hide]]';
  assert.deepEqual([...wiki.filterTiddlers(shortcutFilter, w)], [], '折叠态拦截快捷键');

  wiki.addTiddler({ title: '$:/state/folded/守卫卡', text: 'show' });
  assert.deepEqual([...wiki.filterTiddlers(shortcutFilter, w)], ['show'], '展开态放行快捷键');
});

test('gradeCard next 口径：未来排期卡不作 next（与推进入口 isDueNow 统一）', () => {
  const schema = mod('core/schema.js');
  mkCard('当前卡');
  // 剩余两张：未来排期卡在前、可学卡在后
  wiki.addTiddler({
    title: '远期卡',
    'tidme.kind': 'item',
    caption: '远期？',
    text: '答',
    state: '2',
    due: schema.twDateString(new Date(Date.now() + 30 * 86400000)),
    reps: '5',
    lapses: '0',
    stability: '2',
    difficulty: '5',
    elapsed_days: '1',
    scheduled_days: '30',
    last_review: schema.twDateString(new Date()),
  });
  mkCard('可学卡');
  session.setSession(wiki, { list: ['当前卡', '远期卡', '可学卡'], mode: 'items-only' });
  const r = grade.gradeCard(wiki, { title: '当前卡', deckTitle: '$:/Deck/default', rating: 'Good' });
  assert.equal(r.next, '可学卡', 'next 跳过未来排期卡（list[0] 旧口径回归）');
  assert.equal(r.finished, false);
  assert.equal(r.ok, true);
});

test('跨端契约：repeat.tid 经 $tidme-grade 写库且折叠态禁用；startstudy 写同一计时锚点', () => {
  const repeat = wiki.getTiddlerText('$:/plugins/keepone/tidme/review/buttons/action/repeat');
  assert.match(repeat, /<\$tidme-grade\b/, '评分动作已收敛到 core/grade 入口 widget');
  assert.doesNotMatch(repeat, /action-setmultiplefields/, '旧内联写库编排已移除');
  assert.match(
    String(wiki.getTiddler('$:/plugins/keepone/tidme/review/buttons/action/repeat').fields['condition-disabled']),
    /match\[hide\]/,
    '折叠态禁用评分按钮（防盲评，字段经 button 模板生效）',
  );
  const startstudy = wiki.getTiddlerText('$:/plugins/keepone/tidme/review/buttons/action/startstudy');
  assert.ok(startstudy.includes(ns.CARD_OPEN_AT_TITLE), 'startstudy 写同一计时锚点标题');
  const shortcut = wiki.getTiddlerText('$:/plugins/keepone/tidme/review/ui/ViewTemplate/shortcut');
  assert.match(shortcut, /get\[text\]!match\[hide\]/, '键盘评分有折叠守卫（防盲评）');
});

test('推进决策统一：study-mode 与 pdf-reader 均经 session.advanceSession（不再取 list[0]）', () => {
  const studyMode = wiki.getTiddlerText('$:/plugins/keepone/tidme/review/widgets/study-mode.js');
  const pdfReader = wiki.getTiddlerText('$:/plugins/keepone/tidme/read/widgets/pdf-reader.js');
  assert.match(studyMode, /advanceSession\(/, '模式条推进走统一决策');
  assert.match(pdfReader, /advanceSession\(/, 'PDF 阅读器「完成并继续」走统一决策');
  assert.ok(!/list\[0\]/.test(studyMode), '模式条不再取 list[0]（会话快照提前重放回归）');
  assert.ok(!/list\[0\]/.test(pdfReader), 'PDF 阅读器不再取 list[0]');
});

/** 渲染 wikitext 动作并触发执行（同 study-flow.test.mjs 的 runActions 模式） */
function runActions(text, variables) {
  const parser = wiki.parseText('text/vnd.tiddlywiki', text, {});
  const widgetNode = wiki.makeWidget(parser, { variables, document: fakeDocument });
  widgetNode.render(fakeElement(), null);
  widgetNode.invokeActions();
}

test('startstudy 空队：子集牌组用完即焚（普通牌组不受影响）', () => {
  // 子集牌组（复习本书作用域）+ 普通牌组，二者均无在队卡
  const subsetTitle = deckMod.createDeck(wiki, { name: 'Tidme/Decks/书Y/复习本书', kind: 'subset', sourceDoc: 'doc-y', card: '[title[幽灵卡]]' });
  wiki.addTiddler({ title: '$:/Deck/普通', tags: ['$:/tags/TidmeDeck'], caption: '普通', card: '[tidme.kind[item]]' });
  wiki.addTiddler({ title: `${subsetTitle}/log`, type: 'application/json', text: '{}' });
  const startstudyText = wiki.getTiddlerText('$:/plugins/keepone/tidme/review/buttons/action/startstudy');
  for (const deck of [subsetTitle, '$:/Deck/普通']) {
    runActions(startstudyText, {
      deckTiddler: deck,
      currentTiddler: deck,
      filter_queue: '[tidme.kind[item]]',
      filter_unfold: '',
    });
  }
  assert.equal(deckMod.getDeck(wiki, subsetTitle), null, '空队庆祝时子集牌组已焚烧');
  assert.ok(!wiki.getTiddler(`${subsetTitle}/log`), '子集日志随牌组清除');
  assert.ok(deckMod.getDeck(wiki, '$:/Deck/普通'), '普通牌组不受影响');
});

test('stopstudy：子集牌组手动停止即焚（普通牌组仅清 study）', () => {
  const subsetTitle = deckMod.createDeck(wiki, { name: 'Tidme/Decks/书Z/复习本书', kind: 'subset', sourceDoc: 'doc-z', card: '[tidme.kind[item]]' });
  wiki.addTiddler({ title: '$:/Deck/普通', tags: ['$:/tags/TidmeDeck'], caption: '普通', card: '[tidme.kind[item]]' });
  wiki.addTiddler({ title: `${subsetTitle}/study`, list: ['某卡'] });
  wiki.addTiddler({ title: '$:/Deck/普通/study', list: ['某卡'] });
  const stopText = wiki.getTiddlerText('$:/plugins/keepone/tidme/review/buttons/action/stopstudy');
  for (const deck of [subsetTitle, '$:/Deck/普通']) {
    runActions(stopText, { deckTiddler: deck, currentTiddler: deck });
  }
  assert.equal(deckMod.getDeck(wiki, subsetTitle), null, '子集牌组随手动停止焚烧');
  assert.ok(deckMod.getDeck(wiki, '$:/Deck/普通'), '普通牌组定义保留');
  assert.ok(!wiki.getTiddler('$:/Deck/普通/study'), '普通牌组 study 列表已清');
});
