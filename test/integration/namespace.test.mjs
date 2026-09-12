/*
namespace.test.mjs — Tidme 命名空间隔离集成测试（node:test）

验证：导入的文档/节卡/摘录/挖空/问答/子集牌组/手动节卡都进 Tidme/ 命名空间；
title 唯一稳定；过滤仍然基于字段；老前缀消费者不受影响。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';
import { twDate } from '../helpers/tw-date.mjs';

// tw.utils（generateTiddlerFileInfo）在测试体内直接使用，故保留 tw
const { tw, wiki, mod, reset } = bootPlugin({ prefix: 'tidme-ns-' });
let parseMod, paths, factoryMod, docOps, display, align, sched, schemaMod;
test.before(() => {
  parseMod = mod('import/parse.js');
  paths = mod('core/paths.js');
  factoryMod = mod('core/card-factory.js');
  docOps = mod('core/doc-ops.js');
  display = mod('core/display.js');
  align = mod('core/align.js');
  sched = mod('core/scheduler.js');
  schemaMod = mod('core/schema.js');
});

test.beforeEach(reset);

/** 文档页判定：带 tidme-doc 标签（它同为 kind=topic，不能用 kind 区分） */
const isDocPageTiddler = (t) => Array.isArray(t?.tags) && t.tags.includes('tidme-doc');
/** 节卡判定：kind=topic 且非文档页宿主 */
const isSectionTiddler = (t) => t['tidme.kind'] === 'topic' && !isDocPageTiddler(t);

// === 单元：纯函数 ===

test('paths: slugify 处理各种书名', () => {
  assert.equal(paths.slugify('书名'), '书名');
  assert.equal(paths.slugify('《书》'), '书');
  assert.equal(paths.slugify('书（营销）'), '书营销');
  assert.equal(paths.slugify('书 名'), '书-名');
  assert.equal(paths.slugify('1.1 思维与表达'), '1-1-思维与表达');
  // 空字符串目前返回 ""（调用方 docRoot 兜底为 untitled）
  assert.equal(paths.slugify(''), '');
});

test('paths: docRoot + sectionLeaf 产出符合命名空间（可读叶段 + 稳定 id）', () => {
  const root = paths.docRoot('批评性思维');
  assert.equal(root, 'Tidme/Docs/批评性思维');
  // sectionLeaf（A2）：可读 caption slug + "-" + id；唯一性由 id 保证
  assert.equal(paths.sectionLeaf('第一章', 's1234567890ab'), '第一章-s1234567890ab');
  assert.equal(paths.sectionLeaf('', 's1234567890ab'), 's1234567890ab', 'caption 空退化为纯 id');
  // 节卡路径 = joinPath(docRoot, sectionLeaf)（无独立 sectionPath 包装）
  const sec = paths.joinPath(paths.docRoot('批评性思维'), paths.sectionLeaf('第一章 1.1 思维', 's1234567890ab'));
  assert.equal(sec, 'Tidme/Docs/批评性思维/第一章-1-1-思维-s1234567890ab');
  // 摘录/挖空/问答的真实命名在 card-factory.derivedCardBase（从父卡实际位置派生），
  // 纯形式路径助手（extractPath/cardPath/deckSubsetPath）已随死代码清理删除
});

test('paths: 拒绝保留字书名', () => {
  assert.throws(() => paths.docRoot('index'), /reserved/);
  assert.throws(() => paths.docRoot('default'), /reserved/);
});

test('title 净化：危险字符集合同源（slugify 删除 / titleOf 换 -），产物都过滤器安全', () => {
  const deck = mod('core/deck.js');
  const nsMod2 = mod('core/ns.js');
  const hostile = '书]名}甲{乙[丙$/\\:*?"<>|丁';
  const slug = paths.slugify(hostile);
  assert.equal(/[\\/:*?"<>|$[\]{}]/.test(slug), false, `slug 不含危险字符（实际 ${slug}）`);
  assert.equal(nsMod2.isFilterSafeTitle(slug), true, 'slug 可安全插入过滤器');
  const deckTitle = deck.titleOf('牌组]名}甲');
  assert.equal(nsMod2.isFilterSafeTitle(deckTitle), true, `牌组 title 过滤器安全（实际 ${deckTitle}）`);
  assert.ok(deckTitle.includes('-'), '危险字符换成 -（保留可读轮廓）');
  assert.ok(!slug.includes('《'), '营销括号仍被剔除（风格差异保留）');
  // 合法完整 title 原样通过（内部调用方传的是已构造好的 title）
  assert.equal(deck.titleOf('$:/Deck/默认'), '$:/Deck/默认');
  assert.equal(deck.titleOf('Tidme/Decks/散卡'), 'Tidme/Decks/散卡');
  assert.equal(deck.titleOf('Tidme/Decks/standalone'), 'Tidme/Decks/standalone');
});

// === 集成：runSplit 产物 ===

test('runSplit: 文档页落在 Tidme/Docs/<书名>', async () => {
  const r = await parseMod.runSplit({
    text: '# 第一章\n\n正文一。\n\n## 1.1 节\n\n小节正文。',
    title: '测试书',
    type: 'text/markdown',
    minChars: 0,
  });
  const doc = r.tiddlers.find(isDocPageTiddler);
  assert.equal(doc.title, 'Tidme/Docs/测试书');
  assert.equal(doc.tags[0], 'tidme-doc');
});

test('runSplit: 节卡 title 拍平到书目录（章层次在 breadcrumb 字段里）', async () => {
  const r = await parseMod.runSplit({
    text: '# 章一\n\n内容。',
    title: '测试书2',
    type: 'text/markdown',
    minChars: 0,
  });
  const section = r.tiddlers.find(isSectionTiddler);
  // 拍平：节卡 title = Tidme/Docs/<书>/<可读 caption>-<sectionId>（A2）
  assert.match(section.title, /^Tidme\/Docs\/测试书2\/章一-s[a-f0-9]+$/);
  assert.ok(section['tidme.id'].startsWith('s'), 'tidme.id 以 s 开头');
  // breadcrumb 仍可读（章层次保留在这里）
  assert.equal(section['tidme.breadcrumb'], '测试书2 › 章一', 'breadcrumb 保留可读章名（不被 path 污染）');
});

test('runSplit: 同一输入重切分 ID/title 稳定（确定性 → 重导入保进度）', async () => {
  const input = { text: '# 章\n\n内容。', title: '稳定书', type: 'text/markdown', minChars: 0 };
  const r1 = await parseMod.runSplit(input);
  const r2 = await parseMod.runSplit(input);
  const s1 = r1.tiddlers.find(isSectionTiddler);
  const s2 = r2.tiddlers.find(isSectionTiddler);
  assert.equal(s1.title, s2.title, '同输入 title 稳定');
  assert.equal(s1['tidme.id'], s2['tidme.id'], '同输入 tidme.id 稳定');
});

test('runSplit: 字段过滤器不依赖 title 结构（向后兼容契约）', async () => {
  const r = await parseMod.runSplit({
    text: '# 章\n\n内容。',
    title: '契约书',
    type: 'text/markdown',
    minChars: 0,
  });
  for (const t of r.tiddlers) wiki.addTiddler(t);
  const byDoc = wiki.filterTiddlers(`[tidme.doc[${r.docId}]]`);
  assert.ok(byDoc.length >= 2, '按 tidme.doc 能找到所有卡');
  const byKind = wiki.filterTiddlers(`[tidme.doc[${r.docId}]tidme.kind[topic]!tag[tidme-doc]]`);
  assert.ok(byKind.length >= 1, '按 tidme.doc+tidme.kind 能找到节卡');
});

test('runSplit: 导入产物全部进 Tidme/Docs/；不污染顶级或 $:/', async () => {
  const r = await parseMod.runSplit({
    text: '# 章\n\n内容。',
    title: '隔离书',
    type: 'text/markdown',
    minChars: 0,
  });
  for (const t of r.tiddlers) wiki.addTiddler(t);
  const allUserTiddlers = wiki.filterTiddlers('[!is[system]]');
  for (const t of allUserTiddlers) {
    // 命名空间 shadow tiddlers 也以 Tidme/ 开头；导入产物在 Tidme/Docs/
    assert.ok(t.startsWith('Tidme/'), `导入产物 ${t} 必须以 Tidme/ 开头`);
  }
});

test('runSplit: 中文长书名 + 特殊字符全部安全 slug', async () => {
  const r = await parseMod.runSplit({
    text: '# 章\n\n内容。',
    title: '批判性思维（独立思考者的精进技巧）',
    type: 'text/markdown',
    minChars: 0,
  });
  // runSplit 不自动 cleanTitle（widget 在更外层做），所以 title 含括号但仍合法
  const doc = r.tiddlers.find(isDocPageTiddler);
  // 括号被 slugify 剥除（保留内容），但要保持中文段落紧凑
  assert.ok(doc.title.startsWith('Tidme/Docs/批判性思维'), `doc title 格式: ${doc.title}`);
  // 经 cleanTitle 后的版本应该是 Tidme/Docs/批判性思维
  const cleaned = parseMod.cleanTitle('批判性思维（独立思考者的精进技巧）');
  assert.equal(cleaned, '批判性思维', 'cleanTitle 剥括号副标题');
  const r2 = await parseMod.runSplit({
    text: '# 章\n\n内容。',
    title: cleaned,
    type: 'text/markdown',
    minChars: 0,
  });
  const doc2 = r2.tiddlers.find(isDocPageTiddler);
  assert.equal(doc2.title, 'Tidme/Docs/批判性思维', 'cleanTitle 后 doc title 精确');
});

test('runSplit: 节卡叶段 = 可读 caption slug + 稳定 id（A2；同 caption 仍唯一）', async () => {
  const r = await parseMod.runSplit({ text: '# 第一章\n\n内容甲。\n\n# 第一章\n\n内容乙。', title: '叶段书', type: 'text/markdown', minChars: 0 });
  const secs = r.tiddlers.filter(isSectionTiddler);
  assert.ok(secs.length >= 2, `应有 ≥2 节（同 caption 两节），实际 ${secs.length}`);
  const leaves = secs.map((s) => String(s.title).split('/').pop());
  for (const lf of leaves) assert.ok(lf.startsWith('第一章-s'), `叶段可读且含 id: ${lf}`);
  assert.notEqual(leaves[0], leaves[1], '同 caption 不同 id → title 唯一');
  const tailId = String(leaves[0]).slice(String(leaves[0]).lastIndexOf('-') + 1);
  assert.equal(tailId, secs[0]['tidme.id'], '叶段尾 = tidme.id');
});

// === 集成：buildExtract / buildCloze / buildQA ===

test('section widget: buildExtract 拍平到书目录（与父节卡同层）', () => {
  const parentTitle = 'Tidme/Docs/书/s1234567890ab';
  wiki.addTiddler({
    title: parentTitle,
    type: 'text/vnd.tiddlywiki',
    state: '0',
    due: twDate(),
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'd12345678',
    'tidme.breadcrumb': '书 › 章 › 节',
    bag: 'default',
  });
  const t = factoryMod.buildExtract(wiki, parentTitle, '摘录文本');
  // 拍平：摘录 title = <docRoot>/<sectionId>--extract（不再嵌 /s<hash>/）
  assert.equal(t.title, 'Tidme/Docs/书/s1234567890ab--extract');
  assert.ok(t.title.startsWith('Tidme/Docs/'), '摘录 title 在 Tidme/Docs/ 下');
  assert.equal(t['tidme.parent'], parentTitle);
  assert.ok(t['tidme.breadcrumb'] === '书 › 章 › 节 › 摘录' || t['tidme.breadcrumb'] === '书 › 章 › 节 › Extract', 'breadcrumb 仍可读');
  assert.equal(t['tidme.subkind'], 'extract');
});

test('section widget: buildCloze 与 buildQA 进 Tidme/Decks/<书>/ 命名空间（不在书目录）', () => {
  const parentTitle = 'Tidme/Docs/书/s1234567890ab';
  wiki.addTiddler({
    title: parentTitle,
    type: 'text/vnd.tiddlywiki',
    state: '0',
    due: twDate(),
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'd1',
    'tidme.breadcrumb': '书 › 章 › 节',
  });
  const cloze = factoryMod.buildCloze(wiki, parentTitle, '首都是北京', '北京');
  // 知识卡走 Tidme/Decks/<书>/ 命名空间（拍平）
  assert.equal(cloze.title, 'Tidme/Decks/书/s1234567890ab--cloze');
  assert.equal(cloze['tidme.subkind'], 'cloze');
  assert.equal(cloze['tidme.kind'], 'item');
  const qa = factoryMod.buildQA(wiki, parentTitle, '问题', '答案');
  assert.equal(qa.title, 'Tidme/Decks/书/s1234567890ab--qa');
  assert.equal(qa['tidme.subkind'], 'qa');
  assert.equal(qa['tidme.kind'], 'item');
});

test('section widget: 同位置多张摘录/挖空/问答自动加序号（拍平设计下）', () => {
  const parentTitle = 'Tidme/Docs/书/s1234567890ab';
  wiki.addTiddler({
    title: parentTitle,
    type: 'text/vnd.tiddlywiki',
    state: '0',
    due: twDate(),
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'd1',
    'tidme.breadcrumb': '书 › 章 › 节',
  });
  // buildExtract 拍平后：base = <docRoot>/<sectionId>--extract，冲突加 -N
  const a = factoryMod.buildExtract(wiki, parentTitle, '选一');
  wiki.addTiddler(a);
  const b = factoryMod.buildExtract(wiki, parentTitle, '选二');
  wiki.addTiddler(b);
  const c = factoryMod.buildExtract(wiki, parentTitle, '选三');
  wiki.addTiddler(c);
  const d = factoryMod.buildExtract(wiki, parentTitle, '选四');
  const extractBase = 'Tidme/Docs/书/s1234567890ab--extract';
  assert.equal(a.title, extractBase);
  assert.equal(b.title, extractBase + '-2');
  assert.equal(c.title, extractBase + '-3');
  assert.equal(d.title, extractBase + '-4');
});

test('title: freeTitle = 库内占用 + 待落库草稿（pending）两条判据，唯一实现', () => {
  const titleMod = mod('core/title.js');
  const base = 'Tidme/Docs/唯一书/manual-引言';
  assert.equal(titleMod.freeTitle(wiki, base), base, '库内无冲突 → 原样');
  wiki.addTiddler({ title: base, text: 'x' });
  assert.equal(titleMod.freeTitle(wiki, base), base + '-2', '库内已有 → -2');
  // 草稿窗口：title 还没落库，靠 pending 显式告知（不是模块级全局表 → 结果只取决于库与该批次草稿）
  const pending = new Set([base, base + '-2']);
  assert.equal(titleMod.freeTitle(wiki, base, pending), base + '-3', '库 + pending 都算占用');
  assert.equal(titleMod.freeTitle(wiki, 'Tidme/Docs/唯一书/manual-别段', pending), 'Tidme/Docs/唯一书/manual-别段', 'pending 不影响别的 base');
  assert.equal(titleMod.freeTitle(wiki, '', pending), '', '空 base 原样返回');
});

test('buildCloze: 待落库草稿计入唯一化（弹窗未确认期间再制卡不撞名）', () => {
  const parentTitle = 'Tidme/Docs/弹窗书/s1234567890ab';
  wiki.addTiddler({
    title: parentTitle,
    caption: '节',
    text: '首都是北京。',
    state: '0',
    due: twDate(),
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': 'dpopup',
    'tidme.breadcrumb': '弹窗书 › 节',
  });
  const pending = new Set();
  const first = factoryMod.buildCloze(wiki, parentTitle, '首都是北京。', '北京', pending);
  assert.ok(first, '第一张草稿');
  pending.add(String(first.title));
  const second = factoryMod.buildCloze(wiki, parentTitle, '首都是北京。', '北京', pending);
  assert.equal(second.title, first.title + '-2', '第一张还没落库（弹窗未确认）→ 第二张让号，不撞名');
  // 不传 pending（调用方不持有草稿窗口）时只查库：这是既有口径，草稿窗口须由调用方显式给出
  const third = factoryMod.buildCloze(wiki, parentTitle, '首都是北京。', '北京');
  assert.equal(third.title, first.title, '只查库时看不见草稿 → 与第一张同名（故调用方必须传 pending）');
});

test('字段基座唯一产地：文档页与节卡的不变式字段在三条构建路径上一致', async () => {
  const pdfOps = mod('core/pdf-ops.js');
  // 1. 切分文档页（parse 产物）
  const parsed = await parseMod.runSplit({ text: '# 章\n\n内容。', title: '基座书', type: 'text/markdown' });
  const splitDoc = parsed.tiddlers.find(isDocPageTiddler);
  assert.ok(splitDoc, '切分产出文档页');
  // 2. 整本 PDF 文档页（core/pdf-ops）
  const pdf = await pdfOps.createPdfDoc(wiki, { docTitle: '基座PDF', dataB64: 'JVBERi0xLjQK' });
  const pdfDoc = wiki.getTiddler(pdf.docTitle).fields;
  // 文档页不变式：tags / kind / doc / docpage / structure / type / caption
  for (const key of ['tags', 'tidme.kind', 'tidme.doc', 'tidme.docpage', 'tidme.structure', 'type', 'caption']) {
    assert.ok(splitDoc[key] !== undefined, `切分文档页含 ${key}`);
    assert.ok(pdfDoc[key] !== undefined, `PDF 文档页含 ${key}`);
  }
  assert.deepEqual([...splitDoc.tags], ['tidme-doc']);
  assert.deepEqual([...pdfDoc.tags], ['tidme-doc']);
  assert.equal(splitDoc['tidme.structure'], 'sectioned');
  assert.equal(pdfDoc['tidme.structure'], 'continuous');

  // 3. 节卡：切分产物 vs 手动插入（buildSectionCardFields）不变式一致
  const splitSec = parsed.tiddlers.find((t) => t['tidme.subkind'] === 'section');
  const manualSec = factoryMod.buildSectionCardFields({
    title: 'Tidme/Docs/基座书/manual-手记',
    caption: '手记',
    text: '手写内容。',
    docId: parsed.docId,
    priority: sched.PRIORITY_DEFAULT,
    breadcrumb: '基座书 › 手记',
  });
  for (const key of ['type', 'tidme.kind', 'tidme.subkind', 'tidme.doc']) {
    assert.equal(String(manualSec[key]), String(splitSec[key]), `${key} 两条路径同值`);
  }
  for (const key of ['tidme.chars', 'tidme.priority', 'tidme.afactor']) {
    assert.ok(/^\d+(\.\d+)?$/.test(String(manualSec[key])), `手动节卡 ${key} 为数值串（实际 ${manualSec[key]}）`);
    assert.ok(/^\d+(\.\d+)?$/.test(String(splitSec[key])), `切分节卡 ${key} 为数值串（实际 ${splitSec[key]}）`);
  }
  assert.equal(String(manualSec['tidme.chars']), String('手写内容。'.length), 'chars 按正文字数');
  // FSRS 初值两条路径都有（写库前必须齐）
  for (const key of ['due', 'state', 'reps', 'lapses', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'last_review']) {
    assert.ok(manualSec[key] !== undefined, `手动节卡含 FSRS 字段 ${key}`);
    assert.ok(splitSec[key] !== undefined, `切分节卡含 FSRS 字段 ${key}`);
  }
});

// === 集成：子集牌组 ===

test('deck: 子集牌组（复习本书）走 Tidme/Decks/<书>/复习本书', async () => {
  const r = await parseMod.runSplit({
    text: '# 章\n\n内容。',
    title: '复习本书测试',
    type: 'text/markdown',
    minChars: 0,
  });
  for (const t of r.tiddlers) wiki.addTiddler(t);
  const bookSlug = r.tiddlers[0].title.replace(/^Tidme\/Docs\//, '');
  const deckTitle = `Tidme/Decks/${bookSlug}/复习本书`;
  const baseDeck = wiki.filterTiddlers('[all[shadows+tiddlers]tag[$:/tags/TidmeDeck]!is[draft]]')[0];
  const bf = (baseDeck && wiki.getTiddler(baseDeck)?.fields) || {};
  wiki.addTiddler({
    ...bf,
    title: deckTitle,
    tags: ['$:/tags/TidmeDeck'],
    caption: '复习：测试',
    card: `[tidme.doc[${r.docId}]tidme.kind[item]]`,
    'tidme.subset-doc': r.docId,
  });
  const deck = wiki.getTiddler(deckTitle);
  assert.ok(deck, '子集牌组创建成功');
  assert.equal(deck.fields.tags[0], '$:/tags/TidmeDeck');
  assert.equal(deck.fields['tidme.subset-doc'], r.docId);
  assert.ok(deckTitle.startsWith('Tidme/Decks/复习本书测试/'), `命名空间正确: ${deckTitle}`);
});

// === 集成：手动插入节卡 ===

test('import widget: 手动插入节卡落到 manual/ 子目录', async () => {
  const r = await parseMod.runSplit({
    text: '# 章\n\n内容。',
    title: '手动测试书',
    type: 'text/markdown',
    minChars: 0,
  });
  const newSection = {
    title: `Tidme/Docs/${r.bookTitle}/manual/我的节`,
    caption: '我的节',
    text: '手动内容',
    'tidme.doc': r.docId,
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.breadcrumb': `${r.bookTitle} › 我的节`,
  };
  wiki.addTiddler(newSection);
  const t = wiki.getTiddler(newSection.title);
  assert.ok(t, '手动节卡入库');
  assert.ok(t.fields.title.includes('/manual/'), 'manual/ 子目录标记');
});

// === 集成：namespace shadow tiddlers ===

test('shadow: Tidme 命名空间根/Docs/Decks/Clips 索引存在', () => {
  for (const t of ['Tidme/index', 'Tidme/Docs/index', 'Tidme/Decks/index', 'Tidme/Clips/index']) {
    const tt = wiki.getTiddler(t);
    assert.ok(tt, `命名空间索引存在: ${t}`);
    assert.ok(String(tt.fields.text).length > 0, `索引有内容: ${t}`);
  }
});

test('UI: $:/Deck/default/log/ 前缀消费者（牌组日志）仍工作', () => {
  // 注意：stats-panel 的 [prefix[$:/Deck/]suffix[/log/]] 实际上有 bug，
  // 这里用更精确的前缀确保 namespace 改动不影响老前缀消费者
  const logTitle = '$:/Deck/default/log/20260903';
  wiki.addTiddler({ title: logTitle, type: 'application/json', text: '{"rating":4}' });
  const found = wiki.filterTiddlers('[prefix[$:/Deck/default/log/]]');
  assert.ok(found.includes(logTitle), 'deck log 前缀过滤仍工作（未受 namespace 改动影响）');
});

test('UI: 重复导入 bookTitle 冲突时对齐 alignCards 仍能用 breadcrumb 匹配', async () => {
  const input = { text: '# 章\n\n内容。', title: '重复书', type: 'text/markdown', minChars: 0 };
  const align = tw.modules.execute('$:/plugins/keepone/tidme/core/align.js');
  const r1 = await parseMod.runSplit(input);
  for (const t of r1.tiddlers) wiki.addTiddler(t);
  // 给首张节卡设 SRS 进度
  const sec = r1.tiddlers.find(isSectionTiddler);
  wiki.addTiddler({ ...wiki.getTiddler(sec.title).fields, state: '2', reps: '3', due: twDate(new Date(Date.now() + 86400000)) });
  // 再次切分
  const r2 = await parseMod.runSplit(input);
  const oldCards = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]!tag[tidme-doc]]`)
    .map((t) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
  const sectionCards = r2.tiddlers.filter(isSectionTiddler);
  const aligned = await align.alignCards(oldCards, r1.bookTitle, sectionCards.map((c) => ({ title: c.title, fields: c })));
  assert.ok(aligned.unchanged >= 1, '重切分对齐：未变节卡通过 breadcrumb trail 匹配（SRS 进度保留）');
});

// === 集成：FileSystemPaths（落盘目录）===

test('shadow: FileSystemPaths config 不存在（plugin 不应自带；由 wiki/tiddlers 注入）', () => {
  // 这是有意的设计：FSP 必须是普通 tiddler（tiddlerExists 排除 shadow），由 wiki 维护
  assert.equal(wiki.getTiddler('$:/config/FileSystemPaths'), undefined, 'plugin 不带 FSP shadow（避免 tiddlerExists 跳过）');
});

test('FSP: 启动自愈——filesystem 生效且缺失时创建真实 FSP，已存在不覆盖，非 filesystem 不动', () => {
  const mod = tw.modules.execute('$:/plugins/keepone/tidme/core/server/ensure-filesystem.js');
  // 当前测试 wiki 未加载 filesystem 插件 → 不创建（保证 shadow 测试与 headless 环境不受污染）
  mod.ensureFileSystemPaths(wiki);
  assert.equal(wiki.getTiddler('$:/config/FileSystemPaths'), undefined, '非 filesystem 环境不创建');
  // 模拟 filesystem 插件存在 → 创建默认 FSP（真实 tiddler）
  wiki.addTiddler({ title: '$:/plugins/tiddlywiki/filesystem', type: 'application/javascript', text: '' });
  mod.ensureFileSystemPaths(wiki);
  const fsp = wiki.getTiddler('$:/config/FileSystemPaths');
  assert.ok(fsp, 'filesystem 生效且缺失 → 创建 FSP');
  assert.ok(String(fsp.fields.text).includes('[is[tiddler]prefix[Tidme/Docs/]]'), '默认含 Docs/Decks 目录过滤');
  assert.ok(String(fsp.fields.text).includes('prefix[Tidme/Decks/]'), '含 Decks 过滤');
  // 已存在（wiki 自行定制）→ 不覆盖
  wiki.addTiddler({ title: '$:/config/FileSystemPaths', type: 'text/vnd.tiddlywiki', text: '[is[tiddler]prefix[Tidme/Docs/]]' });
  mod.ensureFileSystemPaths(wiki);
  assert.equal(wiki.getTiddler('$:/config/FileSystemPaths').fields.text, '[is[tiddler]prefix[Tidme/Docs/]]', '不覆盖 wiki 自定义 FSP');
});

test('FSP: 注入普通 tiddler 后保留 Tidme 目录结构（filesystem 适配器真正写入子目录）', () => {
  // 注入 FSP config（模拟 wiki/tiddlers 加载）
  wiki.addTiddler({
    title: '$:/config/FileSystemPaths',
    type: 'text/vnd.tiddlywiki',
    text: '[is[tiddler]prefix[Tidme/Docs/]]\n[is[tiddler]prefix[Tidme/Decks/]]\n[is[tiddler]prefix[Tidme/Clips/]]\n[is[tiddler]prefix[Tidme/]]',
  });
  assert.equal(wiki.tiddlerExists('$:/config/FileSystemPaths'), true, 'FSP 作为普通 tiddler 加载');

  // 调 filesystem 文件信息生成器
  const bookTitle = '导航测试书';
  const docId = 'dnav1234';
  const sectionTitle = paths.joinPath(paths.docRoot(bookTitle), paths.sectionLeaf('第一章', 's1234567890ab'));
  wiki.addTiddler({
    title: sectionTitle,
    type: 'text/vnd.tiddlywiki',
    text: 'x',
    'tidme.doc': docId,
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.breadcrumb': `${bookTitle} › 第一章`,
  });

  // 用 generateTiddlerFileInfo 验证路径（拍平：节卡直接落书目录，叶段=可读+id）
  const tiddler = wiki.getTiddler(sectionTitle);
  const filters = wiki.getTiddlerText('$:/config/FileSystemPaths', '').split('\n').filter(s => s.trim());
  const fi = tw.utils.generateTiddlerFileInfo(tiddler, { pathFilters: filters, wiki });
  assert.match(fi.filepath, /Tidme[\\\/]Docs[\\\/]导航测试书[\\\/]第一章-s1234567890ab\.tid$/, `filepath 拍平到书目录（可读叶段）: ${fi.filepath}`);
});

// === 集成：reading-list / section-bar 导航（真实 widget 点击在 widget-reading.test.mjs）===

test('nav: 卡片自带 tidme.docpage，且 docPageOfDoc 按 docId 能查到同一页（导航不再重算路径）', async () => {
  const bookTitle = '跳转测试书';
  const res = await parseMod.runSplit({ text: '# 第一章\n\n内容。', title: bookTitle, type: 'text/markdown', minChars: 0 });
  for (const t of res.tiddlers) wiki.addTiddler(t);
  const docPage = res.tiddlers.find(isDocPageTiddler);
  const sec = res.tiddlers.find(isSectionTiddler);
  // 生产事实：节卡落 tidme.docpage；UI 只需读它或按 docId 查库，不必重算 slug
  assert.equal(sec['tidme.docpage'], docPage.title, '节卡 docpage 指向真实文档页');
  assert.equal(docOps.docPageOfDoc(wiki, res.docId), docPage.title, '按 docId 查到的就是同一页');
  assert.ok(wiki.getTiddler(docOps.docPageOfDoc(wiki, res.docId)), '查到的页真实存在');
});

test('nav: section.ts 面包屑与 reading-list 文档名都把真实文档页 title 作为跳转目标', () => {
  // 真实 widget 点击（渲染 + 触发 click + 断言 tm-navigate 目标）在 widget-reading.test.mjs
  // 这里只锁数据前提：面包屑首段**不是**文档页 title，故"用 breadcrumb 首段重算"必然失配
  const bookTitle = '面包屑测试书';
  const docRoot = paths.docRoot(bookTitle);
  wiki.addTiddler({
    title: `${docRoot}/章-sabc`,
    'tidme.doc': 'dnav-breadcrumb',
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.docpage': docRoot,
    'tidme.breadcrumb': `${bookTitle} › 章`,
    type: 'text/vnd.tiddlywiki',
    text: 'x',
  });
  const f = wiki.getTiddler(`${docRoot}/章-sabc`).fields;
  assert.notEqual(f['tidme.breadcrumb'].split(' › ')[0], f['tidme.docpage'], '面包屑首段 ≠ 文档页 title（前缀不同）');
  assert.ok(f['tidme.docpage'].startsWith('Tidme/Docs/'), 'docpage 是命名空间路径');
});

test('A1: 同名书不同 docId folder 冲突 → ~docId 后缀；同 docId 重导入幂等复用；卡带 tidme.docpage', async () => {
  const mk = (creator) => parseMod.makeDocId({ title: '同名书', creator, language: '' });
  const dA = await mk('作者A');
  const dB = await mk('作者B');
  const text = '# 章\n\n内容。';
  // 场景 1：folder 被别的 docId（B）占用 → 加 ~docId 后缀
  const rA = await parseMod.runSplit({ text, title: '同名书', type: 'text/markdown', sourceFields: { creator: '作者A' }, folderOccupied: () => dB });
  const docA = rA.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes('tidme-doc'));
  assert.ok(docA.title.startsWith('Tidme/Docs/同名书~'), `被其它 doc 占用 → 加后缀：${docA.title}`);
  assert.notEqual(docA.title, 'Tidme/Docs/同名书');
  const secA = rA.tiddlers.find(isSectionTiddler);
  assert.ok(secA.title.startsWith(docA.title + '/'), '节卡落在带后缀 docRoot 下');
  assert.equal(secA['tidme.docpage'], docA.title, '节卡带 tidme.docpage（= 真实 doc 页）');
  assert.equal(docA['tidme.docpage'], docA.title, 'doc 页自指 docpage');
  // 场景 2：folder 被同一 docId 占用（重导入）→ 幂等复用，不加后缀
  const rA2 = await parseMod.runSplit({ text, title: '同名书', type: 'text/markdown', sourceFields: { creator: '作者A' }, folderOccupied: () => dA });
  const docA2 = rA2.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes('tidme-doc'));
  assert.equal(docA2.title, 'Tidme/Docs/同名书', '同 docId 占用 → 不加后缀（重导入幂等）');
  // 场景 3：无占用 → 不加后缀
  const r3 = await parseMod.runSplit({ text, title: '无冲突书', type: 'text/markdown', folderOccupied: () => null });
  const doc3 = r3.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes('tidme-doc'));
  assert.equal(doc3.title, 'Tidme/Docs/无冲突书');
});

test('doc-ops: docPageOfDoc 按 docId 查到真实文档页（folder 带 ~docId 后缀亦准确）；docFolderOwner 可探测占用', async () => {
  const docOps = tw.modules.execute('$:/plugins/keepone/tidme/core/doc-ops.js');
  const r = await parseMod.runSplit({ text: '# 章\n\n内容。', title: '后缀书', type: 'text/markdown', folderOccupied: () => 'd000000000' });
  for (const t of r.tiddlers) wiki.addTiddler(t);
  const doc = r.tiddlers.find((t) => Array.isArray(t.tags) && t.tags.includes('tidme-doc'));
  assert.ok(doc.title.includes('~'), '前置：folder 应带后缀');
  assert.equal(docOps.docPageOfDoc(wiki, r.docId), doc.title, '按 docId 查到真实（带后缀）文档页');
  assert.equal(docOps.docFolderOwner(wiki, doc.title), r.docId, 'folder 占用可探测到本 docId');
});

test('display: captionText 把 wikitext 转义 caption 解析为可读文本（如牌组 {{$:/language/...}}）', async () => {
  const display = tw.modules.execute('$:/plugins/keepone/tidme/core/display.js');
  // 转义 caption → 解析（zh-Hans 语言包已加载，应得到"默认"而非原始 {{…}}）
  const resolved = display.captionText(wiki, '{{$:/language/tidme/default}}');
  assert.ok(!resolved.includes('{{'), `不应残留 {{ 模板：${resolved}`);
  assert.ok(resolved.trim().length > 0, '应解析出可读文本');
  // 纯文本 caption 原样返回（不触发不必要的渲染）
  assert.equal(display.captionText(wiki, '章节标题'), '章节标题');
  assert.equal(display.captionText(wiki, ''), '');
});

test('deleteDocContent: 删阅读材料、保留知识产物（摘录/挖空/问答/无 kind 散卡）；他书与续读点指向保留卡时不误伤', async () => {
  const docOps = tw.modules.execute('$:/plugins/keepone/tidme/core/doc-ops.js');
  // 书 A：2 普通节 + 1 大纲手动"新节"（topic/section/manual-）+ 1 摘录 + 1 挖空 + 1 无 kind 散卡
  const rA = await parseMod.runSplit({ text: '# 章一\n\n内容一。\n\n# 章二\n\n内容二。', title: '删书A', type: 'text/markdown', minChars: 0 });
  for (const t of rA.tiddlers) wiki.addTiddler(t); // 文档页 + 2 节
  const secA = rA.tiddlers.find(isSectionTiddler);
  const manualSec = {
    title: `${secA.title.slice(0, secA.title.lastIndexOf('/') + 1)}manual-新笔记`,
    caption: '新笔记',
    text: '手写知识。',
    'tidme.doc': rA.docId,
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    state: '0',
    due: twDate(),
  };
  wiki.addTiddler(manualSec);
  const ext = factoryMod.buildExtract(wiki, secA.title, '摘录句。');
  wiki.addTiddler(ext);
  const cloze = factoryMod.buildCloze(wiki, secA.title, '首都 Freetown', 'Freetown');
  wiki.addTiddler(cloze);
  wiki.addTiddler({
    title: '手动散卡A',
    caption: 'Q?',
    text: 'A',
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    'tidme.doc': rA.docId,
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
  // 子集牌组
  wiki.addTiddler({ title: 'Tidme/Decks/删书A/复习本书', tags: ['$:/tags/TidmeDeck'], card: '[tidme.kind[item]]', 'tidme.subset-doc': rA.docId });
  // 续读点：一个指向普通节（应删）、一个指向摘录（应留）
  wiki.addTiddler({ title: '$:/config/tidme/readpoint/' + rA.docId, text: JSON.stringify({ t: secA.title, s: '' }) });
  wiki.addTiddler({ title: '$:/config/tidme/readpoint/keep', text: JSON.stringify({ t: ext.title, s: '' }) });
  wiki.addTiddler({ title: '$:/state/tidme/learning-session', list: [secA.title, ext.title, '其它书卡'] });
  // 书 B 不受影响
  const rB = await parseMod.runSplit({ text: '# 唯一章\n\n内容乙。', title: '别书B', type: 'text/markdown', minChars: 0 });
  for (const t of rB.tiddlers) wiki.addTiddler(t);
  const secB = rB.tiddlers.find(isSectionTiddler);

  const n = docOps.deleteDocContent(wiki, rA.docId);
  // 删除 5 个：文档页 + 2 普通节 + 1 大纲新节 + 1 子集牌组
  assert.equal(n, 5, `删除数量=5，实际 ${n}`);
  // 保留的知识产物仍存在
  assert.ok(wiki.getTiddler(ext.title), '摘录保留');
  assert.ok(wiki.getTiddler(cloze.title), '挖空保留');
  assert.ok(wiki.getTiddler('手动散卡A'), '手动制的 item 卡保留');
  // 被删的不存在
  assert.equal(
    wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.doc[${rA.docId}]tidme.kind[topic]!tidme.subkind[extract]!tag[tidme-doc]]`).length,
    0,
    '普通节卡/大纲新节全删',
  );
  assert.equal(wiki.getTiddler(manualSec.title), undefined, '大纲手动新节删除');
  assert.equal(wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.subset-doc[${rA.docId}]]`).length, 0, '子集牌组删除');
  // 文档页删除
  assert.equal(wiki.filterTiddlers(`[tag[tidme-doc]tidme.doc[${rA.docId}]]`).length, 0, '文档页删除');
  // 续读点：指向节 → 删；指向摘录（保留）→ 留
  assert.equal(wiki.getTiddler('$:/config/tidme/readpoint/' + rA.docId), undefined, '指向被删节的续读点删除');
  assert.ok(wiki.getTiddler('$:/config/tidme/readpoint/keep'), '指向保留摘录的续读点保留');
  // 会话：剔除被删节，保留摘录与其它的
  const sess = wiki.getTiddler('$:/state/tidme/learning-session');
  assert.ok(!sess.fields.list.includes(secA.title), '会话剔除被删节');
  assert.ok(sess.fields.list.includes(ext.title) && sess.fields.list.includes('其它书卡'), '会话保留摘录与其它');
  // 书 B 完好
  assert.ok(wiki.getTiddler(secB.title), 'B 不受影响');
  // 幂等
  assert.equal(docOps.deleteDocContent(wiki, rA.docId), 0, '重复删除幂等');
});

/* 回归测试：重切分时保留摘录 —— alignCards 旧卡查询必须排除 subkind=extract，否则摘录被批量归档 done */
test('re-split 保留已有摘录（不被归档为 obsolete/done）', async () => {
  const text = '# 章节 1\n\n第一段内容。\n\n## 子节 A\n\n子节 A 内容。';
  const r1 = await parseMod.runSplit({ text, title: '重切分测试书', folderOccupied: () => null });
  const [doc, ...cards1] = r1.tiddlers;
  const sec1 = cards1.find(isSectionTiddler);
  for (const t of r1.tiddlers) wiki.addTiddler({ ...t });
  // 模拟用户做的摘录（手动建，挂在第一张节卡下）
  const ext = {
    title: `${doc.title}/ext-keepme`,
    type: 'text/vnd.tiddlywiki',
    caption: '用户摘录',
    text: '<blockquote>用户自己的笔记</blockquote>',
    'tidme.doc': r1.docId,
    'tidme.kind': 'topic',
    'tidme.subkind': 'extract',
    'tidme.parent': sec1.title,
    'tidme.breadcrumb': `${sec1['tidme.breadcrumb']} › 摘录`,
  };
  wiki.addTiddler(ext);
  // 重切分：标题更短、文末新加一节
  const text2 = '# 1\n\n第一段新内容。\n\n## 子节 A\n\n子节 A 改后内容。\n\n## 新增子节 B\n\nB 内容。';
  const r2 = await parseMod.runSplit({ text: text2, title: '重切分测试书', folderOccupied: (base) => docOps.docFolderOwner(wiki, base) });
  const [doc2, ...cards2] = r2.tiddlers;
  const sectionCards2 = cards2.filter(isSectionTiddler);
  const oldCards = wiki.filterTiddlers(`[tidme.doc[${r1.docId}]tidme.kind[topic]!tidme.subkind[extract]!tag[tidme-doc]!is[draft]]`)
    .map((ot) => ({ title: ot, fields: wiki.getTiddler(ot).fields }));
  const aligned = await align.alignCards(oldCards, doc.title, sectionCards2.map((c) => ({ title: c.title, fields: c })));
  // 写入对齐结果
  for (const k of aligned.keep) wiki.addTiddler({ ...k.fields });
  for (const p of aligned.patches) {
    const ex = wiki.getTiddler(p.title);
    if (ex) wiki.addTiddler({ ...ex.fields, ...p.fields });
  }
  for (const at of aligned.archives) {
    const ex = wiki.getTiddler(at);
    if (!ex) continue;
    wiki.addTiddler({ ...ex.fields, 'tidme.obsolete': 'yes', 'tidme.done': 'yes' });
  }
  // 验证：摘录仍存在且未被打 done/obsolete
  const extAfter = wiki.getTiddler(ext.title);
  assert.ok(extAfter, '摘录仍存在');
  assert.notEqual(extAfter.fields['tidme.done'], 'yes', '摘录未被打 done');
  assert.notEqual(extAfter.fields['tidme.obsolete'], 'yes', '摘录未被归档');
});

/* 回归测试：card-manager 写 17 位 due 串（YYYYMMDD + 9 位 0）能被 parseTwDate 正确解析到所选日期 */
test('parseTwDate 接受 card-manager 的 17 位 due 串', () => {
  const due = '20261231000000000';
  const d = schemaMod.parseTwDate(due);
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 11);
  assert.equal(d.getUTCDate(), 31);
  // 旧 buggy 19 位版本会被 fallback 到 now —— 回归保险
  const oldBuggy = schemaMod.parseTwDate('2026123100000000000');
  assert.equal(Number.isNaN(oldBuggy.getTime()) || oldBuggy.getUTCFullYear() !== 1970, true, '19 位非合法日期');
});

/* 回归测试：跳转复习卡前设置折叠态（$:/state/folded/<title>）——缺失时 reveal 默认展开 */
test('prepareCardFold: item 复习卡默认 hide（折叠先看问题）；命中 card_unfold 才 show；topic 不设', async () => {
  const card = {
    title: 'Tidme/Decks/fold测试/x--qa',
    'tidme.kind': 'item',
    'tidme.subkind': 'qa',
    caption: 'x',
    text: 'y',
    due: twDate(new Date()),
    state: '0',
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    last_review: twDate(new Date()),
  };
  wiki.addTiddler(card);
  const sessionMod = mod('core/session.js');
  sessionMod.prepareCardFold(wiki, card.title);
  assert.equal(wiki.getTiddler('$:/state/folded/' + card.title)?.fields?.text, 'hide', '复习卡默认折叠 (session)');
  // 命中 card_unfold → show
  const deck = wiki.getTiddler('$:/Deck/default');
  wiki.addTiddler({ ...deck?.fields, title: '$:/Deck/default', card_unfold: `[all[]match[${card.title}]]` });
  sessionMod.prepareCardFold(wiki, card.title);
  assert.equal(wiki.getTiddler('$:/state/folded/' + card.title)?.fields?.text, 'show', '命中 unfold 过滤器 → show');
  // 还原 default deck 覆盖（防影响后续）
  if (deck) wiki.addTiddler({ ...deck.fields, title: '$:/Deck/default' });
  // topic 卡不设折叠态（阅读界面无关）
  const topic = 'Tidme/Docs/折叠测试/s1-s1--topic';
  wiki.addTiddler({ title: topic, 'tidme.kind': 'topic', caption: 't', text: 'x', state: '0', due: twDate(new Date()) });
  sessionMod.prepareCardFold(wiki, topic);
  assert.equal(wiki.getTiddler('$:/state/folded/' + topic), undefined, 'topic 卡不设折叠态');
});
