/**
 * codemirror-editor.ts — CodeMirror 6 Live Preview 编辑器包装类
 *
 * 负责实例化 CodeMirror 6 视图，管理文档状态更新、自动保存防抖及选区联动。
 */

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { livePreviewPlugin } from './live-preview-plugin';

export interface CodeMirrorEditorOptions {
  parent: HTMLElement;
  initialText: string;
  placeholder?: string;
  onSubmit?: () => void;
  onInput?: (text: string) => void;
  onBlur?: (text: string) => void;
  onSelectionChange?: (selectedText: string, range: { from: number; to: number }) => void;
}

// 定义 Tidme 主题样式，确保 CodeMirror 无缝融入 TiddlyWiki 页面
const tidmeLiveTheme = EditorView.theme({
  '&': {
    fontSize: '1rem',
    lineHeight: '1.8',
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
    minHeight: '180px',
    width: '100%',
    maxWidth: '42em',
    boxSizing: 'border-box',
  },
  '.cm-content': {
    padding: '8px 0 24px 0',
    caretColor: 'var(--tm-primary, #3b82f6)',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--tm-primary, #3b82f6)',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  '.cm-line': {
    padding: '0 2px',
  },
});

export class TidmeLiveEditor {
  view: EditorView;
  private _saveTimer: any = null;

  constructor(options: CodeMirrorEditorOptions) {
    const submitKeymap = options.onSubmit
      ? [{
        key: 'Mod-Enter',
        run: () => {
          options.onSubmit!();
          return true;
        },
      }]
      : [];

    const extensions = [
      history(),
      keymap.of([...submitKeymap, ...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      tidmeLiveTheme,
      livePreviewPlugin,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const docText = update.state.doc.toString();
          if (options.onInput) {
            options.onInput(docText);
          }
        }
        if (update.selectionSet || update.docChanged) {
          const sel = update.state.selection.main;
          if (!sel.empty && options.onSelectionChange) {
            const selectedText = update.state.sliceDoc(sel.from, sel.to);
            options.onSelectionChange(selectedText, { from: sel.from, to: sel.to });
          }
        }
      }),
      EditorView.domEventHandlers({
        blur: () => {
          if (options.onBlur) {
            options.onBlur(this.view.state.doc.toString());
          }
        },
      }),
    ];
    if (options.placeholder) {
      extensions.push(placeholder(options.placeholder));
    }

    const startState = EditorState.create({
      doc: options.initialText,
      extensions,
    });

    this.view = new EditorView({
      state: startState,
      parent: options.parent,
    });
  }

  public getText(): string {
    return this.view.state.doc.toString();
  }

  public setText(newText: string) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: newText },
    });
  }

  public focus() {
    this.view.focus();
  }

  public destroy() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this.view.destroy();
  }
}
