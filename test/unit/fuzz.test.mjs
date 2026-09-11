/*
fuzz.test.mjs — 间隔模糊（Fuzz）分段对称抖动测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { mod } = bootPlugin({ prefix: 'tidme-fuzz-' });
const sched = mod('core/scheduler.js');

test('calculateFuzzRange: 2.5 天以下不加抖动', () => {
  const r1 = sched.calculateFuzzRange(1);
  assert.equal(r1.minDelta, 0);
  assert.equal(r1.maxDelta, 0);

  const r2 = sched.calculateFuzzRange(2);
  assert.equal(r2.minDelta, 0);
  assert.equal(r2.maxDelta, 0);

  const r24 = sched.calculateFuzzRange(2.4);
  assert.equal(r24.minDelta, 0);
  assert.equal(r24.maxDelta, 0);
});

test('calculateFuzzRange: 各分段区间单调递增且关于 0 对称', () => {
  const r3 = sched.calculateFuzzRange(3);
  assert.equal(r3.minDelta, -r3.maxDelta);
  assert.equal(r3.maxDelta, 1);

  const r10 = sched.calculateFuzzRange(10);
  assert.equal(r10.minDelta, -r10.maxDelta);
  assert.ok(r10.maxDelta >= 2);

  const r30 = sched.calculateFuzzRange(30);
  assert.equal(r30.minDelta, -r30.maxDelta);
  assert.ok(r30.maxDelta >= 3);

  const r1000 = sched.calculateFuzzRange(1000);
  assert.ok(r1000.maxDelta <= 90, '上限不超过 90 天');
});

test('applyFuzz: 随机数注入与边界保护', () => {
  // 1 天不抖动
  assert.equal(sched.applyFuzz(1, { randomFn: () => 0.99 }), 1);

  // 10 天，maxDelta 为 2
  // randomFn = 0 -> 最小下界
  const minFuzzed = sched.applyFuzz(10, { randomFn: () => 0 });
  assert.equal(minFuzzed, 8);

  // randomFn = 0.999 -> 最大上界
  const maxFuzzed = sched.applyFuzz(10, { randomFn: () => 0.999 });
  assert.equal(maxFuzzed, 12);

  // prevInterval 保护：不得短于前次既有间隔
  const protectedDays = sched.applyFuzz(10, { prevInterval: 9, randomFn: () => 0 });
  assert.equal(protectedDays, 9, '受前次间隔 9 保护不跌至 8');

  // maxInterval 截断保护
  const capped = sched.applyFuzz(10, { maxInterval: 11, randomFn: () => 0.999 });
  assert.equal(capped, 11, '受 maxInterval 11 截断不升至 12');
});

test('applyFuzz: 抖动期望趋向于 0（对称无系统性偏移）', () => {
  const interval = 20;
  let sum = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    sum += sched.applyFuzz(interval) - interval;
  }
  const avgOffset = Math.abs(sum / N);
  assert.ok(avgOffset < 0.25, `平均偏移应接近 0，实际 ${avgOffset}`);
});
