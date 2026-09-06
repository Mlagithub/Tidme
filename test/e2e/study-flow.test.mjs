/*
study-flow.test.mjs — 无头 E2E：FSRS 学习流转（startstudy → grade → 队列推进）

在临时空目录 boot TW + bin 插件，合成两张新卡，跑 6 轮学习循环，
验证「评分写入 → 队列推进」不变量：进入复习（state 2）的卡不再复现。

历史说明：旧版 tools/study-flow-test.cjs 曾在测试内联复刻 deck-engine 的
队列过滤器组合（漂移风险），现改用生产实现 composeDeckFilters。
*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fakeDocument, fakeElement } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset, tmp } = bootPlugin({ prefix: 'tidme-study-' });
const deckEngine = mod('core/deck-engine.js');
const DECK = '$:/Deck/default';

/** 合成一张新卡（kind=item + FSRS 字段 → 默认牌组新卡队列；不依赖手册狗粮卡） */
function mkTestCard(title, caption) {
  wiki.addTiddler({
    title,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    caption,
    text: `${caption.slice(0, 1)}答案`,
    state: '0',
    due: twDate(),
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    last_review: twDate(),
  });
}

/** 创建带变量的 widget 上下文，供 filterTiddlers(filter, widget) 求值。
 *  注：makeWidget 的 variables 选项包装成 let-widget（子节点），root 的 getVariable 看不到；
 *  过滤器求值须用 parent 链（变量设在 parent）。 */
function makeVarsWidget(variables) {
  const parent = wiki.makeWidget({ tree: [] }, { document: fakeDocument });
  for (const [k, v] of Object.entries(variables)) parent.setVariable(k, v);
  return wiki.makeWidget({ tree: [] }, { parentWidget: parent, document: fakeDocument });
}

/** 渲染 wikitext 动作并触发执行（动作经 invokeActions 触发） */
function runActions(text, variables) {
  const parser = wiki.parseText('text/vnd.tiddlywiki', text, {});
  const widgetNode = wiki.makeWidget(parser, { variables, document: fakeDocument });
  widgetNode.render(fakeElement(), null);
  widgetNode.invokeActions();
}

/** 渲染 startstudy 动作建立牌组学习会话（队列组合 = 生产实现 composeDeckFilters） */
function startstudy() {
  const df = wiki.getTiddler(DECK).fields;
  const filters = deckEngine.composeDeckFilters(DECK, df);
  runActions(wiki.getTiddlerText('$:/plugins/keepone/tidme/review/buttons/action/startstudy'), {
    deckTiddler: DECK,
    currentTiddler: DECK,
    filter_queue: filters.queue,
    filter_unfold: filters.unfold,
  });
  const study = wiki.getTiddler(`${DECK}/study`);
  return study ? study.fields.list : [];
}

/** 对学习卡评分：经 fsrs 过滤器生成 cards_json → 渲染 repeat 动作 → 返回写回字段 */
function grade(studyTiddler, rating) {
  const df = wiki.getTiddler(DECK).fields;
  const varWidget = makeVarsWidget({ studyTiddler, p: df.p });
  const cardsJson = wiki.filterTiddlers('[<studyTiddler>fsrs<p>]', varWidget)[0];
  if (!cardsJson) throw new Error(`fsrs 过滤器无输出: ${studyTiddler}`);
  runActions(wiki.getTiddlerText('$:/plugins/keepone/tidme/review/buttons/action/repeat'), {
    studyTiddler,
    rating,
    cards_json: cardsJson,
    deckTiddler: DECK,
    leech_threshold: String(df.leech_threshold || 8),
  });
  const f = wiki.getTiddler(studyTiddler).fields;
  return { state: f.state, due: f.due };
}

test.beforeEach(() => {
  reset();
  mkTestCard('测试卡A', 'A?');
  mkTestCard('测试卡B', 'B?');
});

test('startstudy: 经动作建立牌组学习会话（队列 = composeDeckFilters 生产组合）', () => {
  const list = startstudy();
  assert.ok(Array.isArray(list) && list.length >= 1, '学习会话已建立且有在队卡');
  assert.ok(['测试卡A', '测试卡B'].includes(String(list[0])), '首项是新卡');
});

test('评分 Good 写入 state/due 并推进队列：进入复习的卡不再复现（6 轮不变量）', () => {
  const seen = [];
  let fail = 0;
  for (let round = 1; round <= 6; round++) {
    const list = startstudy();
    const card = Array.isArray(list) ? list[0] : list;
    if (!card) {
      assert.ok(round > 1, '第 1 轮就空队 = 队列组合失效');
      break; // 队列已空，推进完成
    }
    const r = grade(card, 'Good');
    assert.ok(r.state !== undefined && r.state !== '0', `第${round}轮 评分未写入（${card}）`);
    assert.ok(/^\d{17}$/.test(String(r.due)), `第${round}轮 due 应为 17 位 TW 串`);
    seen.push({ title: String(card), state: r.state });
  }
  // FSRS 学习中（state 1/3）的卡会在学习步复现一次（新卡 Good → Learning → Review）；
  // 不变量：进入复习（state 2）后的卡不应再次出现。
  const byTitle = {};
  for (const e of seen) {
    assert.ok(byTitle[e.title] !== '2', `已进入复习的卡重复出现：${e.title}（队列未推进）`);
    byTitle[e.title] = e.state;
  }
  assert.ok(seen.length >= 2, '两张卡都被消化（允许学习中复现）');
});

test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
