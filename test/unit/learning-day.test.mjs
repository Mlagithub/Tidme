/*
learning-day.test.mjs — 学习日与 Rollover 换天时刻测试
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-day-' });
const schema = mod('core/schema.js');
const config = mod('core/config.js');
const ns = mod('core/ns.js');
const todayMod = mod('review/widgets/today.js');
const stats = mod('core/stats.js');

test('learningDayOf: 基础日期计算与补零', () => {
  const d = new Date(2026, 4, 9, 12, 0, 0); // 2026-05-09 12:00
  assert.equal(schema.learningDayOf(d, 4), '20260509');
});

test('learningDayOf: 凌晨换天前属于前一天（对标 Anki 凌晨 4 点换天）', () => {
  // 本地 2026-09-11 02:30 AM
  const night = new Date(2026, 8, 11, 2, 30, 0);
  assert.equal(schema.learningDayOf(night, 4), '20260910', '02:30 且换天点为 4 点时，计为前一天 20260910');

  // 本地 2026-09-11 04:05 AM
  const morning = new Date(2026, 8, 11, 4, 5, 0);
  assert.equal(schema.learningDayOf(morning, 4), '20260911', '04:05 已过换天点，计为新一天 20260911');

  // 若换天点设为 0（零点切天）
  assert.equal(schema.learningDayOf(night, 0), '20260911', '换天点为 0 时 02:30 计为新一天');
});

test('learningDayOf: 跨年换天边界', () => {
  // 元旦凌晨 2026-01-01 01:00 AM
  const newYear = new Date(2026, 0, 1, 1, 0, 0);
  assert.equal(schema.learningDayOf(newYear, 4), '20251231', '跨年凌晨计入前一年除夕日');
});

test('config: readRolloverHour 默认值与边界限制', () => {
  assert.equal(config.readRolloverHour(wiki), 4, '默认 4 点');
  config.writeRolloverHour(wiki, 6);
  assert.equal(config.readRolloverHour(wiki), 6, '可自定义为 6 点');
  config.writeRolloverHour(wiki, -5);
  assert.equal(config.readRolloverHour(wiki), 0, '负数 clamp 到 0');
  config.writeRolloverHour(wiki, 25);
  assert.equal(config.readRolloverHour(wiki), 23, '超范围 clamp 到 23');
});

test('today: reviewCountToday 支持按学习日统计（实现已下沉 core/stats）', () => {
  const deck = '$:/Deck/学习日测试书';
  wiki.addTiddler({ title: deck, tags: ['$:/tags/TidmeDeck'] });
  // 注入现在时刻
  const now = new Date();
  const keyNow = schema.twDateString(now);

  wiki.addTiddler({
    title: ns.deckLogTitle(deck),
    type: 'application/json',
    text: JSON.stringify({
      [keyNow]: { rating: 3 },
      '20200101000000000': { rating: 1 },
    }),
  });

  assert.equal(stats.reviewCountToday(wiki), 1, '当前学习日的记录被准确计入');
});
