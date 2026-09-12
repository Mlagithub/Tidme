/*
en-smoke.test.mjs — 纯英文环境冒烟测试（node:test）

无 zh-Hans 语言包挂载时的行为验证：
- 默认使用 en-GB 英文词典与 fallback；
- 散卡桶标识稳定归一化（Standalone 输入落入散卡桶，不污染 Decks/Standalone）；
- 独立制卡、阅读与多语言查找无异常报错。
*/
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fakeDocument } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

let tw;
let wiki;
let mod;

before(() => {
  const booted = bootPlugin({ langs: [] }); // 不加载 zh-Hans 语言包
  tw = booted.tw;
  wiki = booted.wiki;
  mod = booted.mod;
});

test('en-smoke: 纯英文无 zh-Hans 下 lingo 返回 en-GB 词条', () => {
  const lingoMod = mod('core/lingo.js');
  const standalone = lingoMod.lingo(wiki, 'creator.deck.standalone', 'FallbackStandalone');
  assert.equal(standalone, 'Standalone', 'en-GB 词典包含 creator.deck.standalone');

  const btnDone = lingoMod.lingo(wiki, 'pdf.study.next', 'FallbackNext');
  assert.ok(btnDone.includes('Done'), 'en-GB 包含 pdf.study.next');
});

test('en-smoke: 英文环境下制卡使用 Standalone 输入稳定归属于散卡桶', () => {
  const cardFactory = mod('core/card-factory.js');
  const ns = mod('core/ns.js');

  const card1 = cardFactory.buildStandaloneCard(wiki, {
    type: 'qa',
    deck: 'Standalone',
    question: 'What is closure?',
    answer: 'A function and its lexical environment.',
  });

  assert.ok(card1.title.startsWith(ns.NS_DECKS_STANDALONE), `卡片应落入独立卡桶，实际落入: ${card1.title}`);
  assert.ok(!card1.title.includes('Tidme/Decks/Standalone/'), '严禁落入垃圾抽屉 Tidme/Decks/Standalone');

  const card2 = cardFactory.buildStandaloneCard(wiki, {
    type: 'cloze',
    deck: 'standalone',
    clozeContent: 'The quick brown fox {c1::jumps} over.',
  });
  assert.ok(card2.title.startsWith(ns.NS_DECKS_STANDALONE), 'standalone 同样落入独立卡桶');
});

test('en-smoke: 默认牌组对外正名为 All Cards（全局队列），不再叫 Default', () => {
  const display = mod('core/display.js');
  const f = wiki.getTiddler('$:/Deck/default')?.fields || {};
  assert.equal(display.captionText(wiki, f.caption).trim(), 'All Cards', 'caption 正名为 All Cards');
  const tip = wiki.getTiddlerText('$:/language/tidme/defaulttip') || '';
  assert.ok(tip.includes('Global queue'), 'defaulttip 描述全局队列语义');
});

test('en-smoke: 英文环境下 omni-creator listAvailableDecks 与模态弹窗真制卡（onSuccess 契约）', () => {
  const omni = mod('ui/components/omni-creator.js');
  const decks = omni.listAvailableDecks(wiki);
  assert.ok(decks.includes('Standalone'), '英文环境牌组首项为 Standalone');

  const doc = {
    createElement: (t) => fakeDocument.createElement(t),
    body: fakeDocument.createElement('body'),
    querySelector: () => null,
  };

  const saved = [];
  omni.openOmniCardModal(doc, wiki, {
    defaultType: 'qa',
    defaultTitle: 'English Card',
    defaultQuestion: 'Is this pure English?',
    defaultAnswer: 'Yes.',
    // 回调名是 onSuccess（曾经测试传 onSave → 死参数，回调契约从未被验证）
    onSuccess: (c) => saved.push(c),
  });

  assert.ok(doc.body.childNodes.length > 0, '成功在英文环境下挂载 modal');

  // 真制卡：填 question/answer → 点「Create Card」→ 断言回调被调 + 卡落库
  const byTag = (node, tag, out = []) => {
    if (!node) return out;
    if (String(node.tagName) === tag) out.push(node);
    for (const c of node.childNodes || []) byTag(c, tag, out);
    return out;
  };
  const overlay = doc.body.childNodes.find((n) => String(n.className).includes('tm-omni-creator-overlay'));
  const textareas = byTag(overlay, 'TEXTAREA');
  assert.ok(textareas.length >= 2, 'QA 模板渲染出问题/答案两个输入框');
  textareas[0].value = 'Is this pure English?';
  textareas[1].value = 'Yes.';
  const submit = byTag(overlay, 'BUTTON').find((b) => String(b.textContent).includes('Create Card'));
  assert.ok(submit, '找到「Create Card」提交按钮');
  submit.dispatchEvent({ type: 'click' });

  assert.equal(saved.length, 1, 'onSuccess 被调用一次（回调契约成立）');
  assert.ok(wiki.getTiddler(saved[0].title), '卡片真的落库');
  assert.equal(saved[0]['tidme.kind'], 'item', 'QA 卡 kind=item');
});
