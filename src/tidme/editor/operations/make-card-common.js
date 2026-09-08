/*\
title: $:/plugins/keepone/tidme/editor/operations/make-card-common
type: application/javascript
module-type: commonjs

编辑器真制卡共享实现：供 tidme-make-cloze / tidme-make-qa 两个
texteditoroperation 调用。制卡统一走 core/card-factory（buildCloze/buildQA +
commitCard），不改写编辑器文本。
\*/

(function() {
  'use strict';

  /*jslint node: true, browser: true */
  /*global $tw: false */

  /** 编辑中的 tiddler（草稿态解析 draft.of）→ 制卡父卡 title */
  exports.resolveParent = function(wiki, editTitle) {
    var t = wiki.getTiddler(editTitle);
    var of = t && t.fields['draft.of'];
    return of ? String(of) : String(editTitle || '');
  };

  /**
   * 从编辑器选区制卡
   * @param editWidget EditTextWidget（handler.call 的 this：wiki/editTitle）
   * @param operation  引擎构造的文本操作对象（取 selection）
   * @param kind       "cloze" | "qa"
   */
  exports.makeCard = function(editWidget, operation, kind) {
    var selected = String(operation && operation.selection || '').trim();
    if (!selected) return;
    var wiki = editWidget.wiki;
    var factory = require('$:/plugins/keepone/tidme/core/card-factory.js');
    var ns = require('$:/plugins/keepone/tidme/core/ns.js');
    var parentTitle = exports.resolveParent(wiki, editWidget.editTitle);

    var finish = function(draft) {
      if (!draft) return;
      factory.commitCard(wiki, draft, editWidget);
      try {
        if (typeof $tw !== 'undefined' && $tw && $tw.notifier && $tw.notifier.display) {
          $tw.notifier.display(ns.NOTIFY_CLOZE);
        }
      } catch (e) { /* 无头/无 document 环境忽略通知 */ }
    };

    if (kind === 'qa') {
      if (typeof document === 'undefined') return;
      var modal = require('$:/plugins/keepone/tidme/ui/components/card-modal.js');
      modal.openCardModal(document, 'qa', selected, function(res) {
        finish(factory.buildQA(wiki, parentTitle, res.question, res.answerOrCloze));
      });
    } else {
      finish(factory.buildCloze(wiki, parentTitle, selected, selected));
    }
  };
})();
