/*
pdf-zoom.test.mjs — PDF 阅读器缩放纯逻辑单元测试（node:test）

- resolveScale：auto 宽度优先不超原大 / fit-page 宽高同约束 / fit-width 只看宽 / actual=1 / 数字档 clamp
- stepLadder：档位步进与端点收敛
- ladderOptions：下拉选项与档位一致（Firefox pdf.js 同款 50%–400%）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const zoom = await import('../../src/tidme/read/widgets/pdf-zoom.ts');

test('resolveScale: fit-page 宽高取小，fit-width 只看宽，actual 恒 1', () => {
  // 页面 600×800，容器 600×1200：fit-page 受高度约束（1200/800=1.5）与宽度（1）取小
  assert.equal(zoom.resolveScale('fit-page', 600, 800, 600, 1200), 1);
  // fit-width 只受宽度约束（忽略更高容器）
  assert.equal(zoom.resolveScale('fit-width', 600, 800, 600, 1200), 1);
  assert.equal(zoom.resolveScale('fit-width', 300, 800, 600, 1200), 2);
  assert.equal(zoom.resolveScale('actual', 600, 800, 600, 1200), 1);
});

test('resolveScale: auto 宽度优先铺满但封顶原大（pdf.js 自动缩放语义）', () => {
  // 容器宽 1200 → 宽适配 2 倍，auto 封顶 1
  assert.equal(zoom.resolveScale('auto', 600, 800, 1200, 1600), 1);
  // 容器窄于页面 → 与 fit-width 一致
  assert.equal(zoom.resolveScale('auto', 600, 800, 300, 1600), 0.5);
});

test('resolveScale: 数字档原样采用并 clamp 到 [0.25, 4]', () => {
  assert.equal(zoom.resolveScale(1.5, 600, 800, 600, 1200), 1.5);
  assert.equal(zoom.resolveScale(99, 600, 800, 600, 1200), 4);
  assert.equal(zoom.resolveScale(0.01, 600, 800, 600, 1200), 0.25);
  assert.equal(zoom.resolveScale(NaN, 600, 800, 600, 1200), 1, '非法值回退 1');
});

test('resolveScale: fit 结果同样 clamp（容器极小不产生微型页面）', () => {
  // 容器 10×10、页面 600×800 → 0.0166 → clamp 0.25
  assert.equal(zoom.resolveScale('fit-page', 600, 800, 10, 10), 0.25);
});

test('stepLadder: 放大/缩小取相邻档，端点收敛', () => {
  assert.equal(zoom.stepLadder(1, 1), 1.25);
  assert.equal(zoom.stepLadder(1, -1), 0.75);
  assert.equal(zoom.stepLadder(0.75, 1), 1);
  assert.equal(zoom.stepLadder(4, 1), 4, '最大档再放大保持 4');
  assert.equal(zoom.stepLadder(0.5, -1), 0.25, '最小档再缩小收敛到 fit 兜底下限 0.25');
  // fit 计算出的非档位值（如 1.44）向上步进落到下一档
  assert.equal(zoom.stepLadder(1.44, 1), 1.5);
  assert.equal(zoom.stepLadder(1.44, -1), 1.25);
  // fit 兜底下限 0.25 低于最小档：再缩小收敛到 ZOOM_MIN
  assert.equal(zoom.stepLadder(0.3, -1), 0.25);
});

test('ladderOptions: 与 ZOOM_LADDER 一致（value=scale 字符串，label=百分比）', () => {
  const opts = zoom.ladderOptions();
  assert.equal(opts.length, zoom.ZOOM_LADDER.length);
  assert.deepEqual(opts[0], { value: '0.5', label: '50%' });
  assert.deepEqual(opts.find((o) => o.value === '1'), { value: '1', label: '100%' });
  assert.deepEqual(opts[opts.length - 1], { value: '4', label: '400%' });
});
