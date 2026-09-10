/*
core/text-structure.ts — 文本结构判定（标题/分隔线的唯一实现）

用途：判断一段文本是否已带标题结构。两处消费者共用同一判据：
- import/parse/ingest-text 的格式探测（sniffFormat）；
- 语义切分（core/semantic-split）：只有"无标题结构的长篇散文"才值得让 LLM 提断点。
曾经两处各写一份正则，且对 `![alt](img)` 这类图片行处理不同（`^!\s*` 把 `![` 当 wikitext
标题）→ 图片段落被误判成"有结构"，整条语义切分静默不触发。

纯函数、无依赖、双端可用。
*/

/** markdown ATX 标题（`# 标题`；`#!` 开头是 shebang 风格注释，不算标题） */
export function isMarkdownAtxHeading(line: string): boolean {
  const s = String(line || '').trim();
  if (!s || s.startsWith('#!')) return false;
  return /^#{1,6}\s+\S/.test(s);
}

/** wikitext 标题（`! 标题`；`!` 后必须空白 + 内容——`![图片](url)` 是图片不是标题） */
export function isWikitextHeading(line: string): boolean {
  return /^!{1,6}\s+\S/.test(String(line || '').trim());
}

/** HTML 标题（`<h1>`…`<h6>`） */
export function isHtmlHeading(line: string): boolean {
  return /^<h[1-6][\s>]/i.test(String(line || '').trim());
}

/** 该行是否为任一种标题 */
export function isHeadingLine(line: string): boolean {
  return isMarkdownAtxHeading(line) || isWikitextHeading(line) || isHtmlHeading(line);
}

/** markdown setext 标题（下一行 `===`/`---`，且本行不是列表/分割线/空行） */
export function isSetextHeading(line: string, nextLine: string): boolean {
  const cur = String(line || '').trim();
  const next = String(nextLine || '').trim();
  if (!cur || !next) return false;
  if (!/^[=-]{3,}$/.test(next)) return false;
  if (/^([-*+]|\d+[.)])\s/.test(cur)) return false; // 列表行
  if (/^[=-]{3,}$/.test(cur)) return false; // 本行即分割线
  return true;
}

/** 文本是否含标题结构（逐行扫描；任一标题即视为有结构） */
export function hasHeadingStructure(text: string): boolean {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isHeadingLine(line)) return true;
    if (isSetextHeading(lines[i], lines[i + 1])) return true;
  }
  return false;
}

/** 是否无结构散文（= 没有标题结构；语义切分的准入判据） */
export function isUnstructuredText(text: string): boolean {
  return !hasHeadingStructure(text);
}
