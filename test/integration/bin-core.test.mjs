/*
bin-core.test.mjs — bin 产物内 core 模块回归（经 tw.modules.execute 加载产物而非源码）

与 unit/scheduler.test.mjs 互补：那边测源码逻辑，这边保证打包产物中行为一致。
*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { wiki, mod } = bootPlugin({ prefix: 'tidme-bin-core-' });
const sched = mod('core/scheduler.js');
const parseMod = mod('import/parse.js');
const sem = mod('core/semantic-split.js');

test('scheduler: 优先级混合判序 comparePriorityMixed（排序唯一实现，产物内同样生效）', () => {
  // 三张卡的两两胜负必须因 mode 而不同，否则断言恒真（曾用"两种口径同解"的数据，等于没测）
  const lowNear = { title: '低优先近到期', fields: { 'tidme.priority': '80', due: '20260101000000000' } };
  const lowFar = { title: '低优先远到期', fields: { 'tidme.priority': '80', due: '20260102000000000' } };
  const highFar = { title: '高优先远到期', fields: { 'tidme.priority': '10', due: '20260103000000000' } };
  const sorted = (cards, mode) => [...cards].sort((a, b) => sched.comparePriorityMixed(a, b, mode)).map((c) => c.title);

  assert.deepEqual(sorted([lowFar, highFar], 'priority-first'), ['高优先远到期', '低优先远到期'], 'priority-first 按优先级');
  assert.deepEqual(sorted([lowNear, lowFar], 'due-first'), ['低优先近到期', '低优先远到期'], 'due-first 按到期时间');
  assert.deepEqual(
    sorted([lowFar, highFar], 'due-first'),
    ['低优先远到期', '高优先远到期'],
    'due-first 下优先级不参与（与 priority-first 结果相反 → 口径确实被区分）',
  );
});

test('scheduler: 过载自动顺延 autoPostpone 门槛触发', () => {
  const overdueCards = [
    { title: '卡1', fields: { due: '20200101000000000', 'tidme.kind': 'item', 'tidme.priority': '80' } },
    { title: '卡2', fields: { due: '20200101000000000', 'tidme.kind': 'item', 'tidme.priority': '70' } },
  ];
  // 当 maxOverdueThreshold = 5 时，未达到 5 张逾期，不触发顺延
  const resUnder = sched.autoPostpone(overdueCards, { maxOverdueThreshold: 5 });
  assert.equal(resUnder.patches.length, 0, '未超阈值不发生顺延');

  // 当 maxOverdueThreshold = 1 时，超过阈值，触发顺延
  const resOver = sched.autoPostpone(overdueCards, { maxOverdueThreshold: 1, keepTop: 1, maxPriority: 60 });
  assert.equal(resOver.patches.length, 1, '超阈值顺延 1 张卡');
});

test('parseMod: cleanTitle 剔除冗余副标题与括号说明', () => {
  const rawTitle = '批判性思维与说服性写作：独立思考者的精进技巧（通过25种思维练习、30项写作训练，让你更具备思辨力和创造性, 实现独立思考和写作精进）';
  const cleaned = parseMod.cleanTitle(rawTitle);
  assert.equal(cleaned, '批判性思维与说服性写作', '成功剥离副标题与括号营销说明');
});

test('产物：core 逻辑实现唯一（ES import 内联重复回归）', () => {
  const raw = fs.readFileSync(path.join(here, '../../bin/$__plugins_keepone_tidme.json'), 'utf8');
  const bundled = Object.values(JSON.parse(JSON.parse(raw).text).tiddlers)
    .map((t) => String(t.text || ''))
    .join('\n');
  // 这些函数曾因 core 模块用 ES import（相对路径）而被 esbuild 内联成第二份实现
  // （改一处不生效 / 产物膨胀）。新增 core 函数时把它加进这份清单。
  for (
    const name of [
      'contentFingerprint',
      'normalizeText',
      'parseTwDate',
      'twDateString',
      'isFilterSafeTitle',
      'isHeadingLine',
      // doc-ops 拆分后的四个职责模块（门面只转引，不得复制实现）
      'isDocPage',
      'sectionsOfDoc',
      'parseReadPoint',
      'collectTopicQueue',
      'deleteDocContent',
    ]
  ) {
    const count = (bundled.match(new RegExp(`function ${name}\\(`, 'g')) || []).length;
    assert.equal(count, 1, `${name} 在产物中应只有一份实现，实际 ${count}`);
  }
});

test('deck-engine: random_learn 的 learn 过滤器语法合法（回归：run 内 +[sortrandom[]] 曾语法错误）', () => {
  const deckEngine = mod('core/deck-engine.js');
  wiki.addTiddler({ title: '随机学习A', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '1', due: '20260101000000000' });
  wiki.addTiddler({ title: '随机学习B', 'tidme.kind': 'item', 'tidme.subkind': 'qa', state: '3', due: '20260201000000000' });
  const learnOf = (randomLearn) => [...wiki.filterTiddlers(deckEngine.composeDeckFilters('$:/Deck/default', { random_learn: randomLearn }).learn)];

  const rand = learnOf('yes');
  assert.ok(!rand.some((t) => String(t).includes('Filter error')), `随机模式过滤器语法合法，实际 ${JSON.stringify(rand)}`);
  assert.ok(rand.includes('随机学习A') && rand.includes('随机学习B'), '两张学习态卡都被收录');
  assert.deepEqual(learnOf('no'), ['随机学习A', '随机学习B'], '关闭随机时按 due 升序');
});

test('server: splitSectionText LLM 二次切片且 100% 保持字数完全相同', async () => {
  const sampleText = '第一段正文内容用来测试字符偏移定位。\n\n第二段正文分析实验结果。\n\n第三段正文给出分析结论。';
  // 注入的 LLM 调用契约：prompt 进 → content 出（网络层在 core/server/llm-client，此处只验切片逻辑）
  const mockLLM = async () => '[{"breakIndex": 0, "title": "概论"}, {"breakIndex": 1, "title": "实验"}, {"breakIndex": 2, "title": "结论"}]';
  const chunks = await sem.splitSectionText(sampleText, { enable: true, apiKey: 'test' }, mockLLM);
  assert.equal(chunks.length, 3, '成功切分为 3 个带语义标题子卡');
  const sumChars = chunks.reduce((n, c) => n + c.text.length, 0);
  assert.equal(sumChars, sampleText.length, '切分前后字数 100% 完全一致（0 字损耗）');
});

test('server: llm-client 是唯一网络层（超时 + 有界重试），语义切分不再自带 http 实现', async () => {
  const llm = mod('core/server/llm-client');
  assert.equal(typeof llm.callLLM, 'function', 'llm-client 暴露 callLLM');
  // 永不 resolve 的注入 httpFn → 超时后失败（不再挂住导入任务）
  const t0 = Date.now();
  await assert.rejects(
    () => llm.callLLM({ apiKey: 'k', timeoutMs: 30, retries: 0 }, 'prompt', () => new Promise(() => {})),
    /超时/,
  );
  assert.ok(Date.now() - t0 < 3000, '在超时窗口内失败');
  // 有界重试：失败 2 次后成功（retries=1 → 共 2 次调用）
  let calls = 0;
  const flaky = async () => {
    calls++;
    if (calls === 1) throw new Error('boom');
    return { status: 200, data: JSON.stringify({ choices: [{ message: { content: '[]' } }] }) };
  };
  assert.equal(await llm.callLLM({ apiKey: 'k', retries: 1 }, 'p', flaky), '[]', '重试后成功取回 content');
  assert.equal(calls, 2, '默认 1 次重试（有界）');
});
