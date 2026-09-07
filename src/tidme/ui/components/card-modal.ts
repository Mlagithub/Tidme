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
  label?: string;
}

export interface CardModalOptions {
  type: 'qa' | 'cloze' | 'image-qa';
  initialAnswerOrCloze?: string;
  imageUrl?: string;
  docTitle?: string;
  page?: number;
  onSave: (res: CardModalResult) => void;
}

/** 打开模态：type=qa / cloze / image-qa。onSave 后自动关闭。 */
export function openCardModal(
  doc: Document,
  typeOrOpts: 'qa' | 'cloze' | 'image-qa' | CardModalOptions,
  initialAnswerOrCloze?: string,
  onSave?: (res: CardModalResult) => void,
) {
  const isOpts = typeof typeOrOpts === 'object' && typeOrOpts !== null;
  const opts: CardModalOptions = isOpts
    ? (typeOrOpts as CardModalOptions)
    : {
      type: typeOrOpts as any,
      initialAnswerOrCloze: initialAnswerOrCloze || '',
      onSave: onSave || (() => {}),
    };

  const type = opts.type;
  const initial = opts.initialAnswerOrCloze || '';
  const saveCallback = opts.onSave;

  const overlay = el(doc, 'div', 'tm-card-modal-overlay');
  const modal = el(doc, 'div', 'tm-card-modal');

  // 标题行
  let titleText = '❓ Q&A Card';
  if (type === 'cloze') titleText = '🧩 Cloze Card';
  else if (type === 'image-qa') titleText = '📷 Image Q&A Card';

  const titleRow = el(doc, 'div', 'tm-card-modal-title', titleText);
  if (type === 'image-qa' && opts.page) {
    const badge = el(doc, 'span', 'tm-card-modal-badge', `Page ${opts.page}`);
    titleRow.appendChild(badge);
  }
  modal.appendChild(titleRow);

  let input1: HTMLInputElement | HTMLTextAreaElement | null = null;
  let input2: HTMLTextAreaElement | null = null;
  let labelInput: HTMLInputElement | null = null;

  if (type === 'image-qa') {
    // 1. 图片预览区（作为问题面）
    if (opts.imageUrl) {
      const imgField = el(doc, 'div', 'tm-card-modal-field');
      const imgLabel = el(doc, 'label', '', 'Question (Image Selection):');
      const imgWrap = el(doc, 'div', 'tm-card-modal-img-wrap');
      const imgNode = el(doc, 'img', 'tm-card-modal-img-preview') as HTMLImageElement;
      imgNode.src = opts.imageUrl;
      imgWrap.appendChild(imgNode);
      imgField.appendChild(imgLabel);
      imgField.appendChild(imgWrap);
      modal.appendChild(imgField);
    }

    // 2. 简短标题 / 说明（可选）
    const fieldTitle = el(doc, 'div', 'tm-card-modal-field');
    const labelTitle = el(doc, 'label', '', 'Card Title / Note (Optional):');
    labelInput = el(doc, 'input', 'tm-card-modal-input') as HTMLInputElement;
    labelInput.placeholder = 'e.g. Architecture Diagram (defaults to page number if empty)';
    fieldTitle.appendChild(labelTitle);
    fieldTitle.appendChild(labelInput);
    modal.appendChild(fieldTitle);

    // 3. 答案输入区（自动聚焦）
    const fieldAns = el(doc, 'div', 'tm-card-modal-field');
    const labelAns = el(doc, 'label', '', 'Answer:');
    input2 = el(doc, 'textarea', 'tm-card-modal-textarea') as HTMLTextAreaElement;
    input2.placeholder = 'Enter answer or key explanation for this image...';
    input2.value = initial;
    fieldAns.appendChild(labelAns);
    fieldAns.appendChild(input2);
    modal.appendChild(fieldAns);
  } else {
    // 经典 QA / Cloze 布局
    const field1 = el(doc, 'div', 'tm-card-modal-field');
    const label1 = el(doc, 'label', '', type === 'qa' ? 'Question:' : 'Cloze Preview / Context:');
    input1 = el(
      doc,
      type === 'qa' ? 'input' : 'textarea',
      type === 'qa' ? 'tm-card-modal-input' : 'tm-card-modal-textarea',
    ) as any;
    if (type === 'qa') {
      (input1 as HTMLInputElement).placeholder = 'Enter question...';
    } else {
      (input1 as HTMLTextAreaElement).value = initial;
    }
    field1.appendChild(label1);
    field1.appendChild(input1);
    modal.appendChild(field1);

    if (type === 'qa') {
      const field2 = el(doc, 'div', 'tm-card-modal-field');
      const label2 = el(doc, 'label', '', 'Answer:');
      input2 = el(doc, 'textarea', 'tm-card-modal-textarea') as HTMLTextAreaElement;
      input2.value = initial;
      field2.appendChild(label2);
      field2.appendChild(input2);
      modal.appendChild(field2);
    }
  }

  const actions = el(doc, 'div', 'tm-card-modal-actions');
  const cancelBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-cancel', 'Cancel (Esc)');
  const saveBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit', 'Create Card (Ctrl+Enter)');

  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  const submit = () => {
    if (type === 'image-qa') {
      const a = String(input2?.value || '').trim();
      const lbl = String(labelInput?.value || '').trim();
      saveCallback({
        question: opts.imageUrl ? `<img src="${opts.imageUrl}" style="max-width:100%">` : '',
        answerOrCloze: a,
        label: lbl,
      });
      close();
    } else {
      const q = type === 'qa' ? String((input1 as HTMLInputElement)?.value || '').trim() : '';
      const a = type === 'qa'
        ? (input2 ? String(input2.value || '').trim() : initial)
        : String((input1 as HTMLTextAreaElement)?.value || '').trim();
      if (type === 'qa' && !q) {
        input1?.focus();
        return;
      }
      saveCallback({ question: q, answerOrCloze: a });
      close();
    }
  };

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', submit);

  // 快捷键支持：Esc 关闭，Ctrl+Enter / Cmd+Enter 快速提交
  modal.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  doc.body.appendChild(overlay);

  setTimeout(() => {
    if (type === 'image-qa') {
      input2?.focus();
    } else {
      input1?.focus();
    }
  }, 50);
}
