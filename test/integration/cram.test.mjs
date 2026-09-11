/*
cram.test.mjs — 自定义突击 Cram 模式集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-cram-' });
let sched, grade, session, ns;

test.before(() => {
  sched = mod('core/scheduler.js');
  grade = mod('core/grade.js');
  session = mod('core/session.js');
  ns = mod('core/ns.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: ['$:/Deck/', ns.DAILY_QUOTA_STATE_TITLE, ns.UNDO_STATE_TITLE] });
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
    due: '20261001000000000',
    reps: '5',
    lapses: '1',
    stability: '12.5',
    difficulty: '4.2',
    elapsed_days: '3',
    scheduled_days: '15',
    last_review: '20260901000000000',
    'tidme.priority': '50',
    ...fields,
  });
}

test('Cram 模式: 仅操练不改变 FSRS 调度状态，不写日志与配额', () => {
  mkCard('考前突击卡1');
  const initialFields = { ...wiki.getTiddler('考前突击卡1').fields };
  const now = new Date('2026-09-11T10:00:00Z');

  // 启动 Cram 会话
  session.startCramSession(wiki, ['考前突击卡1'], now);
  assert.equal(session.getSession(wiki)?.mode, 'cram');

  // 执行评分
  const res = grade.gradeCard(wiki, {
    title: '考前突击卡1',
    rating: 'Good',
    now,
  });
  assert.equal(res.ok, true);

  // 1. 验证卡片 FSRS 字段原封不动
  const cardAfter = wiki.getTiddler('考前突击卡1').fields;
  assert.equal(cardAfter.due, initialFields.due, 'due 不变');
  assert.equal(cardAfter.reps, initialFields.reps, 'reps 不变');
  assert.equal(cardAfter.stability, initialFields.stability, 'stability 不变');
  assert.equal(cardAfter.difficulty, initialFields.difficulty, 'difficulty 不变');
  assert.equal(cardAfter.last_review, initialFields.last_review, 'last_review 不变');

  // 2. 验证日志未被写入
  const logTitle = ns.deckLogTitle('$:/Deck/default');
  const logData = wiki.getTiddlerData(logTitle) || {};
  assert.equal(Object.keys(logData).length, 0, 'cram 评分不写复习日志');

  // 3. 验证不消耗每日配额
  const quota = sched.readDailyQuota(wiki, now);
  assert.equal(quota.reviewCount, 0);
  assert.equal(quota.newCount, 0);

  // 4. 会话正常推进并结束
  const sAfter = session.getSession(wiki);
  assert.equal(sAfter, null);
  assert.equal(res.finished, true);
});

test('Cram 模式: Again 会重新排入队尾重复练习', () => {
  mkCard('错题1');
  mkCard('错题2');
  const now = new Date('2026-09-11T10:00:00Z');

  session.startCramSession(wiki, ['错题1', '错题2'], now);

  // 错题1评 Again
  grade.gradeCard(wiki, { title: '错题1', rating: 'Again', now });

  const sAfterAgain = session.getSession(wiki);
  assert.deepEqual([...sAfterAgain.list], ['错题2', '错题1'], 'Again 挪到队尾继续练');
});
