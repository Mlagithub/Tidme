// TiddlyWiki 运行时提供的全局（模块包装 exports / 浏览器 $tw）；仅供类型检查，
// 使 tsc 能区分「TW 约定的全局」与「真正的未定义标识符（TS2304 = 运行时 ReferenceError）」
declare const exports: Record<string, any>;
declare const $tw: any;
