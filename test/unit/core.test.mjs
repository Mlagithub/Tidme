/*
core.test.mjs — tidme/core 单元测试（node:test）

直接 import src/tidme/core/*.ts（Node 24 类型剥离）。覆盖：
- ids：docId/sectionId 确定性、指纹
- schema：FSRS 初始字段、缺失检测、严格校验
deck-engine 的过滤器组合经真实 TW 加载（该模块 require 同包 core/ns，ESM 直引会缺 require）
→ 见 integration/queue.test.mjs 与 integration/bin-core.test.mjs。
fsrs 四档评分语义见 integration/fsrs.test.mjs；学习流回归见 e2e/study-flow.test.mjs。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const ids = await import('../../src/tidme/core/ids.ts');
const schema = await import('../../src/tidme/core/schema.ts');

test('ids: docId 只由元数据派生且确定', async () => {
  const meta = { title: '书A', creator: '作者', language: 'zh' };
  const a = await ids.makeDocId(meta);
  const b = await ids.makeDocId({ ...meta });
  assert.equal(a, b);
  assert.match(a, /^d[0-9a-f]{8}$/);
  // 不含全文：仅 title 变化 → docId 变化
  const c = await ids.makeDocId({ ...meta, title: '书B' });
  assert.notEqual(a, c);
});

test('ids: sectionId 由 docId|面包屑|序号 派生且稳定', async () => {
  const doc = await ids.makeDocId({ title: '书', creator: '', language: 'zh' });
  const s1 = await ids.makeSectionId(doc, ['第一章', '第一节'], 3);
  const s2 = await ids.makeSectionId(doc, ['第一章', '第一节'], 3);
  assert.equal(s1, s2);
  assert.match(s1, /^s[0-9a-f]{12}$/);
  const s3 = await ids.makeSectionId(doc, ['第一章', '第二节'], 3);
  assert.notEqual(s1, s3, '面包屑不同则 ID 不同');
  const s4 = await ids.makeSectionId(doc, ['第一章', '第一节'], 4);
  assert.notEqual(s1, s4, '序号不同则 ID 不同');
});

test('ids: contentFingerprint 归一化空白', async () => {
  assert.equal(await ids.contentFingerprint('  a   b\nc '), await ids.contentFingerprint('a b c'));
  assert.equal((await ids.contentFingerprint('hello')).length, 16);
});

test('ids: normalizeText 折叠空白', () => {
  assert.equal(ids.normalizeText('  多   个 空格 \n 换行 '), '多 个 空格 换行');
  assert.equal(ids.normalizeText(null), '');
});

test('schema: FSRS 初始字段齐全且 state=0', () => {
  const f = schema.initialFsrsFields(new Date());
  for (const key of schema.FSRS_FIELDS) assert.ok(key in f, `缺 ${key}`);
  assert.equal(f.state, '0');
  assert.equal(f.reps, '0');
  assert.equal(schema.missingFsrsFields(f).length, 0);
});

test('schema: missingFsrsFields 检出缺失', () => {
  const missing = schema.missingFsrsFields({ due: '20260101' });
  assert.ok(missing.includes('state'));
  assert.ok(missing.includes('stability'));
});

test('schema: assertCardFields 校验 kind 与 FSRS 九件套', () => {
  const good = { 'tidme.kind': 'item', 'tidme.subkind': 'qa', ...schema.initialFsrsFields(new Date()) };
  assert.doesNotThrow(() => schema.assertCardFields(good));
  assert.throws(() => schema.assertCardFields({ ...good, 'tidme.kind': undefined }), /tidme\.kind/);
  assert.throws(() => schema.assertCardFields({ ...good, 'tidme.kind': 'extract' }), /tidme\.kind/);
  assert.throws(() => schema.assertCardFields({ ...good, state: undefined }), /FSRS/);
});
