/*
core/title.ts — 命名空间 title 唯一化（唯一实现：取空闲 title）

title 就是 tiddler 身份，重复即静默覆盖。此前"取空闲 title"散在四处
（`card-factory.nextFreeTitle` 查库序号 / 文档目录 `~docId` 后缀 / 节卡稳定 id /
手工插卡的会话内 Set），其中手工插卡那份**只查会话 Set 不查库**：上次会话插过的同名节
在本次导入时被静默吃掉；而只查库的那份又看不见"build 了但还没落库"的草稿——
「选词 → build 草稿 → 弹窗等确认 → 才落库」期间两次 build 会拿到同一个 title。

统一口径：**占用 = 库内已存在 或 调用方给出的待落库 title（pending）**。
pending 由调用方显式传入（不是模块级全局表）：每个流程自己知道"我手里有哪些没写的草稿"，
这样分配结果只取决于库状态与该批次草稿，不随会话历史漂移。

刻意不并入本模块的两种"唯一化"（它们不是防撞序号）：
- `paths.docRoot` 的 `~docId` 后缀：同名书共存，是**身份**（稳定指向同一本书）；
- `paths.sectionLeaf` 的稳定 id：重切分保住同一张节卡，是**身份稳定性**。
*/

/** 是否已被占用：库内存在（含 shadow），或属于调用方给出的待落库 title */
export function isTitleTaken(wiki: any, title: string, pending?: Iterable<string>): boolean {
  const t = String(title || '');
  if (!t) return false;
  if (pending) {
    for (const p of pending) if (String(p || '') === t) return true;
  }
  return !!(wiki && typeof wiki.getTiddler === 'function' && wiki.getTiddler(t));
}

/**
 * 取一个空闲 title：base 空闲即返回 base，否则 base-2、base-3…（与既有约定一致）。
 * @param pending 本批次已 build 但尚未落库的 title（可选；覆盖"草稿先于写库"的窗口）
 */
export function freeTitle(wiki: any, base: string, pending?: Iterable<string>): string {
  const b = String(base || '');
  if (!b) return b;
  let title = b;
  let i = 2;
  while (isTitleTaken(wiki, title, pending)) title = `${b}-${i++}`;
  return title;
}
