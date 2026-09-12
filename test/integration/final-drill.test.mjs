/*
final-drill.test.mjs — 日末集中操练队列（Final Drill）集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-drill-' });
let grade, session, ns, schema, drill;

test.before(() => {
  grade = mod('core/grade.js');
  session = mod('core/session.js');
  ns = mod('core/ns.js');
  schema = mod('core/schema.js');
  drill = mod('core/drill.js'); // 操练队列已独立成模块（队列读写与调度判定分离）
});

test.beforeEach(() => {
  reset({ alsoSystem: ['$:/Deck/', ns.FINAL_DRILL_STATE_TITLE] });
  if (grade.clearUndoStack) grade.clearUndoStack();
});

function mkCard(title, fields = {}) {
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
    ...fields,
  });
}

test('Final Drill: Again 评档记录入队，及格后出队', () => {
  mkCard('难记卡1');
  const now = new Date('2026-09-11T10:00:00Z');

  // 1. 评分 Again -> 记入操练队列
  grade.gradeCard(wiki, { title: '难记卡1', rating: 'Again', now });
  let drillQueue = drill.getFinalDrillQueue(wiki, now);
  assert.deepEqual([...drillQueue], ['难记卡1']);

  // 2. 后续评分 Good -> 从操练队列移除
  grade.gradeCard(wiki, { title: '难记卡1', rating: 'Good', now });
  drillQueue = drill.getFinalDrillQueue(wiki, now);
  assert.deepEqual([...drillQueue], [], '达标后移除');
});

test('Final Drill: startFinalDrill 启动操练会话', () => {
  mkCard('卡1');
  mkCard('卡2');
  const now = new Date('2026-09-11T10:00:00Z');

  drill.recordFinalDrill(wiki, '卡1', now);
  drill.recordFinalDrill(wiki, '卡2', now);

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
  drill.recordFinalDrill(wiki, '陈旧卡', oldTime);

  const now = new Date('2026-09-11T10:00:00Z');
  const queue = drill.getFinalDrillQueue(wiki, now);
  assert.deepEqual([...queue], [], '超期卡片自动被清理出队列');
});

test('Final Drill: 日末重练会话可推进（未到期卡不判 due，评到 ≥Good 才出队）', () => {
  const now = new Date('2026-09-11T10:00:00Z');
  // 次日才到期的卡：操练会话不判 due，必须仍能推进
  const tomorrow = twDate(new Date(now.getTime() + 24 * 3600000));
  mkCard('重练卡1', { due: tomorrow });
  mkCard('重练卡2', { due: tomorrow });
  drill.recordFinalDrill(wiki, '重练卡1', now);
  drill.recordFinalDrill(wiki, '重练卡2', now);

  session.startFinalDrill(wiki, now);

  const r1 = grade.gradeCard(wiki, { title: '重练卡1', rating: 'Good', now });
  assert.equal(r1.next, '重练卡2', '推进到队内下一张（不判 due）');
  assert.equal(r1.finished, false);
  assert.deepEqual([...drill.getFinalDrillQueue(wiki, now)], ['重练卡2'], '及格后离开操练队列');

  // 评 Again：留在操练队列并挪回队尾，会话继续（清账语义 = 练到 ≥Good）
  const r2 = grade.gradeCard(wiki, { title: '重练卡2', rating: 'Again', now });
  assert.equal(r2.next, '重练卡2', 'Again 挪回队尾继续练');
  assert.equal(r2.finished, false);
  assert.deepEqual([...drill.getFinalDrillQueue(wiki, now)], ['重练卡2'], 'Again 的卡留在操练队列待清账');

  const r3 = grade.gradeCard(wiki, { title: '重练卡2', rating: 'Good', now });
  assert.equal(r3.next, null);
  assert.equal(r3.finished, true, '练到 ≥Good 且队列清空才算完成');
  assert.deepEqual([...drill.getFinalDrillQueue(wiki, now)], [], '达标后离开操练队列');
});
