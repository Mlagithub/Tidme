/*
study-mode.test.mjs — 学习模式条与统一结束学习

- core/session：endSession 三清（全局会话 + 全部 <deck>/study + $:/temp/tidme/*）、
  isSessionActive / getActiveStudy（global 与 deck 两个来源）
- 学习模式条 widget：未激活隐藏 / 激活显示进度 / 结束点击清场（走唯一刷新机制嗅探）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-mode-' });
let session, reactive, modeBar, ns;
test.before(() => {
  session = mod('core/session.js');
  reactive = mod('core/reactive.js');
  modeBar = mod('review/widgets/study-mode.js');
  ns = mod('core/ns.js');
});

test.beforeEach(reset);

/** 造一张牌组 + 全局会话 + 牌组会话 + 临时项的完整激活态 */
function setupActive() {
  wiki.addTiddler({ title: '$:/Deck/甲', tags: ['$:/tags/TidmeDeck'], caption: '甲', card: '[tidme.kind[item]]' });
  wiki.addTiddler({ title: '$:/state/tidme/learning-session', list: ['卡甲', '卡乙', '卡丙'], mode: 'items-only' });
  wiki.addTiddler({ title: '$:/Deck/甲/study', list: ['卡丁'] });
  wiki.addTiddler({ title: '$:/temp/tidme/study/input/卡甲', text: 'x' });
  wiki.addTiddler({ title: '$:/temp/tidme/autopostpone/last', text: '{}' });
}

test('session: isSessionActive / getActiveStudy——全局会话优先，回退牌组会话', () => {
  assert.equal(session.isSessionActive(wiki), false, '初始未激活');
  setupActive();
  assert.equal(session.isSessionActive(wiki), true);
  const a = session.getActiveStudy(wiki);
  assert.equal(a.source, 'global', '全局会话优先');
  assert.deepEqual([...a.list], ['卡甲', '卡乙', '卡丙']);
  wiki.deleteTiddler('$:/state/tidme/learning-session');
  const b = session.getActiveStudy(wiki);
  assert.equal(b.source, 'deck', '回退到牌组会话');
  assert.equal(b.deckTitle, '$:/Deck/甲');
  assert.deepEqual([...b.list], ['卡丁']);
});

test('session: endSession 三清（全局会话 + 全部 <deck>/study + $:/temp/tidme/*）', () => {
  setupActive();
  assert.equal(session.isSessionActive(wiki), true);
  const n = session.endSession(wiki);
  assert.ok(n >= 4, `清理数应 ≥4（会话+study+2 临时项），实际 ${n}`);
  assert.ok(!wiki.getTiddler('$:/state/tidme/learning-session'), '全局会话已删除');
  assert.ok(!wiki.getTiddler('$:/Deck/甲/study'), '牌组 study 列表一并清除');
  assert.ok(!wiki.getTiddler('$:/temp/tidme/study/input/卡甲'), '临时项已删除');
  assert.ok(!wiki.getTiddler('$:/temp/tidme/autopostpone/last'), '临时项已删除');
  assert.equal(session.isSessionActive(wiki), false, '结束后再无激活会话');
  // 幂等：再清一次安全
  assert.equal(session.endSession(wiki), 0);
});

test('reactive: 会话变化谓词覆盖全局会话与 <deck>/study', () => {
  assert.equal(reactive.isSessionChange('$:/state/tidme/learning-session'), true);
  assert.equal(reactive.isSessionChange('$:/Deck/甲/study'), true);
  assert.equal(reactive.isSessionChange('$:/Deck/甲'), false);
  assert.equal(reactive.isSessionChange('普通笔记'), false);
});

// ---- 学习模式条 widget（假 DOM 渲染） ----

function fakeNode(tag = 'div') {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    children: [],
    style: {},
    attributes: {},
    parentNode: null,
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    addEventListener(type, fn) {
      (this._listeners ||= {})[type] = fn;
    },
    dispatchEvent() {
      return true;
    },
    removeEventListener() {},
    appendChild(c) {
      this.childNodes.push(c);
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    insertBefore(c) {
      this.childNodes.push(c);
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    removeChild(c) {
      this.childNodes = this.childNodes.filter((x) => x !== c);
      return c;
    },
    innerHTML: '',
  };
  // 对齐真实 DOM 语义：赋值 textContent 清空全部子节点
  Object.defineProperty(node, 'textContent', {
    get() {
      if (node._text !== undefined) return node._text;
      return (node.childNodes || []).map((c) => c.textContent).join('');
    },
    set(v) {
      if (!v) {
        node.childNodes = [];
        node.children = [];
      }
      node._text = v;
    },
  });
  return node;
}

function renderBar(currentTiddler) {
  const holder = fakeNode('div');
  const w = new modeBar['tidme-study-mode-bar']({ attributes: {} }, {
    wiki,
    document: { createElement: (t) => fakeNode(t), body: fakeNode('body') },
    parentWidget: {
      variables: { currentTiddler: { value: currentTiddler, params: [], isMacroDefinition: false } },
      getVariable: (n) => (n === 'currentTiddler' ? currentTiddler : ''),
      getAncestorCount: () => 0,
      dispatchEvent: () => false,
    },
    variables: {},
  });
  w.render(holder, null);
  return { w, holder };
}

function barText(holder) {
  return (holder.children[0]?.childNodes || []).map((c) => c.textContent).join('|');
}

test('模式条: 未激活隐藏，激活显示进度，refresh 嗅探会话变化', () => {
  const { w, holder } = renderBar('卡甲');
  assert.equal(holder.children[0].style.display, 'none', '未激活隐藏');
  setupActive();
  // 唯一刷新机制：learning-session 变化 → refresh 嗅探重建
  assert.equal(w.refresh({ '$:/state/tidme/learning-session': { modified: true } }), true, '会话变化触发重建');
  assert.equal(holder.children[0].style.display, '', '激活可见');
  assert.equal(barText(holder), '学习中|1/3|结束学习', '进度为当前卡在会话中的位置');
  // 队列外的 tiddler 不显示进度
  const { w: w2, holder: h2 } = renderBar('无关笔记');
  w2.refresh({ '$:/state/tidme/learning-session': { modified: true } });
  assert.equal(barText(h2), '学习中|结束学习');
});

test('模式条: 结束学习 → endSession 清场 + 派发导航/通知', () => {
  setupActive();
  const { w, holder } = renderBar('卡乙');
  w.refresh({ '$:/state/tidme/learning-session': { modified: true } });
  // 点击结束按钮
  const btn = holder.children[0].childNodes.find((c) => c.textContent === '结束学习');
  btn._listeners.click();
  assert.equal(session.isSessionActive(wiki), false, '点击后全部清场');
  assert.equal(holder.children[0].style.display, 'none', '结束后隐藏');
});

test('模式条: 阅读材料显示「读完，继续复习 ›」，点击推进到后续 item 卡片', () => {
  setupActive();
  wiki.addTiddler({
    title: '阅读卡丙',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'doc1',
  });
  wiki.addTiddler({
    title: session.SESSION_TIDDLER,
    list: ['阅读卡丙', '卡甲', '卡乙'],
  });
  const { w, holder } = renderBar('阅读卡丙');
  w.refresh({ '$:/state/tidme/learning-session': { modified: true } });

  assert.ok(barText(holder).includes('读完，继续复习 ›'), '阅读卡显示推进复习按钮');
  const advBtn = holder.children[0].childNodes.find((c) => c.textContent === '读完，继续复习 ›');
  assert.ok(advBtn, '存在推进按钮');
  advBtn._listeners.click();

  const sess = wiki.getTiddler(session.SESSION_TIDDLER);
  assert.equal(sess.fields.list[0], '卡甲', '推进后队列首位切换到 item 卡片');
  assert.ok(!sess.fields.list.includes('阅读卡丙'), '阅读卡已从当前会话移出');
});

test('模式条: 整本 PDF 文档页推进 —— 不标 done，留在阅读队列，续读点固化当前页', () => {
  const docOps = mod('core/doc-ops.js');
  const sched = mod('core/scheduler.js');
  wiki.addTiddler({
    title: 'Tidme/Books/长书',
    tags: ['tidme-import-doc'],
    'tidme.kind': 'topic',
    'tidme.type': 'pdf',
    'tidme.pdf': 'Tidme/PDFs/长书',
    'tidme.doc': 'dp-long',
  });
  // 阅读器翻页时同步写的绝对页码 state（advanceStudy 固化续读点的数据来源）
  wiki.addTiddler({ title: ns.pdfPageStateTitle('dp-long'), text: '7' });
  wiki.addTiddler({ title: '卡甲', 'tidme.kind': 'item', state: '2', due: '20260101000000000' });
  wiki.addTiddler({ title: session.SESSION_TIDDLER, list: ['Tidme/Books/长书', '卡甲'] });
  const { w, holder } = renderBar('Tidme/Books/长书');
  w.refresh({ [session.SESSION_TIDDLER]: { modified: true } });

  const advBtn = holder.children[0].childNodes.find((c) => c.textContent === '读完，继续复习 ›');
  assert.ok(advBtn, '整本 PDF 文档页显示推进按钮');
  advBtn._listeners.click();

  const f = wiki.getTiddler('Tidme/Books/长书')?.fields || {};
  assert.notEqual(f['tidme.done'], 'yes', '只读了几页 ≠ 读完整个文件：不得标记 done');
  const titles = [...sched.collectTopicQueue(wiki).map((c) => c.title)];
  assert.ok(titles.includes('Tidme/Books/长书'), '仍在阅读队列（凭续读点继续读）');
  const rp = docOps.parseReadPoint(wiki, 'dp-long');
  assert.equal(rp?.t, 'Tidme/Books/长书', '续读点指向文档页');
  assert.equal(rp?.s, 'p7', '续读点固化当前页码');
  const sess = wiki.getTiddler(session.SESSION_TIDDLER);
  assert.deepEqual([...sess.fields.list], ['卡甲'], '已移出当前学习会话');
});

test('模式条: 牌组页（词书 legacy kind=topic）推进 —— 永不标 done', () => {
  wiki.addTiddler({
    title: '$:/Deck/IELTS_M',
    tags: ['$:/tags/TidmeDeck'],
    caption: '雅思词汇',
    'tidme.kind': 'topic',
    'tidme.doc': 'IELTS_M',
  });
  wiki.addTiddler({ title: '卡甲', 'tidme.kind': 'item', state: '2', due: '20260101000000000' });
  wiki.addTiddler({ title: session.SESSION_TIDDLER, list: ['$:/Deck/IELTS_M', '卡甲'] });
  const { w, holder } = renderBar('$:/Deck/IELTS_M');
  w.refresh({ [session.SESSION_TIDDLER]: { modified: true } });

  const advBtn = holder.children[0].childNodes.find((c) => c.textContent === '读完，继续复习 ›');
  assert.ok(advBtn, '牌组页（legacy kind=topic）仍显示推进按钮');
  advBtn._listeners.click();

  assert.notEqual(wiki.getTiddler('$:/Deck/IELTS_M')?.fields['tidme.done'], 'yes', '牌组页不是阅读卡，不得标记 done');
  const sess = wiki.getTiddler(session.SESSION_TIDDLER);
  assert.deepEqual([...sess.fields.list], ['卡甲'], '已移出当前学习会话');
});

test('模式条: 节卡推进 —— 标记已读出队（「读完此节」语义保持）', () => {
  wiki.addTiddler({
    title: '节卡一',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'doc-sec',
  });
  wiki.addTiddler({ title: '卡甲', 'tidme.kind': 'item', state: '2', due: '20260101000000000' });
  wiki.addTiddler({ title: session.SESSION_TIDDLER, list: ['节卡一', '卡甲'] });
  const { w, holder } = renderBar('节卡一');
  w.refresh({ [session.SESSION_TIDDLER]: { modified: true } });

  const advBtn = holder.children[0].childNodes.find((c) => c.textContent === '读完，继续复习 ›');
  advBtn._listeners.click();

  assert.equal(wiki.getTiddler('节卡一')?.fields['tidme.done'], 'yes', '节卡读完标记 done（移出阅读队列）');
  const sess = wiki.getTiddler(session.SESSION_TIDDLER);
  assert.deepEqual([...sess.fields.list], ['卡甲'], '已移出当前学习会话');
});

test('模式条: 当前卡跟随故事顶层（修复列表序嗅探滞留在旧词卡）', () => {
  wiki.addTiddler({ title: '卡甲', 'tidme.kind': 'item', state: '2', due: '20260101000000000' });
  wiki.addTiddler({
    title: 'Tidme/Books/顶层书',
    tags: ['tidme-import-doc'],
    'tidme.kind': 'topic',
    'tidme.type': 'pdf',
    'tidme.pdf': 'Tidme/PDFs/顶层书',
    'tidme.doc': 'dp-top',
  });
  wiki.addTiddler({ title: session.SESSION_TIDDLER, list: ['卡甲', 'Tidme/Books/顶层书'] });
  // 用户正在看 PDF（故事顶层），词卡仍开在故事下方
  wiki.addTiddler({ title: '$:/StoryList', list: ['Tidme/Books/顶层书', '卡甲'] });
  const { w, holder } = renderBar('');
  w.refresh({ [session.SESSION_TIDDLER]: { modified: true } });

  assert.equal(barText(holder), '学习中|2/2|读完，继续复习 ›|结束学习', '进度与推进按钮跟随故事顶层的会话阅读卡');
});
