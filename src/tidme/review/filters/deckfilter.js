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
  var ns = require('$:/plugins/keepone/tidme/core/ns.js');
  var sched = require('$:/plugins/keepone/tidme/core/scheduler.js');

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

  /** 队列类操作数（需要叠加"排除当日搁置"；unfold 与队列无关，不叠） */
  var QUEUE_KEYS = { learn: 1, due: 1, newly: 1, random: 1, dueNew: 1, newDue: 1, randomCombo: 1, queue: 1 };

  exports.deckfilter = function(source, operator, options) {
    var key = KEYS[String(operator.operand || 'queue').toLowerCase()];
    if (!key) {
      console.error('[tidme] deckfilter: 未知操作数', operator.operand);
      return [];
    }
    var wiki = options && options.wiki;
    // 当日搁置排除的唯一过滤器表述 = ns.buriedExcludeFilter（与 core/deck-engine 同一份）；
    // 学习日经 core/scheduler 单点解析（模板侧不再自行拼换天时刻）
    var bury = '';
    if (wiki && QUEUE_KEYS[key]) {
      try {
        bury = ns.buriedExcludeFilter(sched.learningDayContext(wiki).learningDay);
      } catch (e) {
        // 读配置异常时不能静默丢掉"当日搁置"（会让搁置卡在牌组页复活）：出声再降级
        console.warn('[tidme] deckfilter: 学习日解析失败，本次未排除当日搁置卡', e);
      }
    }
    var out = [];
    source(function(tiddler, title) {
      var fields = (wiki && wiki.getTiddler(title) && wiki.getTiddler(title).fields) || {};
      var text = deckEngine.composeDeckFilters(deckMod.titleOf(title), fields)[key];
      // 空过滤器 = 无成员（deck title 含过滤器不安全字符等），不产出空串让模板误当"匹配全部"
      if (text) out.push(bury ? text + ' ' + bury : text);
    });
    return out;
  };
})();
