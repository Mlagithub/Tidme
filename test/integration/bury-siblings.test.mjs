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
  reset({ alsoSystem: ['$:/Deck/', ns.DAILY_QUOTA_STATE_TITLE, ns.UNDO_STATE_TITLE, ns.BURY_SIBLINGS_TITLE] });
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

test('undoLastGrade: 撤销评分时同步恢复被搁置的兄弟卡', () => {
  mkCard('卡A', '源1');
  mkCard('卡B', '源1');

  const now = new Date('2026-09-11T10:00:00Z');
  session.setSession(wiki, { list: ['卡A', '卡B'], mode: 'items-only' });

  grade.gradeCard(wiki, { title: '卡A', rating: 'Good', now });
  assert.equal(Boolean(wiki.getTiddler('卡B').fields[ns.BURIED_FIELD]), true);

  // 撤销评分
  const undoRes = grade.undoLastGrade(wiki);
  assert.equal(undoRes.ok, true);

  // 验证卡B的搁置标记已解除
  assert.equal(wiki.getTiddler('卡B').fields[ns.BURIED_FIELD], undefined);
  // 验证会话恢复
  assert.deepEqual([...session.getSession(wiki).list], ['卡A', '卡B']);
});
