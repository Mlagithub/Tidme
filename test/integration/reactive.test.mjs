/*
reactive.test.mjs — 刷新谓词与重建合并测试（node:test）

- hasCardDataChange（列表类精化谓词）：卡片/牌组配置/续读点/文档页相关；
  复习日志（<deck>/log/）、牌组学习列表、会话写入不相关（评分一次连写 4+ tiddler，
  列表不展示日志/会话——排除后每次评分少重建一半以上）
- hasRelevantChange（宽谓词）：日志仍相关（统计面板/Today 反馈条要读）
- rebuildSoon：同一宏任务内的多次登记合并为一次重建
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-reactive-' });
const reactive = mod('core/reactive.js');

test('reactive: hasCardDataChange 精化谓词 —— 卡片/牌组配置/续读点相关，日志/会话/学习列表不相关', () => {
  wiki.addTiddler({ title: 'Tidme/Decks/书/卡1', 'tidme.kind': 'item', state: '2', due: '20261231000000000' });
  wiki.addTiddler({ title: '$:/Deck/default/log/20260906', type: 'application/json', text: '{}' });
  wiki.addTiddler({ title: '$:/Deck/词书A', tags: ['$:/tags/TidmeDeck'], card: '[all[]match[x]]' });
  wiki.addTiddler({ title: '$:/Deck/词书A/study', list: ['x'] });
  wiki.addTiddler({ title: '$:/state/tidme/learning-session', list: ['x'] });

  const ch = (t) => ({ [t]: { modified: true } });
  assert.equal(reactive.hasCardDataChange(wiki, ch('Tidme/Decks/书/卡1')), true, '卡片变化相关');
  assert.equal(reactive.hasCardDataChange(wiki, ch('$:/Deck/default/log/20260906')), false, '复习日志不重建列表');
  assert.equal(reactive.hasCardDataChange(wiki, ch('$:/Deck/词书A')), true, '牌组配置相关');
  assert.equal(reactive.hasCardDataChange(wiki, ch('$:/Deck/词书A/study')), false, '学习列表不重建列表');
  assert.equal(reactive.hasCardDataChange(wiki, ch('$:/state/tidme/learning-session')), false, '会话写入不重建列表');
  assert.equal(reactive.hasCardDataChange(wiki, ch('$:/config/tidme/readpoint/global')), true, '续读点相关');
  // 宽谓词：日志/会话仍相关（统计面板与 Today 反馈条要读日志）
  assert.equal(reactive.hasRelevantChange(wiki, ch('$:/Deck/default/log/20260906')), true);
  assert.equal(reactive.hasRelevantChange(wiki, ch('$:/state/tidme/learning-session')), true);
});

test('reactive: 删除事件一律按相关处理（宽谓词与精化谓词一致）', () => {
  const changed = { 'Tidme/Decks/书/被删卡': { deleted: true } };
  assert.equal(reactive.hasCardDataChange(wiki, changed), true);
  assert.equal(reactive.hasRelevantChange(wiki, changed), true);
});

test('reactive: rebuildSoon —— 同一宏任务内多次登记合并为一次重建，不同回调各执行一次', async () => {
  let a = 0;
  let b = 0;
  const fa = () => {
    a += 1;
  };
  const fb = () => {
    b += 1;
  };
  assert.equal(reactive.rebuildSoon(fa), true, '返回 true（DOM 由延迟回调接管）');
  reactive.rebuildSoon(fa); // 同回调去重
  reactive.rebuildSoon(fb);
  assert.equal(a, 0, '重建延迟到宏任务，不同步执行');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(a, 1, '同回调合并为一次');
  assert.equal(b, 1, '不同回调各执行一次');
});
