/*
startup-icons.ts — 运行时向 wiki 注册系统图标 tiddler（保障开发模式与运行时槽位）
*/

declare var $tw: any;
declare function require(module: string): any;

exports.name = 'tidme-icons';
exports.platforms = ['browser', 'node'];
exports.after = ['load-modules'];
exports.synchronous = true;

exports.startup = function() {
  try {
    const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
    if (!icons || !icons.TW_SYSTEM_ICONS) return;
    for (const [title, text] of Object.entries(icons.TW_SYSTEM_ICONS)) {
      if (!$tw.wiki.tiddlerExists(title)) {
        $tw.wiki.addTiddler(
          new $tw.Tiddler({
            title,
            tags: ['$:/tags/Image'],
            text: text as string,
          }),
        );
      }
    }
  } catch (e) {
    // 允许静默忽略
  }
};
