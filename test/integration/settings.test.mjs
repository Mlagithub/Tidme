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

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-settings-' });
const config = mod('core/config.js');
const ns = mod('core/ns.js');

const AUTO = '$:/config/Tidme/AutoPostpone';
const SS = '$:/config/Tidme/SemanticSplit';
const DECK = '$:/Deck/default';

/** 每用例独立：配置与牌组都是系统 tiddler（reset 默认不清），显式清掉才能免于前序用例污染 */
test.beforeEach(() => reset({ alsoSystem: ['$:/config/Tidme/', '$:/config/tidme/', '$:/Deck/'] }));

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

test('config: 语义切分只认 text JSON（字段级历史兼容已删）+ enable 强类型化', () => {
  // 字段级 apiKey 无任何生产写入方；读取一律以 text JSON 为准
  wiki.addTiddler({ title: SS, text: JSON.stringify({ enable: true, apiKey: 'json-key' }), apiKey: 'field-key' });
  assert.equal(config.readSemanticSplit(wiki).apiKey, 'json-key', '字段级 key 不再覆盖（唯一写入口 = text JSON）');
  config.writeSemanticSplit(wiki, { apiKey: 'sk-new', model: 'gpt-4o-mini' });
  const cfg = JSON.parse(wiki.getTiddler(SS).fields.text);
  assert.equal(cfg.apiKey, 'sk-new');
  assert.equal(cfg.model, 'gpt-4o-mini');
  assert.equal(cfg.enable, true, '合并保留 enable');
  // enable 的字符串假值必须解析为 false（否则 importer 的 `enable === true` 与 UI 显示会不一致）
  wiki.addTiddler({ title: SS, text: JSON.stringify({ enable: 'false', apiKey: 'k' }) });
  assert.equal(config.readSemanticSplit(wiki).enable, false, "'false' 解析为 false");
  wiki.addTiddler({ title: SS, text: JSON.stringify({ enable: 'no', apiKey: 'k' }) });
  assert.equal(config.readSemanticSplit(wiki).enable, false, "'no' 解析为 false");
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

test('settings: 每日上限与学习日分区（六项配置都有 UI，不再是只能手改 tiddler）', () => {
  const config = mod('core/config.js');
  reset({ alsoSystem: [ns.NEW_PER_DAY_TITLE, ns.REVIEWS_PER_DAY_TITLE, ns.LIMITS_SUPPRESS_NEW_TITLE, ns.ROLLOVER_HOUR_TITLE, ns.LEARN_AHEAD_TITLE, ns.BURY_SIBLINGS_TITLE] });
  const { root } = renderSettings();
  const text = collectText(root);
  for (const key of ['每日上限与学习日', '每日新卡上限', '每日复习上限', '复习额度压制新卡', '学习日起始时刻', '提前学习上限', '兄弟卡搁置']) {
    assert.ok(text.includes(key), `设置页包含：${key}`);
  }
  // 控件已在；读写往返仍需落在同一份配置（UI 与 core 不各写一套）
  config.writeNewPerDay(wiki, 33);
  config.writeReviewsPerDay(wiki, 321);
  config.writeRolloverHour(wiki, 6);
  config.writeLearnAheadMinutes(wiki, 7);
  config.writeBurySiblings(wiki, false);
  config.writeLimitsSuppressNew(wiki, false);
  assert.equal(config.readNewPerDay(wiki), 33);
  assert.equal(config.readReviewsPerDay(wiki), 321);
  assert.equal(config.readRolloverHour(wiki), 6);
  assert.equal(config.readLearnAheadMinutes(wiki), 7);
  assert.equal(config.readBurySiblings(wiki), false);
  assert.equal(config.readLimitsSuppressNew(wiki), false);
  // 写入的设置必须真的影响调度额度（不是装饰性开关）
  const sched = mod('core/scheduler.js');
  const limits = sched.resolveDailyLimits(wiki);
  assert.equal(limits.newLimit, 33);
  assert.equal(limits.reviewLimit, 321, '压制关闭时复习额度不再扣新卡数');
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

test('config: 复习日志保留天数 —— 未配置走默认 90，显式 0 才是永久保留', () => {
  wiki.deleteTiddler('$:/config/Tidme/LogRetention');
  assert.equal(config.readLogRetentionDays(wiki), 90, '未配置 → 默认 90（曾因 Number(\'\')=0 退化为"永久保留"）');
  config.writeLogRetentionDays(wiki, 0);
  assert.equal(config.readLogRetentionDays(wiki), 0, '显式 0 = 永久保留');
  wiki.addTiddler({ title: '$:/config/Tidme/LogRetention', text: 'abc' });
  assert.equal(config.readLogRetentionDays(wiki), 90, '非法值回默认');
  wiki.addTiddler({ title: '$:/config/Tidme/LogRetention', text: '-5' });
  assert.equal(config.readLogRetentionDays(wiki), 90, '负数回默认');
});

test('config: 读侧强类型化 —— 隐式真值与 NaN 不再流入调度（boolish/num）', () => {
  const AUTO = mod('core/scheduler.js').AUTOPOSTPONE_CONFIG_TITLE;
  for (const falsy of ['false', '0', 'no']) {
    wiki.addTiddler({ title: AUTO, type: 'application/json', text: JSON.stringify({ enable: falsy }) });
    assert.equal(config.readAutoPostpone(wiki).enable, false, `enable='${falsy}' → false`);
  }
  wiki.addTiddler({ title: AUTO, type: 'application/json', text: JSON.stringify({ enable: 'yes', keepTop: 'abc', postponeDays: -3 }) });
  const cfg = config.readAutoPostpone(wiki);
  assert.equal(cfg.enable, true, "enable='yes' → true");
  assert.equal(cfg.keepTop, 10, 'NaN 回默认（不再把 NaN 传进切片）');
  assert.equal(cfg.postponeDays, 1, '负数按下限 1 收敛');

  // 优先级动态：'0'/'no' 也关闭（此前只认字面 'false'）
  for (const falsy of ['false', '0', 'no']) {
    wiki.addTiddler({ title: ns.PRIORITY_DYNAMICS_TITLE, enable: falsy });
    assert.equal(config.readPriorityDynamics(wiki).enable, false, `PriorityDynamics enable='${falsy}' → false`);
  }
});

test('config: 交错比 0/负数/NaN 不死循环且回落到 ≥1', () => {
  const deckEngine = mod('core/deck-engine.js');
  wiki.addTiddler({ title: 'QI_ratio', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '0' });
  wiki.addTiddler({ title: 'QT_ratio', 'tidme.kind': 'topic', 'tidme.subkind': 'section', state: '0', due: twDate() });
  // 0 会让内层 while 不推进（历史上会死循环挂死 UI）——能返回即证明有下限保护
  const q = [...deckEngine.composeGlobalLearningQueue((f) => wiki.filterTiddlers(f), {
    mode: 'interleaved',
    topics: true,
    itemRatio: 0,
    topicRatio: 0,
  })];
  const mine = q.filter((t) => t === 'QI_ratio' || t === 'QT_ratio');
  assert.deepEqual(mine, ['QI_ratio', 'QT_ratio'], '0 比例回落为 1:1（本用例的两张卡按 item→topic 产出）');
});

test('config: 牌组参数默认值与 $:/Deck/default 的出厂值一致（防 100 倍漂移）', () => {
  wiki.deleteTiddler('$:/Deck/default'); // 回到 shadow 出厂值
  const p = config.readDefaultDeckParams(wiki);
  const shadow = wiki.getTiddler('$:/Deck/default').fields;
  const pJson = JSON.parse(String(shadow.p));
  assert.equal(p.maximum_interval, pJson.maximum_interval, 'maximum_interval 与出厂 p 一致');
  assert.equal(p.request_retention, pJson.request_retention, 'request_retention 与出厂 p 一致');
  assert.equal(p.leech_threshold, Number(shadow.leech_threshold), 'leech_threshold 与出厂字段一致');
  assert.equal(p.maximum_interval, 36500, '出厂值为 36500（曾代码写死 365）');
});

test('config.mergeDeckPJson: 百分数换算 + 保留 w 等其余键 + clamp 与宽容', () => {
  const prevP = JSON.stringify({
    request_retention: 0.9,
    maximum_interval: 36500,
    w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
  });
  // 1. 百分数 → 0.5–1 存储量纲，其余键原样保留
  const merged = JSON.parse(config.mergeDeckPJson(prevP, { retentionPct: 85, maximumInterval: 7300 }));
  assert.equal(merged.request_retention, 0.85, '85% → 0.85');
  assert.equal(merged.maximum_interval, 7300);
  assert.deepEqual(merged.w, JSON.parse(prevP).w, 'FSRS 权重 w 不得被合并抹掉');

  // 2. clamp：百分数出界与间隔下限
  const clamped = JSON.parse(config.mergeDeckPJson(prevP, { retentionPct: 130, maximumInterval: 0 }));
  assert.equal(clamped.request_retention, 1, '130% → 上限 1.0');
  assert.equal(clamped.maximum_interval, 1, '0 → 下限 1');

  // 3. 非法/缺失 prev p → 从 patch 兜底重建
  const rebuilt = JSON.parse(config.mergeDeckPJson('{bad', { retentionPct: '90' }));
  assert.equal(rebuilt.request_retention, 0.9, "非法 JSON 宽容为 {}，'90' 字符串也接受");

  // 4. no-op：两键都空 / 值与现值一致 → null（调用方跳过写库）
  assert.equal(config.mergeDeckPJson(prevP, {}), null);
  assert.equal(config.mergeDeckPJson(prevP, { retentionPct: '', maximumInterval: undefined }), null);
  assert.equal(config.mergeDeckPJson(prevP, { retentionPct: 90 }), null, '拖回原值不落库');
  assert.equal(config.mergeDeckPJson(prevP, { retentionPct: 'abc' }), null, '非数值输入忽略');
});

test('widgets/deck-ui: <$deck-fsrs-save/> 合并 temp 友好输入进 p 并清理 helper 字段', () => {
  const TEMP = '$:/temp/tidme/options';
  const DeckFsrsSave = mod('manager/widgets/deck-ui.js')['deck-fsrs-save'];
  const widgetOf = () => {
    const w = new DeckFsrsSave({ type: 'deck-fsrs-save', attributes: {} }, { wiki, document: fakeDocument });
    w.render();
    return w;
  };

  // 1. temp 缺失 → no-op 且返回 true（不阻塞保存链）
  wiki.deleteTiddler(TEMP);
  assert.equal(widgetOf().invokeAction(), true, 'temp 不存在时不抛错');

  // 2. 编辑后保存：p 合并 + helper 字段清理 + 其余字段保留
  wiki.addTiddler({
    title: TEMP,
    card: '[tidme.kind[item]]',
    p: JSON.stringify({ request_retention: 0.9, maximum_interval: 36500, w: [1, 2, 3] }),
    request_retention_pct: '85',
    maximum_interval: '7300',
  });
  assert.equal(widgetOf().invokeAction(), true, 'invokeAction 返回 true（后续 createtiddler 继续）');
  const saved = wiki.getTiddler(TEMP).fields;
  assert.equal(saved.request_retention_pct, undefined, '百分数 helper 字段不得残留在 temp（会随覆写落牌组）');
  assert.equal(saved.maximum_interval, undefined, '间隔 helper 字段同上');
  const p = JSON.parse(String(saved.p));
  assert.equal(p.request_retention, 0.85, '85% 已换算合并');
  assert.equal(p.maximum_interval, 7300);
  assert.deepEqual(p.w, [1, 2, 3], 'w 保留');
  assert.equal(saved.card, '[tidme.kind[item]]', '非 FSRS 字段原样保留（覆写语义依赖完整字段拷贝）');

  // 3. 拖回原值再保存：p 不变，但 helper 字段仍清理
  wiki.addTiddler({
    title: TEMP,
    p: JSON.stringify({ request_retention: 0.9 }),
    request_retention_pct: '90',
  });
  widgetOf().invokeAction();
  const untouched = wiki.getTiddler(TEMP).fields;
  assert.equal(untouched.request_retention_pct, undefined, 'no-op 也要清理 helper 字段');
  assert.equal(JSON.parse(String(untouched.p)).request_retention, 0.9, '原值不变');
});

test('牌组选项弹窗: 保存链接入 <$deck-fsrs-save/>、含 FSRS 参数区块、走 tm-setting 设计语言（bin 产物冒烟）', () => {
  const modal = wiki.getTiddler('$:/plugins/keepone/tidme/review/buttons/action/modal/options');
  assert.ok(modal, '弹窗模板随插件加载');
  assert.ok(String(modal.fields.footer).includes('<$deck-fsrs-save/>'), '保存按钮必须先合并 p 再覆写落库');
  const text = String(modal.fields.text);
  assert.ok(/fsrsretention/.test(text), '期望保留率滑杆宏存在');
  assert.ok(/fsrsmaxinterval/.test(text), '最大间隔输入宏存在');
  assert.ok(text.includes('tm-setting-row'), '表单行复用设置页 tm-setting-* 结构');
  assert.ok(text.includes('class="tm-textarea"') && text.includes('class="tm-input"'), '控件挂统一输入类');
  assert.ok(!text.includes('tc-edit-max-width'), '旧 TW 裸表格布局已移除');
});
