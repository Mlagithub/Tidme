/*
core/semantic-split.ts — 语义切分纯逻辑（LLM 断点建议 + 虚拟标题）

定位：仅用于「无标题结构的长篇散文」，且只作叶内回退——有标题/大纲的文档绝不调用
（结构驱动是主策略；LLM 非确定性对 SRS 是反模式）。

职责边界（单一实现）：
- 纯文本逻辑在本模块（可直测、双端可用、无 $tw/无网络依赖）；
- 结构判定复用 core/text-structure（与导入格式探测同一判据）；
- 网络传输由调用方注入 `httpFn`（服务端/浏览器都传 core/server/llm-client 的 callLLM）。
  本模块刻意不 require core/server/*：core 不能反向依赖服务端模块（浏览器包会被拖入服务端代码）。

流程：判断无结构 → 提取段落 → LLM 返回「新主题起始段落号」→ 断点段落前插虚拟标题（## 段首句）
→ 交给普通切分器（虚拟标题成为切分边界）。LLM 失败/超时 → 原样返回（调用方回退机械切分）。
*/

declare function require(module: string): any;
const textStructure = require('$:/plugins/keepone/tidme/core/text-structure.js');

/** 注入的 LLM 调用：负责"prompt 进 → content 出"（请求构造/超时/重试在 core/server/llm-client） */
export type CallLLM = (cfg: Record<string, any>, prompt: string) => Promise<string>;

export interface Paragraph {
  index: number;
  start: number;
  text: string;
}

/** 是否无结构散文（判据见 core/text-structure：有标题即非散文） */
export function isUnstructured(text: string): boolean {
  return textStructure.isUnstructuredText(text);
}

/** 文本 → 段落（空行分隔），返回 [{index, start, text}]（start 为原文字符偏移） */
export function extractParagraphs(text: string): Paragraph[] {
  const src = String(text || '');
  const out: Paragraph[] = [];
  const segs = src.split(/\n\s*\n/);
  let offset = 0;
  for (const seg of segs) {
    const trimmed = seg.trim();
    if (!trimmed) {
      offset += seg.length + 2;
      continue;
    }
    // 定位该段在原文的起点（从 offset 向后找首个非空白）
    let start = src.indexOf(trimmed, offset);
    if (start < 0) start = offset;
    out.push({ index: out.length, start, text: trimmed });
    offset = start + trimmed.length;
  }
  return out;
}

/** 解析 LLM 响应（容忍 ```json 包裹与前后文字）→ 去重排序的段落索引数组 */
export function parseBreaksResponse(raw: unknown, paraCount: number): number[] {
  if (!raw) return [];
  const s = String(raw).replace(/```(?:json)?/gi, '').trim();
  const m = s.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(m[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of arr) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n < paraCount && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

/** 构造 LLM prompt（段落列表 → 新主题起始段号） */
export function buildPrompt(paras: Paragraph[]): string {
  const list = paras.map((p, i) => `${i}: ${p.text.slice(0, 80)}`);
  return `以下是无标题的散文/笔记，按空行分为 ${paras.length} 段（编号 0..${paras.length - 1}）。\n\n${
    list.join('\n')
  }\n\n请判断哪些段落是新主题（新章节/新小节）的开头。只返回这些段落的编号，格式为 JSON 数组，如 [3, 9]。如果全文是一个主题，返回 []。要求：不要遗漏明显的主题切换；相邻编号不要连选（除非确实密集切换）。`;
}

/** 在断点段落前插入虚拟标题（从后往前避免偏移漂移），返回 { text, virtual } */
export function insertVirtualHeadings(text: string, paras: Paragraph[], breaks: number[], max: number): { text: string; virtual: number } {
  let virtual = 0;
  let out = String(text);
  const list = breaks.filter((b) => b < max).slice().sort((a, b) => b - a);
  for (const b of list) {
    const para = paras[b];
    if (!para) continue;
    const title = para.text.replace(/\s+/g, ' ').trim().slice(0, 14).replace(/[。．.!！?？;；,，]$/, '');
    const heading = `\n\n## ${title || '片段'}\n\n`;
    out = out.slice(0, para.start) + heading + out.slice(para.start);
    virtual++;
  }
  return { text: out, virtual };
}

/**
 * 主入口：若无结构散文 → LLM 断点 + 虚拟标题；否则原样返回。
 * @param callLLM 注入的 LLM 调用（缺省 → 不调用 LLM，原样返回；见文件头注）
 */
export function prepareText(
  text: string,
  cfg: Record<string, any> | null | undefined,
  callLLM?: CallLLM,
): Promise<{ text: string; usedBreaks: number; virtual: number }> {
  const unchanged = { text, usedBreaks: 0, virtual: 0 };
  if (!cfg || !cfg.apiKey || !callLLM) return Promise.resolve(unchanged);
  if (!isUnstructured(text)) return Promise.resolve(unchanged);
  const paras = extractParagraphs(text);
  if (paras.length < 3) return Promise.resolve(unchanged);
  const max = Math.min(Number(cfg.maxParas) || 200, paras.length);
  return Promise.resolve(callLLM(cfg, buildPrompt(paras.slice(0, max))))
    .then((raw) => {
      const breaks = parseBreaksResponse(raw, max);
      const r = insertVirtualHeadings(text, paras, breaks, max);
      return { text: r.text, usedBreaks: breaks.length, virtual: r.virtual };
    })
    .catch((e: any) => {
      console.error('[tidme] semantic split failed, fallback to mechanical:', (e && e.message) || e);
      return unchanged;
    });
}

/**
 * 针对单个长章节正文的 LLM 语义二次切分：
 * 结合 LLM 主题断点与原文字符偏移物理切片，确保字数 100% 一致（0 字损耗）。
 */
export function splitSectionText(
  text: string,
  cfg: Record<string, any>,
  callLLM?: CallLLM,
): Promise<Array<{ title: string; text: string; chars: number }>> {
  const rawText = String(text || '').trim();
  if (!rawText) return Promise.resolve([]);
  const paras = extractParagraphs(rawText);
  if (paras.length <= 1) return Promise.resolve([{ title: '正文', text: rawText, chars: rawText.length }]);
  if (!callLLM) return Promise.resolve([{ title: '正文', text: rawText, chars: rawText.length }]);

  const list = paras.slice(0, 80).map((p, i) => `${i}: ${p.text.slice(0, 70)}`);
  const prompt =
    `以下是一个长章节正文，共 ${paras.length} 段（编号 0..${paras.length - 1}）：\n\n${
      list.join('\n')
    }\n\n请分析逻辑主题划分，挑选 2~5 个新主题起始段落编号，并为每个小节起一个精炼小标题（10字以内）。必须包含段落0。\n` +
    '只返回 JSON 数组，格式如：[{"breakIndex": 0, "title": "概念解析"}, {"breakIndex": 5, "title": "实验分析"}]。不要输出多余文本。';

  return Promise.resolve(callLLM(cfg, prompt))
    .then((raw) => {
      const jsonStr = String(raw).replace(/```(?:json)?/gi, '').trim();
      const m = jsonStr.match(/\[[\s\S]*\]/);
      let items: any[] = [];
      if (m) {
        try {
          items = JSON.parse(m[0]);
        } catch {
          items = [];
        }
      }
      if (!Array.isArray(items) || !items.length) {
        return [{ title: '正文', text: rawText, chars: rawText.length }];
      }
      // 确保升序且包含 0
      items = items.filter((x) => x && typeof x.breakIndex === 'number' && x.breakIndex >= 0 && x.breakIndex < paras.length)
        .sort((a, b) => a.breakIndex - b.breakIndex);
      if (!items.length || items[0].breakIndex !== 0) items.unshift({ breakIndex: 0, title: '第一部分' });

      const subChunks: Array<{ title: string; text: string; chars: number }> = [];
      for (let k = 0; k < items.length; k++) {
        const curIdx = items[k].breakIndex;
        const nextIdx = k + 1 < items.length ? items[k + 1].breakIndex : paras.length;
        const startOffset = paras[curIdx].start;
        const endOffset = nextIdx < paras.length ? paras[nextIdx].start : rawText.length;
        const chunkText = rawText.slice(startOffset, endOffset);
        if (chunkText.trim()) {
          subChunks.push({
            title: String(items[k].title || `第${k + 1}节`).trim(),
            text: chunkText,
            chars: chunkText.length,
          });
        }
      }
      return subChunks.length ? subChunks : [{ title: '正文', text: rawText, chars: rawText.length }];
    })
    .catch((err) => {
      console.error('[tidme] splitSectionText failed:', err);
      throw err;
    });
}
