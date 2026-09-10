/*
server-e2e.test.mjs — 服务端 E2E 测试

起真实 TiddlyWiki 服务端（TiddlyWeb）实例：
1. HTTP API：PUT 建卡 → GET 验证 → 队列过滤 → 评分写回后队列变化
2. 后台导入任务：pending tiddler → 服务端 importer 启动扫描 → 文档/卡生成
*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { installDom } from '../helpers/jsdom-env.mjs';
import { bootPlugin } from '../helpers/tw-boot.mjs';

installDom();

const tmps = []; // 每用例一个 mkdtemp，test.after 统一清理
function bootWiki() {
  // 每个用例独立 boot（随机临时目录 + bin 插件产物），起真实 TiddlyWeb 前置
  const env = bootPlugin({ prefix: 'tidme-e2e-' });
  tmps.push(env.tmp);
  return env;
}

test.after(() => {
  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true });
});

function waitListening(httpServer, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server listen 超时')), timeoutMs);
    httpServer.once('listening', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function waitFor(fn, timeoutMs = 8000, stepMs = 100) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

test('server E2E: HTTP API 建卡 / 查询 / 队列过滤 / 评分写回', async () => {
  const { tw } = bootWiki();
  const Server = tw.modules.execute('$:/core/modules/server/server.js').Server;
  const server = new Server({
    wiki: tw.wiki,
    variables: { port: '0', host: '127.0.0.1', 'root-tiddler': '$:/core/save/all', 'serve-updates': 'yes', 'csrf-disable': 'yes' },
  });
  const httpServer = server.listen(0, '127.0.0.1');
  await waitListening(httpServer);
  const base = `http://127.0.0.1:${httpServer.address().port}`;

  try {
    // 1) PUT 建一张学习卡（body 为 JSON；kind=item + FSRS 字段齐）
    const cardJson = JSON.stringify({
      text: '卡片内容',
      'tidme.kind': 'item',
      'tidme.subkind': 'qa',
      caption: '问题',
      type: 'text/vnd.tiddlywiki',
      state: '0',
      due: '20261231000000000',
      reps: '0',
      lapses: '0',
      stability: '0',
      difficulty: '0',
      elapsed_days: '0',
      scheduled_days: '0',
      last_review: '20261231000000000',
    });
    const put = await fetch(`${base}/recipes/default/tiddlers/${encodeURIComponent('E2E卡片')}`, {
      method: 'PUT',
      body: cardJson,
    });
    assert.ok(put.ok || put.status === 204, `PUT 建卡: ${put.status}`);

    // 2) GET 验证（已知字段在顶层，未知字段在 fields 子对象）
    const got = JSON.parse(await (await fetch(`${base}/recipes/default/tiddlers/${encodeURIComponent('E2E卡片')}`)).text());
    assert.equal(got.text, '卡片内容', 'GET 返回卡片内容');
    assert.equal(got.fields && got.fields.state, '0', 'GET 返回 FSRS 字段');
    assert.equal(got.fields && got.fields['tidme.kind'], 'item', 'GET 返回 kind');

    // 3) 队列过滤（同进程 wiki 内存过滤 = 服务端数据源）
    assert.ok(tw.wiki.filterTiddlers('[tidme.kind[item]]').includes('E2E卡片'), '默认牌组队列含新卡');
    assert.ok(tw.wiki.filterTiddlers('[tidme.kind[item]state[0]]').includes('E2E卡片'), 'state=0 属于新卡队列');

    // 4) 评分写回（模拟评分动作的字段更新）→ 队列状态变化
    const f = tw.wiki.getTiddler('E2E卡片').fields;
    tw.wiki.addTiddler({ ...f, state: '1', reps: '1', due: '20261231000000001' });
    assert.ok(tw.wiki.filterTiddlers('[tidme.kind[item]state[1]]').includes('E2E卡片'), '评分后进入学习中队列');
    assert.ok(tw.wiki.filterTiddlers('[tidme.kind[item]state[1]]').length === 1, '学习队列计数正确');
  } finally {
    httpServer.close();
  }
});

test('server E2E: 后台导入任务（pending → importer → 文档/卡）', async () => {
  const { tw } = bootWiki();
  // startup 先执行（会从磁盘加载 tiddlers），importer 注册扫描
  tw.boot.startup();
  // 预置 pending 导入 tiddler（服务端 importer 契约：base64 文本 + 文件名）
  const md = '# E2E书\n\n第一章内容。\n\n## 小节\n\n第二节内容。';
  const b64 = Buffer.from(md, 'utf8').toString('base64');
  tw.wiki.addTiddler({
    title: '$:/temp/e2e/pending1',
    tags: ['tidme-pending-import'],
    'tidme.file-name': 'e2e.md',
    'tidme.pending': 'yes',
    text: b64,
    bag: 'default',
  });
  // 手动触发扫描（等价于 15s 定时器，立即处理）
  const importer = tw.modules.execute('$:/plugins/keepone/tidme/core/server/importer');
  assert.ok(typeof importer.scan === 'function', 'importer 暴露 scan 入口');
  importer.scan();

  // 轮询处理完成（importer 用 setImmediate 异步处理）
  await waitFor(() => tw.wiki.getTiddler('$:/temp/e2e/pending1')?.fields['tidme.import-done'], 10000);
  const doneT = tw.wiki.getTiddler('$:/temp/e2e/pending1');
  assert.ok(doneT.fields['tidme.import-docId'], '记录 docId');
  assert.equal(doneT.fields['tidme.pending'], undefined, '处理完成去掉 pending 标记');

  // 断言文档页 + 节卡生成（短内容默认合并 → 至少 1 节）
  const doc = tw.wiki.filterTiddlers('[tag[tidme-doc]]')[0];
  assert.ok(doc, '文档页生成');
  const cards = tw.wiki.filterTiddlers(`[tidme.doc[${doneT.fields['tidme.import-docId']}]tidme.kind[topic]!tag[tidme-doc]]`);
  assert.ok(cards.length >= 1, `至少切出 1 节: ${cards.length}`);
  const cardFields = tw.wiki.getTiddler(cards[0]).fields;
  assert.ok(cardFields['tidme.breadcrumb'], '卡含面包屑');
  assert.ok(cardFields.state !== undefined && cardFields.due !== undefined, '卡含 FSRS 字段');
  assert.equal(cardFields['tidme.kind'], 'topic', '节卡 = topic（阅读材料，不进牌组）');
  // 注意：不能用 [title[X]] 判断存在（title filter 对不存在的标题返回自身）；用 tiddlerExists
  assert.equal(tw.wiki.tiddlerExists('$:/Deck/read/E2E书'), false, '不生成自动阅读牌组（topic 走阅读列表）');
});

test('server E2E: 导入失败标记 error（不挂起）', async () => {
  const { tw } = bootWiki();
  tw.boot.startup();
  // 非法文件类型（importer 不支持的扩展）→ 应快速标记 error
  tw.wiki.addTiddler({
    title: '$:/temp/e2e/bad',
    tags: ['tidme-pending-import'],
    'tidme.file-name': 'bad.xyz',
    'tidme.pending': 'yes',
    text: 'x',
    bag: 'default',
  });
  const importer = tw.modules.execute('$:/plugins/keepone/tidme/core/server/importer');
  importer.scan();
  await waitFor(() => tw.wiki.getTiddler('$:/temp/e2e/bad')?.fields['tidme.import-error'], 10000);
  const t = tw.wiki.getTiddler('$:/temp/e2e/bad');
  assert.ok(String(t.fields['tidme.import-error']).includes('不支持'), '错误信息明确');
  assert.equal(t.fields['tidme.pending'], undefined, '失败后不再 pending');
});
