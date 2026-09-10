/*
semantic-split.test.mjs — 语义切分逻辑测试（node:test，boot 真实 TW + bin 产物）

覆盖：无结构判断（结构判定唯一实现 = core/text-structure）、段落提取、LLM 响应解析（容错）、
prompt 构造、虚拟标题插入（偏移稳定）、prepareText 主流程（启用/未启用/失败回退）。
LLM 调用以 `(cfg, prompt) => content` 形式注入——网络层（超时/重试/HTTP）在 core/server/llm-client，
由 bin-core.test.mjs + server-e2e 覆盖。
放在 integration 而非 unit：实现是插件 TS 模块且 require 同包 core 模块（ESM 直引会缺 require）。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPlugin } from '../helpers/tw-boot.mjs';

const { mod } = bootPlugin({ prefix: 'tidme-semantic-' });
const sem = mod('core/semantic-split.js');

test('isUnstructured: 区分无标题散文与有结构文本', () => {
  assert.equal(sem.isUnstructured('第一段。\n\n第二段。\n\n第三段。'), true, '纯散文');
  assert.equal(sem.isUnstructured('# 标题\n\n内容。'), false, 'markdown ATX');
  assert.equal(sem.isUnstructured('标题\n====\n\n内容。'), false, 'markdown setext');
  assert.equal(sem.isUnstructured('! 标题\n\n内容。'), false, 'wikitext ! 标题');
  assert.equal(sem.isUnstructured('<h1>标题</h1>\n\n内容。'), false, 'HTML h1');
  // 漂移回归：图片行 `![alt](url)` 不是 wikitext 标题（旧 `^!\s*` 会把它误判成标题 →
  // 整篇散文被当成"有结构"，LLM 语义切分静默不触发）
  assert.equal(sem.isUnstructured('![示意图](img.png)\n\n第二段。\n\n第三段。'), true, '图片行不算标题');
  assert.equal(sem.isUnstructured('#!shebang 风格注释\n\n第二段。\n\n第三段。'), true, '#! 不是 ATX 标题');
});

test('extractParagraphs: 空行分段 + 原文偏移', () => {
  const text = '第一段。\n\n第二段。\n\n第三段。';
  const paras = sem.extractParagraphs(text);
  assert.equal(paras.length, 3);
  assert.equal(paras[0].text, '第一段。');
  assert.equal(paras[1].start, 6);
  assert.equal(paras[2].start, 12);
});

test('parseBreaksResponse: 容忍 json 包裹 / 前后文字 / 非法值', () => {
  // 跨 realm 数组：断言前先展开（AGENTS 已知陷阱）
  assert.deepEqual([...sem.parseBreaksResponse('[2, 5, 1]', 10)], [1, 2, 5]);
  assert.deepEqual([...sem.parseBreaksResponse('```json\n[3]\n```', 10)], [3]);
  assert.deepEqual([...sem.parseBreaksResponse('结果如下 [0, 4] 请参考', 10)], [0, 4]);
  assert.deepEqual([...sem.parseBreaksResponse('[]', 10)], []);
  assert.deepEqual([...sem.parseBreaksResponse('无法判断', 10)], [], '非 JSON 容错');
  assert.deepEqual([...sem.parseBreaksResponse('[2, 2, -1, 99, 2]', 5)], [2], '去重 + 越界过滤');
});

test('buildPrompt: 含段落编号与要求', () => {
  const prompt = sem.buildPrompt([{ index: 0, start: 0, text: '甲' }, { index: 1, start: 3, text: '乙' }]);
  assert.ok(prompt.includes('0: 甲') && prompt.includes('1: 乙'), '含编号段落');
  assert.ok(prompt.includes('JSON 数组'), '要求 JSON 输出');
});

test('insertVirtualHeadings: 断点前插虚拟标题（偏移稳定）', () => {
  const text = '第一段。\n\n第二段。\n\n第三段。';
  const paras = sem.extractParagraphs(text);
  const r = sem.insertVirtualHeadings(text, paras, [2], 10);
  assert.equal(r.virtual, 1);
  assert.ok(r.text.includes('## 第三段'), '断点段前插标题');
  // 插入后虚拟标题成为独立段（原 3 段 + 1 标题段 = 4 段）
  const after = sem.extractParagraphs(r.text);
  assert.equal(after.length, 4, '虚拟标题成为独立段');
  const texts = after.map((p) => p.text);
  assert.ok(texts.includes('## 第三段'), '标题段存在');
  assert.ok(texts.includes('第三段。'), '正文内容保留');
  // 多个断点从后往前插
  const r2 = sem.insertVirtualHeadings(text, paras, [1, 2], 10);
  assert.equal(r2.virtual, 2);
  const texts2 = sem.extractParagraphs(r2.text).map((p) => p.text);
  assert.ok(texts2.some((t) => t.startsWith('## 第二段')), '第二段前插标题');
  assert.ok(texts2.some((t) => t.startsWith('## 第三段')), '第三段前插标题');
});

test('prepareText: 未启用 / 非无结构 / 无 LLM 注入 → 原样返回', async () => {
  const r1 = await sem.prepareText('甲。\n\n乙。\n\n丙。', {});
  assert.equal(r1.usedBreaks, 0);
  assert.equal(r1.text, '甲。\n\n乙。\n\n丙。');
  const r2 = await sem.prepareText('# 有标题\n\n内容。', { enable: true, apiKey: 'k' }, async () => '[1]');
  assert.equal(r2.usedBreaks, 0, '有标题结构不调用 LLM');
  const r3 = await sem.prepareText('甲。\n\n乙。\n\n丙。', { enable: true, apiKey: 'k' }, undefined);
  assert.equal(r3.usedBreaks, 0, '未注入 LLM 调用 → 原样返回');
});

test('prepareText: LLM 断点 → 虚拟标题（注入 LLM 调用）', async () => {
  const cfg = { enable: true, apiKey: 'sk-test', model: 'm', baseUrl: 'https://x/v1' };
  let seenPrompt = '';
  const callLLM = async (c, prompt) => {
    assert.equal(c.apiKey, 'sk-test', '配置原样传给调用方');
    seenPrompt = prompt;
    return '[2, 5]';
  };
  const text = ['甲段内容。', '乙段内容。', '丙段内容。', '丁段内容。', '戊段内容。', '己段内容。'].join('\n\n');
  const r = await sem.prepareText(text, cfg, callLLM);
  assert.equal(r.usedBreaks, 2);
  assert.ok(r.text.includes('## '), '插入虚拟标题');
  assert.ok(seenPrompt.includes('0: '), 'prompt 含编号段落');
});

test('prepareText: LLM 失败 → 静默回退机械切分', async () => {
  const cfg = { enable: true, apiKey: 'sk-test' };
  const failing = async () => {
    throw new Error('网络错误');
  };
  const text = '甲。\n\n乙。\n\n丙。\n\n丁。';
  const r = await sem.prepareText(text, cfg, failing);
  assert.equal(r.usedBreaks, 0);
  assert.equal(r.text, text, '失败原样返回');
});

test('splitSectionText: 无 LLM 注入 / 单段 → 原样单卡（不猜）', async () => {
  const one = await sem.splitSectionText('单段正文。', { apiKey: 'k' });
  assert.equal(one.length, 1);
  assert.equal(one[0].title, '正文');
  assert.equal(one[0].text, '单段正文。');
  assert.equal(one[0].chars, '单段正文。'.length);
  const multi = '甲段。\n\n乙段。';
  const r = await sem.splitSectionText(multi, { apiKey: 'k' }, undefined);
  assert.equal(r.length, 1, '未注入 LLM → 不切分');
  assert.equal(r[0].text, multi);
});
