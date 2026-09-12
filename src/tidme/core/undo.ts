/*
undo.ts — 评分撤销栈（唯一持有者；对标 Anki 的 UndoManager）

- **纯内存**：与 Anki 一致（栈不跨进程持久化）。唯一入栈点 = core/grade 的评分写路径；
  唯一清空点 = core/session 的会话边界（结束学习 / 新建操练或突击会话）。
- 快照是**判别联合**：`cram`（突击复习不写库，只恢复会话）与 `review`（含字段/日志/
  配额/搁置/操练快照）。此前的可选字段大杂烩让"哪些字段在哪种模式下有意义"无从判断。
- 不落库、也不镜像状态 tiddler：唯一的读方是会话内的「撤销」按钮（core/grade.getUndoStackDepth），
  JS API 即唯一真源——曾写过一个无人读的 $:/state/tidme/undo-state，属死状态。

无跨模块依赖（本模块是叶子），因此 core/grade 与 core/session 都可以直接 require 它。
*/

/** 撤销栈深上限（Anki UNDO_LIMIT = 30） */
export const MAX_UNDO_DEPTH = 30;

export interface UndoBase {
  /** 被评分（或被撤销）的卡 */
  title: string;
  /** 评分时卡所属牌组（日志 tiddler 由它决定） */
  deckTitle: string;
  /** 该次评分的日志键（17 位时刻，撤销时按它精确删除日志条目） */
  logKey: string;
  /** 评分前的会话列表（null = 当时无全局会话） */
  prevSession: { list: string[]; mode?: string; currentIndex?: string } | null;
  /** 评分时的学习日（跨天不再回写会话，避免复活昨日会话） */
  learningDay: string;
  /** 评分时刻 */
  at: Date;
}

/** 突击（cram）评分：不写调度/日志/配额，撤销只需恢复会话与焦点 */
export interface CramUndoSnapshot extends UndoBase {
  kind: 'cram';
}

/** 正常评分：撤销需要回滚字段、日志、配额、兄弟卡搁置与日末操练变动 */
export interface ReviewUndoSnapshot extends UndoBase {
  kind: 'review';
  /** 评分前的完整字段集（含 FSRS 字段族/注释色/优先级） */
  prevFields: Record<string, any>;
  /** 记账类别（撤销按同一类别回滚） */
  quotaKind: 'new' | 'review' | 'learn';
  /** 本次评分新搁置的兄弟卡（撤销时解除） */
  newlyBuried: string[];
  /** 日末操练队列的变动（撤销时反向应用） */
  finalDrillChange: 'added' | 'removed' | null;
}

export type UndoSnapshot = CramUndoSnapshot | ReviewUndoSnapshot;

const stack: UndoSnapshot[] = [];

/** 入栈（超出上限丢最旧）；返回入栈后的深度 */
export function pushUndo(snapshot: UndoSnapshot): number {
  stack.push(snapshot);
  while (stack.length > MAX_UNDO_DEPTH) stack.shift();
  return stack.length;
}

/** 出栈（无可撤销返回 null） */
export function popUndo(): UndoSnapshot | null {
  return stack.length ? stack.pop()! : null;
}

export function undoDepth(): number {
  return stack.length;
}

/** 清空（会话边界调用：结束学习 / 新建操练或突击会话）。
 *  撤销依赖"当前会话"才有意义——会话已结束时把陈旧列表写回会复活一个已关闭的会话。 */
export function clearUndo(): void {
  stack.length = 0;
}
