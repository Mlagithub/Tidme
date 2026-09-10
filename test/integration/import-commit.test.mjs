/*
import-commit.test.mjs — core/import-commit（对齐落库唯一实现）+ doc-ops.docItemsFilter 回归测试

背景：split.ts / import.ts 曾各自实现"alignCards 三路写库 + 文档页落位"，细节漂移；
docItemFilter 曾把 ITEM_FILTER 拼出第二个 run（并集），把全库 item 混进"复习本书"。
同名节丢弃 / 同名 tiddler 跳过 / 同名书碰撞三类异常都必须计数上报（旧实现静默丢弃）。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod, reset } = bootPlugin({ prefix: 'tidme-commit-' });
let parseMod, commitMod, docOps, nsMod;
test.before(() => {
  parseMod = mod('import/parse.js');
  commitMod = mod('core/import-commit.js');
  docOps = mod('core/doc-ops.js');
  nsMod = mod('core/ns.js');
});

test.beforeEach(reset);

/** 文档页（宿主页）也是 kind=topic，故按 tidme-doc 标签排除，只取节卡 */
function sectionTitles(docId) {
  return wiki.filterTiddlers(
    `[tidme.doc[${docId}]tidme.kind[topic]!tidme.subkind[extract]!tag[tidme-doc]nsort[tidme.order]]`,
  );
}

test('import-commit: 首次导入全量写库；rewriteDocPage 把卡 docpage 统一改写为最终文档页 title', async () => {
  const r = await parseMod.runSplit({ text: '# 一\n\n内容一。\n\n# 二\n\n内容二。', title: '落库书', type: 'text/markdown', minChars: 0 });
  const [doc, ...cards] = r.tiddlers;
  const res = await commitMod.commitImportToWiki(wiki, {
    docId: r.docId,
    docTiddler: { ...doc, title: '覆盖后的文档页' },
    docTitle: '覆盖后的文档页',
    cards,
    rewriteDocPage: true,
  });
  assert.equal(res.aligned, false);
  assert.equal(res.created, 2, '两张节卡全量写');
  for (const t of sectionTitles(r.docId)) {
    assert.equal(wiki.getTiddler(t).fields['tidme.docpage'], '覆盖后的文档页', 'docpage 已改写为最终 title');
  }
  assert.ok(wiki.getTiddler('覆盖后的文档页'), '文档页以 docTitle 落库');
});

test('import-commit: 重导入对齐——未变节保 SRS 进度、内容变重挂接、消失节归档', async () => {
  const r1 = await parseMod.runSplit({ text: '# 甲\n\n内容甲。\n\n# 乙\n\n内容乙。', title: '对齐书', type: 'text/markdown', minChars: 0 });
  for (const t of r1.tiddlers) wiki.addTiddler(t);
  const sec1 = sectionTitles(r1.docId);
  // 模拟复习进度：第一节已评分（state=2, reps=1）
  wiki.addTiddler({ ...wiki.getTiddler(sec1[0]).fields, state: '2', reps: '1' });
  const oldFields = wiki.getTiddler(sec1[0]).fields;

  // 重切：甲内容变、乙消失、新增丙
  const r2 = await parseMod.runSplit({ text: '# 甲\n\n内容甲（修订）。\n\n# 丙\n\n内容丙。', title: '对齐书', type: 'text/markdown', minChars: 0 });
  const [doc2, ...cards2] = r2.tiddlers;
  const res = await commitMod.commitImportToWiki(wiki, { docId: r2.docId, docTiddler: doc2, docTitle: doc2.title, cards: cards2 });

  assert.equal(res.aligned, true);
  assert.equal(res.archived, 1, '乙消失 → 归档 1 张');
  const archived = sec1.map((t) => wiki.getTiddler(t)).find((f) => f.fields.caption === '乙');
  assert.equal(archived.fields['tidme.done'], 'yes', '归档卡置 done 出队');
  assert.equal(archived.fields['tidme.obsolete'], 'yes');

  assert.equal(wiki.getTiddler(sec1[0]).fields.state, '2', '甲重挂接后 SRS 进度保留');
  assert.equal(wiki.getTiddler(sec1[0]).fields.reps, '1');
  assert.ok(String(wiki.getTiddler(sec1[0]).fields.text).includes('修订'), '甲内容已更新');

  const nowTitles = sectionTitles(r2.docId);
  // 乙已被归档 → 它不再出现在"可读节"集合里（sectionTitles 不排除归档卡，故按 done 判定）
  assert.ok(!nowTitles.includes(sec1[1]) || wiki.getTiddler(sec1[1]).fields['tidme.done'] === 'yes', '归档节不回队列');
  assert.equal(res.created, 1, '只有丙是新增节（甲重挂接、乙归档）');
  assert.ok(nowTitles.some((t) => wiki.getTiddler(t).fields.caption === '丙'));
});

test('import-commit: 对齐模式下同 key 换 ID 的新卡不重复写（ordinal 漂移防御）', async () => {
  // 旧卡：key = "漂移书 › 章"（title 带旧 ID）
  const oldTitle = 'Tidme/Docs/漂移书/旧s000';
  wiki.addTiddler({
    title: oldTitle,
    caption: '章',
    text: '旧内容',
    'tidme.doc': 'ddrift',
    'tidme.id': 's000',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.breadcrumb': '漂移书 › 章',
    'tidme.order': '000000',
    'tidme.docpage': 'Tidme/Docs/漂移书',
  });
  // 新产物：同 trail key 但 ID 漂移 → 新 title；另有 1 张 keyless 卡（应防御性补写）
  const newSameKey = {
    title: 'Tidme/Docs/漂移书/新s111',
    caption: '章',
    text: '新内容',
    'tidme.doc': 'ddrift',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.breadcrumb': '漂移书 › 章',
    'tidme.order': '000001',
  };
  const keyless = {
    title: 'Tidme/Docs/漂移书/manual-手记',
    caption: '手记',
    text: '手写',
    'tidme.doc': 'ddrift',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
  };
  const doc = { title: 'Tidme/Docs/漂移书', tags: ['tidme-doc'], 'tidme.doc': 'ddrift', text: '' };
  const res = await commitMod.commitImportToWiki(wiki, {
    docId: 'ddrift',
    docTiddler: doc,
    docTitle: doc.title,
    cards: [newSameKey, keyless],
  });
  assert.equal(res.aligned, true);
  assert.ok(wiki.getTiddler(oldTitle), '同 key 旧卡保留（SRS 进度载体）');
  assert.ok(!wiki.getTiddler(newSameKey.title), '同 key 换 ID 的新卡不得写出（防重复节）');
  assert.ok(wiki.getTiddler(keyless.title), 'keyless 漏网新卡防御性补写');
  assert.equal(wiki.getTiddler(oldTitle).fields.text, '新内容', '同 key 旧卡内容重挂接为新内容');
});

test('import-commit: 同名节多张新卡 → 保留一张并上报 dropped/ambiguous（不再静默丢内容）', async () => {
  // 旧卡：key = "重名书 › 章"
  const oldTitle = 'Tidme/Docs/重名书/旧s000';
  wiki.addTiddler({
    title: oldTitle,
    caption: '章',
    text: '旧内容',
    'tidme.doc': 'ddup',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.breadcrumb': '重名书 › 章',
    'tidme.order': '000000',
  });
  const mk = (id, text) => ({
    title: `Tidme/Docs/重名书/${id}`,
    caption: '章',
    text,
    'tidme.doc': 'ddup',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.breadcrumb': '重名书 › 章',
    'tidme.order': '000001',
  });
  const doc = { title: 'Tidme/Docs/重名书', tags: ['tidme-doc'], 'tidme.doc': 'ddup', text: '' };
  const res = await commitMod.commitImportToWiki(wiki, {
    docId: 'ddup',
    docTiddler: doc,
    docTitle: doc.title,
    cards: [mk('新a111', '新内容甲'), mk('新b222', '新内容乙')],
  });
  assert.equal(res.aligned, true);
  assert.equal(res.dropped, 1, '同 key 两张新卡只能采用一张，另一张计入 dropped');
  assert.equal(res.ambiguous, 1, '该 key 被标记为歧义');
  assert.equal(res.created, 0, '被采用的走旧卡重挂接，不新建');
  assert.ok(!wiki.getTiddler('Tidme/Docs/重名书/新b222'), '未被采用的新卡不写库');
});

test('import-commit: 未变节与重挂接节都记为"已消费"（不再走防御性写，不会重复建卡）', async () => {
  const r = await parseMod.runSplit({ text: '# 甲\n\n甲。\n\n# 乙\n\n乙。', title: '无歧义书', type: 'text/markdown', minChars: 0 });
  const [doc, ...cards] = r.tiddlers;
  await commitMod.commitImportToWiki(wiki, { docId: r.docId, docTiddler: doc, docTitle: doc.title, cards });
  const secs = sectionTitles(r.docId);
  assert.equal(secs.length, 2, '首导两张节卡');

  // 甲内容变（重挂接）、乙未变（unchanged）
  const r2 = await parseMod.runSplit({ text: '# 甲\n\n甲改。\n\n# 乙\n\n乙。', title: '无歧义书', type: 'text/markdown', minChars: 0 });
  const [doc2, ...cards2] = r2.tiddlers;
  const res = await commitMod.commitImportToWiki(wiki, { docId: r2.docId, docTiddler: doc2, docTitle: doc2.title, cards: cards2 });
  assert.equal(res.created, 0, '没有新节 → 不新建');
  assert.equal(res.dropped, 0);
  assert.equal(res.ambiguous, 0);
  assert.equal(res.skippedExisting, 0, '未变/重挂接的节被对齐消费，不计为"同名跳过"');
  assert.equal(sectionTitles(r2.docId).length, 2, '节数不变（未重复建卡）');
});

test('import-commit: 对齐未消费的新卡若标题已存在 → 跳过并计入 skippedExisting（不覆盖别人的内容）', async () => {
  // 旧卡：breadcrumb 等于文档标题 → trail key 为空，对齐只归档不配对
  const docTitle = 'Tidme/Docs/撞名书';
  const collide = 'Tidme/Docs/撞名书/manual-手记';
  wiki.addTiddler({
    title: collide,
    caption: '手记',
    text: '既有内容',
    'tidme.doc': 'dclash',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.breadcrumb': docTitle,
  });
  const doc = { title: docTitle, tags: ['tidme-doc'], 'tidme.doc': 'dclash', text: '' };
  const res = await commitMod.commitImportToWiki(wiki, {
    docId: 'dclash',
    docTiddler: doc,
    docTitle,
    cards: [{
      title: collide,
      caption: '手记',
      text: '新内容',
      'tidme.doc': 'dclash',
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.breadcrumb': docTitle,
    }],
  });
  assert.equal(res.skippedExisting, 1, '同名 tiddler 存在 → 跳过并计数');
  assert.equal(wiki.getTiddler(collide).fields.text, '既有内容', '既有内容未被覆盖');
});

test('doc-ops.docItemsFilter: 只匹配本书在队 item（回归：拼接并集曾把全库 item 混入复习本书）', () => {
  wiki.addTiddler({ title: 'a1', 'tidme.doc': 'docA', 'tidme.kind': 'item', 'tidme.subkind': 'qa' });
  wiki.addTiddler({ title: 'a2', 'tidme.doc': 'docA', 'tidme.kind': 'item', 'tidme.subkind': 'cloze', 'tidme.done': 'yes' });
  wiki.addTiddler({ title: 'a3', 'tidme.doc': 'docA', 'tidme.kind': 'item', 'tidme.subkind': 'qa', 'tidme.suspended': 'yes' });
  wiki.addTiddler({ title: 'b1', 'tidme.doc': 'docB', 'tidme.kind': 'item', 'tidme.subkind': 'qa' });
  wiki.addTiddler({ title: 't1', 'tidme.doc': 'docA', 'tidme.kind': 'topic', 'tidme.subkind': 'section' });
  assert.deepEqual([...wiki.filterTiddlers(docOps.docItemsFilter('docA'))], ['a1'], '仅本书、未 done/ignored/suspended 的 item；他书卡与 topic 不入');
  // 阅读队列过滤器常量同样唯一产地
  assert.equal(wiki.filterTiddlers(nsMod.TOPIC_QUEUE_FILTER).includes('t1'), true);
  assert.equal(wiki.filterTiddlers(nsMod.TOPIC_QUEUE_FILTER).includes('a1'), false, 'item 不进阅读队列');
});

test('import-commit: 词书牌组页（legacy kind=topic + tidme.doc）不进入对齐（回归：曾缺 !tag 排除）', async () => {
  // 同 docId 的"旧卡"里混入牌组页：带 TidmeDeck 标签 + legacy kind=topic + tidme.doc
  wiki.addTiddler({
    title: '$:/Deck/词书A',
    tags: ['$:/tags/TidmeDeck'],
    caption: '词书A',
    'tidme.kind': 'topic',
    'tidme.doc': 'd-deckpage',
    'tidme.breadcrumb': '词书A',
  });
  const r = await parseMod.runSplit({ text: '# 一\n\n内容一。\n\n# 二\n\n内容二。', title: '词书宿主书', type: 'text/markdown', minChars: 0 });
  const [doc, ...cards] = r.tiddlers;
  const res = await commitMod.commitImportToWiki(wiki, {
    docId: 'd-deckpage',
    docTiddler: doc,
    docTitle: doc.title,
    cards,
  });
  assert.equal(res.aligned, false, '牌组页不算旧节卡 → 不走对齐路径');
  const deck = wiki.getTiddler('$:/Deck/词书A').fields;
  assert.equal(deck['tidme.done'], undefined, '牌组页不得被归档出队');
  assert.equal(deck['tidme.obsolete'], undefined, '牌组页不得被标记 obsolete');
  assert.equal(deck.caption, '词书A', '牌组页内容不得被对齐重写');
});

test('import-commit: 同名书碰撞检测——旧节无一保留且批量消失时 collisionSuspect 告警', async () => {
  const r1 = await parseMod.runSplit({ text: '# 一\n\n甲。\n\n# 二\n\n乙。\n\n# 三\n\n丙。', title: '碰撞书', type: 'text/markdown', minChars: 0 });
  for (const t of r1.tiddlers) wiki.addTiddler(t);

  // 场景 A：完全不同的内容（另一本同名书）→ collisionSuspect
  const r2 = await parseMod.runSplit({ text: '# X\n\n完全不同一。\n\n# Y\n\n完全不同二。', title: '碰撞书', type: 'text/markdown', minChars: 0 });
  const [doc2, ...cards2] = r2.tiddlers;
  const resA = await commitMod.commitImportToWiki(wiki, { docId: r2.docId, docTiddler: doc2, docTitle: doc2.title, cards: cards2 });
  assert.equal(resA.aligned, true);
  assert.equal(resA.collisionSuspect, true, '无一保留 + 批量消失 → 疑似另一本书');

  // 场景 B：修订版（有未变节）→ 不告警。重导原始内容
  const r3 = await parseMod.runSplit({ text: '# 一\n\n甲。\n\n# 二\n\n乙。\n\n# 三\n\n丙。', title: '碰撞书', type: 'text/markdown', minChars: 0 });
  const [doc3, ...cards3] = r3.tiddlers;
  const resB = await commitMod.commitImportToWiki(wiki, { docId: r3.docId, docTiddler: doc3, docTitle: doc3.title, cards: cards3 });
  assert.equal(resB.aligned, true);
  assert.equal(resB.collisionSuspect, false, '存在未变节 → 视为修订版，不误报');
});

test('import-commit: 消失的节归档后再次出现 → 复活回队（不永久 done+obsolete）', async () => {
  const md = '# 复活书\n\n甲内容。\n\n# 乙章\n\n乙内容。';
  const r1 = await parseMod.runSplit({ text: md, title: '复活书', type: 'text/markdown', minChars: 0 });
  const [doc1, ...cards1] = r1.tiddlers;
  await commitMod.commitImportToWiki(wiki, { docId: r1.docId, docTiddler: doc1, docTitle: doc1.title, cards: cards1 });
  const yi = cards1.find((c) => String(c.caption || '').includes('乙'));
  assert.ok(yi, '找到乙章');

  // 只导入甲 → 乙被归档（obsolete + done）
  const r2 = await parseMod.runSplit({ text: '# 复活书\n\n甲内容。', title: '复活书', type: 'text/markdown', minChars: 0 });
  const [doc2, ...cards2] = r2.tiddlers;
  await commitMod.commitImportToWiki(wiki, { docId: r2.docId, docTiddler: doc2, docTitle: doc2.title, cards: cards2 });
  const archived = wiki.getTiddler(yi.title).fields;
  assert.equal(archived['tidme.obsolete'], 'yes', '乙被归档');
  assert.equal(archived['tidme.done'], 'yes', '归档即出队');

  // 乙再次出现 → 必须复活（旧实现：归档卡仍参与对齐 → 新卡被跳过，永久不回队）
  const r3 = await parseMod.runSplit({ text: md, title: '复活书', type: 'text/markdown', minChars: 0 });
  const [doc3, ...cards3] = r3.tiddlers;
  await commitMod.commitImportToWiki(wiki, { docId: r3.docId, docTiddler: doc3, docTitle: doc3.title, cards: cards3 });
  const revived = wiki.getTiddler(yi.title).fields;
  assert.equal(revived['tidme.obsolete'], undefined, '复活后不再归档');
  assert.equal(revived['tidme.done'], undefined, '复活后回到队列');
  assert.ok(
    wiki.filterTiddlers(`[tidme.doc[${r3.docId}]tidme.kind[topic]!tag[tidme-doc]]`).includes(yi.title),
    '乙重新出现在阅读单元集合中',
  );
});
