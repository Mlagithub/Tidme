/*
card-manager-leech.test.mjs — 卡片管理器 Leech（难点卡）视图与重置动作集成测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-cm-leech-' });
let sched;

test.before(() => {
  sched = mod('core/scheduler.js');
});

test('Leech 判定与批量重置', () => {
  // 模拟一张难点卡（遗忘次数达到阈值 8 次）
  const leechCard = {
    title: '难点卡1',
    'tidme.kind': 'item',
    state: '2',
    lapses: '8',
    'tidme.leech': 'yes',
    'tidme.suspended': 'yes',
    due: '20260920000000000',
  };
  wiki.addTiddler(leechCard);

  // 1. 验证字段包含 leech 状态
  const cardBefore = wiki.getTiddler('难点卡1').fields;
  assert.equal(cardBefore['tidme.leech'], 'yes');
  assert.equal(cardBefore['tidme.suspended'], 'yes');
  assert.equal(cardBefore.lapses, '8');

  // 2. 执行 Reset Leech（重置难点）：清空 leech 标记、解冻、遗忘重置为新卡
  const resetPatch = {
    'tidme.leech': undefined,
    'tidme.suspended': undefined,
    lapses: '0',
    ...sched.forgetCard(),
  };

  const updated = { ...cardBefore };
  for (const [k, v] of Object.entries(resetPatch)) {
    if (v === undefined) delete updated[k];
    else updated[k] = v;
  }
  wiki.addTiddler(updated);

  // 3. 验证卡片重置结果
  const cardAfter = wiki.getTiddler('难点卡1').fields;
  assert.equal(cardAfter['tidme.leech'], undefined, 'leech 标记已清除');
  assert.equal(cardAfter['tidme.suspended'], undefined, '解冻恢复');
  assert.equal(cardAfter.lapses, '0', 'lapses 归零');
  assert.equal(cardAfter.state, '0', '重置为新卡');
});
