/*
widget-card-viewer.test.mjs — 统一卡片学习交互引擎集成测试
测试 <$tidme-card-viewer> 的 DOM 装配、折叠/展开、按键监听与评分流转。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectButtons, collectText, fakeDocument, renderWidget as renderWidgetBase } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-wgt-viewer-' });

function renderViewer(wiki, mod_, opts = {}) {
  const { root, w } = renderWidgetBase(wiki, mod_, 'tidme-card-viewer', opts);
  return { root, widget: w };
}

function mkCard(title, caption, text) {
  wiki.addTiddler({
    title,
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    caption,
    text,
    state: '0',
    due: twDate(),
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    last_review: twDate(),
    'tidme.priority': '50',
  });
}

test.beforeEach(() => {
  reset();
});

test('card-viewer: 初始折叠态展示题面、翻转横幅与禁用评分按钮', () => {
  mkCard('Viewer卡1', '问题一：什么是间隔重复？', '答案一：基于遗忘曲线安排复习。');
  const viewerMod = mod('review/widgets/card-viewer.js');

  const { root, widget } = renderViewer(wiki, viewerMod, {
    attributes: { tiddler: 'Viewer卡1', deck: '$:/Deck/default' },
  });

  const txt = collectText(root);
  assert.ok(txt.includes('问题一：什么是间隔重复？'), '渲染卡片题面 caption');
  assert.ok(!txt.includes('答案一：基于遗忘曲线安排复习。'), '折叠态不暴露答案');
  assert.ok(txt.includes('查看答案 (空格)'), '提示空格翻转答案');

  const btns = collectButtons(root);
  const ratingBtns = btns.filter((b) => b.className?.includes('tm-btn--'));
  assert.equal(ratingBtns.length, 4, '包含 4 个评分按钮（Again/Hard/Good/Easy）');
  assert.ok(ratingBtns.every((b) => b.disabled === true), '折叠态下评分按钮处于 disabled 状态防止盲评');

  widget.destroy();
});

test('card-viewer: toggleFold 切换展开态，显示答案并激活评分按钮', () => {
  mkCard('Viewer卡2', '题面二', '答案详细内容二');
  const viewerMod = mod('review/widgets/card-viewer.js');

  const { root, widget } = renderViewer(wiki, viewerMod, {
    attributes: { tiddler: 'Viewer卡2', deck: '$:/Deck/default' },
  });

  assert.equal(widget.isFolded(), true, '默认是折叠态');
  widget.toggleFold();

  assert.equal(widget.isFolded(), false, '切换后为展开态');
  const txt = collectText(root);
  assert.ok(txt.includes('答案详细内容二'), '展开态渲染答案正文');
  assert.ok(txt.includes('隐藏答案 (空格)'), '横幅变为隐藏答案提示');

  const btns = collectButtons(root);
  const ratingBtns = btns.filter((b) => b.className?.includes('tm-btn--'));
  assert.ok(ratingBtns.every((b) => !b.disabled), '展开态下评分按钮激活可用');

  widget.destroy();
});

test('card-viewer: rateCard 评分流转并写入 FSRS 字段、日志及更新优先级', () => {
  mkCard('Viewer卡3', '题面三', '答案三');
  const viewerMod = mod('review/widgets/card-viewer.js');
  const sessionMod = mod('core/session.js');

  // 模拟初始化学习会话
  wiki.addTiddler({
    title: sessionMod.SESSION_TIDDLER,
    list: ['Viewer卡3'],
  });

  const { root, widget } = renderViewer(wiki, viewerMod, {
    attributes: { tiddler: 'Viewer卡3', deck: '$:/Deck/default' },
  });

  // 展开后评分 Good
  widget.toggleFold();
  widget.rateCard('Good');

  const f = wiki.getTiddler('Viewer卡3').fields;
  assert.notEqual(f.state, '0', '评分后已脱离新卡状态（state 变为 1 或 2）');
  assert.ok(/^\d{17}$/.test(String(f.due)), 'due 已更新为 17 位 TW UTC 时间');
  assert.ok(Number(f.reps) >= 1, 'reps 复习计数增加');
  assert.ok(Number(f.scheduled_days) >= 0, 'scheduled_days 已更新');

  // 检查日志是否记录到牌组
  const logT = wiki.getTiddler('$:/Deck/default/log');
  assert.ok(logT, '创建了牌组学习日志条目');

  // 检查优先级（Good 降优先，数值增大）
  assert.ok(Number(f['tidme.priority']) >= 50, '优先级按 SM 规则自动动态调整');

  // 检查专注时间统计（卡片复习打卡必须记录专注时长）
  const statsMod = mod('core/stats.js');
  const rt = statsMod.getReadTimeStats(wiki);
  assert.ok(rt.todaySeconds >= 1, '卡片评分复习后成功累计专注时间');

  widget.destroy();
});

test('card-viewer: 模拟键盘事件（空格展开，1 评 Again 重排）', () => {
  mkCard('Viewer卡4', '题面四', '答案四');
  const viewerMod = mod('review/widgets/card-viewer.js');
  const sessionMod = mod('core/session.js');

  wiki.addTiddler({
    title: sessionMod.SESSION_TIDDLER,
    list: ['Viewer卡4', '其它卡'],
  });

  const { widget } = renderViewer(wiki, viewerMod, {
    attributes: { tiddler: 'Viewer卡4', deck: '$:/Deck/default' },
  });

  assert.equal(widget.isFolded(), true, '初始折叠');

  // 模拟按下空格键
  fakeDocument.dispatchEvent({
    type: 'keydown',
    key: ' ',
    code: 'Space',
    preventDefault() {},
  });
  assert.equal(widget.isFolded(), false, '按空格键翻转到展开态');

  // 展开态下按键 1 (Again)
  fakeDocument.dispatchEvent({
    type: 'keydown',
    key: '1',
    preventDefault() {},
  });

  const sess = wiki.getTiddler(sessionMod.SESSION_TIDDLER);
  assert.ok(Array.isArray(sess.fields.list), '会话列表有效');
  // Again 的卡应该被重新追加到队列末尾以备重学
  assert.ok(sess.fields.list.includes('Viewer卡4'), 'Again 卡被重新放回会话队列末尾');

  widget.destroy();
});
