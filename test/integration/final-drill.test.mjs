/*
final-drill.test.mjs — 日末集中操练队列（Final Drill）集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-drill-' });
let sched, grade, session, ns, schema;

test.before(() => {
  sched = mod('core/scheduler.js');
  grade = mod('core/grade.js');
  session = mod('core/session.js');
  ns = mod('core/ns.js');
  schema = mod('core/schema.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: ['$:/Deck/', ns.FINAL_DRILL_STATE_TITLE, ns.UNDO_STATE_TITLE] });
  if (grade.clearUndoStack) grade.clearUndoStack();
});

function mkCard(title) {
  wiki.addTiddler({
    title,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    caption: `${title}？`,
    text: '答案',
    state: '2',
    due: twDate(),
    reps: '1',
    lapses: '0',
    stability: '2',
    difficulty: '5',
    elapsed_days: '1',
    scheduled_days: '2',
    last_review: twDate(),
    'tidme.priority': '50',
  });
}

test('Final Drill: Again 评档记录入队，及格后出队', () => {
  mkCard('难记卡1');
  const now = new Date('2026-09-11T10:00:00Z');

  // 1. 评分 Again -> 记入操练队列
  grade.gradeCard(wiki, { title: '难记卡1', rating: 'Again', now });
  let drillQueue = sched.getFinalDrillQueue(wiki, now);
  assert.deepEqual([...drillQueue], ['难记卡1']);

  // 2. 后续评分 Good -> 从操练队列移除
  grade.gradeCard(wiki, { title: '难记卡1', rating: 'Good', now });
  drillQueue = sched.getFinalDrillQueue(wiki, now);
  assert.deepEqual([...drillQueue], [], '达标后移除');
});

test('Final Drill: startFinalDrill 启动操练会话', () => {
  mkCard('卡1');
  mkCard('卡2');
  const now = new Date('2026-09-11T10:00:00Z');

  sched.recordFinalDrill(wiki, '卡1', now);
  sched.recordFinalDrill(wiki, '卡2', now);

  const res = session.startFinalDrill(wiki, now);
  assert.ok(res);
  assert.equal(res.mode, 'final-drill');
  assert.deepEqual([...res.list], ['卡1', '卡2']);

  const current = session.getSession(wiki);
  assert.equal(current?.mode, 'final-drill');
});

test('Final Drill: 超过 3 天未操练自动清理过期', () => {
  mkCard('陈旧卡');
  const oldTime = new Date('2026-09-01T10:00:00Z'); // 10天前
  sched.recordFinalDrill(wiki, '陈旧卡', oldTime);

  const now = new Date('2026-09-11T10:00:00Z');
  const queue = sched.getFinalDrillQueue(wiki, now);
  assert.deepEqual([...queue], [], '超期卡片自动被清理出队列');
});
