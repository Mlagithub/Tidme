/*
undo.test.mjs — 评分撤销（Undo）集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-undo-' });
let grade, session, sched, ns;

test.before(() => {
  grade = mod('core/grade.js');
  session = mod('core/session.js');
  sched = mod('core/scheduler.js');
  ns = mod('core/ns.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: ['$:/Deck/', ns.DAILY_QUOTA_STATE_TITLE] });
  if (grade.clearUndoStack) grade.clearUndoStack();
});

function mkCard(title, fields = {}) {
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
    'tidme.priority': '50',
    ...fields,
  });
}

test('undoLastGrade: 空栈调用返回 ok: false', () => {
  const res = grade.undoLastGrade(wiki);
  assert.equal(res.ok, false);
});

test('undoLastGrade: 评分后撤销，恢复字段、日志、会话和配额', () => {
  const cardTitle = '测试卡1';
  mkCard(cardTitle, { state: '0', 'tidme.priority': '50' });

  // 启动会话
  session.setSession(wiki, { list: [cardTitle], mode: 'items-only' });
  session.enterCard(wiki, cardTitle);

  const now = new Date('2026-09-11T10:00:00Z');
  // 初始配额
  const q0 = sched.readDailyQuota(wiki, now);
  assert.equal(q0.newCount, 0);

  // 执行评分 Good
  const gradeRes = grade.gradeCard(wiki, {
    title: cardTitle,
    rating: 'Good',
    now,
  });
  assert.equal(gradeRes.ok, true);

  // 评分后检查：状态变成 2 或 1，优先级改变，配额增加
  const cardAfter = wiki.getTiddler(cardTitle).fields;
  assert.notEqual(cardAfter.state, '0');
  assert.equal(cardAfter['annotate-colour'], 'green');
  const q1 = sched.readDailyQuota(wiki, now);
  assert.equal(q1.newCount, 1);

  // 检查日志已写
  const logTitle = ns.deckLogTitle('$:/Deck/default');
  const logData = wiki.getTiddlerData(logTitle);
  assert.ok(logData && Object.keys(logData).length > 0, '日志已写入');

  // 检查 undo 深度
  assert.equal(grade.getUndoStackDepth(), 1);

  // 执行撤销 Undo（now 可注入：撤销的"同学习日"守卫按它判定）
  const undoRes = grade.undoLastGrade(wiki, now);
  assert.equal(undoRes.ok, true);
  assert.equal(undoRes.title, cardTitle);

  // 1. 验证卡片字段恢复
  const cardRestored = wiki.getTiddler(cardTitle).fields;
  assert.equal(cardRestored.state, '0');
  assert.equal(cardRestored['tidme.priority'], '50');
  assert.equal(cardRestored['annotate-colour'], undefined);

  // 2. 验证日志条目被删除
  const logRestored = wiki.getTiddlerData(logTitle) || {};
  assert.equal(Object.keys(logRestored).length, 0, '日志条目已删除');

  // 3. 验证会话恢复且重新聚焦该卡
  const sRestored = session.getSession(wiki);
  assert.deepEqual([...sRestored.list], [cardTitle]);
  const anchor = session.readFocusAnchor(wiki);
  assert.equal(anchor?.card, cardTitle);

  // 4. 验证每日配额回滚
  const qRestored = sched.readDailyQuota(wiki, now);
  assert.equal(qRestored.newCount, 0);

  // 5. 验证 undo 深度清零
  assert.equal(grade.getUndoStackDepth(), 0);
});

test('undoLastGrade: 支持多级连续撤销', () => {
  mkCard('卡A');
  mkCard('卡B');
  session.setSession(wiki, { list: ['卡A', '卡B'], mode: 'items-only' });

  const t1 = new Date('2026-09-11T10:00:00Z');
  const t2 = new Date('2026-09-11T10:01:00Z');

  grade.gradeCard(wiki, { title: '卡A', rating: 'Good', now: t1 });
  grade.gradeCard(wiki, { title: '卡B', rating: 'Easy', now: t2 });

  assert.equal(grade.getUndoStackDepth(), 2);

  // 先撤销卡 B
  const undoB = grade.undoLastGrade(wiki, t2);
  assert.equal(undoB.ok, true);
  assert.equal(undoB.title, '卡B');
  assert.equal(grade.getUndoStackDepth(), 1);

  // 再撤销卡 A
  const undoA = grade.undoLastGrade(wiki, t1);
  assert.equal(undoA.ok, true);
  assert.equal(undoA.title, '卡A');
  assert.equal(grade.getUndoStackDepth(), 0);
});
