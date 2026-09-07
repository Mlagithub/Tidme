/*
pdf.test.mjs — PDF 导入/阅读/制卡 测试（node:test）

- import/parse/pdf 纯逻辑：大纲拍平与切分、扫描页判定、LLM-OCR 请求构建与响应解析
- core/pdf-ops：落库（二进制/文档页/节卡）、继续阅读落点、清理级联（二进制+OCR 页）
- config：PDF 导入方式与 OCR 配置（Key 回退语义切分）
- reader smoke：无 pdf.js 环境渲染加载提示（不挂）
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectButtons, collectText, fakeDocument, renderWidget as renderWidgetBase } from '../helpers/fake-dom.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { wiki, mod } = bootPlugin({ prefix: 'tidme-pdf-' });
const parsePdf = mod('import/parse/pdf.js');
const pdfOps = mod('core/pdf-ops.js');
const config = mod('core/config.js');
const docOps = mod('core/doc-ops.js');
const ns = mod('core/ns.js');
const workflow = mod('review/widgets/workflow.js');

test('parse/pdf: normalizeOutline —— 嵌套拍平 + 不可解析页跳过', () => {
  const raw = [
    { title: '第一章', dest: { fake: 1 } },
    { title: '坏项', dest: null },
    { title: '子节', dest: { fake: 2 }, items: [{ title: '1.1 小节', dest: { fake: 3 } }] },
  ];
  assert.deepEqual([...parsePdf.normalizeOutline(raw, () => 0)], [], '全不可解析 → 空');
  const nodes = parsePdf.normalizeOutline(raw, (dest) => (dest && dest.fake) || 0);
  assert.equal(JSON.stringify(nodes.map((n) => [n.title, n.page])), JSON.stringify([['第一章', 1], ['子节', 2], ['1.1 小节', 3]]));
});

test('parse/pdf: splitByOutline —— 页码升序/同页折叠/末节到页尾/越界跳过', () => {
  const sections = parsePdf.splitByOutline(
    [{ title: 'B 章', page: 3 }, { title: 'A 章', page: 2 }, { title: '同页', page: 2 }, { title: '越界', page: 9 }],
    8,
  );
  // 末节 endPage = 下一大纲项 - 1（封顶 pageCount）= 8；越界项只影响前节终点
  assert.equal(
    JSON.stringify(sections.map((x) => ({ title: x.title, startPage: x.startPage, endPage: x.endPage }))),
    JSON.stringify([{ title: 'A 章', startPage: 2, endPage: 2 }, { title: 'B 章', startPage: 3, endPage: 8 }]),
  );
  assert.deepEqual([...parsePdf.splitByOutline([], 10)], [], '无大纲 → 空（调用方走整本）');
  assert.deepEqual([{ ...parsePdf.singleSection(12)[0] }], [{ title: '全文', startPage: 1, endPage: 12 }]);
});

test('parse/pdf: 扫描页判定与 pages 字段解析', () => {
  assert.equal(parsePdf.isScannedPageText(''), true);
  assert.equal(parsePdf.isScannedPageText('短'), true);
  assert.equal(parsePdf.isScannedPageText('x'.repeat(40)), false);
  assert.equal(JSON.stringify({ ...parsePdf.parsePagesField('3-7') }), JSON.stringify({ start: 3, end: 7 }));
  assert.equal(JSON.stringify({ ...parsePdf.parsePagesField('') }), JSON.stringify({ start: 1, end: 0 }));
});

test('parse/pdf: LLM-OCR 请求构建与响应解析', () => {
  const req = parsePdf.buildOcrRequest({ baseUrl: 'https://api.x.com/v1/', apiKey: 'k1', model: 'vision-m' }, 'IMGB64', '第 3 页');
  assert.equal(req.url, 'https://api.x.com/v1/chat/completions');
  assert.equal(req.headers.Authorization, 'Bearer k1');
  const body = JSON.parse(req.body);
  assert.equal(body.model, 'vision-m');
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[0].content[1].image_url.url, 'data:image/png;base64,IMGB64');
  assert.ok(body.messages[0].content[0].text.includes('Markdown'), '提示要求转写为 Markdown');
  assert.equal(parsePdf.parseOcrResponse({ choices: [{ message: { content: ' # 页 ' } }] }), '# 页', '去首尾空白');
  assert.equal(parsePdf.parseOcrResponse({}), '');
  assert.equal(parsePdf.ocrTiddlerTitle('Tidme/Books/书', 3), 'Tidme/Books/书/ocr-p3');
});

test('core/pdf-ops: createPdfBook 落库 —— 二进制/文档页/节卡全部就位', async () => {
  const r = await pdfOps.createPdfBook(wiki, {
    bookTitle: '未来简史',
    dataB64: 'JVBERi0xLjK=',
    sections: [
      { title: '第一章 导论', startPage: 1, endPage: 4 },
      { title: '第二章 方法', startPage: 5, endPage: 9 },
    ],
  });
  assert.equal(ns.NS_PDFS, 'Tidme/PDFs/');
  const bin = wiki.getTiddler(r.pdfTitle).fields;
  assert.equal(r.pdfTitle, 'Tidme/PDFs/未来简史');
  assert.equal(bin.type, 'application/pdf');
  assert.equal(bin.text, 'JVBERi0xLjK=');
  const doc = wiki.getTiddler(r.docTitle).fields;
  assert.equal(doc['tidme.type'], 'pdf');
  assert.equal(doc['tidme.pdf'], r.pdfTitle);
  assert.ok((doc.tags || []).includes('tidme-import-doc'), '文档页带导入标记');
  assert.equal(doc.text, '<$tidme-pdf-reader/>');
  assert.equal(r.sectionTitles.length, 2);
  for (const st of r.sectionTitles) {
    const f = wiki.getTiddler(st).fields;
    assert.equal(f['tidme.kind'], 'topic');
    assert.equal(f['tidme.subkind'], 'section');
    assert.ok(/^\d+-\d+$/.test(String(f['tidme.pages'])), '页区间字段（起-止）');
    assert.equal(f.text, '<$tidme-pdf-reader/>');
    assert.ok(/^\d{17}$/.test(String(f.due)), 'due=now（17 位）→ 进入阅读队列');
  }
  // 继续阅读落到第一节（due=now，无全局续读点）
  assert.equal(workflow.globalReadingTarget(wiki), r.sectionTitles[0]);
});

test('core/pdf-ops + doc-ops: 清理阅读材料级联 PDF 二进制与 OCR 转写页', async () => {
  const r = await pdfOps.createPdfBook(wiki, {
    bookTitle: '待清理书',
    dataB64: 'JVBERg==',
    sections: [{ title: '单章', startPage: 1, endPage: 6 }],
  });
  wiki.addTiddler({ title: parsePdf.ocrTiddlerTitle(r.docTitle, 2), text: 'OCR 文本', 'tidme.doc': 'dpdf2' });
  const docId = wiki.getTiddler(r.docTitle).fields['tidme.doc'];
  const removed = docOps.deleteDocContent(wiki, docId);
  assert.ok(removed >= 3, '文档页 + 节卡 + PDF 二进制');
  assert.equal(wiki.getTiddler(r.pdfTitle), undefined, 'PDF 二进制级联删除');
  assert.equal(wiki.getTiddler(parsePdf.ocrTiddlerTitle(r.docTitle, 2)), undefined, 'OCR 转写页级联删除');
});

test('config: PDF 导入方式与 OCR 配置（Key 回退语义切分；一致不落盘）', () => {
  assert.equal(config.readPdfOptions(wiki).split, 'outline', '默认按大纲');
  config.writePdfOptions(wiki, { split: 'none' });
  assert.equal(config.readPdfOptions(wiki).split, 'none');
  wiki.addTiddler({ title: '$:/config/Tidme/SemanticSplit', text: JSON.stringify({ apiKey: 'sem-key' }) });
  const ocr = config.readOcrConfig(wiki);
  assert.equal(ocr.model, 'gpt-4o-mini', '默认模型');
  assert.equal(ocr.apiKey, 'sem-key', 'Key 回退语义切分');
  config.writeOcrConfig(wiki, { enable: true, apiKey: 'own-key' });
  const saved = JSON.parse(wiki.getTiddler('$:/config/Tidme/Ocr').fields.text);
  assert.equal(saved.enable, true);
  assert.equal(saved.apiKey, 'own-key');
});

test('pdf-reader: 无 pdf.js 环境渲染加载提示（不挂）', () => {
  wiki.addTiddler({
    title: 'Tidme/Books/PDF书',
    'tidme.kind': 'topic',
    'tidme.type': 'pdf',
    'tidme.pdf': 'Tidme/PDFs/PDF书',
    'tidme.doc': 'dpx1',
    text: '<$tidme-pdf-reader/>',
  });
  wiki.addTiddler({ title: 'Tidme/PDFs/PDF书', type: 'application/pdf', text: 'JVBERi0xLjK=' });
  const { root, w } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', { variables: { currentTiddler: 'Tidme/Books/PDF书' } });
  assert.ok(collectText(root).includes('正在加载 pdf.js'), '渲染加载提示（异步加载在无头环境挂起，不阻塞）');
  assert.equal(typeof w._ocrPage, 'function', 'OCR 按钮绑定的处理方法必须存在（曾缺失导致点击即崩）');
});

test('pdf-reader: 工具栏结构 —— 缩放/翻页/全屏齐备，目录无节卡隐藏，OCR 开启才出现', () => {
  config.writeOcrConfig(wiki, { enable: false }); // 显式关闭，用例不依赖文件内执行顺序
  wiki.addTiddler({
    title: 'Tidme/Books/裸工具栏书',
    'tidme.kind': 'topic',
    'tidme.type': 'pdf',
    'tidme.pdf': 'Tidme/PDFs/裸工具栏书',
    'tidme.doc': 'dpx2',
    text: '<$tidme-pdf-reader/>',
  });
  wiki.addTiddler({ title: 'Tidme/PDFs/裸工具栏书', type: 'application/pdf', text: 'JVBERi0xLjK=' });
  const { root } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', { variables: { currentTiddler: 'Tidme/Books/裸工具栏书' } });
  const text = collectText(root);
  const buttons = collectButtons(root);
  assert.ok(text.includes('适合页面') && text.includes('适合宽度') && text.includes('实际大小'), '缩放下拉三模式（仿桌面阅读器）');
  assert.ok(buttons.some((b) => b.title === '第一页') && buttons.some((b) => b.title === '最后一页'), '首末页按钮');
  assert.ok(buttons.some((b) => b.title === '框选图片制卡：在页面上拖拽矩形生成图片问答卡'), '框选制卡入口');
  assert.ok(buttons.some((b) => b.title === '全屏阅读'), '全屏入口');
  const tocBtn = buttons.find((b) => b.title === '目录（本书章节）');
  assert.ok(tocBtn, '目录按钮存在');
  assert.equal(tocBtn.style.display, 'none', '本书无节卡 → 目录按钮隐藏');
  assert.ok(!buttons.some((b) => b.title.startsWith('扫描页识别')), 'OCR 未启用 → 无 OCR 按钮');
  assert.ok(!buttons.some((b) => String(b.className || '').includes('tm-pdf-toc-item')), '无节卡 → 无目录项');
});

test('pdf-reader: 目录抽屉列本书节卡，OCR 开启后按钮出现', async () => {
  const r = await pdfOps.createPdfBook(wiki, {
    bookTitle: '目录测试书',
    dataB64: 'JVBERi0xLjK=',
    sections: [
      { title: '前言', startPage: 1, endPage: 3 },
      { title: '第一章', startPage: 4, endPage: 9 },
    ],
  });
  config.writeOcrConfig(wiki, { enable: true });
  const { root } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', { variables: { currentTiddler: r.sectionTitles[0] } });
  const text = collectText(root);
  const buttons = collectButtons(root);
  const tocItems = buttons.filter((b) => String(b.className || '').includes('tm-pdf-toc-item'));
  assert.equal(tocItems.length, 2, '目录项 = 本书节卡');
  assert.ok(text.includes('前言') && text.includes('第一章'), '目录项标题');
  assert.ok(buttons.some((b) => b.title.startsWith('扫描页识别')), 'OCR 启用 → OCR 按钮出现');
  const tocBtn = buttons.find((b) => b.title === '目录（本书章节）');
  assert.notEqual(tocBtn.style.display, 'none', '有节卡 → 目录按钮可见');
});
