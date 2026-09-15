/*
bury-siblings.test.mjs — 兄弟卡同源分散/搁置（Bury Siblings）集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-bury-' });
let sched, grade, session, config, ns, schema;

test.before(() => {
  sched = mod('core/scheduler.js');
  grade = mod('core/grade.js');
  session = mod('core/session.js');
  config = mod('core/config.js');
  ns = mod('core/ns.js');
  schema = mod('core/schema.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: ['$:/Deck/', ns.DAILY_QUOTA_STATE_TITLE, ns.BURY_SIBLINGS_TITLE] });
  if (grade.clearUndoStack) grade.clearUndoStack();
});

function mkCard(title, parentTitle, fields = {}) {
  wiki.addTiddler({
    title,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    'tidme.parent': parentTitle,
    caption: `${title}？`,
    text: '答案',
    state: '0',
    due: '20260910000000000',
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    last_review: '20260910000000000',
    'tidme.priority': '50',
    ...fields,
  });
}

test('findSiblings: 准确定位同一父源的在队卡片', () => {
  mkCard('卡1', '笔记A');
  mkCard('卡2', '笔记A');
  mkCard('卡3', '笔记B'); // 不同笔记
  mkCard('卡4', '笔记A', { 'tidme.done': 'yes' }); // 已出队

  const s1 = sched.findSiblings(wiki, '卡1');
  assert.deepEqual([...s1], ['卡2'], '仅包含同源且在队的其它卡');
});

test('findSiblings: 会内学习步卡（state 1/3）永不搁置（Anki：不埋时间敏感的会内卡）', () => {
  mkCard('源卡', '笔记L');
  mkCard('学习步兄弟', '笔记L', { state: '1' });
  mkCard('重学兄弟', '笔记L', { state: 3 });
  mkCard('复习兄弟', '笔记L', { state: '2' });

  const s = sched.findSiblings(wiki, '源卡');
  assert.deepEqual([...s], ['复习兄弟'], '学习步/重学步兄弟不参与搁置');
});

test('findSiblings: 父卡 title 含过滤器元字符时不下手（宁可这一轮不分散，也不误埋）', () => {
  mkCard('卡X', '笔记[B');
  mkCard('卡Y', '笔记[B');
  mkCard('卡Z', '笔记B'); // 若把 `[` 删掉会误判成同源

  assert.deepEqual([...sched.findSiblings(wiki, '卡X')], [], '不安全父卡 → 空（不自写净化）');
});

test('gradeCard: 评分后自动搁置兄弟卡至次日，并在会话中剔除', () => {
  mkCard('同源卡1', '文章节1');
  mkCard('同源卡2', '文章节1');

  const now = new Date('2026-09-11T10:00:00Z');
  session.setSession(wiki, { list: ['同源卡1', '同源卡2'], mode: 'items-only' });
  session.enterCard(wiki, '同源卡1', now);

  // 初始：两张卡均为可调度
  assert.equal(sched.isDueNow(wiki.getTiddler('同源卡1').fields, now), true);
  assert.equal(sched.isDueNow(wiki.getTiddler('同源卡2').fields, now), true);

  // 对同源卡1进行评分
  const res = grade.gradeCard(wiki, {
    title: '同源卡1',
    rating: 'Good',
    now,
  });
  assert.equal(res.ok, true);

  // 1. 验证同源卡2被打上当日搁置标记
  const currentDay = schema.learningDayOf(now, 4);
  const card2After = wiki.getTiddler('同源卡2').fields;
  assert.equal(card2After[ns.BURIED_FIELD], currentDay);

  // 2. 验证同源卡2在今日判定为不可调度
  assert.equal(sched.isDueNow(card2After, now), false, '今日被搁置，不再到期');

  // 3. 验证同源卡2已从今日会话中移除（会话耗尽清场）
  const sAfter = session.getSession(wiki);
  assert.equal(sAfter, null, '兄弟卡被剔除出今日会话，会话空队列正常关闭');

  // 4. 验证跨天后自动解除搁置
  const tomorrow = new Date(now.getTime() + 24 * 3600000);
  assert.equal(sched.isDueNow(card2After, tomorrow), true, '次日换天后自动恢复可调度');
});

test('composeGlobalLearningQueue: 重建队列不会让当日搁置的兄弟卡复活（搁置必须全链路生效）', () => {
  const deckEngine = mod('core/deck-engine.js');
  const now = new Date();
  mkCard('搁置新卡', '源Q', { state: '0', due: twDate(new Date(now.getTime() - 1000)) });
  mkCard('正常新卡', '源R', { state: '0', due: twDate(new Date(now.getTime() - 1000)) });

  const ctx = sched.learningDayContext(wiki, now);
  wiki.addTiddler({ ...wiki.getTiddler('搁置新卡').fields, [ns.BURIED_FIELD]: ctx.learningDay });

  const noDay = deckEngine.composeGlobalLearningQueue((f) => [...wiki.filterTiddlers(f)]);
  assert.ok(noDay.includes('搁置新卡'), '未传学习日 = 不做搁置排除（保持既有调用方语义）');

  const withDay = deckEngine.composeGlobalLearningQueue((f) => [...wiki.filterTiddlers(f)], { learningDay: ctx.learningDay });
  assert.ok(!withDay.includes('搁置新卡'), '当日搁置卡被排除（同一天重建队列不复活）');
  assert.ok(withDay.includes('正常新卡'), '其它卡不受影响');
});

test('undoLastGrade: 撤销评分时同步恢复被搁置的兄弟卡', () => {
  mkCard('卡A', '源1');
  mkCard('卡B', '源1');

  const now = new Date('2026-09-11T10:00:00Z');
  session.setSession(wiki, { list: ['卡A', '卡B'], mode: 'items-only' });

  grade.gradeCard(wiki, { title: '卡A', rating: 'Good', now });
  assert.equal(Boolean(wiki.getTiddler('卡B').fields[ns.BURIED_FIELD]), true);

  // 撤销评分（now 注入：撤销的"同学习日"守卫按它判定）
  const undoRes = grade.undoLastGrade(wiki, now);
  assert.equal(undoRes.ok, true);

  // 验证卡B的搁置标记已解除
  assert.equal(wiki.getTiddler('卡B').fields[ns.BURIED_FIELD], undefined);
  // 验证会话恢复
  assert.deepEqual([...session.getSession(wiki).list], ['卡A', '卡B']);
});

/** 家族夹具：三挖内容 → 落库，返回 family 与三张兄弟卡（各用例按需取用，不共享落库状态） */
function makeClozeFamily() {
  const factory = mod('core/card-factory.js');
  const content = '测试<<C "文本" "c1" "">>太长了<<C "个挖" "c2" "">>空支持吗<<C "再来" "c3" "">>？';
  const family = factory.buildClozeFamily(wiki, { type: 'cloze', deck: '散卡', clozeContent: content });
  factory.commitClozeFamily(wiki, family);
  return { factory, family, cards: family.cards };
}

test('cloze 家族构建：多挖 → 笔记 + 每挖一张兄弟卡（笔记不可调度）', () => {
  const factory = mod('core/card-factory.js');
  const content = '测试<<C "文本" "c1" "">>太长了<<C "个挖" "c2" "">>空支持吗<<C "再来" "c3" "">>？';
  const family = factory.buildClozeFamily(wiki, { type: 'cloze', deck: '散卡', clozeContent: content });

  assert.ok(family.note, '多挖生成笔记 tiddler');
  assert.equal(family.cards.length, 3, '每挖一张卡');
  assert.equal(family.note['tidme.kind'], undefined, '笔记不是可调度卡');

  const committed = factory.commitClozeFamily(wiki, family);
  assert.equal(committed.length, 3, '三张兄弟卡落库');
  assert.ok(wiki.getTiddler(family.note.title), '笔记落库');

  // 兄弟卡 title 标注空号（caption 是渲染面，不携带识别噪音）
  const [c1, c2] = family.cards;
  assert.ok(c1.title.endsWith('(c1)') && c2.title.endsWith('(c2)'));
});

test('cloze 家族兄弟契约：tidme.parent 统一指向笔记，findSiblings 对称可见', () => {
  const { cards } = makeClozeFamily();
  const [c1, c2, c3] = cards;
  const s1 = [...sched.findSiblings(wiki, c1.title)];
  assert.equal(s1.length, 2, 'c1 的兄弟 = 另外两张');
  assert.ok(s1.includes(c2.title) && s1.includes(c3.title));
  assert.deepEqual([...sched.findSiblings(wiki, c2.title)].sort(), [c1.title, c3.title].sort(), '反向查找对称');
});

test('cloze 家族渲染面契约：caption = 每卡宏文本（本空保留、他空还原），text 留空', () => {
  // 挖空卡渲染面 = caption（buildCloze/buildStandaloneCard 同一契约）：宏必须放 caption
  // 才能在复习模板 wikify 生效；此前宏放 text、caption 放纯文本预览 → 复习时空白不遮挡
  const { cards } = makeClozeFamily();
  const f1 = wiki.getTiddler(cards[0].title).fields;
  assert.ok(String(f1.caption).includes('<<C "文本" "c1" "">>'), 'caption 保留本卡挖空宏（渲染面生效位）');
  assert.ok(String(f1.caption).includes('太长了个挖空支持吗'), '其余挖空还原为纯文本');
  assert.ok(!String(f1.caption).includes('<<C "个挖" "c2"'), '不保留他卡宏');
  assert.equal(f1.text, '', 'text 留空（渲染面在 caption，契约同 buildCloze）');
  const f2 = wiki.getTiddler(cards[1].title).fields;
  assert.ok(String(f2.caption).includes('<<C "个挖" "c2" "">>'), 'c2 卡保留自己的宏');
});

test('cloze 家族挂现有调度：评分一张 → 其余兄弟当日搁置（bury siblings 全链路）', () => {
  const { cards } = makeClozeFamily();
  const [c1, c2, c3] = cards;
  const now = new Date('2026-09-11T10:00:00Z');
  const res = grade.gradeCard(wiki, { title: c1.title, rating: 'Good', now });
  assert.equal(res.ok, true);
  const day = schema.learningDayOf(now, 4);
  assert.equal(wiki.getTiddler(c2.title).fields[ns.BURIED_FIELD], day, 'c2 当日搁置');
  assert.equal(wiki.getTiddler(c3.title).fields[ns.BURIED_FIELD], day, 'c3 当日搁置');
});

test('cloze 家族孤儿清扫：兄弟删净后笔记连带删除；仍有兄弟时不删', () => {
  const factory = mod('core/card-factory.js');
  const { cards, family } = makeClozeFamily();
  const noteTitle = family.note.title;

  // 删第一张：仍有兄弟，笔记保留
  wiki.deleteTiddler(cards[0].title);
  assert.equal(factory.sweepOrphanClozeNote(wiki, noteTitle), false, '仍有兄弟 → 不清扫');
  assert.ok(wiki.getTiddler(noteTitle), '笔记保留');

  // 删净：笔记连带删除
  wiki.deleteTiddler(cards[1].title);
  wiki.deleteTiddler(cards[2].title);
  assert.equal(factory.sweepOrphanClozeNote(wiki, noteTitle), true, '兄弟清零 → 清扫');
  assert.equal(wiki.getTiddler(noteTitle), undefined, '孤儿笔记已删除');

  // 非 cloze-note 的 parent 不下手
  mkCard('普通兄弟', '普通笔记');
  assert.equal(factory.sweepOrphanClozeNote(wiki, '普通笔记'), false, '无 cloze-note 标记 → 不删');
});

test('cloze 家族原子提交：任一兄弟卡字段非法 → 整体不落库（无残缺家族）', () => {
  const factory = mod('core/card-factory.js');
  const family = factory.buildClozeFamily(wiki, {
    type: 'cloze',
    deck: '散卡',
    clozeContent: '甲<<C "一" "c1" "">>乙<<C "二" "c2" "">>丙',
  });
  // 破坏第二张卡的必需字段（模拟契约违例）
  delete family.cards[1]['tidme.kind'];
  assert.throws(() => factory.commitClozeFamily(wiki, family), /kind/, '契约校验抛错');
  assert.equal(wiki.getTiddler(family.note.title), undefined, '笔记未落库（整体回滚语义）');
  assert.equal(wiki.getTiddler(family.cards[0].title), undefined, '第一张卡也未落库');
});

test('cloze 家族：单挖与旧单卡路径同形态（零迁移），nextClozeId 自动编号', () => {
  const factory = mod('core/card-factory.js');
  const single = factory.buildClozeFamily(wiki, { type: 'cloze', deck: '散卡', clozeContent: '只有<<C "一个" "c1" "">>空' });
  assert.equal(single.note, null, '单挖无笔记');
  assert.equal(single.cards.length, 1);
  assert.equal(single.cards[0]['tidme.parent'], undefined, '单挖不挂父（与旧 buildStandaloneCard 同形态）');
  assert.ok(!single.cards[0].title.includes('(c1)'), '单挖标题不带空号后缀');
  assert.ok(!String(single.cards[0].caption).includes('（c1）'), '单挖 caption 不带空号');

  assert.deepEqual([...factory.parseClozeIds('没有宏的文本')], [], '无宏 → 空');
  assert.deepEqual([...factory.parseClozeIds('<<C "a" "c2" "">>中<<C "b" "c2" "">>间')], ['c2'], '重复 id 去重');
  assert.equal(factory.nextClozeId('前<<C "a" "c1" "">>后<<C "b" "c3" "">>'), 'c4', '取最大编号 +1');
  assert.equal(factory.nextClozeId('没有任何挖空'), 'c1', '空正文从 c1 起');
});
