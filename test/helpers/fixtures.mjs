/*
fixtures.mjs — 共享造数 builder（Arrange 收口）

只收口"基础设施形态"的造数（字段集、管线导入落库）；各测试独有的领域摆置
（特定的书结构、特定字段组合）留在各自文件里，不要硬塞进这里。
*/
import { twDate } from './tw-date.mjs';

/** 最小 item 知识卡字段集（默认新卡：state=0，due=现在） */
export function makeItem(title, { state = '0', due = twDate(), priority, ...extra } = {}) {
  return {
    title,
    'tidme.kind': 'item',
    state,
    due: due instanceof Date ? twDate(due) : due,
    caption: title,
    text: 'x',
    ...(priority !== undefined ? { 'tidme.priority': String(priority) } : {}),
    ...extra,
  };
}

/** 最小 topic 阅读卡字段集 */
export function makeTopic(title, { due = twDate(), ...extra } = {}) {
  return {
    title,
    'tidme.kind': 'topic',
    due: due instanceof Date ? twDate(due) : due,
    caption: title,
    text: 'x',
    ...extra,
  };
}

/** 用导入管线把 markdown 切成书并落库（文档页 + 节卡），返回 runSplit 结果 */
export async function importMarkdown(wiki, parseMod, markdown, { title = '导入书', type = 'text/markdown' } = {}) {
  const r = await parseMod.runSplit({ text: markdown, title, type, minChars: 0 });
  for (const t of r.tiddlers) wiki.addTiddler(t);
  return r;
}

/**
 * 标准书夹具「书名甲」：一书两节（markdown 切分）+ 1 摘录卡（topic）+ 1 挖空卡（item）。
 * title 由确定性 ID 派生，reset+重建后引用不变。返回关键 title 引用。
 */
export async function makeBookFixture(wiki, parseMod) {
  const r = await importMarkdown(wiki, parseMod, '# 书名甲\n\n第一章正文。\n\n## 小节乙\n\n第二节正文。', { title: '书名甲' });
  const section = r.tiddlers.find((x) => x['tidme.kind'] === 'topic');
  const docTitle = r.tiddlers[0].title;
  const sectionTitle = section.title;
  // 摘录留在书目录（拍平）：<bookRoot>/<sectionId>--extract
  const extractTitle = section.title + '--extract';
  // 知识卡进 decks 命名空间：<Tidme/Decks/<书>/<sectionId>--cloze
  const clozeTitle = section.title.replace(/^Tidme\/Books\//, 'Tidme/Decks/') + '--cloze';
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
