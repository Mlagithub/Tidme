/*
today-workload.test.mjs — 「今天」页面待学卡数与配额截断计算测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-today-workload-' });
let todayMod, config, sched, ns;

test.before(() => {
  todayMod = mod('review/widgets/today.js');
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

test('todayCounts: 待学卡数受每日上限配额截断，避免全量卡池压迫感', () => {
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
  // 今日待学 = 2(学习步) + 10(全部10张到期复习卡) + 20(截断后的新卡上限) = 32 张！
  // 而全库总池 = 2 + 10 + 50 = 62 张
  const c1 = todayMod.todayCounts(wiki);
  assert.equal(c1.learn, 2);
  assert.equal(c1.due, 10);
  assert.equal(c1.newly, 20, '新卡受每日配额截断为 20');
  assert.equal(c1.todayToStudy, 32, '今日待学任务量为 32，而非总数 62');
  assert.equal(c1.totalPool, 62, '卡库总池仍准确统计为 62');

  // 当今日已经学习了 15 张新卡时（剩余新卡配额 5 张）
  sched.recordDailyQuota(wiki, true, new Date());
  for (let i = 0; i < 14; i++) {
    sched.recordDailyQuota(wiki, true, new Date());
  }

  const c2 = todayMod.todayCounts(wiki);
  assert.equal(c2.newly, 5, '扣除今日已学新卡后，剩余新卡配额为 5');
  assert.equal(c2.todayToStudy, 17, '今日剩余待学量动态减少为 17');
});
