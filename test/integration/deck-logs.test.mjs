/*
deck-logs.test.mjs — 复习日志布局 v2（按文件）测试（node:test）

- 契约：<deck>/log 单个 data tiddler（键 = 17 位复习时刻，值 = review_log JSON）
- 迁移：旧版按天日志（<deck>/log/<YYYYMMDD>）启动时合并进单文件并删除旧 tiddler
- 修剪：超过保留天数（设置页「复习日志保留天数」）的条目自动清理；0 = 永久保留
- 牌组删除时日志随之清理；今日计数按日期前缀统计
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-logs-' });
const ns = mod('core/ns.js');
const config = mod('core/config.js');
const deckMod = mod('core/deck.js');
const schedMod = mod('core/server/scheduler');
const todayMod = mod('review/widgets/today.js');

const DAY = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  const p = (x, l = 2) => String(x).padStart(l, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
};

function seedLegacy(deck, day, entries) {
  const data = {};
  for (const [time, log] of entries) data[time] = log;
  wiki.addTiddler({ title: `${deck}/log/${day}`, type: 'application/json', text: JSON.stringify(data) });
}

test('ns: 日志契约 v2 —— <deck>/log 单文件；旧版按天布局已废弃', () => {
  assert.equal(ns.isDeckLogTitle('$:/Deck/词书A/log'), true);
  assert.equal(ns.isDeckLogTitle('$:/Deck/词书A/log/20260906'), false);
  assert.equal(ns.deckLogTitle('$:/Deck/词书A'), '$:/Deck/词书A/log');
});

test('scheduler: 旧版按天日志迁移合并进单文件并删除旧 tiddler', () => {
  const deck = '$:/Deck/迁移书';
  wiki.addTiddler({ title: deck, tags: ['$:/tags/TidmeDeck'] });
  seedLegacy(deck, DAY(1), [['093015123', { rating: 3 }], ['100001000', { rating: 2 }]]);
  seedLegacy(deck, DAY(2), [['080000000', { rating: 1 }]]);
  schedMod.migrateAndPruneLogs();
  const log = wiki.getTiddlerData(ns.deckLogTitle(deck)) || {};
  const keys = Object.keys(log).sort();
  assert.equal(keys.length, 3, '两天共 3 条合并为 3 键');
  assert.deepEqual(keys.map((k) => k.slice(0, 8)).sort(), [DAY(1), DAY(1), DAY(2)].sort(), '键以日期开头');
  assert.equal(wiki.getTiddler(`${deck}/log/${DAY(1)}`), undefined, '旧按天 tiddler 已删除');
});

test('scheduler: 超过保留天数的条目自动修剪（0 = 永久保留）', () => {
  const deck = '$:/Deck/修剪书';
  wiki.addTiddler({ title: deck, tags: ['$:/tags/TidmeDeck'] });
  config.writeLogRetentionDays(wiki, 7);
  seedLegacy(deck, DAY(2), [['090000000', { rating: 3 }]]);
  seedLegacy(deck, DAY(10), [['090000000', { rating: 1 }]]);
  schedMod.migrateAndPruneLogs();
  const log = wiki.getTiddlerData(ns.deckLogTitle(deck)) || {};
  assert.deepEqual(Object.keys(log).length, 1, '10 天前的条目被修剪，2 天前的保留');
  config.writeLogRetentionDays(wiki, 0);
  seedLegacy(deck, DAY(30), [['090000000', { rating: 2 }]]);
  schedMod.migrateAndPruneLogs();
  const log2 = wiki.getTiddlerData(ns.deckLogTitle(deck)) || {};
  assert.ok(Object.keys(log2).length >= 2, '0 = 永久保留不修剪');
});

test('deck: 删除牌组时复习日志随之清理', () => {
  const deckTitle = deckMod.createDeck(wiki, { name: '日志随删书', card: '[all[]match[不存在]]' });
  wiki.addTiddler({ title: ns.deckLogTitle(deckTitle), type: 'application/json', text: JSON.stringify({ '20260906090000000': { rating: 3 } }) });
  deckMod.deleteDeck(wiki, deckTitle);
  assert.equal(wiki.getTiddler(ns.deckLogTitle(deckTitle)), undefined, '日志已随牌组删除');
});

test('today: 今日复习计数 —— v2 单文件按日期前缀统计', () => {
  const deck = '$:/Deck/计数书';
  wiki.addTiddler({ title: deck, tags: ['$:/tags/TidmeDeck'] });
  const key = ns.todayKey();
  wiki.addTiddler({
    title: ns.deckLogTitle(deck),
    type: 'application/json',
    text: JSON.stringify({ [`${key}093015123`]: { rating: 3 }, [`${key}100001000`]: { rating: 2 }, '20260101090000000': { rating: 1 } }),
  });
  assert.equal(todayMod.todayReviewCount(wiki), 2, '只计今天的条目');
});
