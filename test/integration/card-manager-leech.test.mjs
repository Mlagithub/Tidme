/*
card-manager-leech.test.mjs — 卡片管理器 Leech（难点卡）视图与重置动作集成测试

注意：重置补丁的唯一产地是 core/scheduler.resetLeechCard，本测试调用真身——
曾在测试里复制一份补丁，实现改了（漏清 tidme.ignored）测试也不会红。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-cm-leech-' });
let sched, ns;

test.before(() => {
  sched = mod('core/scheduler.js');
  ns = mod('core/ns.js');
});

test('resetLeechCard: 清 leech/出队三态（含 ignored）并遗忘回新卡', () => {
  reset({ alsoSystem: [] });
  // 典型 leech 现场：达阈值 → 默认 leech_action=exclude 写了 tidme.ignored，卡已出队
  wiki.addTiddler({
    title: '难点卡1',
    'tidme.kind': 'item',
    state: '2',
    lapses: '8',
    'tidme.leech': 'yes',
    'tidme.ignored': 'yes',
    'tidme.suspended': 'yes',
    'tidme.buried': '20260912',
    due: '20260920000000000',
  });

  const patch = sched.resetLeechCard();
  const before = wiki.getTiddler('难点卡1').fields;
  const updated = { ...before };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete updated[k];
    else updated[k] = v;
  }
  wiki.addTiddler(updated);

  const after = wiki.getTiddler('难点卡1').fields;
  assert.equal(after['tidme.leech'], undefined, 'leech 标记已清除');
  assert.equal(after['tidme.ignored'], undefined, 'ignored 已清除（否则重置后卡仍在队列之外）');
  assert.equal(after['tidme.suspended'], undefined, '解冻恢复');
  assert.equal(after[ns.BURIED_FIELD], undefined, '当日搁置一并解除');
  assert.equal(after.lapses, '0', 'lapses 归零');
  assert.equal(after.state, '0', '重置为新卡');

  // 重置后必须真的回到队列（这是"重置"的意义所在）
  assert.equal(sched.isInQueue(after), true, '重置后回到队列');
  assert.equal(sched.isDueNowFor(wiki, after), true, '重置后立即可调度');
});

test('unburyCard: 只解除当日搁置，不动其它出队态', () => {
  reset({ alsoSystem: [] });
  wiki.addTiddler({
    title: '搁置卡',
    'tidme.kind': 'item',
    state: '0',
    due: '20260901000000000',
    'tidme.buried': '20260912',
  });
  const f = { ...wiki.getTiddler('搁置卡').fields, ...sched.unburyCard() };
  wiki.addTiddler(f);
  assert.equal(wiki.getTiddler('搁置卡').fields['tidme.buried'], undefined);
  assert.equal(sched.isDueNowFor(wiki, wiki.getTiddler('搁置卡').fields), true);
});
