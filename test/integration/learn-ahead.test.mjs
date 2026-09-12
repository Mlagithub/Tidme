/*
learn-ahead.test.mjs — 提前学习放行（Learn Ahead Limit）集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-learn-ahead-' });
let sched, session, config, ns, grade;

test.before(() => {
  sched = mod('core/scheduler.js');
  session = mod('core/session.js');
  config = mod('core/config.js');
  ns = mod('core/ns.js');
  grade = mod('core/grade.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: [ns.LEARN_AHEAD_TITLE, ns.DAILY_QUOTA_STATE_TITLE, '$:/Deck/'] });
});

test('isDueNow: 提前学习放行窗口', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  // 卡片在 10 分钟后到期 (12:10)，状态为学习步 (state=1)
  const due10MinLater = new Date(now.getTime() + 10 * 60000);
  const cardFields10 = { state: '1', due: twDate(due10MinLater) };

  // 1. 无提前放行 (0 分钟)：尚未到期
  assert.equal(sched.isDueNow(cardFields10, now, 0), false);

  // 2. 提前 20 分钟放行：在窗口内，判定为可学
  assert.equal(sched.isDueNow(cardFields10, now, 20), true);

  // 卡片在 30 分钟后到期 (12:30)，状态为学习步 (state=1)
  const due30MinLater = new Date(now.getTime() + 30 * 60000);
  const cardFields30 = { state: '1', due: twDate(due30MinLater) };

  // 3. 提前 20 分钟放行：超出 20 分钟窗口，判定为不可学
  assert.equal(sched.isDueNow(cardFields30, now, 20), false);
});

test('isDueNow: 数字 state（fsrs 写回的真实形态）同样享受提前放行，复习卡不享受', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  const due = twDate(new Date(now.getTime() + 10 * 60000));

  // fsrs.repeat 的 JSON 里 state 是数字 → 卡字段存的就是数字
  assert.equal(sched.isDueNow({ state: 1, due }, now, 20), true, '数字 state=1 放行');
  assert.equal(sched.isDueNow({ state: 3, due }, now, 20), true, '数字 state=3 放行');
  assert.equal(sched.isDueNow({ state: 1, due }, now, 0), false, '窗口为 0 时不放行');
  assert.equal(sched.isDueNow({ state: 2, due }, now, 20), false, '复习卡（state=2）不放行');
});

test('stateOf: state 归一化唯一产地', () => {
  assert.equal(sched.stateOf({ state: 1 }), '1');
  assert.equal(sched.stateOf({ state: '3' }), '3');
  assert.equal(sched.stateOf({ state: ' 2 ' }), '2');
  assert.equal(sched.stateOf({}), '0');
  assert.equal(sched.stateOf({ state: 'garbage' }), '0');
  assert.equal(sched.stateOf(null), '0');
});

test('advanceSession: 评分 Again 写回的数字 state 学习卡在窗口内被放行（真实路径回归）', () => {
  const now = new Date();
  wiki.addTiddler({
    title: '真实学习卡',
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    state: '0',
    due: twDate(new Date(now.getTime() - 60000)),
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    'tidme.priority': '50',
  });

  // 走真实评分写路径：Again → state 由 fsrs 写回（数字），due 落在 1 分钟后
  assert.equal(grade.gradeCard(wiki, { title: '真实学习卡', rating: 'Again', now }).ok, true);
  assert.equal(typeof wiki.getTiddler('真实学习卡').fields.state, 'number', 'state 为数字（fsrs 形态）');

  session.setSession(wiki, { list: ['真实学习卡'], mode: 'items-only' });
  assert.equal(session.advanceSession(wiki, null), '真实学习卡', '默认 20 分钟窗口内应放行');
});

test('advanceSession: 配合 config.readLearnAheadMinutes 自动放行即将到期的卡', () => {
  const now = new Date();
  const due15MinLater = new Date(now.getTime() + 15 * 60000);

  wiki.addTiddler({
    title: '学习步卡A',
    'tidme.kind': 'item',
    state: '1',
    due: twDate(due15MinLater),
  });

  session.setSession(wiki, { list: ['学习步卡A'], mode: 'items-only' });

  // 默认配置（20 分钟窗口）：15 分钟后的卡被成功放行
  const nextDefault = session.advanceSession(wiki, null);
  assert.equal(nextDefault, '学习步卡A', '在 20 分钟默认提前学习窗口内，推进返回该卡');

  // 修改配置为 10 分钟窗口
  config.writeLearnAheadMinutes(wiki, 10);
  assert.equal(config.readLearnAheadMinutes(wiki), 10);

  const nextNarrow = session.advanceSession(wiki, null);
  assert.equal(nextNarrow, null, '超出 10 分钟提前窗口，不放行');
});
