/*
stats.test.mjs — core 统计聚合测试（node:test + 真实 TW boot）

- deckLoad / docProgress / retentionFromLogs / funnelCounts / priorityBuckets / formatDuration
- recordReadTime 写真实 wiki（$:/plugins/tidme/stats/readtime.json），不再 mock wiki
- 调度语义（isCardOutOfQueue/parseTwDate/normalizePriority）引用 core/scheduler 正身，
  测试跑在真实模块装配上而非本地副本
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { T } from '../helpers/tw-date.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-stats-' });
const stats = mod('core/stats.js');

test('deckLoad: new/learn/due/overdue 分类（未来排期的 state2 不计 due）', () => {
  const cards = [
    { title: '新卡', fields: { 'tidme.kind': 'item', state: '0', due: T(48) } },
    { title: '学习中', fields: { 'tidme.kind': 'item', state: '1', due: T(-1) } },
    { title: '未来排期', fields: { 'tidme.kind': 'item', state: '2', due: T(6) } },
    { title: '逾期', fields: { 'tidme.kind': 'item', state: '2', due: T(-24) } },
    { title: '已出队', fields: { 'tidme.kind': 'item', state: '2', due: T(-24), 'tidme.done': 'yes' } },
    { title: '已忽略', fields: { 'tidme.kind': 'item', state: '2', due: T(-24), 'tidme.ignored': 'yes' } },
    { title: '搁置', fields: { 'tidme.kind': 'item', state: '2', due: T(-24), 'tidme.suspended': 'yes' } },
  ];
  const load = stats.deckLoad(cards);
  assert.equal(load.total, 7);
  assert.equal(load.newCount, 1);
  assert.equal(load.learn, 1);
  assert.equal(load.due, 1); // 仅逾期（state2 且 due<=now）；未来排期不计入"到期"
  assert.equal(load.overdue, 1);
});

test('docProgress: 已读/剩余', () => {
  const sections = [
    { title: 'A', fields: { 'tidme.kind': 'topic' } },
    { title: 'B', fields: { 'tidme.kind': 'topic' } },
    { title: 'C', fields: { 'tidme.kind': 'topic', 'tidme.done': 'yes' } }, // 已读
    { title: 'D', fields: { 'tidme.kind': 'topic', 'tidme.ignored': 'yes' } }, // 忽略
  ];
  // 跨 realm 对象逐字段比（AGENTS.md 已知陷阱：deepEqual 原型不等）
  const p = stats.docProgress(sections);
  assert.equal(p.total, 4);
  assert.equal(p.done, 2);
  assert.equal(p.left, 2);
});

test('retentionFromLogs: 保留率 ≈ 1 - Again 占比', () => {
  const r = stats.retentionFromLogs([{ rating: 1 }, { rating: 3 }, { rating: 4 }, { rating: 3 }]);
  assert.equal(r.reviews, 4);
  assert.equal(r.retention, 0.75);
  assert.equal(stats.retentionFromLogs([]).retention, 1);
});

test('funnelCounts: 漏斗分层（topic/item 大类 + subkind）', () => {
  const items = [
    { title: '文档', fields: { tags: ['tidme-doc'] } },
    { title: '节', fields: { 'tidme.kind': 'topic', 'tidme.subkind': 'section' } },
    { title: '节2', fields: { 'tidme.kind': 'topic', 'tidme.subkind': 'section' } },
    { title: '摘录', fields: { 'tidme.kind': 'topic', 'tidme.subkind': 'extract' } },
    { title: '挖空', fields: { 'tidme.kind': 'item', 'tidme.subkind': 'cloze' } },
  ];
  // 跨 realm 对象逐字段比（AGENTS.md 已知陷阱：deepEqual 原型不等）
  const f = stats.funnelCounts(items);
  assert.equal(f.docs, 1);
  assert.equal(f.sections, 2);
  assert.equal(f.extracts, 1);
  assert.equal(f.cards, 1);
});

test('priorityBuckets: 分桶（缺失/空串 = 未设）', () => {
  const cards = [
    { title: 'A', fields: { 'tidme.priority': '10' } },
    { title: 'B', fields: { 'tidme.priority': '90' } },
    { title: 'C', fields: { 'tidme.priority': '50' } },
    { title: 'D', fields: {} },
    { title: 'E', fields: { 'tidme.priority': '' } },
  ];
  const b = stats.priorityBuckets(cards);
  assert.equal(b.high, 1);
  assert.equal(b.medium, 1);
  assert.equal(b.low, 1);
  assert.equal(b.none, 2, '缺失与空串都算未设');
});

test('formatDuration: 格式化时间', () => {
  assert.equal(stats.formatDuration(15), '15 s');
  assert.equal(stats.formatDuration(120), '2 m');
  assert.equal(stats.formatDuration(330), '5 m 30 s');
  assert.equal(stats.formatDuration(3600), '1 h');
  assert.equal(stats.formatDuration(3720), '1 h 2 m');
});

test('recordReadTime and getReadTimeStats: 记录与获取阅读时长（真实 wiki 落库）', () => {
  stats.recordReadTime(wiki, 'stats-doc-1', 120);
  stats.recordReadTime(wiki, 'stats-doc-1', 60);
  stats.recordReadTime(wiki, 'stats-doc-2', 300);

  const res = stats.getReadTimeStats(wiki);
  assert.equal(res.totalSeconds, 480);
  assert.equal(res.todaySeconds, 480);
  assert.equal(res.docSeconds['stats-doc-1'], 180);
  assert.equal(res.docSeconds['stats-doc-2'], 300);
});
