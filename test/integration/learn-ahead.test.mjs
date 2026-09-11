/*
learn-ahead.test.mjs — 提前学习放行（Learn Ahead Limit）集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-learn-ahead-' });
let sched, session, config, ns;

test.before(() => {
  sched = mod('core/scheduler.js');
  session = mod('core/session.js');
  config = mod('core/config.js');
  ns = mod('core/ns.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: [ns.LEARN_AHEAD_TITLE] });
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
