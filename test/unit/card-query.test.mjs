/*
card-query.test.mjs — 卡片查询语法（tag:/is:/due:/ivl:/lapses:/deck:/parent: + 自由文本）单元测试

纯函数（core/card-query），不起 widget、不查 wiki。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { mod } = bootPlugin({ prefix: 'tidme-query-' });
const q = mod('core/card-query.js');

const NOW = new Date('2026-09-11T12:00:00Z');
const due = (offsetDays) => {
  const d = new Date(NOW.getTime() + offsetDays * 86400000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}000`;
};

const match = (text, fields, title = '卡甲', ctx = {}) => q.matchCardQuery(fields, title, q.parseCardQuery(text), { now: NOW, ...ctx });

test('parseCardQuery: 识别 key:value 与自由文本，未知 key 退化为文本（不静默无结果）', () => {
  const parsed = q.parseCardQuery('tag:汉字 is:due due:7 lapses:>=8 ivl:<=30 priority:<=20 parent:笔记甲 中药 foo:bar');
  // 跨 realm（vm 沙箱）数组：断言前展开（见 AGENTS 已知陷阱）
  assert.deepEqual([...parsed.tags], ['汉字']);
  assert.deepEqual([...parsed.states], ['due']);
  assert.equal(parsed.dueNotLaterThanDays, 7);
  assert.equal(parsed.lapsesMin, 8);
  assert.equal(parsed.intervalMax, 30);
  assert.equal(parsed.priorityMax, 20);
  assert.equal(parsed.parent, '笔记甲');
  assert.deepEqual([...parsed.text].sort(), ['foo:bar', '中药']);
});

test('matchCardQuery: 状态条件（new/learn/review/due/suspended/ignored/done/buried/leech）', () => {
  const review = { state: '2', due: due(-1), scheduled_days: '10', lapses: '2' };
  assert.equal(match('is:review', review), true);
  assert.equal(match('is:new', review), false);
  assert.equal(match('is:due', review), true, 'state2 且已到期 = due');
  assert.equal(match('is:due', { ...review, due: due(3) }), false, '未到期的复习卡不算 due');
  assert.equal(match('is:due', { ...review, 'tidme.ignored': 'yes' }), false, '出队卡不算 due');
  assert.equal(match('is:due', { ...review, 'tidme.buried': '20260911' }), false, '当日搁置不算 due');
  assert.equal(match('is:due', { ...review, 'tidme.buried': '20260910' }), true, '昨日埋卡次日已失效，不应再排除（曾致 is:due 永久漏卡）');
  assert.equal(match('is:learn', { state: '1' }), true);
  assert.equal(match('is:learn', { state: '3' }), true, '重学步也算 learn');
  assert.equal(match('is:suspended', { 'tidme.suspended': 'yes' }), true);
  assert.equal(match('is:ignored', { 'tidme.ignored': 'yes' }), true);
  assert.equal(match('is:done', { 'tidme.done': 'yes' }), true);
  assert.equal(match('is:buried', { 'tidme.buried': '20260911' }), true);
  assert.equal(match('is:buried', { 'tidme.buried': '20260910' }), false, '过期埋卡不算 buried');
  assert.equal(match('is:leech', { state: '2', lapses: '8' }), true);
  assert.equal(match('is:leech', { state: '2', lapses: '2' }), false);
  assert.equal(match('is:leech', { state: '2', lapses: '0', 'tidme.leech': 'yes' }), true, '触发期落库的标记也认');
});

test('matchCardQuery: 数值与日期条件（due/ivl/stab/diff/lapses/reps/priority）', () => {
  const f = { state: '2', due: due(3), scheduled_days: '21', stability: '45', difficulty: '8.5', lapses: '9', reps: '12', 'tidme.priority': '15' };
  assert.equal(match('due:<=7', f), true);
  assert.equal(match('due:<=1', f), false);
  assert.equal(match('ivl:>=21', f), true);
  assert.equal(match('ivl:<=7', f), false);
  assert.equal(match('stab:>=30', f), true);
  assert.equal(match('diff:>=8', f), true, '难度按 1–10 量纲比较');
  assert.equal(match('lapses:>=8', f), true);
  assert.equal(match('lapses:>=10', f), false);
  assert.equal(match('reps:>=5', f), true);
  assert.equal(match('priority:<=20', f), true);
  assert.equal(match('priority:<=10', f), false);
  assert.equal(match('ivl:>=21', { state: '2', due: due(0) }), false, '缺字段的条件视为不匹配（不猜）');
});

test('matchCardQuery: 标签 / 父源 / 牌组名 / 自由文本', () => {
  const f = { state: '0', tags: ['汉字', '中药'], 'tidme.parent': '笔记甲', 'tidme.breadcrumb': '本草/中药学' };
  assert.equal(match('tag:汉字', f), true);
  assert.equal(match('tag:汉字 tag:中药', f), true, '多个 tag: 为 AND');
  assert.equal(match('tag:西药', f), false);
  assert.equal(match('parent:笔记甲', f), true);
  assert.equal(match('parent:笔记乙', f), false);
  assert.equal(match('中药', f, '卡甲'), true, '自由文本命中面包屑');
  assert.equal(match('中药', f, '卡乙', { deckNamesOf: () => ['中药牌组'] }), true, '自由文本不查牌组名');
  assert.equal(match('deck:中药', f, '卡甲', { deckNamesOf: () => ['中药牌组'] }), true);
  assert.equal(match('deck:西药', f, '卡甲', { deckNamesOf: () => ['中药牌组'] }), false);
  assert.equal(match('deck:中药', f, '卡甲'), false, '无 deckNamesOf 时 deck: 不生效（不误命中）');
});

test('matchCardQuery: 空查询命中一切（视图过滤前的默认态）', () => {
  assert.equal(match('', { state: '0' }), true);
  assert.equal(match('   ', { state: '0' }), true);
});

test('parseCardQuery: 全角冒号「：」与半角同义（中文输入法实测踩坑）', () => {
  const f = { state: '2', due: '20260911000000000', tags: ['中药'], 'tidme.priority': '20', caption: '中药' };
  const now = new Date('2026-09-12T00:00:00Z');
  assert.equal(match('tag：中药', f, '卡甲', { now }), true, '全角冒号的 tag: 正常识别');
  assert.equal(match('TAG：中药', f, '卡甲', { now }), true, 'key 大小写不敏感且兼容全角冒号');
  assert.equal(match('is：due', f, '卡甲', { now }), true, '全角冒号的 is:due 正常识别');
  assert.equal(match('priority：<=20', f, '卡甲', { now }), true, '全角冒号的 priority: 正常识别');
  // 纯自由文本里的全角冒号保持原义（不被误当条件分隔）
  assert.equal(match('本草：纲目', { 'tidme.breadcrumb': '本草：纲目' }, '卡乙', { now }), true, '自由文本中的全角冒号原样匹配');
  assert.equal(match('中药 is：due', f, '卡甲', { now }), true, '全角/半角冒号条件可混用');
});
