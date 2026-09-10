/*
session.test.mjs — 学习会话读写收口（core/session）语义补全

study-mode.test.mjs 已覆盖 getActiveStudy / endSession 三清；
本文件锁定其余入口：set/get 往返、removeFromSession、空 list 清空、
advanceSession 推进语义（消除 1:1 死循环的关键：cur 之后找，不回选），
以及专注计时锚点的生命周期（进入写、换卡/评分/结束学习结算）。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { FUTURE, PAST, twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-session-' });
const session = mod('core/session.js');
const stats = mod('core/stats.js');
const ns = mod('core/ns.js');

function mkCard(title, { due = PAST(), doc = '', kind = 'item' } = {}) {
  wiki.addTiddler({
    title,
    'tidme.kind': kind,
    'tidme.subkind': 'qa',
    state: '2',
    due,
    ...(doc ? { 'tidme.doc': doc } : {}),
  });
}

/** 锚点相关用例共用清场：锚点与阅读时长 tiddler 都带 $:/ 前缀，reset 默认不动它们 */
function resetFocus() {
  reset({ alsoSystem: [ns.CARD_OPEN_AT_TITLE, stats.READTIME_TIDDLER] });
}

test('setSession/getSession: 往返读写，list 为空时删除会话 tiddler（无残骸）', () => {
  reset();
  session.setSession(wiki, { list: ['卡甲', '卡乙'], mode: 'items-only', currentIndex: '0' });
  const s = session.getSession(wiki);
  assert.deepEqual([...s.list], ['卡甲', '卡乙']);
  assert.equal(s.mode, 'items-only');
  assert.equal(s.currentIndex, '0');

  session.setSession(wiki, { list: [] });
  assert.equal(session.getSession(wiki), null, '空 list → 无会话');
  assert.equal(wiki.getTiddler(session.SESSION_TIDDLER), undefined, '空 list 不留下会话 tiddler（曾经会留残骸）');
});

test('getActiveStudy: modified 为 Date 对象与 17 位串时排序一致（不依赖非规范日期解析）', () => {
  reset({ alsoSystem: ['$:/Deck/'] });
  const older = new Date('2026-01-01T00:00:00Z');
  const newer = new Date('2026-06-01T00:00:00Z');
  // 两个牌组会话：一个用 Date（TW 原生 modified），一个用 17 位串
  wiki.addTiddler({ title: '$:/Deck/串牌组', tags: ['$:/tags/TidmeDeck'], card: '[tidme.kind[item]]' });
  wiki.addTiddler({ title: '$:/Deck/串牌组/study', list: ['甲'], modified: twDate(newer) });
  wiki.addTiddler({ title: '$:/Deck/日期牌组', tags: ['$:/tags/TidmeDeck'], card: '[tidme.kind[item]]' });
  wiki.addTiddler({ title: '$:/Deck/日期牌组/study', list: ['乙'], modified: older });
  const a = session.getActiveStudy(wiki);
  assert.equal(a.deckTitle, '$:/Deck/串牌组', '按 modified 取最新（17 位串形态）');

  // 交换时间：Date 形态的牌组更新 → 应被选中（若 String(Date) 解析失败会恒选第一个）
  wiki.addTiddler({ title: '$:/Deck/日期牌组/study', list: ['乙'], modified: new Date('2026-12-01T00:00:00Z') });
  const b = session.getActiveStudy(wiki);
  assert.equal(b.deckTitle, '$:/Deck/日期牌组', 'Date 形态的 modified 也参与排序');
});

test('removeFromSession: 移除指定卡；不在会话时无操作并返回 false', () => {
  reset();
  session.setSession(wiki, { list: ['卡甲', '卡乙', '卡丙'] });
  assert.equal(session.removeFromSession(wiki, '卡乙'), true);
  assert.deepEqual([...session.getSession(wiki).list], ['卡甲', '卡丙']);
  assert.equal(session.removeFromSession(wiki, '不在'), false, '不存在的卡返回 false');
  assert.deepEqual([...session.getSession(wiki).list], ['卡甲', '卡丙'], '无操作');
});

test('setSession 空 list 幂等清空（原 clearSession 的唯一用途）', () => {
  reset();
  session.setSession(wiki, { list: ['卡甲'] });
  session.setSession(wiki, { list: [] });
  assert.equal(session.getSession(wiki), null);
  session.setSession(wiki, { list: [] }); // 幂等
  assert.equal(session.getSession(wiki), null);
});

test('advanceSession: 默认 canLearn=isDueNow —— cur 之后推进，跳过出队与未来排期', () => {
  reset();
  mkCard('会话卡A', { due: PAST() });
  mkCard('会话卡B', { due: FUTURE() }); // 未来排期 → 跳过
  mkCard('会话卡C', { due: PAST() });
  mkCard('会话卡D', { due: PAST() });
  wiki.addTiddler({ title: '会话卡D', 'tidme.ignored': 'yes' }); // 出队 → 跳过
  session.setSession(wiki, { list: ['会话卡A', '会话卡B', '会话卡C', '会话卡D'] });

  assert.equal(session.advanceSession(wiki, '会话卡A'), '会话卡C', 'cur 之后跳过 B/D → C');
  assert.equal(session.advanceSession(wiki, '会话卡C'), null, '其后无可学 → null');
});

test('advanceSession: cur 不在会话 → 从头找；无会话 → null', () => {
  reset();
  mkCard('会话卡A', { due: PAST() });
  mkCard('会话卡B', { due: PAST() });
  session.setSession(wiki, { list: ['会话卡A', '会话卡B'] });
  assert.equal(session.advanceSession(wiki, '不在列表'), '会话卡A', '从头找');

  session.setSession(wiki, { list: [] }); // 空 list = 结束会话
  assert.equal(session.advanceSession(wiki, null), null, '无会话 → null');
});

test('advanceSession: 自定义 canLearn 生效（如按 kind 分流）', () => {
  reset();
  session.setSession(wiki, { list: ['甲', '乙', '丙'] });
  const next = session.advanceSession(wiki, '甲', (t) => t === '丙');
  assert.equal(next, '丙', 'canLearn 决定可学集合');
});

// ---------- 专注计时锚点（P1-7：进入写 / 换卡先结算 / 评分消费 / 结束学习结算） ----------

test('enterCard: 换卡先结算上一张，两段时长都记入（锚点后写不再覆盖丢失）', () => {
  resetFocus();
  mkCard('卡甲', { doc: 'docA' });
  mkCard('卡乙', { doc: 'docB' });
  const t0 = new Date('2026-09-10T01:00:00Z');

  session.enterCard(wiki, '卡甲', t0);
  assert.equal(wiki.getTiddler(ns.CARD_OPEN_AT_TITLE).fields.card, '卡甲', '锚点记录归属卡');

  session.enterCard(wiki, '卡乙', new Date('2026-09-10T01:00:20Z'));
  assert.equal(stats.getReadTimeStats(wiki).docSeconds.docA, 20, '上一张的 20 秒归卡甲的文档');
  assert.equal(wiki.getTiddler(ns.CARD_OPEN_AT_TITLE).fields.card, '卡乙', '锚点换成新卡');

  assert.equal(session.consumeFocusAnchor(wiki, '卡乙', new Date('2026-09-10T01:00:35Z')), 15, '评分消费返回本卡秒数');
  assert.equal(stats.getReadTimeStats(wiki).docSeconds.docB, 15, '本卡 15 秒归卡乙的文档');
  assert.equal(wiki.getTiddler(ns.CARD_OPEN_AT_TITLE), undefined, '消费后锚点删除');
});

test('consumeFocusAnchor: 锚点归属别的卡 → 归还给它，本卡记 0（不把上一张算到本卡）', () => {
  resetFocus();
  mkCard('卡甲', { doc: 'docA' });
  mkCard('卡乙', { doc: 'docB' });
  const t0 = new Date('2026-09-10T01:00:00Z');
  session.touchFocusAnchor(wiki, '卡甲', t0);

  // 评分入口绕过导航（例如会话里直接对另一张卡评分）
  const sec = session.consumeFocusAnchor(wiki, '卡乙', new Date('2026-09-10T01:00:30Z'));
  assert.equal(sec, 0, '本卡无锚点 → 0');
  assert.equal(stats.getReadTimeStats(wiki).docSeconds.docA, 30, '上一张的 30 秒回归它自己的文档');
  assert.equal(stats.getReadTimeStats(wiki).docSeconds.docB, undefined, '不写给本卡');
  assert.equal(wiki.getTiddler(ns.CARD_OPEN_AT_TITLE), undefined, '锚点已结算删除');
});

test('touchFocusAnchor: 同一张卡重复进入不重置起点（重渲染不清零）', () => {
  resetFocus();
  mkCard('卡甲', { doc: 'docA' });
  session.enterCard(wiki, '卡甲', new Date('2026-09-10T01:00:00Z'));
  session.touchFocusAnchor(wiki, '卡甲', new Date('2026-09-10T01:05:00Z')); // 同卡再次进入

  assert.equal(
    session.consumeFocusAnchor(wiki, '卡甲', new Date('2026-09-10T01:00:30Z')),
    30,
    '起点仍是首次进入时刻（若被覆盖会算成负值/0）',
  );
});

test('touchFocusAnchor: 非 item 卡只结算不写锚点（阅读时长归阅读器自己的计时）', () => {
  resetFocus();
  mkCard('卡甲', { doc: 'docA' });
  mkCard('阅读节卡', { doc: 'docB', kind: 'topic' });
  session.touchFocusAnchor(wiki, '卡甲', new Date('2026-09-10T01:00:00Z'));
  session.touchFocusAnchor(wiki, '阅读节卡', new Date('2026-09-10T01:00:10Z'));

  assert.equal(wiki.getTiddler(ns.CARD_OPEN_AT_TITLE), undefined, 'topic 卡不起锚点');
  assert.equal(stats.getReadTimeStats(wiki).docSeconds.docA, 10, '离开卡甲时它的 10 秒已结算');
});

test('consumeFocusAnchor: 超上限的段整段丢弃并告警（不 clamp 成上限值）', () => {
  resetFocus();
  mkCard('挂机卡', { doc: 'docA' });
  const t0 = new Date('2026-09-10T01:00:00Z');
  session.touchFocusAnchor(wiki, '挂机卡', t0);

  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    const sec = session.consumeFocusAnchor(wiki, '挂机卡', new Date(t0.getTime() + 3 * 3600 * 1000));
    assert.equal(sec, 0, '3 小时挂机段丢弃');
  } finally {
    console.warn = origWarn;
  }
  assert.equal(stats.getReadTimeStats(wiki).totalSeconds, 0, '丢弃即不计入统计（clamp 会记成上限）');
  assert.equal(warns.length, 1, '异常段有一条告警（可观测，不静默）');
  assert.match(warns[0], /专注段超上限/);
});

test('consumeFocusAnchor: 同秒内快刷保底 1 秒（产品口径：评过卡不显示专注 0 秒）', () => {
  resetFocus();
  mkCard('快刷卡', { doc: 'docA' });
  const t0 = new Date('2026-09-10T01:00:00Z');
  session.touchFocusAnchor(wiki, '快刷卡', t0);
  assert.equal(session.consumeFocusAnchor(wiki, '快刷卡', new Date(t0.getTime() + 200)), 1);
  assert.equal(stats.getReadTimeStats(wiki).totalSeconds, 1);
});

test('endSession: 结算未评分的锚点后再清场（最后一张的时长不随 $:/temp 消失）', () => {
  resetFocus();
  mkCard('卡甲', { doc: 'docA' });
  session.setSession(wiki, { list: ['卡甲'], mode: 'items-only' });
  session.touchFocusAnchor(wiki, '卡甲'); // 锚点取真实当前时刻（endSession 内部也用当前时刻）
  // 用真实 now 结算：时长注入不可行（endSession 内部取当前时刻），故只断言"记进去了"
  session.endSession(wiki);
  assert.equal(wiki.getTiddler(ns.CARD_OPEN_AT_TITLE), undefined, '清场带走锚点');
  assert.ok(stats.getReadTimeStats(wiki).totalSeconds >= 1, '结束学习前的那段时长已结算');
});
