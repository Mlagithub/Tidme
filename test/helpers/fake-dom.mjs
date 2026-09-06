/*
fake-dom.mjs — widget 渲染冒烟专用的最小假 DOM（全库唯一一份）

为什么不直接用 jsdom：widget 冒烟只关心"渲染不抛错 + 输出树内容"，
假 DOM 快且能精确暴露 widget 对 DOM 的真实依赖。
已知陷阱（改这里之前先读）：
- textContent 赋值必须像真实 DOM：空串清空子节点（widget rebuild 依赖此行为）
- TW 的 getVariable 只从 parentWidget.variables 链读，变量存储格式为 {value,...} 对象
- computeAttribute 只认 type: string/filtered/indirect/macro/substituted，属性必须带 type
*/
export function fakeElement(tag = 'div') {
  const e = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    children: [],
    style: {},
    attributes: {},
    parentNode: null,
    innerHTML: '',
    _text: '',
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    getAttribute(k) {
      return this.attributes[k];
    },
    appendChild(c) {
      this.childNodes.push(c);
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    insertBefore(c) {
      this.childNodes.push(c);
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    removeChild(c) {
      this.childNodes = this.childNodes.filter((x) => x !== c);
      this.children = this.children.filter((x) => x !== c);
      return c;
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      },
      toggle() {},
    },
    hasAttribute() {
      return false;
    },
    ownerDocument: null,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    setAttributeNS() {},
    getBoundingClientRect() {
      return { top: 0, left: 0 };
    },
    focus() {},
    scrollIntoView() {},
    replaceChildren() {},
  };
  // textContent 赋值需像真实 DOM：空串清空子节点（widget rebuild 依赖此行为）
  Object.defineProperty(e, 'textContent', {
    get() {
      return e._text;
    },
    set(v) {
      e._text = v;
      if (v === '' || v === undefined) {
        e.childNodes = [];
        e.children = [];
      }
    },
  });
  return e;
}

export const fakeDocument = {
  createElement: (t) => fakeElement(t),
  createElementNS: (ns, t) => fakeElement(t),
  createTextNode: (text) => {
    const e = fakeElement('#text');
    e.textContent = String(text);
    return e;
  },
  body: fakeElement('body'),
  title: 'fake',
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createRange: () => ({ setStart() {}, setEnd() {}, surroundContents() {} }),
  defaultView: null,
};

/** 递归收集 DOM 文本（fake 不自动聚合 textContent） */
export function collectText(node) {
  if (!node) return '';
  let out = node.textContent || '';
  for (const c of node.childNodes || []) out += collectText(c);
  return out;
}

/** 递归收集 button 元素（fake 不提供 querySelectorAll） */
export function collectButtons(node, out = []) {
  if (!node) return out;
  if (String(node.tagName) === 'BUTTON') out.push(node);
  for (const c of node.childNodes || []) collectButtons(c, out);
  return out;
}

/**
 * 渲染一个插件 widget（冒烟）。opts.variables / opts.attributes 传纯字符串值即可，
 * 内部负责包装成 TW 需要的 {value,...} / {type,value} 格式。
 */
export function renderWidget(wiki, mod, name, opts = {}) {
  const root = fakeElement('div');
  const vars = {};
  for (const [k, v] of Object.entries(opts.variables || {})) {
    vars[k] = { value: v, params: [], isMacroDefinition: false, isFunctionDefinition: false, isProcedureDefinition: false, isWidgetDefinition: false, configTrimWhiteSpace: false };
  }
  const attrs = {};
  for (const [k, v] of Object.entries(opts.attributes || {})) {
    attrs[k] = typeof v === 'object' && v !== null ? v : { type: 'string', value: String(v) };
  }
  const parentWidget = {
    variables: vars,
    getAncestorCount: () => 0,
    getVariable: () => '',
  };
  const w = new mod[name]({ attributes: attrs }, {
    wiki,
    document: fakeDocument,
    parentWidget,
    variables: {},
  });
  w.render(root, null);
  return { root, w };
}
