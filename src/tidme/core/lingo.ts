/*
core/lingo.ts — 多语言/本地化文案查询工具函数
纯函数，首参注入 wiki；无 wiki 或未查到时回退到默认英文。
*/

declare function require(module: string): any;

/**
 * 获取 $:/language/tidme/ 下的本地化文案
 * @param wiki TiddlyWiki wiki 实例
 * @param key 键名，例如 "startstudy"、"manager.all"
 * @param fallback 兜底默认英文字符串
 */
export function lingo(wiki: any, key: string, fallback?: string): string {
  if (!wiki || typeof wiki.getTiddlerText !== 'function') {
    return fallback ?? key;
  }
  const title = '$:/language/tidme/' + key;
  const val = wiki.getTiddlerText(title);
  if (val !== undefined && val !== null && val.trim() !== '') {
    return val.trim();
  }
  return fallback ?? key;
}
