/*
deck.test.mjs — 牌组子系统（core/deck）单元测试（node:test）

覆盖：创建/重复/读取/更新/成员求值（strict/loose/exclude）/subset 标记与
完整标题/删除语义（默认保留卡 vs 连卡）/default 保护/configToFields 低层字段。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-deck-' });
let deckMod;
test.before(() => {
  deckMod = mod('core/deck.js');
});

function mkItem(title) {
  wiki.addTiddler({ title, 'tidme.kind': 'item', state: '0', due: twDate(), caption: title, text: 'x' });
}

// alsoSystem：本文件创建 $:/Deck/* 牌组，普通 reset 清不掉（system tiddler），显式清扫
test.beforeEach(() => reset({ alsoSystem: ['$:/Deck/'] }));

test('deck: 创建/读取/枚举；重复创建抛错', () => {
  const t = deckMod.createDeck(wiki, { name: '词书A', caption: '词汇A', card: '[all[]match[itemX]]' });
  assert.equal(t, '$:/Deck/词书A');
  const d = deckMod.getDeck(wiki, '词书A');
  assert.ok(d, '可按名读取');
  assert.equal(d.fields.caption, '词汇A');
  assert.ok(deckMod.listDecks(wiki).includes('$:/Deck/词书A'), '可枚举');
  // 低层 fsrs4tw 字段由 configToFields 生成（不缺失）
  for (const k of ['state_learn', 'state_due', 'state_new', 'order', 'p', 'leech_threshold', 'card_exclude', 'exclude_action']) {
    assert.ok(d.fields[k] !== undefined && d.fields[k] !== '', `configToFields 生成 ${k}`);
  }
  assert.throws(() => deckMod.createDeck(wiki, { name: '词书A' }), '重名抛错');
});

test('deck: 成员求值（strict 排除 card_exclude；loose 含）', () => {
  mkItem('deckItemIn');
  mkItem('deckItemOut');
  wiki.addTiddler({ title: 'deckItemOut', 'tidme.ignored': 'yes' });
  const t = deckMod.createDeck(wiki, { name: '成员组', card: '[all[]match[deckItemIn]] [all[]match[deckItemOut]]' });
  const strict = deckMod.deckCards(wiki, t);
  assert.ok(strict.includes('deckItemIn'), 'strict 含在队卡');
  assert.ok(!strict.includes('deckItemOut'), 'strict 排除（card_exclude=ignored）');
  const loose = deckMod.deckCards(wiki, t, { strict: false });
  assert.ok(loose.includes('deckItemOut'), 'loose 含全部 card 命中');
  // 成员判定即 deckCards 的结果（不另设 deckHasCard 包装）
  assert.ok(deckMod.deckCards(wiki, t).includes('deckItemIn'));
  assert.ok(!deckMod.deckCards(wiki, t).includes('deckItemOut'));
});

test('deck: 更新字段（含 configToFields 重生成）', () => {
  // 自带夹具：前序用例创建的词书A已被 alsoSystem reset 清除
  deckMod.createDeck(wiki, { name: '词书A', caption: '词汇A', card: '[all[]match[itemX]]' });
  deckMod.updateDeck(wiki, '词书A', deckMod.configToFields(wiki, { name: '词书A', caption: '新名', card: '[all[]match[other]]' }));
  const d = deckMod.getDeck(wiki, '词书A');
  assert.equal(d.fields.caption, '新名');
  assert.equal(d.fields.card, '[all[]match[other]]');
  assert.ok(d.fields.state_new, '低层字段仍在');
});

test('deck: subset（完整镜像标题）标记与 titleOf', () => {
  assert.equal(deckMod.titleOf('Tidme/Decks/书X/复习本书'), 'Tidme/Decks/书X/复习本书', '合法完整标题原样');
  assert.equal(deckMod.titleOf('a/b'), '$:/Deck/a-b', '非法 / 被 slug 化');
  const t = deckMod.createDeck(wiki, { name: 'Tidme/Decks/书X/复习本书', kind: 'subset', sourceDoc: 'doc1', card: '[all[]match[z]]' });
  const d = deckMod.getDeck(wiki, t);
  assert.ok(deckMod.isSubset(d), 'subset 标记');
  assert.equal(d.fields['tidme.subset-doc'], 'doc1');
  assert.ok(deckMod.listDecks(wiki).includes(t), 'subset 也可枚举');
});

test('deck: 删除语义 —— 默认仅删容器（卡保留）；alsoCards 连卡删；default 不可删', () => {
  mkItem('keepCard1');
  const t = deckMod.createDeck(wiki, { name: '临时组', card: '[all[]match[keepCard1]]' });
  const n = deckMod.deleteDeck(wiki, t);
  assert.equal(n, 0, '默认不删卡');
  assert.equal(deckMod.getDeck(wiki, t), null, '容器已删');
  assert.ok(wiki.getTiddler('keepCard1'), '卡保留');
  // alsoCards
  mkItem('doomCard');
  const t2 = deckMod.createDeck(wiki, { name: '连卡组', card: '[all[]match[doomCard]]' });
  const n2 = deckMod.deleteDeck(wiki, t2, { alsoCards: true });
  assert.equal(n2, 1, '连卡删除 1 张');
  assert.equal(wiki.getTiddler('doomCard'), undefined, '卡已删');
  // default 保护
  assert.throws(() => deckMod.deleteDeck(wiki, '$:/Deck/default'), 'default 不可删');
});

test('deck: 手写 deck title 含过滤器不安全字符时不产出假卡（回归：Filter error 冒充卡标题）', () => {
  const deckEngine = mod('core/deck-engine.js');
  // TW 过滤器不支持 `]`/`}` 转义（实测 `\]`、双括号写法也报错），含这些字符的 deck title 无法插值
  wiki.addTiddler({ title: '$:/Deck/坏}牌组', tags: ['$:/tags/TidmeDeck'], card: '[tidme.kind[item]]' });
  mkItem('不安全测试卡');

  const cards = [...deckMod.deckCards(wiki, '$:/Deck/坏}牌组')];
  assert.ok(!cards.some((t) => String(t).includes('Filter error')), `不得把过滤器错误文本当卡，实际 ${JSON.stringify(cards)}`);

  const f = deckEngine.composeDeckFilters('$:/Deck/坏}牌组', {});
  assert.equal(f.queue, '', '不安全 title → 队列过滤器置空（调用方按无成员处理）');
  const out = [...wiki.filterTiddlers(f.queue || '[!is[missing]]')];
  assert.ok(!out.some((t) => String(t).includes('Filter error')), '空过滤器不产生假结果');
});

test('deck: newPerDay 产出合法 limit 过滤器且正确截断新卡队列（防 Filter error 回归）', () => {
  const deckEngine = mod('core/deck-engine.js');
  mkItem('限额新卡A');
  mkItem('限额新卡B');
  mkItem('限额新卡C');
  const fields = deckMod.configToFields(wiki, {
    name: '限额牌组',
    card: '[tidme.kind[item]]',
    newPerDay: 2,
  });
  assert.ok(fields.order_new.includes('+[limit[2]]'), 'order_new 包含合法 run 级 limit');
  const dTitle = deckMod.createDeck(wiki, { name: '限额牌组', card: '[tidme.kind[item]]', newPerDay: 2 });
  const f = deckEngine.composeDeckFilters(dTitle, wiki.getTiddler(dTitle).fields);
  const newly = [...wiki.filterTiddlers(f.newly)];
  assert.ok(!newly.some((t) => String(t).includes('Filter error')), '无 Filter error');
  assert.equal(newly.length, 2, '正确截断为 2 张新卡');
});
