/*
pdf.test.mjs — PDF 导入/阅读/制卡 测试（node:test）

- import/parse/pdf 纯逻辑：扫描页判定、续读点页码解析、LLM-OCR 请求构建与响应解析
- core/pdf-ops：整本落库（二进制 + 文档页阅读卡，不切分）、空数据守卫、
  二进制原位恢复、清理级联（二进制+OCR 页）
- config：OCR 配置（Key 回退语义切分）
- reader smoke：无 pdf.js 环境渲染加载提示（不挂）、工具栏结构、续读点绝对页恢复、
  框选图片制卡
- 存量分节书籍（legacy）：文档页不入队、sectionsOfDoc 排除文档页、推进流携带页码
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
const sessionMod = mod('core/session.js');
const sched = mod('core/scheduler.js');
const deckEngine = mod('core/deck-engine.js');

test('parse/pdf: 扫描页判定与 pages 字段解析（存量分节书籍兼容）', () => {
  assert.equal(parsePdf.isScannedPageText(''), true);
  assert.equal(parsePdf.isScannedPageText('短'), true);
  assert.equal(parsePdf.isScannedPageText('x'.repeat(40)), false);
  assert.equal(JSON.stringify({ ...parsePdf.parsePagesField('3-7') }), JSON.stringify({ start: 3, end: 7 }));
  assert.equal(JSON.stringify({ ...parsePdf.parsePagesField('') }), JSON.stringify({ start: 1, end: 0 }));
});

test('ns: PDF 临时跳转页码契约（前缀与生成函数）', () => {
  assert.equal(ns.PDF_PAGE_STATE_PREFIX, '$:/state/tidme-pdf/page/');
  assert.equal(ns.pdfPageStateTitle('d123'), '$:/state/tidme-pdf/page/d123');
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

test('core/pdf-ops: createPdfBook 整本落库 —— 二进制/文档页就位并入队（不切分）', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '未来简史', dataB64: 'JVBERi0xLjK=' });
  assert.equal(ns.NS_PDFS, 'Tidme/PDFs/');
  assert.equal(r.pdfTitle, 'Tidme/PDFs/未来简史');
  const bin = wiki.getTiddler(r.pdfTitle).fields;
  assert.equal(bin.type, 'application/pdf');
  assert.equal(bin.text, 'JVBERi0xLjK=');
  const doc = wiki.getTiddler(r.docTitle).fields;
  assert.equal(r.docTitle, 'Tidme/Books/未来简史');
  assert.equal(doc['tidme.type'], 'pdf');
  assert.equal(doc['tidme.pdf'], r.pdfTitle);
  assert.ok((doc.tags || []).includes('tidme-import-doc'), '文档页带导入标记');
  assert.equal(doc.text, '<$tidme-pdf-reader/>');
  assert.ok(/^\d{17}$/.test(String(doc.due)), 'due=now（17 位）→ 整本阅读卡进入阅读队列');
  // 不切分：无节卡，文档页即唯一阅读卡并入队
  assert.equal(docOps.sectionsOfDoc(wiki, r.docId).length, 1, 'sectionsOfDoc 回退到文档页本身');
  const titles = sched.collectTopicQueue(wiki).map((c) => c.title);
  assert.ok(titles.includes(r.docTitle), '整本文档页进入阅读队列');
  assert.equal(workflow.globalReadingTarget(wiki), r.docTitle, '继续阅读落到整本文档页');
});

test('core/pdf-ops: 空 dataB64 拒绝落库；reattachPdfBinary 原位恢复二进制', async () => {
  // 空二进制落库即埋雷：同步层会把它写成 0 字节 .pdf，重载后阅读器报「缺少 PDF 数据」
  await assert.rejects(
    pdfOps.createPdfBook(wiki, { bookTitle: '空二进制书', dataB64: '' }),
    /dataB64/,
  );
  // 构造存量损坏：二进制条目 text 为空（服务端 0 字节 .pdf 在客户端的形态）
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '重绑测试书', dataB64: 'JVBERi0xLjQK' });
  wiki.addTiddler({ ...wiki.getTiddler(r.pdfTitle).fields, text: '' });
  assert.equal(wiki.getTiddlerText(r.pdfTitle), '', '空二进制构造成功');

  pdfOps.reattachPdfBinary(wiki, r.pdfTitle, 'JVBERi0xLjQ5');
  const f = wiki.getTiddler(r.pdfTitle).fields;
  assert.equal(f.type, 'application/pdf', '恢复后仍为 application/pdf');
  assert.equal(f.text, 'JVBERi0xLjQ5', '二进制原位覆写');
  assert.equal(wiki.getTiddler(r.docTitle).fields['tidme.pdf'], r.pdfTitle, '文档页关联不变');
  assert.throws(() => pdfOps.reattachPdfBinary(wiki, r.pdfTitle, ''), /dataB64/, '空 base64 拒绝恢复');
});

test('core/pdf-ops + doc-ops: 清理阅读材料级联 PDF 二进制与 OCR 转写页', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '待清理书', dataB64: 'JVBERg==' });
  wiki.addTiddler({ title: parsePdf.ocrTiddlerTitle(r.docTitle, 2), text: 'OCR 文本', 'tidme.doc': 'dpdf2' });
  const docId = wiki.getTiddler(r.docTitle).fields['tidme.doc'];
  const removed = docOps.deleteDocContent(wiki, docId);
  assert.ok(removed >= 2, '文档页 + PDF 二进制');
  assert.equal(wiki.getTiddler(r.pdfTitle), undefined, 'PDF 二进制级联删除');
  assert.equal(wiki.getTiddler(parsePdf.ocrTiddlerTitle(r.docTitle, 2)), undefined, 'OCR 转写页级联删除');
});

test('config: OCR 配置（Key 回退语义切分；一致不落盘）', () => {
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

test('pdf-reader: 二进制缺失或为空时状态条提供重新绑定入口', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '缺二进制渲染书', dataB64: 'JVBERi0xLjQK' });
  // 文本层加载依赖 pdf.js，无头环境挂起即可；此处只锁定 missing 分支的恢复入口
  wiki.addTiddler({ ...wiki.getTiddler(r.pdfTitle).fields, text: '' });
  const { root, w } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', {
    variables: { currentTiddler: r.docTitle },
  });
  // 等待异步 _loadPdf 走完 loadPdfBytesWithWait（空文本 → null → missing 分支）
  await new Promise((resolve) => setTimeout(resolve, 30));
  const text = collectText(root);
  assert.ok(text.includes('缺少 PDF 数据') || text.includes('Missing PDF data'), '状态条展示缺失提示');
  const reattach = collectButtons(root).find((b) => String(b.className || '').includes('tm-pdf-reattach'));
  assert.ok(reattach, '缺失分支渲染「重新绑定 PDF」按钮');
  assert.ok(reattach.title.includes('进度') || reattach.title.includes('progress'), '按钮提示说明进度保留');
  w.destroy?.();
});

test('pdf-reader: 工具栏结构 —— 缩放/翻页/全屏齐备（无目录：不切分）', () => {
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
  assert.ok(!buttons.some((b) => String(b.textContent || '') === '☰'), '无目录按钮（PDF 不切分，无节卡可列）');
  assert.ok(!buttons.some((b) => String(b.className || '').includes('tm-pdf-toc-item')), '无目录项');
  assert.ok(!buttons.some((b) => b.title.startsWith('扫描页识别')), 'OCR 未启用 → 无 OCR 按钮');
});

test('pdf-reader: 节卡缺少 tidme.pdf 时通过 docId 回退解析（存量分节书兼容），且学习会话中显示推进按钮', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '回退测试书', dataB64: 'JVBERi0xLjQK' });
  const secTitle = `${r.docTitle}/01 存量节`;
  // 模拟存量分节书籍：手工构造节卡并删除其 tidme.pdf（回退解析路径仍要成立）
  wiki.addTiddler({
    title: secTitle,
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': r.docId,
    'tidme.pages': '1-5',
    text: '<$tidme-pdf-reader/>',
  });

  // 模拟处于学习会话中
  sessionMod.setSession(wiki, { list: [secTitle] });

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

  w.destroy?.();
  sessionMod.endSession(wiki);
});

test('pdf-reader: resolvePdfContext 路径回退与全局模糊匹配兜底（存量分节书兼容）', () => {
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

test('pdf-reader: 翻页自动持久化续读点与精准恢复（整本文档页）', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '翻页测试书', dataB64: 'JVBERi0xLjQK' });

  const { w } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', {
    variables: { currentTiddler: r.docTitle },
  });

  // 翻页到第 18 页
  w._setPage(18);
  // 等待防抖保存
  await new Promise((resolve) => setTimeout(resolve, 350));

  // 续读点以文档页为目标记录绝对页码
  const rp = docOps.parseReadPoint(wiki, r.docId);
  assert.ok(rp, '续读点成功持久化');
  assert.equal(rp.t, r.docTitle, '续读点指向整本文档页');
  assert.equal(rp.s, 'p18', '记录页码 p18');
  assert.equal(wiki.getTiddlerText(docOps.GLOBAL_READPOINT), r.docTitle, '全局续读点同步更新');

  w.destroy?.();

  // 模拟会话级临时条目失效（跨刷新）：清空 $:/state/tidme-pdf/page/ 条目
  for (const t of wiki.filterTiddlers(`[prefix[${ns.PDF_PAGE_STATE_PREFIX}]]`)) {
    wiki.deleteTiddler(t);
  }

  // 再次打开：验证从持久化续读点精准恢复到第 18 页
  const { w: w2 } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', {
    variables: { currentTiddler: r.docTitle },
  });

  // 等待 _loadPdf 完成
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(w2._page, 18, '刷新后即使 $:/state/ 丢失，依然精准恢复至第 18 页');

  w2.destroy?.();
});

test('pdf-reader: 续读点页码越出存量节区间也精确恢复（连续跨节阅读兼容）', async () => {
  // 存量分节书：手工构造（新导入已不产生节卡）
  const docTitle = 'Tidme/Books/越区间兼容书';
  const pdfTitle = 'Tidme/PDFs/越区间兼容书';
  const docId = 'dout1';
  wiki.addTiddler({
    title: docTitle,
    tags: ['tidme-import-doc'],
    'tidme.kind': 'topic',
    'tidme.doc': docId,
    'tidme.type': 'pdf',
    'tidme.pdf': pdfTitle,
    text: '<$tidme-pdf-reader/>',
    due: '20260101000000000',
    state: '0',
  });
  wiki.addTiddler({ title: pdfTitle, type: 'application/pdf', text: 'JVBERi0xLjQK' });
  const yei = `${docTitle}/01 扉页`;
  wiki.addTiddler({
    title: yei,
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': docId,
    'tidme.pdf': pdfTitle,
    'tidme.pages': '2-2',
    text: '<$tidme-pdf-reader/>',
    due: '20260101000000000',
    state: '0',
  });

  // 学习模式「读完继续」/ 页间防抖续存都以当前卡记绝对页：p7 越出扉页区间 [2,2]
  docOps.saveReadPoint(wiki, docId, { t: yei, s: 'p7' });
  const { w } = renderWidgetBase(wiki, mod('read/widgets/pdf-reader.js'), 'tidme-pdf-reader', {
    variables: { currentTiddler: yei },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(w._page, 7, '续读点卡恢复绝对页 p7（不受本节区间限制）');
  w.destroy?.();
});

test('pdf-reader: 框选图片制卡与 buildImageQA 字段治理（纯净短标题+无Base64污染+即时答案）', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '图片制卡测试书', dataB64: 'JVBERi0xLjQK' });
  const dummyB64 = 'data:image/png;base64,' + 'A'.repeat(500);

  // 1. 测试 buildImageQA 纯净字段与短标题（制卡父卡 = 整本文档页）
  const card1 = cardFactory.buildImageQA(wiki, r.docTitle, {
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
  assert.equal(card1['tidme.parent'], r.docTitle);

  // 2. 测试默认无 label 时自动生成 P{page}-QA
  const card2 = cardFactory.buildImageQA(wiki, r.docTitle, {
    dataUrl: dummyB64,
    answer: '第二张卡片答案',
    page: 5,
  });
  assert.equal(card2.title, 'Tidme/Decks/图片制卡测试书/P5-QA', '缺省 label 时标题为 P5-QA');
  assert.ok(!card2.caption.includes('data:image'), '默认 caption 绝不泄露 Base64');
  assert.ok(card2.caption.startsWith('[图]') || card2.caption.startsWith('[Img]'), '默认 caption 携带 [图] 或 [Img] 标识');

  // 3. 验证 safeCaption 防护：即使普通 buildQA 传入带有 <img> 的问题，caption 也绝不含 HTML
  const card3 = cardFactory.buildQA(wiki, r.docTitle, `<img src="${dummyB64}">`, '普通问答答案');
  assert.ok(!card3.caption.includes('<img') && !card3.caption.includes('data:image'), 'buildQA 安全剥离 Base64');

  // 4. 测试 cardModal 打开 image-qa 模式与快捷交互
  let savedResult = null;
  let clickSubmit = null;
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

test('pdf: 续读点持久化 & 回原文锚点（整本文档页）', async () => {
  const b = await pdfOps.createPdfBook(wiki, { bookTitle: '精确定位测试书', dataB64: 'fake-bytes' });

  // 1. 续读点持久化至 $:/config/ 命名空间
  docOps.saveReadPoint(wiki, b.docId, { t: b.docTitle, s: 'p18' });
  const rp = docOps.parseReadPoint(wiki, b.docId);
  assert.equal(rp?.t, b.docTitle);
  assert.equal(rp?.s, 'p18');
  assert.ok(wiki.getTiddler(docOps.READPOINT_PREFIX + b.docId), '持久化保存到 $:/config/tidme/readpoint/');

  // 2. docReadingTarget 正确返回续读点（文档页在队）
  const target = docOps.docReadingTarget(wiki, b.docId);
  assert.equal(target, b.docTitle, '续读目标命中整本文档页');

  // 3. 跨章在第 18 页制作图片卡：锚点记录页码，sectionOfDocByPage 对整本回退 null
  const card = cardFactory.buildImageQA(wiki, b.docTitle, {
    dataUrl: 'data:image/png;base64,sample',
    answer: '测试答案',
    label: '重点图示',
    page: 18,
  });
  assert.equal(card['tidme.page'], '18', '卡片包含 tidme.page 字段');
  const anchor = cardFactory.parseAnchor(card['tidme.anchor']);
  assert.equal(anchor?.page, 18, 'anchor 记录页码');
  assert.equal(docOps.sectionOfDocByPage(wiki, b.docId, 18), null, '整本无节卡 → 页码反查回退 null');
});

test('pdf: 存量分节书 —— 文档页不入队（入口而非可学习卡），节卡在队', async () => {
  // 存量分节书籍：手工构造文档页 + 节卡（新导入已不产生节卡）
  const docTitle = 'Tidme/Books/存量分节书';
  const pdfTitle = 'Tidme/PDFs/存量分节书';
  const docId = 'dsplit1';
  wiki.addTiddler({
    title: docTitle,
    tags: ['tidme-import-doc'],
    'tidme.kind': 'topic',
    'tidme.doc': docId,
    'tidme.type': 'pdf',
    'tidme.pdf': pdfTitle,
    text: '<$tidme-pdf-reader/>',
    due: '20260101000000000',
    state: '0',
  });
  wiki.addTiddler({ title: pdfTitle, type: 'application/pdf', text: 'JVBERi0xLjQK' });
  const sec1 = `${docTitle}/01 扉页`;
  const sec2 = `${docTitle}/02 序言`;
  for (const [i, st] of [sec1, sec2].entries()) {
    wiki.addTiddler({
      title: st,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': docId,
      'tidme.pdf': pdfTitle,
      'tidme.pages': `${i + 2}-${i + 3}`,
      text: '<$tidme-pdf-reader/>',
      due: '20260101000000000',
      state: '0',
    });
  }

  const titles = sched.collectTopicQueue(wiki).map((c) => c.title);
  assert.ok(!titles.includes(docTitle), '存量分节书文档页不入队（入口而非可学习卡）');
  assert.ok(titles.includes(sec1) && titles.includes(sec2), '节卡在队');

  const queue = deckEngine.composeGlobalLearningQueue(
    (filter) => wiki.filterTiddlers(filter),
    { topics: true, itemRatio: 1, topicRatio: 1, excludeTitles: Array.from(sched.splitDocPageSet(wiki)) },
  );
  assert.ok(!queue.includes(docTitle), '学习会话不含存量分节书文档页');
  assert.ok(queue.includes(sec1), '学习会话含节卡');

  // 整本不切分的 PDF 文档页（无节卡）必须入队：不受存量排除逻辑误伤
  const r2 = await pdfOps.createPdfBook(wiki, { bookTitle: '队列排除测试书', dataB64: 'JVBERi0xLjQK' });
  const titles2 = sched.collectTopicQueue(wiki).map((c) => c.title);
  assert.ok(titles2.includes(r2.docTitle), '整本不切分的 PDF 文档页入队');
  const queue2 = deckEngine.composeGlobalLearningQueue(
    (filter) => wiki.filterTiddlers(filter),
    { topics: true, itemRatio: 1, topicRatio: 1, excludeTitles: Array.from(sched.splitDocPageSet(wiki)) },
  );
  assert.ok(queue2.includes(r2.docTitle), '学习会话含整本文档页');
});

test('pdf: 阅读条栏推进（▶ 下一节）续读点携带目标节起始页（存量分节书兼容，不再丢失阅读位置）', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '页码携带测试书', dataB64: 'JVBERi0xLjQK' });
  // 存量分节书兼容形态：手工补两张带页区间的节卡
  const sec1 = `${r.docTitle}/01 扉页`;
  const sec2 = `${r.docTitle}/02 序言`;
  for (const [i, st] of [sec1, sec2].entries()) {
    wiki.addTiddler({
      title: st,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': r.docId,
      'tidme.pdf': r.pdfTitle,
      'tidme.pages': `${i * 2 + 2}-${i * 2 + 3}`,
      text: '<$tidme-pdf-reader/>',
      due: '20260101000000000',
      state: '0',
    });
  }
  const { root } = renderWidgetBase(wiki, mod('import/widgets/section.js'), 'section-bar', { variables: { currentTiddler: sec1 } });
  const nextBtn = collectButtons(root).find((b) => String(b.textContent || '') === '▶');
  assert.ok(nextBtn, '▶ 下一节按钮存在');
  nextBtn.dispatchEvent({ type: 'click' });

  const rp = docOps.parseReadPoint(wiki, r.docId);
  assert.equal(rp.t, sec2, '续读点指向下一节');
  assert.equal(rp.s, 'p4', '携带下一节起始页 p4（不再被 s:"" 抹掉页码）');
});

test('pdf: 学习模式「完成，下一张」续读点指向下一节并携带起始页（存量分节书兼容）', async () => {
  const r = await pdfOps.createPdfBook(wiki, { bookTitle: '学习推进页码书', dataB64: 'JVBERi0xLjQK' });
  const sec1 = `${r.docTitle}/01 扉页`;
  const sec2 = `${r.docTitle}/02 序言`;
  for (const [i, st] of [sec1, sec2].entries()) {
    wiki.addTiddler({
      title: st,
      'tidme.kind': 'topic',
      'tidme.subkind': 'section',
      'tidme.doc': r.docId,
      'tidme.pdf': r.pdfTitle,
      'tidme.pages': `${i * 2 + 2}-${i * 2 + 3}`,
      text: '<$tidme-pdf-reader/>',
      due: '20260101000000000',
      state: '0',
    });
  }
  sessionMod.setSession(wiki, { list: [sec1, sec2], mode: 'global-interleaved' });

  const { root } = renderWidgetBase(wiki, mod('review/widgets/study-mode.js'), 'tidme-study-mode-bar', {
    variables: { currentTiddler: sec1 },
  });
  const nextBtn = collectButtons(root).find((b) => String(b.className || '').includes('tm-study-mode-next'));
  assert.ok(nextBtn, '「完成，下一张」按钮存在');
  nextBtn.dispatchEvent({ type: 'click' });

  assert.equal(wiki.getTiddler(sec1).fields['tidme.done'], 'yes', '当前节标记已读');
  const rp = docOps.parseReadPoint(wiki, r.docId);
  assert.equal(rp.t, sec2, '续读点指向下一节（不再指向刚读完的卡）');
  assert.equal(rp.s, 'p4', '携带下一节起始页 p4');
});
