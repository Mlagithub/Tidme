/*
section.test.mjs — 阅读闭环字段构建器单元测试（node:test）

在临时 TW 环境加载 core/card-factory.js（制卡唯一实现），验证：
- buildExtract/buildCloze：parent 链、anchor 记录、嵌套摘录（parent = 摘录卡）
- parseAnchor：round-trip
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-section-' });
let sectionMod; // = core/card-factory（制卡唯一实现）
let docOps; // = core/doc-ops（正文清洗唯一实现）
let deckMod;
test.before(() => {
  sectionMod = mod('core/card-factory.js');
  docOps = mod('core/doc-ops.js');
  deckMod = mod('core/deck.js');
});

test.beforeEach(reset);

test('buildExtract: parent 链 + anchor 记录', () => {
  wiki.addTiddler({
    title: '书 › 第一章',
    'tidme.doc': 'd12345678',
    'tidme.breadcrumb': '书 › 第一章',
    'tidme.source': '书',
    'tidme.format': 'epub',
    'tidme.priority': '30',
    text: '正文',
  });
  const card = sectionMod.buildExtract(wiki, '书 › 第一章', '这是一段被选中的文字，用于摘录。');
  assert.equal(card['tidme.parent'], '书 › 第一章');
  assert.equal(card['tidme.kind'], 'topic', '摘录 = Topic（阅读材料）');
  assert.equal(card['tidme.subkind'], 'extract');
  assert.equal(card['tidme.doc'], 'd12345678');
  assert.equal(card['tidme.priority'], '30', '继承父卡优先级');
  const anchor = sectionMod.parseAnchor(card['tidme.anchor']);
  assert.equal(anchor.section, '书 › 第一章');
  assert.ok(anchor.snippet.includes('被选中'), 'anchor 记录片段');
  assert.ok(card.state === '0', 'FSRS 初始字段');
  // 分类重构后无 ?/. 标签：kind=topic 决定阅读队列归属
  assert.equal(card.tags, undefined, '摘录卡不带学习标签');
});

test('buildExtract: 嵌套摘录（parent = 摘录卡）', () => {
  wiki.addTiddler({
    title: '书 › 第一章 › 摘录',
    'tidme.doc': 'd12345678',
    'tidme.breadcrumb': '书 › 第一章 › 摘录',
    'tidme.parent': '书 › 第一章',
    'tidme.kind': 'topic',
    'tidme.subkind': 'extract',
    text: '引文',
  });
  const card = sectionMod.buildExtract(wiki, '书 › 第一章 › 摘录', '更细的一层摘录。');
  assert.equal(card['tidme.parent'], '书 › 第一章 › 摘录', '嵌套 parent');
  assert.ok(card['tidme.breadcrumb'].endsWith('摘录 › 摘录') || card['tidme.breadcrumb'].endsWith('摘录 › Extract'), '面包屑继续追加');
});

test('buildCloze: anchor + parent', () => {
  wiki.addTiddler({ title: '书 › 第一章', 'tidme.doc': 'd12345678', 'tidme.breadcrumb': '书 › 第一章', 'tidme.priority': '70', text: '正文' });
  const card = sectionMod.buildCloze(wiki, '书 › 第一章', 'Sierra Leone 的首都是 Freetown。', 'Freetown');
  assert.equal(card['tidme.kind'], 'item', '挖空 = Item（测试卡）');
  assert.equal(card['tidme.subkind'], 'cloze');
  assert.equal(card['tidme.parent'], '书 › 第一章');
  assert.equal(card['tidme.priority'], '70', '继承父卡优先级');
  assert.ok(card.caption.includes('<<C'), '挖空宏');
  const anchor = sectionMod.parseAnchor(card['tidme.anchor']);
  assert.equal(anchor.snippet, 'Freetown');
  // 分类重构后无 ?/. 标签：kind=item 决定复习队列归属
  assert.equal(card.tags, undefined, '挖空卡不带学习标签');
});

test('parseAnchor: 容错', () => {
  assert.equal(sectionMod.parseAnchor(null), null);
  assert.equal(sectionMod.parseAnchor('非法 json'), null);
  const a = sectionMod.parseAnchor('{"section":"甲","snippet":"乙"}');
  assert.equal(a.section, '甲');
  assert.equal(a.snippet, '乙');
});

test('processedSnippets: 收集本卡全部衍生卡 anchor 片段', () => {
  wiki.addTiddler({
    title: '书 › 第二章',
    'tidme.doc': 'd12345678',
    'tidme.breadcrumb': '书 › 第二章',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    text: '<p>地球平均表面温度可达 14 摄氏度。</p>',
  });
  wiki.addTiddler({
    title: '书 › 第二章 › 摘录',
    'tidme.parent': '书 › 第二章',
    'tidme.kind': 'topic',
    'tidme.subkind': 'extract',
    'tidme.anchor': JSON.stringify({ section: '书 › 第二章', snippet: '地球平均表面温度' }),
  });
  wiki.addTiddler({
    title: '书 › 第二章 › 挖空',
    'tidme.parent': '书 › 第二章',
    'tidme.kind': 'item',
    'tidme.subkind': 'cloze',
    'tidme.anchor': JSON.stringify({ section: '书 › 第二章', snippet: '14 摄氏度' }),
  });
  wiki.addTiddler({ title: '无关卡', 'tidme.kind': 'topic' });
  const snips = docOps.processedSnippets(wiki, '书 › 第二章');
  assert.deepEqual([...snips].sort(), ['14 摄氏度', '地球平均表面温度']);
});

test('cleanProcessedText: 删除已提取片段、保留其余、幂等', () => {
  wiki.addTiddler({
    title: '书 › 第三章',
    'tidme.doc': 'd12345678',
    'tidme.breadcrumb': '书 › 第三章',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    text: '<p>这句话包含 一个被摘录 的片段，后面还有内容。</p>',
  });
  wiki.addTiddler({
    title: '书 › 第三章 › 摘录',
    'tidme.parent': '书 › 第三章',
    'tidme.kind': 'topic',
    'tidme.subkind': 'extract',
    'tidme.anchor': JSON.stringify({ section: '书 › 第三章', snippet: '一个被摘录' }),
  });
  const n = docOps.cleanProcessedText(wiki, '书 › 第三章');
  assert.equal(n, 1);
  const text = wiki.getTiddler('书 › 第三章').fields.text;
  assert.ok(!text.includes('一个被摘录'), '片段已从原文删除');
  assert.ok(text.includes('这句话包含') && text.includes('后面还有内容'), '其余内容保留');
  // 幂等：片段已不在原文，再次执行不再删除
  assert.equal(docOps.cleanProcessedText(wiki, '书 › 第三章'), 0);
});

test('cleanProcessedText: 整段被摘录后清理遗留空 <p>', () => {
  wiki.addTiddler({ title: '书 › 第四章', 'tidme.doc': 'd12345678', 'tidme.kind': 'topic', 'tidme.subkind': 'section', text: '<p>整段被摘录的内容。</p>\n<p>保留段。</p>' });
  wiki.addTiddler({
    title: '书 › 第四章 › 摘录',
    'tidme.parent': '书 › 第四章',
    'tidme.kind': 'topic',
    'tidme.subkind': 'extract',
    'tidme.anchor': JSON.stringify({ section: '书 › 第四章', snippet: '整段被摘录的内容。' }),
  });
  docOps.cleanProcessedText(wiki, '书 › 第四章');
  const text = wiki.getTiddler('书 › 第四章').fields.text;
  assert.ok(!text.includes('<p></p>') && !text.includes('整段被摘录'), '空 <p> 与片段均已清理');
  assert.ok(text.includes('保留段'), '保留段不受影响');
});

test('无 doc 普通笔记不提供摘录（buildExtract → null）', () => {
  wiki.addTiddler({ title: '随手笔记', text: '想法正文' });
  assert.equal(sectionMod.buildExtract(wiki, '随手笔记', '想法片段'), null, '摘录只属于阅读材料');
});

test('commitCard——无 doc 笔记挖空/问答 → item 卡入缺省牌组 + 折叠预备 + 空安全', () => {
  const cloze = sectionMod.buildCloze(wiki, '随手笔记', '记忆的核心是 间隔重复。', '间隔重复');
  assert.equal(cloze['tidme.kind'], 'item');
  assert.equal(cloze['tidme.parent'], '随手笔记');
  assert.equal(cloze['tidme.doc'], '', '无 doc 来源');
  assert.ok(sectionMod.commitCard(wiki, cloze), '写库成功');

  const qa = sectionMod.buildQA(wiki, '随手笔记', '记忆的核心机制?', '间隔重复');
  assert.equal(qa['tidme.kind'], 'item');
  assert.ok(sectionMod.commitCard(wiki, qa));

  // 缺省 input.deck：无 doc item 由默认牌组 card 过滤器自动收录
  const inDeck = deckMod.deckCards(wiki, '$:/Deck/default');
  assert.ok(inDeck.includes(cloze.title), '挖空卡入缺省牌组');
  assert.ok(inDeck.includes(qa.title), '问答卡入缺省牌组');
  // 折叠态预备（默认 hide：先看问题再翻面）
  assert.equal(wiki.getTiddler('$:/state/folded/' + cloze.title).fields.text, 'hide');
  // 空安全
  assert.equal(sectionMod.commitCard(wiki, null), false);
});
