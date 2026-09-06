/*
session.test.mjs — 学习会话读写收口（core/session）语义补全

study-mode.test.mjs 已覆盖 isSessionActive / getActiveStudy / endSession 三清；
本文件锁定其余入口：set/get 往返、removeFromSession、clearSession、
advanceSession 推进语义（消除 1:1 死循环的关键：cur 之后找，不回选）。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { FUTURE, PAST } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-session-' });
const session = mod('core/session.js');

function mkCard(title, { due = PAST() } = {}) {
  wiki.addTiddler({ title, 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '2', due });
}

test('setSession/getSession: 往返读写，list 为空时不建会话', () => {
  reset();
  session.setSession(wiki, { list: ['卡甲', '卡乙'], mode: 'items-only', currentIndex: '0' });
  const s = session.getSession(wiki);
  assert.deepEqual([...s.list], ['卡甲', '卡乙']);
  assert.equal(s.mode, 'items-only');
  assert.equal(s.currentIndex, '0');

  session.setSession(wiki, { list: [] });
  assert.equal(session.getSession(wiki), null, '空 list → 无会话');
});

test('removeFromSession: 移除指定卡；不在会话时无操作并返回 false', () => {
  reset();
  session.setSession(wiki, { list: ['卡甲', '卡乙', '卡丙'] });
  assert.equal(session.removeFromSession(wiki, '卡乙'), true);
  assert.deepEqual([...session.getSession(wiki).list], ['卡甲', '卡丙']);
  assert.equal(session.removeFromSession(wiki, '不在'), false, '不存在的卡返回 false');
  assert.deepEqual([...session.getSession(wiki).list], ['卡甲', '卡丙'], '无操作');
});

test('clearSession: 删除会话 tiddler，无会话时安全', () => {
  reset();
  session.setSession(wiki, { list: ['卡甲'] });
  session.clearSession(wiki);
  assert.equal(session.getSession(wiki), null);
  session.clearSession(wiki); // 幂等
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

  session.clearSession(wiki);
  assert.equal(session.advanceSession(wiki, null), null, '无会话 → null');
});

test('advanceSession: 自定义 canLearn 生效（如按 kind 分流）', () => {
  reset();
  session.setSession(wiki, { list: ['甲', '乙', '丙'] });
  const next = session.advanceSession(wiki, '甲', (t) => t === '丙');
  assert.equal(next, '丙', 'canLearn 决定可学集合');
});
