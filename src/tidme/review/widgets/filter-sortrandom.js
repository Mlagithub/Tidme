/*\
Filter operator for return a random title in the list.
\*/
(function() {
  /*jslint node: true, browser: true */
  /*global $tw: false */
  'use strict';

  /*
    Export our filter function
    */
  exports.sortrandom = function(source, operator, options) {
    var results = [];

    source(function(tiddler, title) {
      results.push(title);
    });

    // Fisher-Yates 均匀洗牌。比较器随机（sort(() => Math.random() - 0.5)）有偏：
    // 依赖排序实现，部分元素会倾向停留在原位，导致「随机发卡不随机」。
    for (var i = results.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = results[i];
      results[i] = results[j];
      results[j] = tmp;
    }

    return results;
  };
})();
