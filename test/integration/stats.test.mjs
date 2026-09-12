/*
stats.test.mjs — core 统计聚合测试（node:test + 真实 TW boot）

- deckLoad / retentionFromLogs / funnelCounts / priorityBuckets / formatDuration
- recordReadTime 写真实 wiki（$:/plugins/tidme/stats/readtime.json），不再 mock wiki
- 调度语义（isCardOutOfQueue/parseTwDate/normalizePriority）引用 core/scheduler 正身，
  测试跑在真实模块装配上而非本地副本
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { learningDayInstant, parseTwDate, T, twDate } from '../helpers/tw-date.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-stats-' });
const stats = mod('core/stats.js');
const schema = mod('core/schema.js');

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
    // 概念卡同属 topic 轨道但不是切分出的节 → 单独成桶（曾计入 sections 使漏斗虚高）
    { title: '概念', fields: { 'tidme.kind': 'topic', 'tidme.subkind': 'concept' } },
    { title: '挖空', fields: { 'tidme.kind': 'item', 'tidme.subkind': 'cloze' } },
  ];
  // 跨 realm 对象逐字段比（AGENTS.md 已知陷阱：deepEqual 原型不等）
  const f = stats.funnelCounts(items);
  assert.equal(f.docs, 1);
  assert.equal(f.sections, 2);
  assert.equal(f.extracts, 1);
  assert.equal(f.concepts, 1, 'concept 不计入 sections');
  assert.equal(f.cards, 1);
});

test('display.kindMark: subkind 徽章字形唯一产地（含 concept）', () => {
  const display = mod('core/display.js');
  const schema = mod('core/schema.js');
  // 契约内的每个 subkind 都有明确归属（plan 的 section 无徽章属刻意留白）
  assert.equal(display.kindMark({ 'tidme.subkind': 'extract' }), 'E');
  assert.equal(display.kindMark({ 'tidme.subkind': 'cloze' }), 'C');
  assert.equal(display.kindMark({ 'tidme.subkind': 'qa' }), 'Q');
  assert.equal(display.kindMark({ 'tidme.subkind': 'section' }), '');
  assert.notEqual(display.kindMark({ 'tidme.subkind': 'concept' }), '', '概念卡不再是"无徽章的隐形卡"');
  // 工厂产出的 subkind 必须全部落在契约内（P1-15 的根因就是 concept 越出 SUBKINDS）
  for (const sk of ['section', 'extract', 'concept', 'cloze', 'qa']) {
    assert.ok(schema.SUBKINDS.includes(sk), `${sk} 应在 schema.SUBKINDS 内`);
  }
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

test('priorityBucket: 三档分界唯一产地（边界值与 priorityBuckets 一致）', () => {
  const sched = mod('core/scheduler.js');
  // 边界：33 属高、34 属中、66 属中、67 属低（曾经 stats 与 section 各写一份 33/66）
  assert.equal(sched.priorityBucket(0), 'high');
  assert.equal(sched.priorityBucket(33), 'high');
  assert.equal(sched.priorityBucket(34), 'medium');
  assert.equal(sched.priorityBucket(66), 'medium');
  assert.equal(sched.priorityBucket(67), 'low');
  assert.equal(sched.priorityBucket(100), 'low');
  assert.equal(sched.priorityBucket('abc'), 'medium', '非法值经 normalizePriority → 默认 50（中）');
  // 与分桶统计同解：三档计数 = 逐卡 priorityBucket 计数
  const cards = [
    { title: 'A', fields: { 'tidme.priority': '33' } },
    { title: 'B', fields: { 'tidme.priority': '34' } },
    { title: 'C', fields: { 'tidme.priority': '67' } },
    { title: 'D', fields: {} },
  ];
  const b = stats.priorityBuckets(cards);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const c of cards) {
    if (c.fields['tidme.priority'] === undefined) continue;
    counts[sched.priorityBucket(c.fields['tidme.priority'])]++;
  }
  assert.deepEqual({ high: b.high, medium: b.medium, low: b.low }, counts);
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

test('trueRetentionFromLogs: 区分成熟卡（>=21天）与年轻卡保留率', () => {
  const logs = [
    // 成熟卡：state=2, elapsed_days>=21 (2 次 Good, 1 次 Again)
    { rating: 3, state: '2', elapsed_days: 30 },
    { rating: 4, state: '2', elapsed_days: 45 },
    { rating: 1, state: '2', elapsed_days: 25 },
    // 年轻卡：state=2, elapsed_days<21 (1 次 Good, 1 次 Again)
    { rating: 3, state: '2', elapsed_days: 5 },
    { rating: 1, state: '2', elapsed_days: 10 },
    // 学习中卡片：state=1 (不计入成熟/年轻复习)
    { rating: 1, state: '1', elapsed_days: 0 },
    { rating: 3, state: '1', elapsed_days: 0 },
  ];

  const tr = stats.trueRetentionFromLogs(logs);
  assert.equal(tr.matureReviews, 3);
  assert.equal(tr.maturePass, 2);
  assert.equal(tr.matureAgain, 1);
  assert.equal(Math.round(tr.trueRetention * 100), 67); // 2 / 3 ≈ 66.7%

  assert.equal(tr.youngReviews, 2);
  assert.equal(tr.youngPass, 1);
  assert.equal(tr.youngAgain, 1);
  assert.equal(tr.youngRetention, 0.5); // 1 / 2 = 50%

  assert.equal(tr.allReviews, 7);
  assert.equal(Math.round(tr.overallRetention * 100), 57); // 4 / 7 ≈ 57.1%
});

test('futureDueSchedule: 未来 30 天负荷预测与累计到期计算', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  // 夹具按"学习日"构造到期时刻（learningDayInstant = 该学习日内的真实本地时刻），
  // 不用固定 UTC 串——固定串的学习日归属随运行时区漂移（UTC+14 下 +3 天会落到第 4 天）。
  const rollover = 4;
  const day0 = schema.learningDayOf(now, rollover);
  const dueOn = (dayOffset) => twDate(learningDayInstant(schema.addLearningDays(day0, dayOffset), rollover));
  const cards = [
    // 逾期卡片 (归入第 0 天)
    { fields: { 'tidme.kind': 'item', state: '2', due: dueOn(-5) } },
    // 今天到期 (第 0 天)
    { fields: { 'tidme.kind': 'item', state: '2', due: dueOn(0) } },
    // 3 天后到期 (第 3 天)
    { fields: { 'tidme.kind': 'item', state: '2', due: dueOn(3) } },
    // 3 天后到期另 1 张 (第 3 天)
    { fields: { 'tidme.kind': 'item', state: '2', due: twDate(new Date(parseTwDate(dueOn(3)).getTime() + 3600000)) } },
    // 新卡 (不计入排期)
    { fields: { 'tidme.kind': 'item', state: '0', due: dueOn(-1) } },
    // 出队卡片 (忽略)
    { fields: { 'tidme.kind': 'item', state: '2', due: dueOn(3), 'tidme.done': 'yes' } },
  ];

  const schedule = stats.futureDueSchedule(cards, 10, now, rollover);
  assert.equal(schedule.length, 10);
  assert.equal(schedule[0].dueCount, 2, '第 0 天包含逾期与今天到期');
  assert.equal(schedule[0].cumulativeDue, 2);

  // 日期标签 = 学习日（纯日历推算）：曾用 parseTwDate(<本地学习日串>) 当 UTC 零点，
  // 在 UTC 负偏移时区整体错一天（分桶对、标签错）
  assert.equal(schedule[0].dateString, day0, '第 0 天标签 = 当前学习日');
  for (let i = 1; i < schedule.length; i++) {
    assert.equal(schedule[i].dateString, schema.addLearningDays(day0, i), `第 ${i} 天标签连续`);
  }

  assert.equal(schedule[1].dueCount, 0);
  assert.equal(schedule[1].cumulativeDue, 2);

  assert.equal(schedule[2].dueCount, 0);
  assert.equal(schedule[2].cumulativeDue, 2);

  assert.equal(schedule[3].dueCount, 2, '第 3 天有 2 张卡到期');
  assert.equal(schedule[3].cumulativeDue, 4, '第 3 天累计为 4');
});

test('collectReviewLogs: 对象行与字符串行都收（历史行形态兼容），坏行不拖垮整体', () => {
  const nsMod = mod('core/ns.js');
  const deckLog = nsMod.deckLogTitle('$:/Deck/default');
  wiki.addTiddler({
    title: deckLog,
    type: 'application/json',
    text: '{"20260911090000000":{"rating":3},"20260911090100000":"{\\"rating\\":1}","20260911090200000":"not-json"}',
  });
  // getTiddlerData 已把 application/json 解析成对象：行值此时是对象；字符串行是历史/手写形态
  const logs = stats.collectReviewLogs(wiki);
  assert.equal(logs.length, 2, '坏行被忽略，其余行照收');
  assert.deepEqual([...logs].map((r) => Number(r.rating)).sort(), [1, 3]);
  assert.equal(stats.retentionFromLogs(logs).retention, 0.5, '保留率由真实行算出');
  wiki.deleteTiddler(deckLog);
});

test('retentionByPeriod: 今天/昨天/最近7天/最近30天/全部 × 成熟/年轻/总计（学习步不计入）', () => {
  const schedMod = mod('core/scheduler.js');
  const now = new Date();
  const rollover = 4;
  const day = schedMod.learningDayContext(wiki, now).learningDay;
  const at = (dayOffset, minute = 0) => {
    const d = new Date(learningDayInstant(schema.addLearningDays(day, dayOffset), rollover).getTime() + minute * 60000);
    return twDate(d);
  };
  const logs = [
    // 今天：成熟卡 Good + 年轻卡 Again
    { at: at(0, 1), rating: 3, state: '2', last_elapsed_days: 30 },
    { at: at(0, 2), rating: 1, state: '2', last_elapsed_days: 5 },
    // 昨天：成熟卡 Again
    { at: at(-1, 1), rating: 1, state: '2', last_elapsed_days: 40 },
    // 10 天前：年轻卡 Good（只进"最近 30 天"和"全部"）
    { at: at(-10, 1), rating: 3, state: '2', last_elapsed_days: 3 },
    // 40 天前：成熟卡 Good（只进"全部"）
    { at: at(-40, 1), rating: 4, state: '2', last_elapsed_days: 99 },
    // 今天的学习步（不进任何保留率列）
    { at: at(0, 3), rating: 1, state: '1', last_elapsed_days: 0 },
  ];
  const rows = stats.retentionByPeriod(logs, now, rollover);
  const by = (p) => rows.find((r) => r.period === p);
  const today = by('today');
  assert.equal(today.mature.reviews, 1);
  assert.equal(today.mature.retention, 1, '今日成熟卡 1/1 通过');
  assert.equal(today.young.reviews, 1);
  assert.equal(today.young.retention, 0, '今日年轻卡 1 次 Again');
  assert.equal(today.total.reviews, 2, '总计 = 成熟 + 年轻（学习步不计入）');
  assert.equal(today.total.retention, 0.5);

  assert.equal(by('yesterday').total.reviews, 1);
  assert.equal(by('yesterday').mature.again, 1);
  assert.equal(by('lastWeek').total.reviews, 3, '最近 7 天 = 今天 + 昨天（10 天前不在内）');
  assert.equal(by('lastMonth').total.reviews, 4);
  assert.equal(by('all').total.reviews, 5);
  assert.equal(by('all').mature.reviews, 3);
  assert.equal(by('all').young.reviews, 2);
});

test('histogram: 分桶边界与非法值（间隔/稳定度/难度）', () => {
  const bins = stats.histogram([0, 1, 2.9, 3, 7, 14, -5, NaN, Infinity, 400], [0, 1, 3, 7, 14, 365, Infinity], ['0', '1', '2-3', '4-7', '8-14', '15+']);
  assert.deepEqual([...bins.map((b) => b.count)], [1, 2, 1, 1, 1, 1], '负值/NaN/Infinity 忽略；边界值归下桶');
  assert.deepEqual([...bins.map((b) => b.label)], ['0', '1', '2-3', '4-7', '8-14', '15+']);
  assert.deepEqual([...stats.histogram([1], [0, 1], ['a', 'b']).map((b) => b.count)], [0, 0], 'edges 长度不符 → 全零（不抛错）');
});

test('interval/stability/difficulty 直方图: 只统计在队复习卡，难度按 1–10 量纲折成百分比', () => {
  const cards = [
    { fields: { 'tidme.kind': 'item', state: '2', scheduled_days: '5', stability: '20', difficulty: '5' } },
    { fields: { 'tidme.kind': 'item', state: '2', scheduled_days: '40', stability: '200', difficulty: '2' } },
    { fields: { 'tidme.kind': 'item', state: '0', scheduled_days: '5', stability: '20', difficulty: '5' } }, // 新卡不计
    { fields: { 'tidme.kind': 'item', state: '2', scheduled_days: '5', stability: '20', difficulty: '5', 'tidme.done': 'yes' } }, // 出队不计
  ];
  const ivl = stats.intervalHistogram(cards);
  assert.equal(ivl.reduce((n, b) => n + b.count, 0), 2, '只算在队复习卡');
  assert.equal(ivl.find((b) => b.label === '4-7').count, 1);
  assert.equal(ivl.find((b) => b.label === '31-60').count, 1);

  const stab = stats.stabilityHistogram(cards);
  assert.equal(stab.find((b) => b.label === '7-30').count, 1);
  assert.equal(stab.find((b) => b.label === '180-365').count, 1);

  const diff = stats.difficultyHistogram(cards);
  assert.equal(diff.find((b) => b.label === '40-60%').count, 1, 'difficulty 5（1–10 量纲）应落 40–60%');
  assert.equal(diff.find((b) => b.label === '20-40%').count, 1, 'difficulty 2 → 20–40%');
  assert.equal(diff.find((b) => b.label === '0-20%').count, 0, '曾因不折算把全部卡塞进第一桶');
});

test('forecastSummary: 总量/平均/明天到期/每日负载（Σ1/间隔）', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  const rollover = 4;
  const day = schema.learningDayOf(now, rollover);
  const dueOn = (offset) => twDate(learningDayInstant(schema.addLearningDays(day, offset), rollover));
  const cards = [
    { fields: { 'tidme.kind': 'item', state: '2', due: dueOn(-2), scheduled_days: '2' } }, // 逾期 → 第 0 天
    { fields: { 'tidme.kind': 'item', state: '2', due: dueOn(1), scheduled_days: '4' } }, // 明天
    { fields: { 'tidme.kind': 'item', state: '0', due: dueOn(0), scheduled_days: '0' } }, // 新卡不计
    { fields: { 'tidme.kind': 'item', state: '2', due: dueOn(1000), scheduled_days: '10' } }, // 窗口外，但计入负载
  ];
  const f = stats.forecastSummary(cards, 30, now, rollover);
  assert.equal(f.days, 30);
  assert.equal(f.total, 2, '窗口内 2 张（逾期并入第 0 天）');
  assert.equal(f.dueTomorrow, 1);
  assert.ok(Math.abs(f.averagePerDay - 2 / 30) < 1e-9);
  assert.ok(Math.abs(f.burden - (1 / 2 + 1 / 4 + 1 / 10)) < 1e-9, '负载 = Σ1/间隔（只算在队复习卡）');
});

test('learningDay 纯日历换算：addLearningDays / learningDayDiff（跨月跨年）', () => {
  assert.equal(schema.addLearningDays('20260911', 3), '20260914');
  assert.equal(schema.addLearningDays('20260930', 1), '20261001', '跨月');
  assert.equal(schema.addLearningDays('20261231', 1), '20270101', '跨年');
  assert.equal(schema.addLearningDays('20260911', -3), '20260908');
  assert.equal(schema.learningDayDiff('20260911', '20260914'), 3);
  assert.equal(schema.learningDayDiff('20260914', '20260911'), -3);
  assert.equal(schema.learningDayDiff('20261231', '20270101'), 1, '跨年差 1 天');
});

test('readTime: 日桶键用学习日（与复习计数同一换天口径）', () => {
  const sched = mod('core/scheduler.js');
  const tiddler = stats.READTIME_TIDDLER;
  wiki.deleteTiddler(tiddler);
  stats.recordReadTime(wiki, 'doc-day', 60);
  const raw = JSON.parse(wiki.getTiddlerText(tiddler));
  const day = sched.learningDayContext(wiki).learningDay;
  assert.equal(raw.days[day], 60, '写入学学习日桶');
  assert.equal(stats.getReadTimeStats(wiki).todaySeconds, 60, '读回同一学习日');
});
