/*
settings.test.mjs — 设置页（参数集中配置）测试（node:test）

- core/config 三域读写：默认值兜底、合并写不抹键、p 子键合并保留 FSRS 权重
- 设置页渲染 smoke：三分区与关键控件；页面 tiddler 存在且挂载 widget（Today 同源骨架）
- 开关迁移：自动顺延开关集中在设置页（queue-ops 只保留手动触发）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectText, fakeDocument, renderWidget as renderWidgetBase } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-settings-' });
const config = mod('core/config.js');
const ns = mod('core/ns.js');

const AUTO = '$:/config/Tidme/AutoPostpone';
const SS = '$:/config/Tidme/SemanticSplit';
const DECK = '$:/Deck/default';

function renderSettings() {
  return renderWidgetBase(wiki, mod('manager/widgets/settings.js'), 'tidme-settings');
}

test('config: 自动顺延读写 —— 默认值兜底 + 合并写不抹键 + 非法 JSON 宽容', () => {
  const cfg = config.readAutoPostpone(wiki);
  assert.equal(cfg.enable, false, '默认关闭（不自动改用户数据）');
  assert.equal(cfg.maxPriority, 60, '与出厂 shadow 配置一致');
  assert.equal(cfg.postponeDays, 7);
  assert.equal(cfg.keepTop, 10);
  config.writeAutoPostpone(wiki, { enable: true });
  const saved = JSON.parse(wiki.getTiddler(AUTO).fields.text);
  assert.equal(saved.enable, true);
  assert.equal(saved.postponeDays, 7, '局部修改不抹掉其它键');
  wiki.addTiddler({ title: AUTO, type: 'application/json', text: '{bad' });
  assert.equal(config.readAutoPostpone(wiki).enable, false, '非法 JSON 宽容回默认');
});

test('config: 语义切分读写 —— 字段覆盖历史兼容 + 统一写 text JSON', () => {
  wiki.addTiddler({ title: SS, text: JSON.stringify({ enable: true, apiKey: 'json-key' }), apiKey: 'field-key' });
  assert.equal(config.readSemanticSplit(wiki).apiKey, 'field-key', '字段覆盖优先（历史兼容）');
  config.writeSemanticSplit(wiki, { apiKey: 'sk-new', model: 'gpt-4o-mini' });
  const cfg = JSON.parse(wiki.getTiddler(SS).fields.text);
  assert.equal(cfg.apiKey, 'sk-new');
  assert.equal(cfg.model, 'gpt-4o-mini');
  assert.equal(cfg.enable, true, '合并保留 enable');
});

test('config: 默认牌组参数 —— order/leech 直写，retention 合并进 p 且保留 FSRS 权重', () => {
  const w = Array.from({ length: 17 }, (_, i) => Number((i / 100).toFixed(2)));
  wiki.addTiddler({ title: DECK, tags: ['$:/tags/TidmeDeck'], order: 'due-new', leech_threshold: '8', p: JSON.stringify({ w, request_retention: 0.9, maximum_interval: 365 }) });
  const before = config.readDefaultDeckParams(wiki);
  assert.equal(before.order, 'due-new');
  assert.equal(before.request_retention, 0.9);
  assert.equal(before.maximum_interval, 365);
  config.writeDefaultDeckParams(wiki, { order: 'random', request_retention: 0.95 });
  const f = wiki.getTiddler(DECK).fields;
  assert.equal(f.order, 'random');
  assert.equal(f.leech_threshold, '8', '未 patch 的键不动');
  const p = JSON.parse(f.p);
  assert.equal(p.request_retention, 0.95);
  assert.deepEqual([...p.w], w, 'FSRS 权重不被设置页抹掉');
  config.writeDefaultDeckParams(wiki, { request_retention: 1.5 });
  assert.equal(JSON.parse(wiki.getTiddler(DECK).fields.p).request_retention, 1, 'retention 越界 clamp 到 1');
});

test('settings: 设置页渲染 —— 三分区与关键控件；页面挂载 widget（Today 同源骨架）', () => {
  const page = wiki.getTiddler(ns.PAGE_SETTINGS);
  assert.ok(page, '设置页 tiddler 存在');
  assert.ok(String(page.fields.text).includes('tidme-settings'), '页面挂载设置 widget');
  const { root } = renderSettings();
  const text = collectText(root);
  for (const key of ['复习调度', '记忆参数', '语义切分', '出题顺序', '学习流构成', '交错比', '随机打乱学习步', '复习日志保留天数', '每日自动顺延', '目标记忆率', 'API Key']) {
    assert.ok(text.includes(key), `设置页包含：${key}`);
  }
  assert.ok(!text.includes('立即顺延'), '高频操作（立即顺延）保留在牌组页，不集中到设置页');
});

test('settings: 自动顺延开关迁移到设置页（queue-ops 只保留手动触发）', () => {
  const queueOps = mod('manager/widgets/queue-ops.js');
  const { root } = renderWidgetBase(wiki, queueOps, 'queue-ops');
  const text = collectText(root);
  assert.ok(text.includes('立即顺延'), '手动触发保留在牌组页');
  assert.ok(!text.includes('每日自动顺延'), '开关已从牌组页移除');
  assert.ok(collectText(renderSettings().root).includes('每日自动顺延'), '设置页承载开关');
});

test('nav: 导航含设置入口（新路径 ui/components/nav 与向后兼容 shim）', () => {
  const navNew = mod('ui/components/nav.js');
  const { root: rootNew } = renderWidgetBase(wiki, navNew, 'tidme-nav');
  assert.ok(collectText(rootNew).includes('设置'), 'ui/components/nav.js 包含设置');

  const navOld = mod('import/widgets/nav.js');
  const { root: rootOld } = renderWidgetBase(wiki, navOld, 'tidme-nav');
  assert.ok(collectText(rootOld).includes('设置'), 'import/widgets/nav.js shim 包含设置');
});

test('config: 学习流构成与交错比 —— QueueMode 旧值兼容 + QueueMix 回环 + 2:1 队列形状', () => {
  const deckEngine = mod('core/deck-engine.js');
  wiki.addTiddler({ title: '$:/config/Tidme/QueueMode', text: 'strict' });
  let o = config.readQueueOptions(wiki);
  assert.equal(o.topics, true);
  assert.equal(o.mode, 'strict', '旧值 strict 兼容');
  wiki.deleteTiddler('$:/config/Tidme/QueueMode');
  o = config.readQueueOptions(wiki);
  assert.equal(o.topics, false, '默认不混入阅读材料');
  assert.equal(o.itemRatio, 4, '默认 4:1');
  // 物化默认牌组：先删前序用例写出的残缺真 tiddler，让本次写入从 shadow 拷贝完整字段
  wiki.deleteTiddler('$:/Deck/default');
  config.writeDefaultDeckParams(wiki, { order: 'due-new' });
  config.writeQueueOptions(wiki, { topics: true, itemRatio: 2, topicRatio: 1 });
  o = config.readQueueOptions(wiki);
  assert.equal(o.topics, true);
  assert.equal(o.mode, 'interleaved', '未设 strict 保持交错');
  assert.equal(o.itemRatio, 2);
  // 交错比传入队列形状（2 测试卡后插 1 阅读卡）
  wiki.addTiddler({ title: 'QI1', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '0' });
  wiki.addTiddler({ title: 'QI2', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '0' });
  wiki.addTiddler({ title: 'QI3', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '0' });
  wiki.addTiddler({ title: 'QI4', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '0' });
  wiki.addTiddler({ title: 'QT1', 'tidme.kind': 'topic', 'tidme.subkind': 'section', state: '0', due: twDate() });
  wiki.addTiddler({ title: 'QT2', 'tidme.kind': 'topic', 'tidme.subkind': 'section', state: '0', due: twDate() });
  const q = deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), { mode: 'interleaved', topics: true, itemRatio: 2, topicRatio: 1 });
  assert.deepEqual([...q], ['QI1', 'QI2', 'QT1', 'QI3', 'QI4', 'QT2'], '2:1 交错队列形状');
});
