/*
widgets/nav.ts — 页面间导航条（Tidme 主页面切换 + 分隔线 + 当前页高亮）

渲染：今天 · 阅读 · 导入 · 管理 · 统计
点击 tm-navigate 切换；当前 tiddler 高亮（主色）。
放各主页面顶部，替换散落的底部链接。
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

function lingo(wiki: any, key: string, fallback: string): string {
  return lingoMod ? lingoMod.lingo(wiki, key, fallback) : fallback;
}

const NAV: [string, string, string][] = [
  [ns.PAGE_TODAY, 'nav.today', 'Today'],
  [ns.PAGE_READING_LIST, 'nav.reading', 'Reading'],
  [ns.PAGE_IMPORT_CENTER, 'nav.import', 'Import'],
  [ns.PAGE_CARD_MANAGER, 'nav.manager', 'Manager'],
  [ns.PAGE_IMPORT_STATS, 'nav.stats', 'Stats'],
  [ns.PAGE_SETTINGS, 'nav.settings', 'Settings'],
];

// 共享 DOM 工具（实现收敛于 core/dom）
const el = dom.el;

function makeNav(): any {
  class NavWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const root = el(doc, 'nav', 'tm-nav');
      this.domNodes.push(root);

      const current = this.getVariable('currentTiddler') || this.getVariable('currentTiddlerTitle') || '';
      for (const [title, key, fallback] of NAV) {
        const label = lingo(this.wiki, key, fallback);
        const a = dom.createNavLink(doc, this, {
          text: label,
          target: title,
          cls: 'tm-nav-item' + (current === title ? ' tm-nav-active' : ''),
        });
        root.appendChild(a);
      }

      parent.insertBefore(root, nextSibling);
    }
  }
  return NavWidget as any;
}

exports['tidme-nav'] = makeNav();
