/*
pdf-base64.test.mjs — base64 编码纯逻辑单元测试（node:test，直测 TS 源码）

实现唯一收口于 core/binary.ts：
- bytesToBase64Async 与同步 bytesToBase64 输出逐字节一致（分片边界处 3 字节对齐）
- 进度回调：done 单调递增、末次 done === total；时间切片让帧不影响结果
- 回程解码（base64ToBytes）无损还原原字节；base64RoundtripValid 校验空/损坏
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const binary = await import('../../src/tidme/core/binary.ts');

/** 确定性伪随机字节（避免每次运行随机数据掩盖边界缺陷） */
function pseudoBytes(len) {
  const out = new Uint8Array(len);
  let seed = 0x9e3779b9;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = seed & 0xff;
  }
  return out;
}

test('bytesToBase64Async: 与同步版输出一致（跨分片边界，49152=3*0x4000 为切片）', async () => {
  // 覆盖：空、末片 padding 三种余数、恰好整片、多片
  for (const len of [0, 1, 2, 3, 49151, 49152, 49153, 49155, 3 * 0x4000 * 2 + 7]) {
    const bytes = pseudoBytes(len);
    const syncOut = binary.bytesToBase64(bytes);
    const asyncOut = await binary.bytesToBase64Async(bytes);
    assert.equal(asyncOut, syncOut, `len=${len} 分片异步与同步输出一致`);
    assert.equal(binary.base64ToBytes(asyncOut).length, len, `len=${len} 回程无损`);
    if (len % 3 === 0) {
      assert.ok(!asyncOut.includes('='), `len=${len} 3 的倍数无 padding`);
    } else if (len > 0) {
      assert.ok(asyncOut.includes('='), `len=${len} 末片补位`);
    }
  }
});

test('bytesToBase64Async: 进度回调单调递增且收尾 done===total', async () => {
  const bytes = pseudoBytes(3 * 0x4000 * 3 + 5); // 3 整片 + 尾片
  const seen = [];
  await binary.bytesToBase64Async(bytes, (done, total) => seen.push({ done, total }));
  assert.ok(seen.length >= 4, '每片至少回报一次');
  assert.equal(seen[0].total, bytes.length, 'total 为原始字节数');
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i].done > seen[i - 1].done, 'done 严格递增');
    assert.equal(seen[i].total, bytes.length, 'total 恒定');
  }
  assert.equal(seen[seen.length - 1].done, bytes.length, '末次 done === total');
});

test('bytesToBase64Async: 空输入返回空串且不回调', async () => {
  let calls = 0;
  const out = await binary.bytesToBase64Async(new Uint8Array(0), () => calls++);
  assert.equal(out, '');
  assert.equal(calls, 0, '空输入不产生进度回调');
});

test('base64RoundtripValid: 空/损坏 base64 校验不通过', () => {
  assert.equal(binary.base64RoundtripValid(binary.bytesToBase64(pseudoBytes(100)), 100), true, '正常编码通过');
  assert.equal(binary.base64RoundtripValid('', 100), false, '空串不通过');
  assert.equal(binary.base64RoundtripValid('JVBER', 4), false, '截断数据不通过');
});
