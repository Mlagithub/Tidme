/*
pdf-view.test.mjs — PDF 阅读器视图模式纯逻辑单元测试（node:test）

- unitOf/unitCount/unitStartByIndex/unitIndexOf：单页/双页/书籍/无限四种口径的单元切分与互逆
- unitStep：翻单元导航与端点收敛
- resolveViewScale：布局/滚动折算后的 fit 约束（双页单元宽、水平受高、平铺半宽、auto ≤ 1）
- parseViewState/viewStateText：视图偏好持久化编解码与非法输入回退
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const view = await import('../../src/tidme/read/widgets/pdf-view.ts');

test('unitOf: 单页与无限滚动恒单页单元', () => {
  assert.deepEqual([...view.unitOf(3, 'single', 'page', 10)], [3]);
  assert.deepEqual([...view.unitOf(3, 'dual', 'infinite', 10)], [3], 'infinite 无视成对布局');
  assert.deepEqual([...view.unitOf(3, 'book', 'vertical', 10)], [2, 3], '连续滚动仍按书籍配对（封面后的对从偶数页起）');
  assert.deepEqual([...view.unitOf(0, 'single', 'page', 10)], [1], '页码非法回 1');
  assert.deepEqual([...view.unitOf(99, 'single', 'page', 10)], [10], '越界裁剪到末页');
});

test('unitOf: 双页 1-2/3-4 成对；书籍首页独占后 2-3/4-5；末页奇数落单', () => {
  assert.deepEqual([...view.unitOf(1, 'dual', 'page', 8)], [1, 2]);
  assert.deepEqual([...view.unitOf(2, 'dual', 'page', 8)], [1, 2], '单元成员页互查');
  assert.deepEqual([...view.unitOf(4, 'dual', 'page', 8)], [3, 4]);
  assert.deepEqual([...view.unitOf(7, 'dual', 'page', 7)], [7], '奇数末页落单');
  assert.deepEqual([...view.unitOf(1, 'book', 'page', 8)], [1], '书籍封面独占');
  assert.deepEqual([...view.unitOf(2, 'book', 'page', 8)], [2, 3]);
  assert.deepEqual([...view.unitOf(3, 'book', 'page', 8)], [2, 3]);
  assert.deepEqual([...view.unitOf(5, 'book', 'page', 8)], [4, 5]);
  assert.deepEqual([...view.unitOf(8, 'book', 'page', 8)], [8], '书籍奇数末页落单');
});

test('unitCount: dual 向上取整；book = 封面 + 其余成对', () => {
  assert.equal(view.unitCount(8, 'dual', 'page'), 4);
  assert.equal(view.unitCount(7, 'dual', 'page'), 4);
  assert.equal(view.unitCount(8, 'book', 'page'), 5, '封面 + 3 组对 + 末页落单');
  assert.equal(view.unitCount(7, 'book', 'page'), 4, '封面 + 3 组（末页并入对）');
  assert.equal(view.unitCount(5, 'single', 'vertical'), 5);
  assert.equal(view.unitCount(5, 'dual', 'infinite'), 5, 'infinite 恒单页单元');
  assert.equal(view.unitCount(0, 'dual', 'page'), 1, '非法页数按 1');
});

test('unitStartByIndex 与 unitIndexOf 互逆（三种布局全索引遍历）', () => {
  for (const layout of ['dual', 'book']) {
    for (const scroll of ['page', 'vertical']) {
      const count = view.unitCount(9, layout, scroll);
      for (let i = 0; i < count; i++) {
        const start = view.unitStartByIndex(i, layout, scroll, 9);
        assert.equal(view.unitIndexOf(start, layout, scroll, 9), i, `${layout}/${scroll} 单元 ${i} 互逆`);
      }
    }
  }
});

test('unitStartByIndex: 越界收敛端点单元', () => {
  assert.equal(view.unitStartByIndex(-1, 'dual', 'page', 8), 1);
  assert.equal(view.unitStartByIndex(99, 'dual', 'page', 8), 7);
  assert.equal(view.unitStartByIndex(0, 'book', 'page', 8), 1);
  assert.equal(view.unitStartByIndex(1, 'book', 'page', 8), 2, '书籍第 1 对起始 p2');
  assert.equal(view.unitStartByIndex(2, 'book', 'page', 8), 4);
});

test('unitStep: 相邻单元首页导航，端点收敛；书籍封面步长 1', () => {
  assert.equal(view.unitStep(1, 'dual', 'page', 1, 8), 3);
  assert.equal(view.unitStep(3, 'dual', 'page', -1, 8), 1);
  assert.equal(view.unitStep(7, 'dual', 'page', 1, 8), 7, '末单元再前进保持');
  assert.equal(view.unitStep(1, 'dual', 'page', -1, 8), 1, '首单元再后退保持');
  assert.equal(view.unitStep(1, 'book', 'page', 1, 8), 2, '书籍封面 → 第一对');
  assert.equal(view.unitStep(2, 'book', 'page', -1, 8), 1, '第一对 → 封面（步长 1）');
  assert.equal(view.unitStep(2, 'book', 'page', 1, 8), 4);
  assert.equal(view.unitStep(4, 'single', 'vertical', 1, 9), 5, '单页布局等价逐页');
  assert.equal(view.unitStep(4, 'single', 'page', -1, 0), 3, '页数未知（加载中）按单元步进，不回起点');
});

test('resolveViewScale: 数字档与 actual 原样（clamp）；双页单元宽计入间距', () => {
  // 页面 612×792，双页单元 = 612*2+12 = 1236；容器宽 1236 → fit-width = 1
  assert.equal(view.resolveViewScale('fit-width', 612, 792, 1236, 2000, 'dual', 'vertical'), 1);
  assert.equal(view.resolveViewScale('fit-width', 612, 792, 618, 2000, 'dual', 'vertical'), 0.5, '618/1236 = 0.5');
  assert.equal(view.resolveViewScale(1.5, 612, 792, 100, 100, 'dual', 'vertical'), 1.5);
  assert.equal(view.resolveViewScale('actual', 612, 792, 100, 100, 'dual', 'vertical'), 1);
});

test('resolveViewScale: fit-page 受高度约束、auto 宽度优先且不超原大', () => {
  // 容器高仅 792 → fit-page = 1（宽本可更大但取小）
  assert.equal(view.resolveViewScale('fit-page', 612, 792, 2472, 792, 'single', 'vertical'), 1);
  assert.equal(view.resolveViewScale('fit-page', 612, 792, 2472, 396, 'single', 'vertical'), 0.5);
  // auto：宽可放大到 4 倍也封顶 1
  assert.equal(view.resolveViewScale('auto', 612, 792, 2448, 4000, 'single', 'vertical'), 1);
  assert.equal(view.resolveViewScale('auto', 612, 792, 306, 4000, 'single', 'vertical'), 0.5);
});

test('resolveViewScale: horizontal 沿滚动方向 fit 只受高约束', () => {
  // 容器高 792 → fit-width/fit-page 至少 1；宽充足不额外缩
  assert.equal(view.resolveViewScale('fit-width', 612, 792, 200, 792, 'dual', 'horizontal'), 1);
  assert.equal(view.resolveViewScale('fit-width', 612, 792, 200, 396, 'dual', 'horizontal'), 0.5);
  assert.equal(view.resolveViewScale('auto', 612, 792, 200, 1584, 'dual', 'horizontal'), 1, 'auto 不超原大');
  assert.equal(view.resolveViewScale('auto', 612, 792, 200, 396, 'dual', 'horizontal'), 0.5);
});

test('resolveViewScale: wrapped 按一行两个单元的名义列宽约束', () => {
  // 容器宽 1260 → 单元列宽 630-12=618 → 双页单元 618/1236 = 0.5
  assert.equal(view.resolveViewScale('fit-width', 612, 792, 1260, 2000, 'dual', 'wrapped'), 0.5);
  // 单页单元：列宽 1248 / 612 = 2.039…（clamp 内原样）
  const single = view.resolveViewScale('fit-width', 612, 792, 2520, 2000, 'single', 'wrapped');
  assert.ok(Math.abs(single - 1248 / 612) < 1e-9, `单页 wrapped fit-width = 1248/612（实际 ${single}）`);
});

test('parseViewState: 非法 JSON/字段逐项回退默认', () => {
  const d = view.parseViewState('');
  assert.equal(d.layout, 'single');
  assert.equal(d.scroll, 'page');
  assert.equal(d.zoom, 'fit-page');
  assert.equal(view.parseViewState('not-json{').layout, 'single');
  const bad = view.parseViewState('{"l":"xxx","s":"yyy","z":null}');
  assert.equal(bad.layout, 'single');
  assert.equal(bad.scroll, 'page');
  assert.equal(bad.zoom, 'fit-page');
  assert.equal(view.parseViewState('{"z":1.5}').zoom, 1.5, '合法数字档保留');
});

test('viewStateText 与 parseViewState 互逆（含数字档与各模式）', () => {
  for (const layout of ['single', 'dual', 'book']) {
    for (const scroll of ['page', 'vertical', 'horizontal', 'wrapped', 'infinite']) {
      const text = view.viewStateText(layout, scroll, 'auto');
      const back = view.parseViewState(text);
      assert.deepEqual(back, { layout, scroll, zoom: 'auto' }, `${layout}/${scroll} 往返`);
    }
  }
  assert.equal(view.parseViewState(view.viewStateText('dual', 'vertical', 2)).zoom, 2);
});
