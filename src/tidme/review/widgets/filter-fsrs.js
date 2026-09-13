/*\
Use Free Spaced Repetition Scheduler: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
计算逻辑已上移 tidme/core（$:/plugins/keepone/tidme/core/fsrs），本模块仅为过滤器包装。
\*/

/*
Export our filter function
*/
(function() {
  /*jslint node: true, browser: true */
  /*global $tw: false */
  'use strict';

  var coreFsrs = require('$:/plugins/keepone/tidme/core/fsrs');

  /*
    Export our filter function
    */
  exports.fsrs = function(source, operator, options) {
    var results = [];
    source(function(tiddler, title) {
      if (tiddler) {
        try {
          results.push(coreFsrs.repeat(tiddler.fields, { p: operator.operand }));
        } catch (e) {
          // 单卡字段异常不炸整个过滤器（坏卡返回空串占位）
          results.push('');
        }
      } else {
        results.push('');
      }
    });
    return results;
  };
})();
