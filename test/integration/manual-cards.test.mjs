/*
manual-cards.test.mjs — 手动制卡触发点测试

- selection 共享工具（划词定位/选区信息，假 DOM 节点）
- 全局划词气泡 pick-bubble 模块装载
- 编辑器真制卡操作（tidme-make-cloze 用桩 EditTextWidget；qa 在无头环境守卫）
- tools/migrate-manual-cards.cjs（临时 wiki fixture：预览 + --apply 写回）
*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import TiddlyWiki from 'tiddlywiki';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// tw.modules.execute 在测试体内直接使用，故保留 tw
const { tw, wiki } = bootPlugin({ prefix: 'tidme-manual-' });

// === selection 共享工具（纯函数，假 DOM 节点） ===

const selection = await import('../../src/tidme/import/widgets/selection.ts');

function fakeNode(attrs = {}, parent = null) {
  return {
    _attrs: attrs,
    parentNode: parent,
    getAttribute(k) {
      return k in this._attrs ? this._attrs[k] : null;
    },
  };
}

test('selection: frameTitleOfSelection 沿父链找 data-tiddler-title，找不到回退 fallback', () => {
  const frame = fakeNode({ 'data-tiddler-title': '书 › 章' });
  const textNode = fakeNode({}, frame);
  const win = { getSelection: () => ({ anchorNode: textNode }) };
  assert.equal(selection.frameTitleOfSelection(win), '书 › 章');
  assert.equal(selection.frameTitleOfSelection({ getSelection: () => ({ anchorNode: null }) }, () => 'CTX 回退卡'), 'CTX 回退卡');
  assert.equal(selection.frameTitleOfSelection({}), null);
});

test('selection: getSelectionInfo 原生选区提取 + 块定位回退选区本身', () => {
  const span = fakeNode({}, fakeNode({ 'data-tiddler-title': '笔记' }));
  span.tagName = 'SPAN';
  span.textContent = ' 间隔重复 是记忆的核心。';
  const range = { startContainer: span };
  const win = { getSelection: () => ({ isCollapsed: false, rangeCount: 1, toString: () => '间隔重复', getRangeAt: () => range }) };
  const info = selection.getSelectionInfo(win);
  assert.equal(info.selected, '间隔重复');
  assert.equal(info.block, '间隔重复 是记忆的核心。');
  // 无选区
  assert.deepEqual([...Object.values(selection.getSelectionInfo({ getSelection: () => ({ isCollapsed: true }) }))], ['', '']);
});

// === pick-bubble / 编辑器操作模块 ===

test('pick-bubble: 模块装载并注册 tidme-pick-bubble widget', () => {
  const mod = tw.modules.execute('$:/plugins/keepone/tidme/import/widgets/pick-bubble.js');
  assert.ok(typeof mod['tidme-pick-bubble'] === 'function', 'widget 构造器已注册');
});

test('编辑器真制卡: tidme-make-cloze 从选区建卡（draft.of 解析 + commitCard 全链路）', () => {
  // 草稿态：编辑器里 currentTiddler 是 "Draft of '…'"
  wiki.addTiddler({ title: "Draft of '我的笔记'", 'draft.of': '我的笔记', text: '记忆的核心是 间隔重复。' });
  const opMod = tw.modules.execute('$:/plugins/keepone/tidme/editor/operations/make-cloze-card');
  const editWidget = { wiki, editTitle: "Draft of '我的笔记'", dispatchEvent() {} };
  const operation = { text: 'x', selStart: 0, selEnd: 4, selection: '间隔重复' };
  opMod['tidme-make-cloze'].call(editWidget, {}, operation);

  const cardTitle = 'Tidme/Decks/散卡/我的笔记--cloze';
  const card = wiki.getTiddler(cardTitle);
  assert.ok(card, '挖空卡已写库（父卡解析自 draft.of）');
  assert.equal(card.fields['tidme.kind'], 'item');
  assert.equal(card.fields['tidme.subkind'], 'cloze');
  assert.equal(card.fields['tidme.parent'], '我的笔记');
  assert.equal(card.fields.caption.includes('间隔重复'), true, 'caption 含挖空宏与选区');
  assert.equal(wiki.getTiddler('$:/state/folded/' + cardTitle).fields.text, 'hide', '折叠态已预备');
  // 无变更变换：replacement 保持 undefined（引擎 replacement===null/undefined 走原生不改写路径）
  assert.equal(operation.replacement, undefined);
});

test('编辑器真制卡: 空选区 / qa 无头守卫', () => {
  const common = tw.modules.execute('$:/plugins/keepone/tidme/editor/operations/make-card-common');
  const editWidget = { wiki, editTitle: '我的笔记', dispatchEvent() {} };
  // 空选区：cloze 不建卡
  const before = wiki.filterTiddlers('[tidme.kind[item]]').length;
  common.makeCard(editWidget, { selection: '  ' }, 'cloze');
  assert.equal(wiki.filterTiddlers('[tidme.kind[item]]').length, before, '空选区不建卡');
  // qa 需要模态（DOM）——无头环境守卫不抛错、不建卡
  common.makeCard(editWidget, { selection: '答案' }, 'qa');
  assert.equal(wiki.filterTiddlers('[tidme.kind[item]]').length, before);
});

// === 迁移工具（临时 wiki fixture） ===

test('migrate-manual-cards: 预览不改盘，--apply 补 kind/subkind 并写回原 .tid', (t) => {
  const wikiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidme-migrate-wiki-'));
  fs.writeFileSync(path.join(wikiDir, 'tiddlywiki.info'), JSON.stringify({ description: 'fixture', plugins: [] }));
  const tiddlersDir = path.join(wikiDir, 'tiddlers');
  fs.mkdirSync(tiddlersDir);
  const legacyCloze = [
    'title: 旧挖空卡',
    'caption: 记忆核心是<<C "间隔重复" "c1" "">>',
    'type: text/vnd.tiddlywiki',
    'state: 0',
    'due: 20260101000000000',
    'reps: 0',
    '',
    '正文',
  ].join('\n');
  const legacyQa = [
    'title: 旧问答卡',
    'caption: 什么是间隔重复?',
    'state: 2',
    'due: 20260101000000000',
    'reps: 3',
    '',
    'Q: 什么是间隔重复?\nA: 按遗忘曲线复习。',
  ].join('\n');
  fs.writeFileSync(path.join(tiddlersDir, 'legacy-cloze.tid'), legacyCloze);
  fs.writeFileSync(path.join(tiddlersDir, 'legacy-qa.tid'), legacyQa);

  const tool = path.resolve(here, '../../tools/migrate-manual-cards.cjs');
  const run = (extra) => execFileSync(process.execPath, [tool, wikiDir, ...extra], { encoding: 'utf8' });

  // 预览：不改盘
  const preview = run([]);
  assert.match(preview, /\[cloze\] 旧挖空卡/);
  assert.match(preview, /\[qa\] 旧问答卡/);
  assert.ok(!fs.readFileSync(path.join(tiddlersDir, 'legacy-cloze.tid'), 'utf8').includes('tidme.kind'), '预览不写盘');

  // --apply：写回
  const applied = run(['--apply']);
  assert.match(applied, /迁移 2 张/);

  // 重新启动独立 TW 校验落盘结果
  const tw2 = TiddlyWiki.TiddlyWiki();
  tw2.boot.argv = [wikiDir];
  tw2.boot.boot();
  const c = tw2.wiki.getTiddler('旧挖空卡');
  const q = tw2.wiki.getTiddler('旧问答卡');
  assert.equal(c.fields['tidme.kind'], 'item');
  assert.equal(c.fields['tidme.subkind'], 'cloze', 'caption 含 <<C → cloze');
  assert.equal(q.fields['tidme.kind'], 'item');
  assert.equal(q.fields['tidme.subkind'], 'qa');
  assert.equal(q.fields.reps, '3', '其余字段不动');
});

test('气泡类名契约: section-bar 只管理自己的 tm-section-bubble，与全局 pick-bubble 不互删', () => {
  const src = fs.readFileSync(path.resolve(here, '../../src/tidme/import/widgets/section.ts'), 'utf8');
  // 断言用引号无关正则（dprint preferSingle 会改写源码引号风格，字符串内容才是契约）
  assert.ok(/querySelector\(['"]\.tm-section-bubble['"]\)/.test(src), 'section-bar 应只查询自己的气泡类');
  assert.ok(!/querySelector\(['"]\.tm-selection-bubble['"]\)/.test(src), '不得按共享类名查询（会误删全局气泡）');
  const pick = fs.readFileSync(path.resolve(here, '../../src/tidme/import/widgets/pick-bubble.ts'), 'utf8');
  assert.ok(pick.includes('tm-pick-bubble'), '全局气泡独立类名');
  assert.ok(pick.includes('tm-selection-bubble'), '保留共享样式类');
});
