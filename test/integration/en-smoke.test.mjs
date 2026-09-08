/*
en-smoke.test.mjs — 纯英文环境冒烟测试（node:test）

无 zh-Hans 语言包挂载时的行为验证：
- 默认使用 en-GB 英文词典与 fallback；
- 散卡桶标识稳定归一化（Standalone / Inbox 均落入散卡桶，不污染 Decks/Standalone）；
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

test('en-smoke: 英文环境下制卡使用 Standalone/Inbox 稳定归属于散卡桶', () => {
  const cardFactory = mod('core/card-factory.js');
  const ns = mod('core/ns.js');

  const card1 = cardFactory.buildStandaloneCard(wiki, {
    type: 'qa',
    deck: 'Standalone',
    question: 'What is closure?',
    answer: 'A function and its lexical environment.',
  });

  assert.ok(card1.title.startsWith(ns.NS_DECKS_SCATTER), `卡片应落入散卡桶，实际落入: ${card1.title}`);
  assert.ok(!card1.title.includes('Tidme/Decks/Standalone/'), '严禁落入垃圾抽屉 Tidme/Decks/Standalone');

  const card2 = cardFactory.buildStandaloneCard(wiki, {
    type: 'cloze',
    deck: 'inbox',
    clozeContent: 'The quick brown fox {c1::jumps} over.',
  });
  assert.ok(card2.title.startsWith(ns.NS_DECKS_SCATTER), 'inbox 同样落入散卡桶');
});

test('en-smoke: 英文环境下 omni-creator listAvailableDecks 与模态弹窗挂载', () => {
  const omni = mod('ui/components/omni-creator.js');
  const decks = omni.listAvailableDecks(wiki);
  assert.ok(decks.includes('Standalone'), '英文环境牌组首项为 Standalone');

  const doc = {
    createElement: (t) => fakeDocument.createElement(t),
    body: fakeDocument.createElement('body'),
    querySelector: () => null,
  };

  let saved = null;
  omni.openOmniCardModal(doc, wiki, {
    defaultType: 'qa',
    defaultTitle: 'English Card',
    defaultQuestion: 'Is this pure English?',
    defaultAnswer: 'Yes.',
    onSave: (c) => {
      saved = c;
    },
  });

  assert.ok(doc.body.childNodes.length > 0, '成功在英文环境下挂载 modal');
});
