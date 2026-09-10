/*
scheduler.test.mjs — core 调度体系单元测试（node:test）

覆盖：优先级归一化/三档随机、批量操作补丁、autoPostpone 语义（保留 top N、顺延低优先级逾期）。
一个 test 只回答一个问题。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { FUTURE, PAST, T } from '../helpers/tw-date.mjs';

// core/scheduler 运行时 require core/schema（铁律：core 跨模块引用禁 ES import，会被 esbuild
// 内联成第二份实现），故与 test/integration 同源：走 bin 产物 + 真实 TW boot。
// 注意：产物来自 vm 沙箱，返回的数组/对象是跨 realm 值——断言前先展开（AGENTS 已知陷阱）。
const { mod } = bootPlugin({ prefix: 'tidme-sched-' });
const sched = mod('core/scheduler.js');
const schema = mod('core/schema.js');

test('normalizePriority: 边界与非法值', () => {
  assert.equal(sched.normalizePriority(0), 0);
  assert.equal(sched.normalizePriority(100), 100);
  assert.equal(sched.normalizePriority(150), 100);
  assert.equal(sched.normalizePriority(-5), 0);
  assert.equal(sched.normalizePriority('30'), 30);
  assert.equal(sched.normalizePriority(undefined), 50);
  assert.equal(sched.normalizePriority('abc'), 50);
});

test('tierRandom: 三档落在合理区间', () => {
  for (let i = 0; i < 50; i++) {
    const h = sched.tierRandom('high', 8);
    const l = sched.tierRandom('low', 8);
    assert.ok(h >= 0 && h <= 25, `high 应在 0-25，实际 ${h}`);
    assert.ok(l >= 75 && l <= 100, `low 应在 75-100，实际 ${l}`);
  }
});

test('priorityDeltaForRating: 评分 → 优先级调整量（SM: pass grades 降优先）', () => {
  assert.equal(sched.priorityDeltaForRating('Again'), 0, 'Again 不动优先级（遗忘靠间隔重学）');
  assert.equal(sched.priorityDeltaForRating('Hard'), 0, 'Hard 不动优先级');
  assert.equal(sched.priorityDeltaForRating('Good'), 5, 'Good 及格降优先');
  assert.equal(sched.priorityDeltaForRating('Easy'), 10, 'Easy 及格降更多');
  assert.equal(sched.priorityDeltaForRating('3'), 5, '数字 rating 兼容');
  assert.equal(sched.priorityDeltaForRating('X'), 0, '未知 rating 不动');
  assert.equal(sched.priorityDeltaForRating('Again', { enable: false }), 0, 'enable:false 关闭');
  assert.equal(sched.priorityDeltaForRating('Again', { again: -20 }), -20, '配置可覆盖（自定义升优先）');
});

test('shiftPriority: 缺省 50 起步并 clamp 到 0-100（字符串字段值与位移）', () => {
  assert.equal(sched.shiftPriority(50, -10), '40', '升优先');
  assert.equal(sched.shiftPriority(5, -10), '0', '下限 clamp');
  assert.equal(sched.shiftPriority(95, 10), '100', '上限 clamp');
  assert.equal(sched.shiftPriority(undefined, 5), '55', '缺省按 50');
  assert.equal(sched.shiftPriority('50', -5), '45', '字符串优先级位移');
  assert.equal(sched.shiftPriority('50', 5), '55');
});

test('postponeCard: 顺延 N 天后 due 落在未来（严重逾期卡相对 now 计算，杜绝顺延后依然逾期）', () => {
  // 1. 严重逾期卡（逾期 10 天）：相对 now 顺延 7 天，due 必须严格落在未来
  const overdueCard = { due: T(-240) };
  const p1 = sched.postponeCard(overdueCard, 7);
  const p1Time = schema.parseTwDate(p1.due).getTime();
  assert.ok(p1Time > Date.now(), '严重逾期卡顺延 7 天后应在未来');
  assert.ok(p1Time >= Date.now() + 6 * 86400000, '相对 now 顺延至少 6 天以上');

  // 2. 未来卡（3 天后到期）：相对卡片本身的 due 顺延 7 天（即 10 天后）
  const futureCard = { due: T(72) };
  const p2 = sched.postponeCard(futureCard, 7);
  const p2Time = schema.parseTwDate(p2.due).getTime();
  assert.ok(p2Time >= Date.now() + 9 * 86400000, '未来卡保持原有排期基准累加');
});

test('advanceCard: due 重置到≈现在（立即到期）', () => {
  const advanced = sched.advanceCard();
  assert.ok(schema.parseTwDate(advanced.due).getTime() <= Date.now() + 60000, 'advance 到期时间≈现在');
});

test('ignoreCard: 返回补丁（不含原字段），合并后出队', () => {
  const fields = { title: '卡', 'tidme.kind': 'item', state: '0' };
  const ignored = sched.ignoreCard();
  assert.equal(ignored['tidme.ignored'], 'yes', '忽略置 tidme.ignored');
  assert.ok(!('title' in ignored) && !('tidme.kind' in ignored), '只返回补丁，不含原字段');
  assert.ok(sched.isCardOutOfQueue({ ...fields, ...ignored }), '合并后 isCardOutOfQueue 为真（出队）');
});

test('doneCard: 返回补丁，合并后出队且 kind 保留', () => {
  const done = sched.doneCard();
  assert.deepEqual({ ...done }, { 'tidme.done': 'yes' }, 'done 补丁只有一键');
  const merged = { ...{ title: '节', 'tidme.kind': 'topic', state: '0' }, ...done };
  assert.equal(merged['tidme.kind'], 'topic', 'kind 经合并保留');
  assert.ok(sched.isCardOutOfQueue(merged), 'doneCard 后 isCardOutOfQueue 应返回 true');
});

test('restoreCard: 返回删除补丁，合并后可逆恢复（topic/item 同）', () => {
  const restored = sched.restoreCard();
  const base = { title: '节', 'tidme.kind': 'topic', state: '0', 'tidme.done': 'yes', 'tidme.ignored': 'yes', 'tidme.suspended': 'yes' };
  const merged = { ...base, ...restored };
  assert.equal(merged['tidme.done'], undefined, '恢复删除 done');
  assert.equal(merged['tidme.ignored'], undefined, '恢复删除 ignored');
  assert.equal(merged['tidme.suspended'], undefined, '恢复删除 suspended');
  assert.equal(merged['tidme.kind'], 'topic', 'kind 保留（topic 回阅读流）');
  assert.ok(!sched.isCardOutOfQueue(merged), 'restoreCard 后 isCardOutOfQueue 应返回 false');

  const item = { title: '卡', 'tidme.kind': 'item', state: '0', ...sched.doneCard(), ...sched.restoreCard() };
  assert.equal(item['tidme.kind'], 'item', 'item 保留（回复习流）');
  assert.ok(!sched.isCardOutOfQueue(item));
});

test('forgetCard: 重置为新卡（state=0、reps=0）', () => {
  const forgotten = sched.forgetCard();
  assert.equal(forgotten.state, '0');
  assert.equal(forgotten.reps, '0');
});

test('afactorForText: 篇幅启发式（短文快速、长文平缓）', () => {
  assert.equal(sched.afactorForText(100), 2.0);
  assert.equal(sched.afactorForText(799), 2.0);
  assert.equal(sched.afactorForText(1500), 1.6);
  assert.equal(sched.afactorForText(5000), 1.4);
  assert.equal(sched.afactorForText(50000), 1.3);
  assert.equal(sched.afactorForText(0), 1.5);
});

test('normalizeAFactor: 字段容错与越界回默认', () => {
  assert.equal(sched.normalizeAFactor('2.5'), 2.5);
  assert.equal(sched.normalizeAFactor('abc'), 1.5);
  assert.equal(sched.normalizeAFactor(undefined), 1.5);
  assert.equal(sched.normalizeAFactor(99), 1.5, '越界回默认');
  assert.equal(sched.normalizeAFactor('1.0'), 1.0, '下限 1.0 允许');
});

test('postponeTopicByAFactor: 读取卡片 tidme.afactor（字段优先 → 篇幅启发式 → 默认 1.5），且递增 reps', () => {
  const f1 = { due: PAST(), 'tidme.afactor': '2', scheduled_days: '10', reps: '2' };
  const r1 = sched.postponeTopicByAFactor(f1);
  assert.equal(Number(r1.scheduled_days), 20, '10 × 2 = 20');
  assert.equal(r1.reps, '3', 'reps 递增 1（2 -> 3）');
  assert.ok(r1.last_review, '更新 last_review');

  const f2 = { due: PAST(), 'tidme.afactor': '3', scheduled_days: '10' };
  const r2 = sched.postponeTopicByAFactor(f2);
  assert.equal(Number(r2.scheduled_days), 30, '10 × 3 = 30');
  assert.equal(r2.reps, '1', '无 reps 缺省从 0 递增到 1');

  const f3 = { due: PAST(), 'tidme.chars': '100', scheduled_days: '10' };
  assert.equal(Number(sched.postponeTopicByAFactor(f3).scheduled_days), 20, '短文启发式 2.0');
  const f4 = { due: PAST(), scheduled_days: '10' };
  assert.equal(Number(sched.postponeTopicByAFactor(f4).scheduled_days), 15, '无字段默认 1.5');
  // 显式 aFactor 覆盖字段
  const f5 = { due: PAST(), 'tidme.afactor': '2', scheduled_days: '10' };
  assert.equal(Number(sched.postponeTopicByAFactor(f5, 1.5).scheduled_days), 15, '显式参数优先');
  // minDays 兜底
  const f6 = { due: PAST(), 'tidme.afactor': '1.1', scheduled_days: '1' };
  assert.equal(Number(sched.postponeTopicByAFactor(f6).scheduled_days), 3, '最小 3 天');
});

test('顺延时钟可注入：postponeCard / postponeTopicByAFactor 按传入 now 计算（不读真实时钟）', () => {
  const fixed = new Date('2026-03-01T00:00:00Z');

  // 1. 逾期卡：以注入的 now 为基准顺延 7 天（而非卡片自身 due）
  const overdue = sched.postponeCard({ due: '20260101000000000' }, 7, fixed);
  assert.equal(String(overdue.due), '20260308000000000', '逾期卡 = now + 7d');

  // 2. 未来卡：仍以卡片自身 due 为基准累加
  const future = sched.postponeCard({ due: '20260305000000000' }, 7, fixed);
  assert.equal(String(future.due), '20260312000000000', '未来卡 = 自身 due + 7d');

  // 3. Topic 顺延：due = now + 间隔 × A-Factor，last_review 固定为注入时刻
  const topic = sched.postponeTopicByAFactor(
    { due: '20260101000000000', 'tidme.afactor': '2', scheduled_days: '10' },
    undefined,
    3,
    fixed,
  );
  assert.equal(Number(topic.scheduled_days), 20, '10 × A-Factor 2 = 20');
  assert.equal(String(topic.due), '20260321000000000', 'due = now + 20d');
  assert.equal(String(topic.last_review), '20260301000000000', 'last_review = 注入的 now');
});

test('autoPostpone: 保留 top N 高优先级，顺延其余低优先级逾期卡', () => {
  const mk = (title, priority, due) => ({
    title,
    fields: { 'tidme.priority': String(priority), due, 'tidme.kind': 'item', state: '2' },
  });
  const cards = [
    mk('高优A', 5, PAST()),
    mk('高优B', 10, PAST()),
    mk('低优C', 90, PAST()),
    mk('低优D', 80, PAST()),
    mk('未到期E', 90, FUTURE()), // 不应被处理
  ];
  const r = sched.autoPostpone(cards, { maxPriority: 60, postponeDays: 7, keepTop: 2 });
  assert.equal(r.stats.overdue, 4, '4 张逾期（E 未到期排除）');
  assert.equal(r.stats.postponed, 2, '保留 top2（A/B），顺延 C/D');
  assert.deepEqual([...r.patches].map((p) => p.title).sort(), ['低优C', '低优D']);
  for (const p of r.patches) {
    assert.ok(schema.parseTwDate(p.fields.due).getTime() > Date.now(), `${p.title} 被顺延到未来`);
  }
});

test('autoPostpone: 搁置/完成/忽略卡不处理', () => {
  const cards = [
    { title: '搁置', fields: { 'tidme.priority': '90', due: PAST(), 'tidme.kind': 'item', 'tidme.suspended': 'yes' } },
    { title: '已读完', fields: { 'tidme.priority': '90', due: PAST(), 'tidme.kind': 'item', 'tidme.done': 'yes' } },
    { title: '已忽略', fields: { 'tidme.priority': '90', due: PAST(), 'tidme.kind': 'item', 'tidme.ignored': 'yes' } },
  ];
  const r = sched.autoPostpone(cards, { maxPriority: 60, keepTop: 0 });
  assert.deepEqual([...r.patches].map((p) => p.title), [], '已出队状态不顺延');
});

test('autoPostpone: topic 阅读卡按 A-Factor 顺延（SM: auto-postpone 主要作用于 Topics）', () => {
  const cards = [
    { title: '阅读卡', fields: { 'tidme.priority': '90', due: PAST(), 'tidme.kind': 'topic' } },
    { title: '可顺延', fields: { 'tidme.priority': '90', due: PAST(), 'tidme.kind': 'item' } },
  ];
  const r = sched.autoPostpone(cards, { maxPriority: 60, keepTop: 0 });
  assert.deepEqual([...r.patches].map((p) => p.title), ['可顺延', '阅读卡'], 'item 加权 -15 排前，topic 阅读卡同样顺延');
  for (const p of r.patches) {
    assert.ok(schema.parseTwDate(p.fields.due).getTime() > Date.now(), `${p.title} 被顺延到未来`);
  }
  const topicPatch = r.patches.find((p) => p.title === '阅读卡');
  assert.ok(topicPatch.fields.scheduled_days, 'topic 走 A-Factor 展期（写 scheduled_days）');
});

test('isDueNow: 未完成且 due≤now 可调度；无 due = Pending 可读', () => {
  assert.ok(sched.isDueNow({ due: PAST() }), '逾期可调度');
  assert.ok(sched.isDueNow({ due: T(0) }), 'due=now 边界（≤）');
  assert.ok(sched.isDueNow({}), '无 due（Pending）可读');
  assert.ok(!sched.isDueNow({ due: FUTURE() }), '未来排期不可调度（评分/顺延写出）');
  assert.ok(!sched.isDueNow(null), '无字段不可');
});

test('isDueNow: 出队状态（搁置/完成/忽略）不可调度', () => {
  assert.ok(!sched.isDueNow({ due: PAST(), 'tidme.suspended': 'yes' }), '搁置不可');
  assert.ok(!sched.isDueNow({ due: PAST(), 'tidme.done': 'yes' }), '完成不可');
  assert.ok(!sched.isDueNow({ due: PAST(), 'tidme.ignored': 'yes' }), '忽略不可');
});

test('doneCard/restoreCard 补丁合并：topic 出队后可逆恢复', () => {
  const topic = { title: '节', 'tidme.kind': 'topic', state: '0', 'tidme.suspended': 'yes' };
  const done = { ...topic, ...sched.doneCard() };
  assert.equal(done['tidme.done'], 'yes', 'Done 置 tidme.done');
  assert.ok(sched.isCardOutOfQueue(done), 'doneCard 后出队');
  const resumed = { ...done, ...sched.restoreCard() };
  assert.equal(resumed['tidme.suspended'], undefined, '恢复清搁置标记');
  assert.ok(!sched.isCardOutOfQueue(resumed), '恢复后回队');
});

test('isInQueue: 出队三态唯一定义（done/ignored/suspended）+ isCardOutOfQueue 只管已处理', () => {
  const base = { 'tidme.kind': 'item' };
  assert.ok(sched.isInQueue(base), '无标记 → 在队');
  assert.ok(!sched.isInQueue({ ...base, 'tidme.done': 'yes' }), 'done → 不在队');
  assert.ok(!sched.isInQueue({ ...base, 'tidme.ignored': 'yes' }), 'ignored → 不在队');
  assert.ok(!sched.isInQueue({ ...base, 'tidme.suspended': 'yes' }), 'suspended → 不在队');
  assert.ok(!sched.isInQueue(null), '空值 → 不在队');
  // 两个谓词的分工：isCardOutOfQueue 只回答"是否已处理"（进度口径），不含 suspended
  assert.ok(sched.isCardOutOfQueue({ ...base, 'tidme.done': 'yes' }), 'done 属于已处理');
  assert.ok(!sched.isCardOutOfQueue({ ...base, 'tidme.suspended': 'yes' }), 'suspended 不算已处理（可恢复）');
});

test('时钟可注入：comparePriorityMixed / autoPostpone 用传入 now（hybrid 逾期权重可复现）', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const overdue = { title: '逾期', fields: { 'tidme.priority': '80', due: schema.twDateString(new Date('2026-05-01T00:00:00Z')), 'tidme.kind': 'item' } };
  const fresh = { title: '新卡', fields: { 'tidme.priority': '50', due: schema.twDateString(new Date('2026-06-05T00:00:00Z')), 'tidme.kind': 'item' } };
  // 判序唯一实现 = comparePriorityMixed（排序即"两两比较"，不另设排序包装）
  const sorted = [fresh, overdue].sort((a, b) => sched.comparePriorityMixed(a, b, 'hybrid', 0.5, now));
  assert.equal(sorted[0].title, '逾期', '注入时钟下逾期卡因权重排前（且与真实时钟无关）');

  const res = sched.autoPostpone([overdue], { keepTop: 0, maxPriority: 60, maxOverdueThreshold: 0 }, now);
  assert.equal(res.patches.length, 1, '传入 now 时该卡被判定为逾期');
  const dueOut = schema.parseTwDate(res.patches[0].fields.due).getTime();
  assert.ok(dueOut > now.getTime(), '顺延基准 = 注入的 now（而非真实时钟）');
});

test('默认值单一产地：autoPostpone 代码默认 = config 默认；牌组参数默认 = shadow 牌组字段', () => {
  assert.equal(sched.AUTOPOSTPONE_OPTS_DEFAULTS.maxPriority, 60);
  assert.equal(sched.AUTOPOSTPONE_OPTS_DEFAULTS.keepTop, 10);
  assert.equal(sched.POSTPONE_DEFAULT_DAYS, 7);
  assert.equal(sched.TOPIC_MIN_INTERVAL_DAYS, 3);
  assert.equal(sched.AFACTOR_DEFAULT, 1.5);
  assert.equal(sched.DECK_PARAM_DEFAULTS.maximumInterval, 36500, '与 $:/Deck/default 的 p.maximum_interval 同值');
  assert.equal(sched.DECK_PARAM_DEFAULTS.requestRetention, 0.9);
  assert.equal(sched.DECK_PARAM_DEFAULTS.leechThreshold, 8);
});

test('isDueNow: 无法解析的 due 不再伪装成"立即到期"', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(sched.isDueNow({ 'tidme.kind': 'item', due: 'garbage' }, now), false, '脏 due → 不可调度');
  assert.equal(sched.isDueNow({ 'tidme.kind': 'item', due: schema.twDateString(new Date('2026-05-01T00:00:00Z')) }, now), true, '正常逾期 → 可调度');
  assert.equal(sched.isDueNow({ 'tidme.kind': 'item' }, now), true, '无 due（Pending）→ 可读');
  assert.equal(schema.tryParseTwDate('garbage'), null, 'tryParseTwDate 对非法值返回 null');
  assert.equal(schema.tryParseTwDate(''), null);
});

test('ITEM_FILTER: 双轨分流（topic 出、item 进）', () => {
  const f = sched.ITEM_FILTER;
  assert.ok(f.includes('[tidme.kind[item]]'), '含 item 大类');
  assert.ok(!f.includes('topic'), '不含 topic（阅读流）');
  assert.ok(!f.includes('section') && !f.includes('extract') && !f.includes('cloze') && !f.includes('qa'), '不按子类型过滤');
});

test('parseTwDate: 17 位 TW 日期串（UTC 语义，与 $tw.utils.parseDate 一致）', () => {
  const d = schema.parseTwDate('20260824201518283');
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 7); // 8 月（0-based）
  assert.equal(d.getUTCDate(), 24);
  assert.equal(d.getUTCHours(), 20);
  assert.equal(d.getUTCMinutes(), 15);
  assert.equal(d.getUTCSeconds(), 18);
});

test('sortTopicQueue: 优先级（0 最高）→ due（早在前）→ 阅读顺序', () => {
  const mk = (title, priority, due, order) => ({ title, priority, due: schema.parseTwDate(due), order });
  const cards = [
    mk('B', 50, '20270101000000000', '000002'),
    mk('A', 10, '20270201000000000', '000003'),
    mk('C', 50, '20270101000000000', '000001'),
    mk('D', 50, '20260101000000000', '000004'),
  ];
  assert.deepEqual([...sched.sortTopicQueue(cards)].map((c) => c.title), ['A', 'D', 'C', 'B'], '优先级分组内按 due，再按阅读顺序');
});
