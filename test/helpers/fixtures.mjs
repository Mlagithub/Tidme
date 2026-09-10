/*
fixtures.mjs — 共享造数 builder（Arrange 收口）

只收口"基础设施形态"的造数（导入落库、标准书夹具）；各测试独有的领域摆置
（特定的卡字段组合）留在各自文件里，不要硬塞进这里。
*/

/** 用导入解析把 markdown 切成书并落库（文档页 + 节卡），返回 runSplit 结果 */
export async function importMarkdown(wiki, parseMod, markdown, { title = '导入书', type = 'text/markdown' } = {}) {
  const r = await parseMod.runSplit({ text: markdown, title, type, minChars: 0 });
  for (const t of r.tiddlers) wiki.addTiddler(t);
  return r;
}

/** 解析产物里的文档页（宿主页）：带 tidme-doc 标签——它同样是 kind=topic，故不能用 kind 区分 */
export function isDocPageTiddler(t) {
  return Array.isArray(t?.tags) && t.tags.includes('tidme-doc');
}

/** 解析产物里的节卡：kind=topic 且非文档页宿主（卡片一律带 kind，文档页靠标签区分） */
export function parsedSections(result) {
  return result.tiddlers.filter((t) => t['tidme.kind'] === 'topic' && !isDocPageTiddler(t));
}

/**
 * 标准书夹具「书名甲」：一书两节（markdown 切分）+ 1 摘录卡（topic）+ 1 挖空卡（item）。
 * title 由确定性 ID 派生，reset+重建后引用不变。返回关键 title 引用。
 */
export async function makeBookFixture(wiki, parseMod) {
  const r = await importMarkdown(wiki, parseMod, '# 书名甲\n\n第一章正文。\n\n## 小节乙\n\n第二节正文。', { title: '书名甲' });
  const section = parsedSections(r)[0];
  const docTitle = r.tiddlers[0].title;
  const sectionTitle = section.title;
  // 摘录留在书目录（拍平）：<docRoot>/<sectionId>--extract
  const extractTitle = section.title + '--extract';
  // 知识卡进 decks 命名空间：<Tidme/Decks/<书>/<sectionId>--cloze
  const clozeTitle = section.title.replace(/^Tidme\/Docs\//, 'Tidme/Decks/') + '--cloze';
  wiki.addTiddler({
    title: extractTitle,
    caption: '摘',
    text: '<blockquote>第一章的摘录</blockquote>',
    'tidme.doc': r.docId,
    'tidme.parent': section.title,
    'tidme.kind': 'topic',
    'tidme.subkind': 'extract',
    'tidme.breadcrumb': `${section['tidme.breadcrumb']} › 摘录`,
    'tidme.source': '书名甲',
    'tidme.format': 'markdown',
    state: '0',
    due: '20261231000000000',
  });
  wiki.addTiddler({
    title: clozeTitle,
    caption: '首都',
    text: '',
    'tidme.doc': r.docId,
    'tidme.parent': section.title,
    'tidme.kind': 'item',
    'tidme.subkind': 'cloze',
    'tidme.breadcrumb': `${section['tidme.breadcrumb']} › 挖空`,
    'tidme.source': '书名甲',
    'tidme.format': 'markdown',
    state: '0',
    due: '20261231000000000',
  });
  return { docId: r.docId, docTitle, sectionTitle, extractTitle, clozeTitle };
}
