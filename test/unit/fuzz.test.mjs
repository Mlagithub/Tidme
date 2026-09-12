/*
fuzz.test.mjs — 间隔模糊（Fuzz）测试

期望值直接取自 Anki states/fuzz.rs 的单元测试表（fuzz_factor 0.0 / 0.5 / 0.99
分别对应区间下界 / 中值 / 上界），保证与参照实现逐值同源。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { mod } = bootPlugin({ prefix: 'tidme-fuzz-' });
const sched = mod('core/scheduler.js');

/** Anki 测试表的断言助手：同一区间在 factor 0.0 / 0.5 / 0.99 下的三个结果 */
function assertBounds(interval, minimum, maximum, lower, middle, upper, msg) {
  assert.equal(sched.withReviewFuzz(0.0, interval, minimum, maximum), lower, `${msg}（下界）`);
  assert.equal(sched.withReviewFuzz(0.5, interval, minimum, maximum), middle, `${msg}（中值）`);
  assert.equal(sched.withReviewFuzz(0.99, interval, minimum, maximum), upper, `${msg}（上界）`);
}

test('fuzzDelta: 2.5 天以下不抖；分段半径与 Anki 同式', () => {
  assert.equal(sched.fuzzDelta(1), 0);
  assert.equal(sched.fuzzDelta(2.49), 0);
  assert.equal(sched.fuzzDelta(2.5), 1);
  // 7 天：1 + 0.15 × (7 − 2.5) = 1.675
  assert.ok(Math.abs(sched.fuzzDelta(7) - 1.675) < 1e-9);
  // 20 天：1 + 0.675 + 0.10 × 13 = 2.975
  assert.ok(Math.abs(sched.fuzzDelta(20) - 2.975) < 1e-9);
  // 20 天以上无半径上限（文档中"90 天"是 load balancer 视野，不是抖动半径）
  assert.ok(sched.fuzzDelta(1000) > 50, '大间隔半径持续增长，不被人为截断');
});

test('withReviewFuzz: Anki 测试表逐值对齐', () => {
  // 不抖动区间
  assertBounds(1.0, 1, 1000, 1, 1, 1, '1 天不抖');
  assertBounds(2.49, 1, 1000, 2, 2, 2, '2.49 天不抖');
  // 分段起点
  assertBounds(2.5, 1, 1000, 2, 3, 4, '2.5 天');
  assertBounds(7.0, 1, 1000, 5, 7, 9, '7 天');
  assertBounds(17.0, 1, 1000, 14, 17, 20, '17 天');
  assertBounds(37.0, 1, 1000, 33, 37, 41, '37 天');
  // 分段切换连续性
  assertBounds(6.9, 3, 1000, 5, 7, 9, '6.9 天');
  assertBounds(7.0, 3, 1000, 5, 7, 9, '7.0 天');
  assertBounds(7.1, 3, 1000, 5, 7, 9, '7.1 天');
  assertBounds(19.9, 3, 1000, 17, 20, 23, '19.9 天');
  assertBounds(20.0, 3, 1000, 17, 20, 23, '20.0 天');
  assertBounds(20.1, 3, 1000, 17, 20, 23, '20.1 天');
  // 上下限约束
  assertBounds(2.0, 2, 1000, 2, 2, 2, '间隔 2 且下界 2 → 单值');
  assertBounds(2.0, 3, 1000, 3, 4, 4, '下界 3 → 放开 1 天保证两档');
  assertBounds(2.0, 3, 3, 3, 3, 3, '上下界相等 → 单值');
  assertBounds(100.0, 101, 1000, 101, 105, 108, '间隔被下限顶起');
  assertBounds(100.0, 1, 99, 92, 96, 99, '间隔被上限压低');
  assertBounds(100.0, 97, 103, 97, 100, 103, '窄区间夹取');
});

test('withReviewFuzz: factor = null 时不抖动，只按上下限取整夹取（Anki 行为）', () => {
  assert.equal(sched.withReviewFuzz(null, 1.5, 1, 100), 2);
  assert.equal(sched.withReviewFuzz(null, 0.1, 1, 100), 1);
  assert.equal(sched.withReviewFuzz(null, 101, 1, 100), 100);
});

test('minimumReviewFuzzInterval: 前次间隔保护（增长 / 平齐 / 收缩三态）', () => {
  assert.equal(sched.minimumReviewFuzzInterval(2.7269483, 4, 36500), 4, '未长大且旧间隔在上界内 → 下界 = 旧间隔');
  assert.equal(sched.minimumReviewFuzzInterval(2.7269483, 5, 36500), 0, '旧间隔超出上界 → 允许自由抖动');
  assert.equal(sched.minimumReviewFuzzInterval(4.591988, 4, 36500), 5, '确实长大 → 下界 = 旧间隔 + 1');
});

test('applyFuzz: 随机注入 + 前次间隔/最大间隔约束', () => {
  const lo = () => 0;
  const hi = () => 0.999;

  // 1 天不抖
  assert.equal(sched.applyFuzz(1, { randomFn: hi }), 1);

  // 10 天：delta = 1 + 0.675 + 0.3 = 1.975 → [8, 12]
  assert.equal(sched.applyFuzz(10, { randomFn: lo }), 8);
  assert.equal(sched.applyFuzz(10, { randomFn: hi }), 12);

  // 前次间隔 9 < round(10) → 下界 = 10（不许抖回旧间隔），取整后落在 [10, 12]
  assert.equal(sched.applyFuzz(10, { prevInterval: 9, randomFn: lo }), 10, '下界 = 旧间隔 + 1');
  // 前次间隔 11 > round(10)：旧间隔超出上界 12？11 ≤ 12 → 下界 = 11
  assert.equal(sched.applyFuzz(10, { prevInterval: 11, randomFn: lo }), 11, '旧间隔在上界内 → 不短于旧间隔');

  // 收缩（FSRS 给出比旧间隔更短的新间隔）：旧间隔 15 > 上界 12 → 下界 0，允许抖到 8
  assert.equal(sched.applyFuzz(10, { prevInterval: 15, randomFn: lo }), 8, '收缩时允许自由抖动');

  // 最大间隔截断
  assert.equal(sched.applyFuzz(10, { maxInterval: 11, randomFn: hi }), 11, '受 maximum_interval 截断');
});

test('applyFuzz: 抖动期望趋向于 0（区间对称，无系统性偏移）', () => {
  const interval = 20;
  const N = 3000;
  let sum = 0;
  // 确定性伪随机（线性同余）注入：避免用真实 Math.random 做统计断言的不可复现性
  let seed = 123456789;
  const next = () => {
    seed = (1103515245 * seed + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < N; i++) {
    sum += sched.applyFuzz(interval, { randomFn: next }) - interval;
  }
  const avgOffset = Math.abs(sum / N);
  assert.ok(avgOffset < 0.5, `平均偏移应接近 0，实际 ${avgOffset}`);
});

test('calculateFuzzRange: 与 constrainedFuzzBounds 同源表述（对称半径）', () => {
  const r = sched.calculateFuzzRange(10);
  assert.equal(r.minDelta, -r.maxDelta);
  assert.equal(r.maxDelta, 2);
  const protected10 = sched.calculateFuzzRange(10, { prevInterval: 9 });
  assert.equal(protected10.minDelta, 0, '下界被前次间隔顶起（不再对称）');
  assert.equal(protected10.maxDelta, 2);
});
