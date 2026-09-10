/*
text-structure.test.mjs — 标题/结构判定单元测试（node:test，直测 TS 源码）

结构判定是"导入格式探测"与"语义切分准入"的共用判据（唯一实现）。本文件锁住
`![图片](url)`、`#!`、列表内的 `---` 等易漂移边界——语义切分曾因 `^!\s*` 把图片行当标题，
导致整篇散文被判成"有结构"，LLM 断点路径静默不触发。
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const ts = await import('../../src/tidme/core/text-structure.ts');

test('isMarkdownAtxHeading: `# 标题` 是，#! 不是', () => {
  assert.equal(ts.isMarkdownAtxHeading('# 标题'), true);
  assert.equal(ts.isMarkdownAtxHeading('### 三级'), true);
  assert.equal(ts.isMarkdownAtxHeading('####### 七个井号'), false, '最多六级');
  assert.equal(ts.isMarkdownAtxHeading('#标题'), false, '井号后必须有空白');
  assert.equal(ts.isMarkdownAtxHeading('#!shebang'), false, 'shebang 风格注释不是标题');
  assert.equal(ts.isMarkdownAtxHeading('正文 # 井号'), false);
});

test('isWikitextHeading: `! 标题` 是，`![图片](url)` 不是', () => {
  assert.equal(ts.isWikitextHeading('! 标题'), true);
  assert.equal(ts.isWikitextHeading('!!! 三级'), true);
  assert.equal(ts.isWikitextHeading('![示意图](img.png)'), false, '图片行不是标题（旧实现在此漂移）');
  assert.equal(ts.isWikitextHeading('!标题'), false, '感叹号后必须有空白');
  assert.equal(ts.isWikitextHeading('文本 ! 感叹'), false);
});

test('isHtmlHeading: h1-h6 是，h7/普通标签不是', () => {
  assert.equal(ts.isHtmlHeading('<h1>标题</h1>'), true);
  assert.equal(ts.isHtmlHeading('<H3 class="x">'), true);
  assert.equal(ts.isHtmlHeading('<h7>不是</h7>'), false);
  assert.equal(ts.isHtmlHeading('<p>段落</p>'), false);
});

test('isSetextHeading: 下行 ===/--- 是；列表与分割线不是', () => {
  assert.equal(ts.isSetextHeading('标题', '===='), true);
  assert.equal(ts.isSetextHeading('标题', '---'), true);
  assert.equal(ts.isSetextHeading('', '===='), false, '空行不是 setext 标题');
  assert.equal(ts.isSetextHeading('- 列表项', '---'), false, '列表行不是 setext 标题');
  assert.equal(ts.isSetextHeading('---', '---'), false, '本行即分割线');
  assert.equal(ts.isSetextHeading('标题', '--'), false, '两个短横不够');
});

test('hasHeadingStructure / isUnstructuredText: 逐行扫描的合并判据', () => {
  assert.equal(ts.hasHeadingStructure('第一段。\n\n第二段。'), false);
  assert.equal(ts.isUnstructuredText('第一段。\n\n第二段。'), true);
  assert.equal(ts.hasHeadingStructure('引言。\n\n# 章一\n\n正文。'), true);
  assert.equal(ts.hasHeadingStructure('引言。\n\n标题\n===\n\n正文。'), true);
  assert.equal(ts.hasHeadingStructure('![图](a.png)\n\n![图](b.png)\n\n散文。'), false, '图片段落不构成结构');
});
