/*
widgets/grade.ts — <$tidme-grade/> 动作 widget（评分写路径的 wikitext 入口）

薄封装：属性 tiddler/deck/rating → core/grade.gradeCard 执行全部评分写库
（FSRS 字段/日志/优先级/会话/专注时长/清理）。关卡、导航、通知、leech 配置动作
与结果展示仍由 repeat.tid 的动作序列负责——widget 只写库，不派发消息。
*/

declare function require(module: string): any;
const Widget = require('$:/core/modules/widgets/widget.js').widget;
const gradeMod = require('$:/plugins/keepone/tidme/core/grade.js');

function makeGradeAction(): any {
  class GradeActionWidget extends Widget {
    gradeTitle: string = '';
    gradeDeck: string = '';
    gradeRating: string = '';

    render() {
      this.computeAttributes();
      this.execute();
    }

    execute() {
      this.gradeTitle = this.getAttribute('tiddler', '') || this.getVariable('studyTiddler') || '';
      this.gradeDeck = this.getAttribute('deck', '') || this.getVariable('deckTiddler') || '';
      this.gradeRating = this.getAttribute('rating', '');
    }

    refresh(changedTiddlers: Record<string, any>) {
      const changed = this.computeAttributes();
      if (Object.keys(changed).length) {
        this.execute();
        return true;
      }
      return false;
    }

    invokeAction() {
      gradeMod.gradeCard(this.wiki, {
        title: this.gradeTitle,
        deckTitle: this.gradeDeck || undefined,
        rating: this.gradeRating,
      });
      return true; // 后续动作（tm-close-tiddler 等）继续执行
    }
  }
  return GradeActionWidget as any;
}

exports['tidme-grade'] = makeGradeAction();
