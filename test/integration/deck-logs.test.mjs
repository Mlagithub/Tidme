/*
deck-logs.test.mjs — 复习日志（按文件布局）测试（node:test）

- 契约：<deck>/log 单个 data tiddler（键 = 17 位复习时刻，值 = review_log JSON）；按天子路径不算日志
- 修剪：超过保留天数（设置页「复习日志保留天数」）的条目自动清理；0 = 永久保留
- 牌组删除时日志随之清理；今日计数按日期前缀统计
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-logs-' });
const ns = mod('core/ns.js');
const schemaMod = mod('core/schema.js');
const config = mod('core/config.js');
const deckMod = mod('core/deck.js');
const schedMod = mod('core/server/scheduler');
const todayMod = mod('review/widgets/today.js');

const DAY = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  const p = (x, l = 2) => String(x).padStart(l, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
};

/** 按单文件契约播种：<deck>/log data tiddler，键 = 天 + 时刻 */
function seedLog(deck, entries) {
  const data = {};
  for (const [day, time, log] of entries) data[day + time] = log;
  wiki.addTiddler({ title: ns.deckLogTitle(deck), type: 'application/json', text: JSON.stringify(data) });
}

test('ns: 日志契约 —— <deck>/log 单文件，按天子路径不算日志', () => {
  assert.equal(ns.isDeckLogTitle('$:/Deck/词书A/log'), true);
  assert.equal(ns.isDeckLogTitle('$:/Deck/词书A/log/20260906'), false);
  assert.equal(ns.deckLogTitle('$:/Deck/词书A'), '$:/Deck/词书A/log');
});

test('scheduler: 超过保留天数的条目自动修剪（0 = 永久保留）', () => {
  const deck = '$:/Deck/修剪书';
  wiki.addTiddler({ title: deck, tags: ['$:/tags/TidmeDeck'] });
  config.writeLogRetentionDays(wiki, 7);
  seedLog(deck, [[DAY(2), '090000000', { rating: 3 }], [DAY(10), '090000000', { rating: 1 }]]);
  schedMod.pruneLogs();
  const log = wiki.getTiddlerData(ns.deckLogTitle(deck)) || {};
  assert.equal(Object.keys(log).length, 1, '10 天前的条目被修剪，2 天前的保留');

  config.writeLogRetentionDays(wiki, 0);
  const data = wiki.getTiddlerData(ns.deckLogTitle(deck)) || {};
  data[DAY(30) + '090000000'] = { rating: 2 };
  wiki.addTiddler({ title: ns.deckLogTitle(deck), type: 'application/json', text: JSON.stringify(data) });
  schedMod.pruneLogs();
  const log2 = wiki.getTiddlerData(ns.deckLogTitle(deck)) || {};
  assert.ok(Object.keys(log2).length >= 2, '0 = 永久保留不修剪');
});

test('deck: 删除牌组时复习日志随之清理', () => {
  const deckTitle = deckMod.createDeck(wiki, { name: '日志随删书', card: '[all[]match[不存在]]' });
  wiki.addTiddler({ title: ns.deckLogTitle(deckTitle), type: 'application/json', text: JSON.stringify({ '20260906090000000': { rating: 3 } }) });
  deckMod.deleteDeck(wiki, deckTitle);
  assert.equal(wiki.getTiddler(ns.deckLogTitle(deckTitle)), undefined, '日志已随牌组删除');
});

test('today: 今日复习计数 —— 单文件按日期前缀统计', () => {
  const deck = '$:/Deck/计数书';
  wiki.addTiddler({ title: deck, tags: ['$:/tags/TidmeDeck'] });
  const key = schemaMod.todayKey();
  wiki.addTiddler({
    title: ns.deckLogTitle(deck),
    type: 'application/json',
    text: JSON.stringify({ [`${key}093015123`]: { rating: 3 }, [`${key}100001000`]: { rating: 2 }, '20260101090000000': { rating: 1 } }),
  });
  assert.equal(todayMod.todayReviewCount(wiki), 2, '只计今天的条目');
});
