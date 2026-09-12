/*
drill.ts — 日末操练队列（Final Drill，对标 SuperMemo 的日流程第三段）

- 入队：评分 < Good 的 item（core/grade 调 recordFinalDrill）；达标（≥ Good）出队。
- 存储：`$:/state/tidme/final-drill` 单 tiddler JSON（`{ entries: [{title, addedAt, failCount}] }`）。
  放 `$:/state/` 而非 `$:/temp/`：这是**要跨页面刷新存活**的当日清单
  （`$:/temp/` 语义上是瞬态，刷新即失，操练进度会丢）。
- 过期：超过 FINAL_DRILL_MAX_AGE_DAYS 未消费的条目自动清理（SM 取 3 天）；卡被删除同样清理。
- 纯队列操作，不含调度判定；推进判定见 core/session.advanceSession（final-drill 模式不判 due）。

跨模块引用一律显式 require（ES import 会被 esbuild 内联复制成第二份实现）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');

export interface FinalDrillEntry {
  title: string;
  addedAt: string;
  failCount: number;
}

export const FINAL_DRILL_MAX_AGE_DAYS = 3;

function writeEntries(wiki: any, entries: FinalDrillEntry[]): void {
  wiki.addTiddler({
    title: ns.FINAL_DRILL_STATE_TITLE,
    type: 'application/json',
    text: JSON.stringify({ entries }),
  });
}

function readEntries(wiki: any): FinalDrillEntry[] {
  const data = wiki.getTiddlerData?.(ns.FINAL_DRILL_STATE_TITLE);
  return Array.isArray(data?.entries) ? data.entries : [];
}

/** 读取日末操练队列（自动清理 >3 天超期或已被删除的卡片） */
export function getFinalDrillQueue(wiki: any, now = new Date(), maxAgeDays = FINAL_DRILL_MAX_AGE_DAYS): string[] {
  if (!wiki || typeof wiki.getTiddlerData !== 'function') return [];
  const list = readEntries(wiki);
  if (!list.length) return [];

  const nowMs = now.getTime();
  const maxAgeMs = maxAgeDays * 86400000;
  const validEntries: FinalDrillEntry[] = [];

  for (const item of list) {
    const t = item.title;
    if (!t || !wiki.getTiddler(t)) continue; // 卡已删除
    const addedTime = schema.tryParseTwDate(item.addedAt)?.getTime() || 0;
    if (nowMs - addedTime > maxAgeMs) continue; // 超期
    validEntries.push(item);
  }

  if (validEntries.length !== list.length) writeEntries(wiki, validEntries);
  return validEntries.map((e) => e.title);
}

/** 记录一张卡到日末操练队列（评 Again 时触发）；已在队则累加 failCount 并刷新时刻 */
export function recordFinalDrill(wiki: any, title: string, now = new Date()): void {
  if (!wiki || typeof wiki.addTiddler !== 'function' || !title) return;
  getFinalDrillQueue(wiki, now); // 先清理超期项，再追加
  const entries = [...readEntries(wiki)];

  const existing = entries.find((e) => e.title === title);
  if (existing) {
    existing.failCount = (existing.failCount || 1) + 1;
    existing.addedAt = schema.twDateString(now);
  } else {
    entries.push({ title, addedAt: schema.twDateString(now), failCount: 1 });
  }
  writeEntries(wiki, entries);
}

/** 从日末操练队列移除一张卡（评及格达标时触发）；返回是否真的移除 */
export function removeFinalDrill(wiki: any, title: string): boolean {
  if (!wiki || typeof wiki.getTiddlerData !== 'function' || !title) return false;
  const entries = readEntries(wiki);
  const filtered = entries.filter((e) => e.title !== title);
  if (filtered.length === entries.length) return false;
  writeEntries(wiki, filtered);
  return true;
}
