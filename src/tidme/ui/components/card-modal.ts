/*
ui/components/card-modal.ts — 极速建卡/问答/挖空修改弹窗（Card Edit Modal）

制卡 UI 共享件：阅读条栏（section.ts）与全局划词气泡（pick-bubble.ts）、
编辑器真制卡操作共用。只做 DOM 弹窗 + 回调；不写库（写库统一走
core/card-factory.commitCard，由调用方在 onSave 回调里完成）。
跨模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const el = dom.el;

export interface CardModalResult {
  question: string;
  answerOrCloze: string;
}

/** 打开模态：type=qa 问两个输入框；type=cloze 展示/编辑挖空行。onSave 后自动关闭。 */
export function openCardModal(
  doc: Document,
  type: 'qa' | 'cloze',
  initialAnswerOrCloze: string,
  onSave: (res: CardModalResult) => void,
) {
  const overlay = el(doc, 'div', 'tm-card-modal-overlay');
  const modal = el(doc, 'div', 'tm-card-modal');

  const titleRow = el(
    doc,
    'div',
    'tm-card-modal-title',
    type === 'qa' ? '❓ 极速问答卡 (QA Card)' : '🧩 挖空卡设置 (Cloze Deletion)',
  );
  modal.appendChild(titleRow);

  const field1 = el(doc, 'div', 'tm-card-modal-field');
  const label1 = el(doc, 'label', '', type === 'qa' ? '问题 (Question):' : '挖空预览 / 上下文:');
  const input1 = el(
    doc,
    type === 'qa' ? 'input' : 'textarea',
    type === 'qa' ? 'tm-card-modal-input' : 'tm-card-modal-textarea',
  ) as HTMLInputElement;
  if (type === 'qa') {
    input1.placeholder = '输入问题（例如：该概念的核心定义是什么？）';
  } else {
    (input1 as HTMLTextAreaElement).value = initialAnswerOrCloze;
  }
  field1.appendChild(label1);
  field1.appendChild(input1);
  modal.appendChild(field1);

  let input2: HTMLTextAreaElement | null = null;
  if (type === 'qa') {
    const field2 = el(doc, 'div', 'tm-card-modal-field');
    const label2 = el(doc, 'label', '', '答案 (Answer / 选区):');
    input2 = el(doc, 'textarea', 'tm-card-modal-textarea') as HTMLTextAreaElement;
    input2.value = initialAnswerOrCloze;
    field2.appendChild(label2);
    field2.appendChild(input2);
    modal.appendChild(field2);
  }

  const actions = el(doc, 'div', 'tm-card-modal-actions');
  const cancelBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-cancel', '取消');
  const saveBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit', '确定生成卡片');

  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', () => {
    const q = type === 'qa' ? input1.value.trim() : '';
    const a = type === 'qa'
      ? (input2 ? input2.value.trim() : initialAnswerOrCloze)
      : (input1 as HTMLTextAreaElement).value.trim();
    if (type === 'qa' && !q) {
      input1.focus();
      return;
    }
    onSave({ question: q, answerOrCloze: a });
    close();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  doc.body.appendChild(overlay);

  setTimeout(() => input1.focus(), 50);
}
