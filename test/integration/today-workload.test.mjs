/*
today-workload.test.mjs — 「今天」待学负荷与每日额度截断（口径都在 core，widget 只渲染）

测试直接打 core/stats.todayWorkload：widget 不再导出内部计数函数（分层：widgets 只做 DOM）。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { learningDayInstant, twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-today-workload-' });
let stats, config, sched, ns;

test.before(() => {
  stats = mod('core/stats.js');
  config = mod('core/config.js');
  sched = mod('core/scheduler.js');
  ns = mod('core/ns.js');
});

test.beforeEach(() => {
  reset({ alsoSystem: ['$:/Deck/', ns.DAILY_QUOTA_STATE_TITLE, ns.NEW_PER_DAY_TITLE, ns.REVIEWS_PER_DAY_TITLE] });
});

function mkCard(title, state, due) {
  wiki.addTiddler({
    title,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    caption: `${title}？`,
    text: '答案',
    state: String(state),
    due: due || twDate(),
    'tidme.priority': '50',
  });
}

test('todayWorkload: 待学卡数受每日剩余额度截断，避免全量卡池压迫感', () => {
  const pastDue = '20260901000000000';

  // 创建 50 张新卡 (state=0)
  for (let i = 1; i <= 50; i++) {
    mkCard(`新卡${i}`, 0);
  }
  // 创建 10 张到期复习卡 (state=2)
  for (let i = 1; i <= 10; i++) {
    mkCard(`复习卡${i}`, 2, pastDue);
  }
  // 创建 2 张会内学习步卡片 (state=1)
  for (let i = 1; i <= 2; i++) {
    mkCard(`学习步卡${i}`, 1, pastDue);
  }

  // 默认配置：新卡上限 20，复习上限 200
  // 今日待学 = 2(学习步) + 10(全部到期复习卡) + 20(截断后的新卡上限) = 32
  const c1 = stats.todayWorkload(wiki);
  assert.equal(c1.learn, 2);
  assert.equal(c1.due, 10);
  assert.equal(c1.newly, 20, '新卡受每日额度截断为 20');
  assert.equal(c1.todayToStudy, 32, '今日待学任务量为 32，而非全池 62');
  assert.equal(c1.totalPool, 62, '卡库全池仍准确统计为 62');

  // 今日已引入 15 张新卡 → 剩余新卡额度 5，且复习预算被这 15 张占用（Anki limits.rs）
  for (let i = 0; i < 15; i++) {
    sched.recordDailyQuota(wiki, 'new', new Date());
  }

  const c2 = stats.todayWorkload(wiki);
  assert.equal(c2.newly, 5, '扣除今日已引入新卡后剩余 5');
  assert.equal(c2.todayToStudy, 17, '今日剩余待学量动态减少为 17');
});

test('todayWorkload: 与「开始学习」实际队列同口径（含当日搁置排除）', () => {
  const deckEngine = mod('core/deck-engine.js');
  const now = new Date();
  mkCard('今日新卡', 0, twDate(new Date(now.getTime() - 1000)));
  mkCard('今日搁置新卡', 0, twDate(new Date(now.getTime() - 1000)));

  const ctx = sched.learningDayContext(wiki, now);
  wiki.addTiddler({ ...wiki.getTiddler('今日搁置新卡').fields, [ns.BURIED_FIELD]: ctx.learningDay });

  const workload = stats.todayWorkload(wiki);
  const limits = sched.resolveDailyLimits(wiki);
  const queue = deckEngine.composeGlobalLearningQueue((f) => [...wiki.filterTiddlers(f)], {
    newLimit: limits.newLimit,
    reviewLimit: limits.reviewLimit,
    learningDay: limits.learningDay,
  });
  assert.equal(workload.newly, queue.filter((t) => t === '今日新卡' || t === '今日搁置新卡').length);
  assert.ok(!queue.includes('今日搁置新卡'), '搁置卡不进队列');
  assert.equal(workload.newly, 1, '展示口径同样排除当日搁置卡');
});

test('reviewCountToday: 按学习日统计日志（与配额账本口径不同，各有其用）', () => {
  const deck = '$:/Deck/default';
  wiki.addTiddler({ title: deck, tags: ['$:/tags/TidmeDeck'] });
  const ctx = sched.learningDayContext(wiki);
  const inDay = learningDayInstant(ctx.learningDay, ctx.rolloverHour);
  wiki.addTiddler({
    title: ns.deckLogTitle(deck),
    type: 'application/json',
    text: JSON.stringify({
      [twDate(inDay)]: { rating: 1 },
      [twDate(new Date(inDay.getTime() - 5 * 86400000))]: { rating: 1 },
    }),
  });
  assert.equal(stats.reviewCountToday(wiki), 1);
});
