/*
quota.test.mjs — 每日上限配额体系（Daily Limits）集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-quota-' });
let sched, deckEngine, ns;

test.before(() => {
  sched = mod('core/scheduler.js');
  deckEngine = mod('core/deck-engine.js');
  ns = mod('core/ns.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: [ns.DAILY_QUOTA_STATE_TITLE] });
});

test('quota: 记账、读取与回滚', () => {
  const now = new Date();
  const q0 = sched.readDailyQuota(wiki, now);
  assert.equal(q0.newCount, 0);
  assert.equal(q0.reviewCount, 0);

  sched.recordDailyQuota(wiki, true, now);
  const q1 = sched.readDailyQuota(wiki, now);
  assert.equal(q1.newCount, 1);
  assert.equal(q1.reviewCount, 0);

  sched.recordDailyQuota(wiki, false, now);
  const q2 = sched.readDailyQuota(wiki, now);
  assert.equal(q2.newCount, 1);
  assert.equal(q2.reviewCount, 1);

  sched.rollbackDailyQuota(wiki, true, now);
  const q3 = sched.readDailyQuota(wiki, now);
  assert.equal(q3.newCount, 0);
  assert.equal(q3.reviewCount, 1);
});

test('quota: 跨学习日自动重置计数', () => {
  // 昨天时刻（24 小时前）
  const yesterday = new Date(Date.now() - 24 * 3600000);
  sched.recordDailyQuota(wiki, true, yesterday);
  assert.equal(sched.readDailyQuota(wiki, yesterday).newCount, 1);

  // 今天时刻
  const today = new Date();
  const qToday = sched.readDailyQuota(wiki, today);
  assert.equal(qToday.newCount, 0, '跨天后计数自动重置为 0');
});

test('composeGlobalLearningQueue: 每日上限截断与超额压制', () => {
  // 模拟求值函数：5 张复习卡、5 张新卡
  const mockEval = (filter) => {
    if (filter.includes('state_due')) return ['D1', 'D2', 'D3', 'D4', 'D5'];
    if (filter.includes('state_new')) return ['N1', 'N2', 'N3', 'N4', 'N5'];
    if (filter.includes('state_learn')) return ['L1'];
    return [];
  };

  // 1. 无限制：包含全部 learn + due + new
  const qAll = deckEngine.composeGlobalLearningQueue(mockEval);
  assert.deepEqual([...qAll], ['L1', 'D1', 'D2', 'D3', 'D4', 'D5', 'N1', 'N2', 'N3', 'N4', 'N5']);

  // 2. 限制 reviewLimit=3，newLimit=2
  const qLimited = deckEngine.composeGlobalLearningQueue(mockEval, {
    reviewLimit: 3,
    newLimit: 2,
  });
  assert.deepEqual([...qLimited], ['L1', 'D1', 'D2', 'D3', 'N1', 'N2'], '复习截断到 3，新卡截断到 2');

  // 3. 复习超额压制新卡（Anki 默认：当复习量 >= reviewLimit 时，新卡压制为 0）
  const qSuppressed = deckEngine.composeGlobalLearningQueue(mockEval, {
    reviewLimit: 3,
    newLimit: 5,
    suppressNewOnOverdue: true,
  });
  assert.deepEqual([...qSuppressed], ['L1', 'D1', 'D2', 'D3'], '复习卡达到上限，新卡完全被压制');
});
