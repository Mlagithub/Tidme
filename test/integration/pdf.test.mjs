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
const cardFactory = mod('core/card-factory.js');
const cardModal = mod('ui/components/card-modal.js');
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

test('pdf-reader: 节卡缺少 tidme.pdf 时通过 docId 回退解析，且学习会话中显示推进按钮', async () => {
  const r = await pdfOps.createPdfBook(wiki, {
    bookTitle: '回退测试书',
    dataB64: 'JVBERi0xLjQK',
    sections: [{ title: '第一节', startPage: 1, endPage: 5 }],
  });
  const secTitle = r.sectionTitles[0];
  // 模拟历史存量数据：删除节卡上的 tidme.pdf
  const f = { ...wiki.getTiddler(secTitle).fields };
  delete f['tidme.pdf'];
  wiki.addTiddler(f);

  // 模拟处于学习会话中
  const sessionMod = mod('core/session.js');
  wiki.addTiddler({
    title: sessionMod.SESSION_TIDDLER,
    list: [secTitle, '后置卡片'],
  });

  const { root, w } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', {
    variables: { currentTiddler: secTitle },
  });

  assert.equal(w._pdfTitle, r.pdfTitle, '自动通过 docId 回退找到文档页的 tidme.pdf');
  const buttons = collectButtons(root);
  const nextBtn = buttons.find((b) => b.textContent?.includes('读完继续'));
  assert.ok(nextBtn, '学习会话中工具栏展示「读完继续」按钮');

  // refresh 响应
  assert.equal(w.refresh({ [secTitle]: {} }), true, '当前卡片变更触发 refresh');
  assert.equal(w.refresh({ [r.pdfTitle]: {} }), true, 'PDF 二进制条目变更触发 refresh');
  assert.equal(w.refresh({ 无关卡片: {} }), false, '无关变更不触发 refresh');

  w.destroy();
});

test('pdf-reader: resolvePdfContext 路径回退与全局模糊匹配兜底', async () => {
  const pdfWidgetMod = mod('read/widgets/pdf-reader.js');
  const resolve = pdfWidgetMod.resolvePdfContext;

  // 1. 模拟存量节卡：无 tidme.pdf，无 tidme.doc
  const bookRoot = 'Tidme/Books/极简测试书';
  const secTitle = `${bookRoot}/01 第一节`;
  const pdfTitle = 'Tidme/PDFs/极简测试书';

  wiki.addTiddler({
    title: pdfTitle,
    type: 'application/pdf',
    text: 'JVBERi0xLjQK',
  });
  wiki.addTiddler({
    title: bookRoot,
    tags: ['tidme-import-doc'],
    'tidme.pdf': pdfTitle,
  });
  wiki.addTiddler({
    title: secTitle,
    text: '<$tidme-pdf-reader/>',
  });

  const ctx1 = resolve(wiki, secTitle);
  assert.equal(ctx1.pdfTitle, pdfTitle, '通过路径父级 Tidme/Books/极简测试书 找到 pdfTitle');
  assert.equal(ctx1.docPageTitle, bookRoot);

  // 2. 模拟文档页也没有 tidme.pdf，仅通过书名与 type: application/pdf 模糊/候选命中
  wiki.deleteTiddler(bookRoot);
  const ctx2 = resolve(wiki, secTitle);
  assert.equal(ctx2.pdfTitle, pdfTitle, '通过候选书名匹配到 Tidme/PDFs/极简测试书');
});

test('pdf-reader: 翻页自动持久化续读点与精准页码恢复（跨刷新/跨小节）', async () => {
  const r = await pdfOps.createPdfBook(wiki, {
    bookTitle: '翻页测试书',
    dataB64: 'JVBERi0xLjQK',
    sections: [
      { title: '第一章', startPage: 1, endPage: 10 },
      { title: '第二章', startPage: 11, endPage: 30 },
    ],
  });
  const sec1 = r.sectionTitles[0];
  const sec2 = r.sectionTitles[1];

  // 1. 测试 sectionOfDocByPage
  assert.equal(docOps.sectionOfDocByPage(wiki, r.docId, 5), sec1);
  assert.equal(docOps.sectionOfDocByPage(wiki, r.docId, 15), sec2);
  assert.equal(docOps.sectionOfDocByPage(wiki, r.docId, 999), null);

  // 2. 模拟在第一章打开阅读器
  const { w } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', {
    variables: { currentTiddler: sec1 },
  });

  // 翻页到第 18 页（跨越到第二章范围）
  w._setPage(18);
  // 等待防抖保存
  await new Promise((resolve) => setTimeout(resolve, 350));

  // 验证续读点自动将卡片对准第二章，且页码为 p18
  const rp = docOps.parseReadPoint(wiki, r.docId);
  assert.ok(rp, '续读点成功持久化');
  assert.equal(rp.t, sec2, '自动感知并映射至第二章');
  assert.equal(rp.s, 'p18', '记录页码 p18');
  assert.equal(wiki.getTiddlerText(docOps.GLOBAL_READPOINT), sec2, '全局续读点同步更新');

  w.destroy();

  // 3. 模拟会话级临时条目失效（例如跨设备或临时条目被清除）：清空 $:/state/tidme-pdf/page/ 条目
  for (const t of wiki.filterTiddlers('[prefix[$:/state/tidme-pdf/page/]]')) {
    wiki.deleteTiddler(t);
  }

  // 4. 再次打开第二章：验证从持久化续读点精准恢复到第 18 页
  const { w: w2 } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', {
    variables: { currentTiddler: sec2 },
  });

  // 等待 _loadPdf 完成
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(w2._page, 18, '刷新后即使 $:/state/ 丢失，依然精准恢复至第 18 页');

  w2.destroy();
});

test('pdf-reader: 框选图片制卡与 buildImageQA 字段治理（纯净短标题+无Base64污染+即时答案）', async () => {
  const r = await pdfOps.createPdfBook(wiki, {
    bookTitle: '图片制卡测试书',
    dataB64: 'JVBERi0xLjQK',
    sections: [{ title: '第一章', startPage: 1, endPage: 10 }],
  });
  const secTitle = r.sectionTitles[0];
  const dummyB64 = 'data:image/png;base64,' + 'A'.repeat(500);

  // 1. 测试 buildImageQA 纯净字段与短标题
  const card1 = cardFactory.buildImageQA(wiki, secTitle, {
    dataUrl: dummyB64,
    answer: '这是框选后输入的完整答案解析',
    label: '函数调用栈',
    page: 5,
  });

  assert.equal(card1.title, 'Tidme/Decks/图片制卡测试书/P5-函数调用栈', '标题短化且携带书名/页码/用户标题');
  assert.ok(card1.caption === '[图] 函数调用栈' || card1.caption === '[Img] 函数调用栈', 'caption 干净可读，无 Base64 或 HTML');
  assert.ok(card1.text.includes(dummyB64), '正文安全携带图片数据');
  assert.ok(card1.text.includes('这是框选后输入的完整答案解析'), '正文包含用户答案');
  assert.equal(card1['tidme.kind'], 'item');
  assert.equal(card1['tidme.subkind'], 'qa');
  assert.equal(card1['tidme.parent'], secTitle);

  // 2. 测试默认无 label 时自动生成 P{page}-QA
  const card2 = cardFactory.buildImageQA(wiki, secTitle, {
    dataUrl: dummyB64,
    answer: '第二张卡片答案',
    page: 5,
  });
  assert.equal(card2.title, 'Tidme/Decks/图片制卡测试书/P5-QA', '缺省 label 时标题为 P5-QA');
  assert.ok(!card2.caption.includes('data:image'), '默认 caption 绝不泄露 Base64');
  assert.ok(card2.caption.startsWith('[图]') || card2.caption.startsWith('[Img]'), '默认 caption 携带 [图] 或 [Img] 标识');

  // 3. 验证 safeCaption 防护：即使普通 buildQA 传入带有 <img> 的问题，caption 也绝不含 HTML
  const card3 = cardFactory.buildQA(wiki, secTitle, `<img src="${dummyB64}">`, '普通问答答案');
  assert.ok(!card3.caption.includes('<img') && !card3.caption.includes('data:image'), 'buildQA 安全剥离 Base64');

  // 4. 测试 cardModal 打开 image-qa 模式与快捷交互
  let savedResult = null;
  let clickSubmit = null;
  let answerInput = null;
  const mockDoc = {
    createElement: (t) => {
      const el = fakeDocument.createElement(t);
      el.addEventListener = (evt, fn) => {
        if (evt === 'click' && String(el.className).includes('tm-card-modal-submit')) {
          clickSubmit = fn;
        }
      };
      return el;
    },
    body: fakeDocument.createElement('body'),
  };

  cardModal.openCardModal(mockDoc, {
    type: 'image-qa',
    imageUrl: dummyB64,
    page: 5,
    onSave: (res) => {
      savedResult = res;
    },
  });

  assert.ok(mockDoc.body.childNodes.length > 0, '制卡弹窗成功在 DOM 挂载');
  assert.ok(clickSubmit, '确定按钮成功绑定事件');

  clickSubmit();
  assert.ok(savedResult, '点击保存成功触发 onSave 回调');
  assert.ok(savedResult.question.includes(dummyB64), '问题面包含图片');
});

test('pdf: sectionsOfDoc 排除文档页与续读点持久化 & 回原文精确定位', async () => {
  const b = await pdfOps.createPdfBook(wiki, {
    bookTitle: '精确定位测试书',
    dataB64: 'fake-bytes',
    sections: [
      { title: '第一章', startPage: 1, endPage: 10 },
      { title: '第二章', startPage: 11, endPage: 20 },
    ],
  });

  // 1. sectionsOfDoc 排除文档页本身（仅包含章节）
  const secs = docOps.sectionsOfDoc(wiki, b.docId);
  assert.equal(secs.length, 2, '两章书籍的 sectionsOfDoc 仅含 2 节，排除文档页');
  assert.equal(secs[0], b.sectionTitles[0]);
  assert.equal(secs[1], b.sectionTitles[1]);

  // 2. 跨章在第 18 页制作图片卡
  const card = cardFactory.buildImageQA(wiki, b.sectionTitles[0], {
    dataUrl: 'data:image/png;base64,sample',
    answer: '测试答案',
    label: '重点图示',
    page: 18,
  });
  assert.equal(card['tidme.page'], '18', '卡片包含 tidme.page 字段');
  const anchor = cardFactory.parseAnchor(card['tidme.anchor']);
  assert.equal(anchor?.page, 18, 'anchor 记录页码');

  // 3. sectionOfDocByPage 能够按页码反查节卡
  const matchedSec = docOps.sectionOfDocByPage(wiki, b.docId, 18);
  assert.equal(matchedSec, b.sectionTitles[1], '第 18 页准确命中第二章节卡');

  // 4. 续读点持久化至 $:/config/ 命名空间
  docOps.saveReadPoint(wiki, b.docId, { t: b.sectionTitles[1], s: 'p18' });
  const rp = docOps.parseReadPoint(wiki, b.docId);
  assert.equal(rp?.t, b.sectionTitles[1]);
  assert.equal(rp?.s, 'p18');
  assert.ok(wiki.getTiddler(docOps.READPOINT_PREFIX + b.docId), '持久化保存到 $:/config/tidme/readpoint/');

  // 5. docReadingTarget 正确返回续读点
  const target = docOps.docReadingTarget(wiki, b.docId);
  assert.equal(target, b.sectionTitles[1], '续读目标命中第二章');
});
