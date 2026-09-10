/*
ui/base/view-state.ts — TW 视图状态读取（故事河）

`$:/StoryList` 是**界面**状态（用户当前开着哪些条目），不是领域数据：core 不认它。
学习模式条要判断"结束时还堆着哪些死界面卡"、要判断"用户当前在看哪张卡"，
两处都属于 UI 层，故读故事河的实现放这里，core 只保留领域判定（卡是不是 item 由 kind 决定）。

硬约束：tm-navigate 只**追加**故事河、不替换（TW story.addToStory），所以"当前卡"不是
栈顶之外的概念——一律按列表顺序 + 显式优先级判定，调用方自己决定取哪个。
*/

declare function require(module: string): any;

/** TW 故事河列表标题（当前打开的 tiddler 顺序） */
export const STORY_LIST_TITLE = '$:/StoryList';

/** 故事河里已打开的条目（按列表顺序；非数组/缺失 → 空） */
export function storyTitles(wiki: any): string[] {
  if (!wiki || typeof wiki.getTiddler !== 'function') return [];
  const list = wiki.getTiddler(STORY_LIST_TITLE)?.fields?.list;
  return Array.isArray(list) ? [...list] : [];
}

/**
 * 故事河里还开着的复习卡（kind=item）——结束学习后必须关闭的遗留卡。
 *
 * 为什么需要：学习过程中用户可能离开当前卡（如去读 PDF/文档页）把 item 卡留在河里；
 * 会话一结束，这些卡既无评分入口也无进度（两者都依赖会话），只剩死界面堆在下面。
 * 阅读材料（kind=topic）不算：用户可能正在读，留着。
 */
export function storyItemCards(wiki: any): string[] {
  return storyTitles(wiki).filter((t) => wiki.getTiddler(t)?.fields?.['tidme.kind'] === 'item');
}
