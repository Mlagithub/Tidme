/*
quota.test.mjs — 每日上限配额体系（Daily Limits）集成测试

口径对标 Anki rslib/src/decks/limits.rs：剩余复习 = 上限 − 今日已复习；
开启压制时再扣今日已引入的新卡，新卡剩余 = min(新卡上限 − 已引入, 剩余复习)。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-quota-' });
let sched, deckEngine, ns;

test.before(() => {
  sched = mod('core/scheduler.js');
  deckEngine = mod('core/deck-engine.js');
  ns = mod('core/ns.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: [ns.DAILY_QUOTA_STATE_TITLE, ns.NEW_PER_DAY_TITLE, ns.REVIEWS_PER_DAY_TITLE, ns.LIMITS_SUPPRESS_NEW_TITLE] });
});

test('quota: 记账、读取与回滚（按类别）', () => {
  const now = new Date();
  const q0 = sched.readDailyQuota(wiki, now);
  assert.equal(q0.newCount, 0);
  assert.equal(q0.reviewCount, 0);

  sched.recordDailyQuota(wiki, 'new', now);
  const q1 = sched.readDailyQuota(wiki, now);
  assert.equal(q1.newCount, 1);
  assert.equal(q1.reviewCount, 0);

  sched.recordDailyQuota(wiki, 'review', now);
  const q2 = sched.readDailyQuota(wiki, now);
  assert.equal(q2.newCount, 1);
  assert.equal(q2.reviewCount, 1);

  sched.rollbackDailyQuota(wiki, 'new', now);
  const q3 = sched.readDailyQuota(wiki, now);
  assert.equal(q3.newCount, 0);
  assert.equal(q3.reviewCount, 1);
});

test('quota: 会内学习步（learn）不消耗任何每日额度', () => {
  const now = new Date();
  sched.recordDailyQuota(wiki, 'learn', now);
  sched.recordDailyQuota(wiki, 'learn', now);
  const q = sched.readDailyQuota(wiki, now);
  assert.equal(q.newCount, 0);
  assert.equal(q.reviewCount, 0, '学习步重复不计入复习额度（对标 Anki：会内学习不受上限约束）');
  // 不写状态 tiddler：账本保持"仅记上限消耗"
  assert.equal(wiki.getTiddlerText(ns.DAILY_QUOTA_STATE_TITLE, ''), '');
});

test('quota: 跨学习日自动重置计数', () => {
  // 昨天时刻（24 小时前）
  const yesterday = new Date(Date.now() - 24 * 3600000);
  sched.recordDailyQuota(wiki, 'new', yesterday);
  assert.equal(sched.readDailyQuota(wiki, yesterday).newCount, 1);

  // 今天时刻
  const today = new Date();
  const qToday = sched.readDailyQuota(wiki, today);
  assert.equal(qToday.newCount, 0, '跨天后计数自动重置为 0');
});

test('resolveDailyLimits: 剩余额度照 Anki 逐次扣减，新卡受剩余复习额度封顶', () => {
  const now = new Date();
  reset({ alsoSystem: [ns.DAILY_QUOTA_STATE_TITLE] });

  // 新的一天：复习 200 / 新卡 20
  let limits = sched.resolveDailyLimits(wiki, now);
  assert.equal(limits.reviewLimit, 200);
  assert.equal(limits.newLimit, 20);

  // 复习 190 张后（文档引用的 Anki 例子：只剩 10 张新卡额度，而不是 20）
  for (let i = 0; i < 190; i++) sched.recordDailyQuota(wiki, 'review', now);
  limits = sched.resolveDailyLimits(wiki, now);
  assert.equal(limits.reviewLimit, 10, '剩余复习 10');
  assert.equal(limits.newLimit, 10, '新卡被剩余复习额度封顶为 10（Anki limits.rs）');

  // 复习额度用尽：新卡一并归零（回归：曾因 `reviewLimit > 0` 反相判定反而放开）
  for (let i = 0; i < 10; i++) sched.recordDailyQuota(wiki, 'review', now);
  limits = sched.resolveDailyLimits(wiki, now);
  assert.equal(limits.reviewLimit, 0);
  assert.equal(limits.newLimit, 0, '复习额度用尽 → 新卡为 0');
});

test('resolveDailyLimits: 新卡引入同样消耗复习预算；上限 0 = 不限（null）', () => {
  const now = new Date();
  reset({ alsoSystem: [ns.DAILY_QUOTA_STATE_TITLE, ns.NEW_PER_DAY_TITLE, ns.REVIEWS_PER_DAY_TITLE] });

  for (let i = 0; i < 5; i++) sched.recordDailyQuota(wiki, 'new', now);
  let limits = sched.resolveDailyLimits(wiki, now);
  assert.equal(limits.newLimit, 15, '新卡上限 20 − 已引入 5');
  assert.equal(limits.reviewLimit, 195, '复习预算已被 5 张新卡占用（200 − 0 − 5）');

  // 上限配 0 = 不限 → 翻译为 null（deck-engine 的 number 语义仍是"还能放几张"）
  const config = mod('core/config.js');
  config.writeNewPerDay(wiki, 0);
  config.writeReviewsPerDay(wiki, 0);
  limits = sched.resolveDailyLimits(wiki, now);
  assert.equal(limits.newLimit, null);
  assert.equal(limits.reviewLimit, null);
});

test('composeGlobalLearningQueue: 额度截断（learn 段不受限）', () => {
  // 模拟求值函数：5 张复习卡、5 张新卡、1 张学习步卡
  const mockEval = (filter) => {
    if (filter.includes('state_due')) return ['D1', 'D2', 'D3', 'D4', 'D5'];
    if (filter.includes('state_new')) return ['N1', 'N2', 'N3', 'N4', 'N5'];
    if (filter.includes('state_learn')) return ['L1'];
    return [];
  };

  // 1. 不限（null/缺省）：全部
  const qAll = deckEngine.composeGlobalLearningQueue(mockEval);
  assert.deepEqual([...qAll], ['L1', 'D1', 'D2', 'D3', 'D4', 'D5', 'N1', 'N2', 'N3', 'N4', 'N5']);
  const qNull = deckEngine.composeGlobalLearningQueue(mockEval, { reviewLimit: null, newLimit: null });
  assert.deepEqual([...qNull], [...qAll], 'null = 不限，与缺省同义');

  // 2. reviewLimit=3 / newLimit=2
  const qLimited = deckEngine.composeGlobalLearningQueue(mockEval, { reviewLimit: 3, newLimit: 2 });
  assert.deepEqual([...qLimited], ['L1', 'D1', 'D2', 'D3', 'N1', 'N2'], '复习截断到 3，新卡截断到 2');

  // 3. 额度用尽（0）：复习与新卡都不放行，学习步仍放行（会内学习不受上限）
  const qZero = deckEngine.composeGlobalLearningQueue(mockEval, { reviewLimit: 0, newLimit: 0 });
  assert.deepEqual([...qZero], ['L1'], '额度为 0 = 一张不放；learn 段不受限');

  // 4. 只压新卡：reviewLimit 充足 + newLimit=0
  const qNoNew = deckEngine.composeGlobalLearningQueue(mockEval, { reviewLimit: 5, newLimit: 0 });
  assert.deepEqual([...qNoNew], ['L1', 'D1', 'D2', 'D3', 'D4', 'D5'], '新卡为 0 时只出复习卡');
});
