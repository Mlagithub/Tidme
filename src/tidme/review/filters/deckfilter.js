/*\
deckfilter 过滤器操作符 —— deck 队列过滤器组合的唯一桥

用法：`[<deckTiddler>deckfilter[learn|due|newly|unfold|random|duenew|newdue|randomcombo|queue]]`
返回**一段过滤器字符串**（单项），供模板用 `${ [<deckTiddler>deckfilter[queue]] }$` 取用。

为什么需要它：deck 页模板（review/ui/ViewTemplate/{deck,tiddler}.tid）需要与 JS 侧完全
一致的队列组合（学习/到期/新卡三段 + 排序 + 宏观顺序）。此前模板里复制了一份 `$let`
组合（两份模板 + core/deck-engine 共三份），任一侧改动都会静默漂移——
队列错一半时界面上看不出任何异常。现在组合逻辑只存在于 core/deck-engine，
模板只负责"取字符串 + subfilter 求值"。
\*/
(function() {
  'use strict';

  /*jslint node: true, browser: true */
  /*global $tw: false */

  var deckEngine = require('$:/plugins/keepone/tidme/core/deck-engine.js');
  var deckMod = require('$:/plugins/keepone/tidme/core/deck.js');

  /** 操作数 → DeckFilters 键（大小写不敏感；`new` 是 `newly` 的别名，贴合模板变量名） */
  var KEYS = {
    learn: 'learn',
    due: 'due',
    newly: 'newly',
    new: 'newly',
    unfold: 'unfold',
    random: 'random',
    duenew: 'dueNew',
    newdue: 'newDue',
    randomcombo: 'randomCombo',
    queue: 'queue',
  };

  exports.deckfilter = function(source, operator, options) {
    var key = KEYS[String(operator.operand || 'queue').toLowerCase()];
    if (!key) {
      console.error('[tidme] deckfilter: 未知操作数', operator.operand);
      return [];
    }
    var out = [];
    source(function(tiddler, title) {
      var wiki = options && options.wiki;
      var fields = (wiki && wiki.getTiddler(title) && wiki.getTiddler(title).fields) || {};
      var text = deckEngine.composeDeckFilters(deckMod.titleOf(title), fields)[key];
      // 空过滤器 = 无成员（deck title 含过滤器不安全字符等），不产出空串让模板误当"匹配全部"
      if (text) out.push(text);
    });
    return out;
  };
})();
