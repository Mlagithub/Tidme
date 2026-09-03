"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/tidme/import/pipeline/main.ts
var main_exports = {};
__export(main_exports, {
  NS: () => NS,
  applyOverrides: () => applyOverrides,
  bookCardsRoot: () => bookCardsRoot,
  bookRoot: () => bookRoot,
  cardPath: () => cardPath,
  cleanTitle: () => cleanTitle,
  contentFingerprint: () => contentFingerprint,
  deckSubsetPath: () => deckSubsetPath,
  docPageTitle: () => docPageTitle,
  extractPath: () => extractPath,
  initialFsrsFields: () => initialFsrsFields,
  insertedSectionTitle: () => insertedSectionTitle,
  isInBook: () => isInBook,
  isTidmeContent: () => isTidmeContent,
  itemPath: () => itemPath,
  makeCardId: () => makeCardId,
  makeDocId: () => makeDocId,
  makeExtractId: () => makeExtractId,
  makeSectionId: () => makeSectionId,
  neighborsOf: () => neighborsOf,
  runImport: () => runImport,
  runSplit: () => runSplit,
  sectionPath: () => sectionPath,
  slugify: () => slugify,
  twDateString: () => twDateString
});
module.exports = __toCommonJS(main_exports);

// src/tidme/core/ids.ts
var _encoder = null;
function getEncoder() {
  if (_encoder)
    return _encoder;
  if (typeof TextEncoder !== "undefined") {
    _encoder = new TextEncoder();
    return _encoder;
  }
  const buf = typeof Buffer !== "undefined" ? Buffer : null;
  if (buf) {
    _encoder = { encode: (s) => new Uint8Array(buf.from(s, "utf8")) };
    return _encoder;
  }
  throw new Error("TextEncoder \u4E0D\u53EF\u7528");
}
function getSubtle() {
  const subtle = globalThis.crypto?.subtle;
  if (subtle)
    return subtle;
  let proc;
  try {
    proc = typeof process !== "undefined" ? process : void 0;
  } catch {
    proc = void 0;
  }
  if (proc && typeof proc.getBuiltinModule === "function") {
    const nodeCrypto = proc.getBuiltinModule("node:crypto");
    if (nodeCrypto?.webcrypto?.subtle)
      return nodeCrypto.webcrypto.subtle;
  }
  throw new Error("crypto.subtle \u4E0D\u53EF\u7528\uFF08\u9700\u8981\u6D4F\u89C8\u5668\u6216 Node >= 19\uFF09");
}
async function hashHex(str) {
  const digest = await getSubtle().digest("SHA-256", getEncoder().encode(str));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function shortHash(str, len = 10) {
  return (await hashHex(str)).slice(0, len);
}
function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
async function contentFingerprint(text) {
  return shortHash(normalizeText(text), 16);
}
async function makeDocId(meta) {
  const basis = ["tidme-doc/v1", meta.title || "", meta.creator || "", meta.language || ""].join("\n");
  return "d" + await shortHash(basis, 8);
}
async function makeSectionId(docId, breadcrumb, ordinal) {
  const basis = [docId, breadcrumb.join(" \u203A "), String(ordinal)].join("|");
  return "s" + await shortHash(basis, 12);
}
async function makeExtractId(parentId, text, ordinal) {
  const basis = [parentId, await contentFingerprint(text), String(ordinal)].join("|");
  return "e" + await shortHash(basis, 12);
}
async function makeCardId(parentId, caption, text, ordinal) {
  const basis = [parentId, await contentFingerprint(caption + "\n" + text), String(ordinal)].join("|");
  return "c" + await shortHash(basis, 12);
}

// src/tidme/import/pipeline/epub.ts
var _JSZip = null;
function JSZipLib() {
  if (!_JSZip)
    _JSZip = require("$:/plugins/keepone/tidme/import/jszip");
  return _JSZip;
}
var XHTML_TYPE = "application/xhtml+xml";
function localName(node) {
  return String(node && (node.localName || node.tagName) || "").toLowerCase();
}
function findNode(root, selectors) {
  let node = root;
  for (const selector of selectors) {
    const children = node.childNodes || [];
    node = null;
    for (const child of Array.from(children)) {
      if (child.nodeType === 1 && localName(child) === selector.toLowerCase()) {
        node = child;
        break;
      }
    }
    if (!node)
      return null;
  }
  return node;
}
function getText(node) {
  let out = "";
  const walk = (n) => {
    for (const c of Array.from(n.childNodes || [])) {
      if (c.nodeType === 3)
        out += c.nodeValue || "";
      else if (c.nodeType === 1)
        walk(c);
    }
  };
  walk(node);
  return out;
}
function resolvePath(href, baseDir) {
  if (!href)
    return href;
  if (/^[a-z]+:/i.test(href))
    return href;
  href = href.replace(/^\.\//, "");
  if (href.startsWith("/"))
    return href.slice(1);
  return baseDir + href;
}
function normalizePath(p) {
  return String(p || "").replace(/^\.\//, "").replace(/\\/g, "/").split("#")[0];
}
function readEpubBytes(bytes) {
  return __async(this, null, function* () {
    const zip = yield JSZipLib().loadAsync(bytes);
    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile)
      throw new Error("\u4E0D\u662F\u6709\u6548\u7684 EPUB\uFF1A\u7F3A\u5C11 META-INF/container.xml");
    const containerDoc = new DOMParser().parseFromString(yield containerFile.async("string"), "text/xml");
    const rootfile = findNode(containerDoc, ["container", "rootfiles", "rootfile"]);
    if (!rootfile)
      throw new Error("container.xml \u4E2D\u627E\u4E0D\u5230 rootfile");
    const opfPath = rootfile.getAttribute("full-path");
    const opfDoc = new DOMParser().parseFromString(yield zip.file(opfPath).async("string"), "text/xml");
    const opfDir = opfPath.replace(/[^/]*$/, "");
    const meta = {};
    const metaNode = findNode(opfDoc, ["package", "metadata"]);
    if (metaNode) {
      for (const child of Array.from(metaNode.childNodes || [])) {
        if (child.nodeType !== 1)
          continue;
        const n = localName(child);
        const val = String(child.textContent || "").trim();
        if (!val)
          continue;
        if (n === "title" && !meta.title)
          meta.title = val;
        else if (n === "creator" && !meta.creator)
          meta.creator = val;
        else if (n === "language" && !meta.language)
          meta.language = val;
        else if (n === "publisher" && !meta.publisher)
          meta.publisher = val;
        else if (n === "date" && !meta.date)
          meta.date = val;
      }
    }
    const manifest = {};
    const manifestNode = findNode(opfDoc, ["package", "manifest"]);
    if (manifestNode) {
      for (const child of Array.from(manifestNode.childNodes || [])) {
        if (child.nodeType !== 1 || localName(child) !== "item")
          continue;
        const id = child.getAttribute("id");
        manifest[id] = {
          id,
          href: resolvePath(child.getAttribute("href"), opfDir),
          mediaType: child.getAttribute("media-type") || "",
          properties: (child.getAttribute("properties") || "").split(/\s+/).filter(Boolean)
        };
      }
    }
    const spineNode = findNode(opfDoc, ["package", "spine"]);
    if (!spineNode)
      throw new Error("OPF \u4E2D\u6CA1\u6709 spine");
    const spine = [];
    for (const child of Array.from(spineNode.childNodes || [])) {
      if (child.nodeType !== 1 || localName(child) !== "itemref")
        continue;
      const item = manifest[child.getAttribute("idref")];
      if (item && item.mediaType === XHTML_TYPE)
        spine.push({ idref: item.id, href: item.href });
    }
    let ncxHref = null;
    const tocId = spineNode.getAttribute("toc");
    if (tocId && manifest[tocId])
      ncxHref = manifest[tocId].href;
    if (!ncxHref) {
      for (const id in manifest)
        if (/\.ncx$/i.test(manifest[id].href))
          ncxHref = manifest[id].href;
    }
    let navHref = null;
    for (const id in manifest)
      if ((manifest[id].properties || []).includes("nav"))
        navHref = manifest[id].href;
    return { zip, meta, spine, ncxHref, navHref };
  });
}
function extractNcxTree(book) {
  return __async(this, null, function* () {
    if (!book.ncxHref)
      return [];
    const doc = new DOMParser().parseFromString(yield book.zip.file(book.ncxHref).async("string"), "text/xml");
    const navMap = findNode(doc, ["ncx", "navMap"]);
    if (!navMap)
      return [];
    const ncxDir = book.ncxHref.replace(/[^/]*$/, "");
    const visit = (parent, depth) => {
      const out = [];
      for (const np of Array.from(parent.childNodes || [])) {
        if (np.nodeType !== 1 || localName(np) !== "navpoint")
          continue;
        const label = findNode(np, ["navLabel", "text"]);
        const content = findNode(np, ["content"]);
        let href = "";
        let frag = "";
        if (content) {
          const src = content.getAttribute("src") || "";
          const hashIdx = src.indexOf("#");
          href = resolvePath(hashIdx === -1 ? src : src.slice(0, hashIdx), ncxDir);
          frag = hashIdx === -1 ? "" : src.slice(hashIdx + 1);
        }
        out.push({
          text: label ? getText(label).replace(/\s+/g, " ").trim() : "",
          href,
          frag,
          depth,
          children: visit(np, depth + 1)
        });
      }
      return out;
    };
    return visit(navMap, 0);
  });
}
function extractNavTree(book) {
  return __async(this, null, function* () {
    if (!book.navHref)
      return [];
    const doc = new DOMParser().parseFromString(yield book.zip.file(book.navHref).async("string"), "text/xml");
    const navDir = book.navHref.replace(/[^/]*$/, "");
    const navs = doc.getElementsByTagName("nav");
    let nav = null;
    for (const n of Array.from(navs)) {
      const type = n.getAttribute("epub:type") || "";
      const role = n.getAttribute("role") || "";
      if (type.includes("toc") || role === "doc-toc") {
        nav = n;
        break;
      }
    }
    if (!nav && navs.length)
      nav = navs[0];
    if (!nav)
      return [];
    const visit = (ol2, depth) => {
      const out = [];
      for (const li of Array.from(ol2.childNodes || [])) {
        if (li.nodeType !== 1 || localName(li) !== "li")
          continue;
        const a = findNode(li, ["a"]) || findNode(li, ["span"]);
        const text = a ? getText(a).replace(/\s+/g, " ").trim() : "";
        const src = a ? a.getAttribute("href") || "" : "";
        const hashIdx = src.indexOf("#");
        const href = resolvePath(hashIdx === -1 ? src : src.slice(0, hashIdx), navDir);
        const frag = hashIdx === -1 ? "" : src.slice(hashIdx + 1);
        const childOl = findNode(li, ["ol"]);
        out.push({ text, href, frag, depth, children: childOl ? visit(childOl, depth + 1) : [] });
      }
      return out;
    };
    const ol = findNode(nav, ["ol"]);
    return ol ? visit(ol, 0) : [];
  });
}
function makeBreadcrumbResolver(ncxTree, spine) {
  const byHref = /* @__PURE__ */ new Map();
  const walk = (nodes, trail) => {
    for (const n of nodes) {
      const path = [...trail, n.text].filter(Boolean);
      const key = normalizePath(n.href);
      if (key && !byHref.has(key))
        byHref.set(key, path);
      walk(n.children || [], path);
    }
  };
  walk(ncxTree, []);
  const cache = [];
  let last = [];
  return (i) => {
    var _a;
    if (cache[i] !== void 0)
      return cache[i];
    const key = normalizePath(((_a = spine[i]) == null ? void 0 : _a.href) || "");
    const found = byHref.get(key);
    const result = found ? found.slice() : last.slice();
    last = result;
    cache[i] = result;
    return result;
  };
}
function flattenNcx(tree) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      out.push({ title: n.text, href: n.href, frag: n.frag, depth: n.depth });
      walk(n.children || []);
    }
  };
  walk(tree);
  return out;
}
function anchorBoundaries(doc, blocks, entries) {
  const byEl = /* @__PURE__ */ new Map();
  blocks.forEach((b, i) => {
    if (b.el)
      byEl.set(b.el, i);
  });
  const out = [];
  if (!entries.length || !blocks.length)
    return out;
  for (const entry of entries) {
    if (!entry.frag)
      continue;
    let el = null;
    try {
      el = doc.getElementById(entry.frag);
    } catch (e) {
    }
    if (!el)
      continue;
    let cur = el;
    while (cur && !byEl.has(cur))
      cur = cur.parentNode;
    const idx = cur ? byEl.get(cur) : void 0;
    if (idx !== void 0 && !out.some((o) => o.idx === idx)) {
      out.push({ idx, entry });
    }
  }
  out.sort((a, b) => a.idx - b.idx);
  return out;
}
var BLOCK_TAGS = /* @__PURE__ */ new Set([
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "caption",
  "pre"
]);
function collectBlocks(doc) {
  const rows = [];
  const body = doc.getElementsByTagName("body")[0] || doc.documentElement;
  if (!body)
    return rows;
  const walk = (parent) => {
    for (const child of Array.from(parent.childNodes || [])) {
      if (child.nodeType !== 1)
        continue;
      const local = localName(child);
      if (!BLOCK_TAGS.has(local))
        continue;
      const hasBlockChild = Array.from(child.childNodes).some(
        (c) => c.nodeType === 1 && BLOCK_TAGS.has(localName(c))
      );
      const text = getText(child).replace(/\s+/g, " ").trim();
      const isHeading = /^h[1-6]$/.test(local);
      if (!hasBlockChild && text) {
        rows.push({ el: child, text, tag: local, isHeading, level: isHeading ? parseInt(local[1], 10) : 0 });
      }
      walk(child);
    }
  };
  walk(body);
  return rows;
}

// src/tidme/import/pipeline/smart-merge.ts
var SENTENCE_END = /[。！？；：…!?;:"“”‘’（）)]\s*$/;
var BLOCK_BREAK = /* @__PURE__ */ new Set(["div", "body", "blockquote", "td", "li", "dd", "dt", "tr"]);
var NEW_BLOCK_PATTERNS = [
  /^\s*第[一二三四五六七八九十百千0-9]+[章节篇部卷]/,
  /^\s*[一二三四五六七八九十百]+\s*[、.．]/,
  /^\s*（[一二三四五六七八九十百]+）/,
  /^\s*\d+\s*[、.．]/,
  /^\s*\d+(\.\d+)+/,
  /^\s*[—\-–]\s*\S/,
  /^\s*[A-Z][A-Z0-9\s]{0,24}$/
];
function localName2(node) {
  return String(node && (node.localName || node.tagName) || "").toLowerCase();
}
function getText2(node) {
  let out = "";
  const walk = (n) => {
    for (const c of Array.from(n.childNodes || [])) {
      if (c.nodeType === 3)
        out += c.nodeValue || "";
      else if (c.nodeType === 1)
        walk(c);
    }
  };
  walk(node);
  return out;
}
function smartMergeParagraphs(doc) {
  const body = doc.getElementsByTagName("body")[0] || doc.documentElement;
  if (!body)
    return false;
  const isNewBlock = (text) => {
    const t = (text || "").trim();
    if (!t)
      return true;
    if (t.length <= 20 && !/[。！？；：!?;]$/.test(t))
      return true;
    for (const re of NEW_BLOCK_PATTERNS)
      if (re.test(t))
        return true;
    return false;
  };
  const textOf = (node) => getText2(node).replace(/\s+/g, " ").trim();
  const stripTrailingHyphen = (node) => {
    const kids = node.childNodes;
    for (let i = kids.length - 1; i >= 0; i--) {
      const c = kids[i];
      if (c.nodeType === 3) {
        c.nodeValue = c.nodeValue.replace(/\s*-\s*$/, "");
        return;
      }
      if (c.nodeType === 1) {
        stripTrailingHyphen(c);
        return;
      }
    }
  };
  let changed = false;
  const mergeWalk = (parent) => {
    const kids = Array.from(parent.childNodes || []);
    for (const c of kids) {
      if (c.nodeType === 1 && BLOCK_BREAK.has(localName2(c)))
        mergeWalk(c);
    }
    let i = 0;
    while (i < kids.length) {
      const c = kids[i];
      if (c.nodeType !== 1 || localName2(c) !== "p") {
        i++;
        continue;
      }
      const seq = [kids[i]];
      let j = i + 1;
      while (j < kids.length) {
        const k = kids[j];
        if (k.nodeType === 1 && localName2(k) === "p") {
          seq.push(k);
          j++;
          continue;
        }
        if (k.nodeType === 3 && /^\s*$/.test(k.nodeValue || "")) {
          j++;
          continue;
        }
        break;
      }
      if (seq.length < 2) {
        i = j;
        continue;
      }
      let current = seq[0];
      let curText = textOf(current);
      for (let k = 1; k < seq.length; k++) {
        const p = seq[k];
        const t = textOf(p);
        if (!t)
          continue;
        if (SENTENCE_END.test(curText) || isNewBlock(t) || isNewBlock(curText)) {
          current = p;
          curText = t;
          continue;
        }
        const lastChar = curText.slice(-1);
        const firstChar = t[0] || "";
        if (lastChar === "-")
          stripTrailingHyphen(current);
        else if (/[a-zA-Z0-9]/.test(lastChar) && /[a-zA-Z0-9]/.test(firstChar))
          current.appendChild(doc.createTextNode(" "));
        while (p.firstChild)
          current.appendChild(p.firstChild);
        p.parentNode.removeChild(p);
        curText = textOf(current);
        changed = true;
      }
      i = j;
    }
  };
  mergeWalk(body);
  return changed;
}

// src/tidme/import/pipeline/chunker.ts
var DEFAULTS = { maxChars: 4e3, minChars: 600 };
function cleanOptions(options = {}) {
  const out = {};
  if (Number.isFinite(options.maxChars) && options.maxChars > 0)
    out.maxChars = options.maxChars;
  if (Number.isFinite(options.minChars) && options.minChars >= 0)
    out.minChars = options.minChars;
  return out;
}
function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
var charsOf = (blocks) => blocks.reduce((n, b) => n + normalizeText(b.text).length, 0);
function serializeChildren(el) {
  const ser = new XMLSerializer();
  let out = "";
  for (const c of Array.from(el.childNodes || []))
    out += ser.serializeToString(c);
  return out;
}
var WRAP_TAGS = /* @__PURE__ */ new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "figcaption", "caption", "div"]);
function blockHtml(block) {
  if (typeof block.virtualHtml === "string")
    return block.virtualHtml;
  try {
    if (block.el) {
      const inner = serializeChildren(block.el);
      let tag = String(block.tag || "p").toLowerCase();
      if (!WRAP_TAGS.has(tag))
        tag = "p";
      if (inner.trim())
        return `<${tag}>${inner}</${tag}>`;
    }
  } catch (e) {
  }
  return `<p>${escapeHtml(normalizeText(block.text))}</p>`;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function splitSentences(text, maxLen) {
  const sentences = String(text).match(/[^。！？!?；;\n]+[。！？!?；;]*/g) || [String(text)];
  const out = [];
  let cur = "";
  for (const s of sentences) {
    if (s.length > maxLen) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      for (let i = 0; i < s.length; i += maxLen)
        out.push(s.slice(i, i + maxLen));
      continue;
    }
    if (cur && cur.length + s.length > maxLen) {
      out.push(cur);
      cur = s;
    } else
      cur += s;
  }
  if (cur)
    out.push(cur);
  return out;
}
function partitionBlocks(blocks, maxChars) {
  const parts = [];
  let cur = { htmlParts: [], textParts: [], chars: 0 };
  let hardSplitCount = 0;
  const flush = () => {
    if (cur.htmlParts.length || cur.textParts.length) {
      parts.push(cur);
      cur = { htmlParts: [], textParts: [], chars: 0 };
    }
  };
  for (const b of blocks) {
    const t = normalizeText(b.text);
    if (!t)
      continue;
    if (b.atomic) {
      flush();
      parts.push({ htmlParts: [blockHtml(b)], textParts: [t], chars: t.length });
      continue;
    }
    if (t.length > maxChars) {
      flush();
      for (const piece of splitSentences(t, maxChars)) {
        parts.push({ htmlParts: [`<p>${escapeHtml(piece)}</p>`], textParts: [piece], chars: piece.length });
        hardSplitCount++;
      }
      continue;
    }
    if (cur.chars && cur.chars + t.length > maxChars)
      flush();
    cur.htmlParts.push(blockHtml(b));
    cur.textParts.push(t);
    cur.chars += t.length;
  }
  flush();
  return { parts, hardSplitCount };
}
function buildTree(blocks) {
  const roots = [];
  const stack = [{ level: 0, children: roots }];
  let current = null;
  const preamble = [];
  for (const b of blocks) {
    if (b.isHeading) {
      while (stack.length > 1 && stack[stack.length - 1].level >= b.level)
        stack.pop();
      const parent = stack[stack.length - 1];
      const node = { level: b.level, text: b.text, blocks: [], children: [] };
      parent.children.push(node);
      stack.push({ level: b.level, children: node.children });
      current = node;
    } else {
      (current ? current.blocks : preamble).push(b);
    }
  }
  return { roots, preamble };
}
function collectLeaves(nodes, trail = [], out = []) {
  for (const n of nodes) {
    const path = [...trail, n.text || ""];
    if (!n.children.length)
      out.push({ node: n, trail: path });
    else {
      if (n.blocks.length)
        out.push({ node: { level: n.level, text: n.text, blocks: n.blocks, children: [] }, trail: path });
      collectLeaves(n.children, path, out);
    }
  }
  return out;
}
function deriveSection(sec) {
  if (sec.parts && sec.parts.length) {
    sec.html = sec.parts.map((p) => (p.title ? `<p><strong>${escapeHtml(p.title)}</strong></p>
` : "") + p.html).join("\n");
    sec.text = sec.parts.map((p) => (p.title ? "\u3010" + p.title + "\u3011" : "") + p.text).join("\n");
    sec.chars = sec.parts.reduce((n, p) => n + p.chars, 0);
  }
  return sec;
}
function applyOverrides(sections, overrides) {
  const o = overrides || {};
  const mergeKeys = new Set(o.merge || []);
  const splitKeys = new Set(o.split || []);
  const deleteKeys = new Set(o.delete || []);
  const titleMap = o.titles || {};
  const customList = o.customSections || [];
  const keyOf = (s) => s.trail.join(" \u203A ");
  const filtered = [];
  for (const s of sections) {
    const k = keyOf(s);
    if (deleteKeys.has(k))
      continue;
    const sec = __spreadProps(__spreadValues({}, s), { trail: [...s.trail] });
    if (titleMap[k]) {
      sec.title = titleMap[k];
      if (sec.trail.length)
        sec.trail[sec.trail.length - 1] = titleMap[k];
    }
    filtered.push(sec);
  }
  const out = [];
  for (const sec of filtered) {
    out.push(sec);
    if (splitKeys.has(keyOf(sec))) {
      const parts = sec.parts || [];
      const idx = parts.findIndex((p, i) => i > 0 && p.title);
      if (idx > 0) {
        const sub = parts[idx];
        sec.parts = [parts[0], ...parts.slice(idx + 1)];
        sec.merged = sec.parts.length > 1;
        const newSec = {
          level: sec.level,
          title: sub.title || "",
          trail: [...sec.trail, sub.title || ""].filter(Boolean),
          html: sub.html,
          text: sub.text,
          chars: sub.chars,
          parts: [{ html: sub.html, text: sub.text, chars: sub.chars }]
        };
        out.push(newSec);
      }
    }
  }
  const result = [];
  for (const sec of out) {
    if (mergeKeys.has(keyOf(sec)) && result.length) {
      const prev = result[result.length - 1];
      const parts = sec.parts || [{ html: sec.html, text: sec.text, chars: sec.chars }];
      prev.parts = prev.parts || [{ html: prev.html, text: prev.text, chars: prev.chars }];
      prev.parts.push({ title: sec.title || void 0, html: parts[0].html, text: parts[0].text, chars: parts[0].chars });
      for (const p of parts.slice(1))
        prev.parts.push(p);
      prev.merged = true;
      prev.level = Math.min(prev.level, sec.level);
      continue;
    }
    result.push(sec);
  }
  for (const cs of customList) {
    if (!cs.title || !cs.text)
      continue;
    const newSec = {
      level: 1,
      title: cs.title,
      trail: [cs.title],
      html: `<p>${escapeHtml(cs.text)}</p>`,
      text: cs.text,
      chars: cs.text.length,
      parts: [{ html: `<p>${escapeHtml(cs.text)}</p>`, text: cs.text, chars: cs.text.length }]
    };
    if (cs.insertAfterKey) {
      const idx = result.findIndex((s) => keyOf(s) === cs.insertAfterKey);
      if (idx >= 0)
        result.splice(idx + 1, 0, newSec);
      else
        result.push(newSec);
    } else {
      result.push(newSec);
    }
  }
  result.forEach((sec, i) => {
    deriveSection(sec);
    sec.ordinal = i;
  });
  return result;
}
function applySizeRules(leaves, cfg, stats) {
  const expanded = [];
  for (const leaf of leaves) {
    const title = leaf.trail[leaf.trail.length - 1] || "";
    const blocks = leaf.node.blocks.filter((b) => normalizeText(b.text));
    const html = blocks.map(blockHtml).join("\n\n");
    const text = blocks.map((b) => normalizeText(b.text)).join("\n");
    const total = charsOf(blocks);
    expanded.push({
      level: leaf.node.level,
      title,
      trail: leaf.trail,
      html,
      text,
      chars: total,
      parts: [{ html, text, chars: total }]
    });
  }
  const result = [];
  for (const sec of expanded) {
    const canMergeIntoPrev = result.length && sec.chars < cfg.minChars && result[result.length - 1].chars + sec.chars <= cfg.maxChars;
    if (canMergeIntoPrev) {
      const prev = result[result.length - 1];
      prev.parts.push({ title: sec.title || void 0, html: sec.html, text: sec.text, chars: sec.chars });
      prev.chars += sec.chars;
      prev.merged = true;
      continue;
    }
    result.push(sec);
  }
  return result.map(deriveSection);
}
function makeBreadcrumb(parts) {
  return parts.map((p) => String(p || "").replace(/\s+/g, " ").trim()).filter(Boolean);
}
function chunkFile(p, statsOut = {}) {
  const cfg = __spreadValues(__spreadValues({}, DEFAULTS), cleanOptions(p.options || {}));
  statsOut.hardSplitCount = statsOut.hardSplitCount || 0;
  const blocks = p.blocks || [];
  const crumbBase = Array.isArray(p.fileBreadcrumb) ? p.fileBreadcrumb.filter(Boolean) : [];
  const headings = blocks.filter((b) => b.isHeading);
  if (!headings.length) {
    const fallbackTitle = crumbBase[crumbBase.length - 1] || String(p.fileName || "").replace(/.*\//, "").replace(/\.[a-z0-9]+$/i, "") || "\u6B63\u6587";
    const level = Math.max(2, Math.min(6, crumbBase.length + 1));
    const { parts, hardSplitCount } = partitionBlocks(blocks, cfg.maxChars);
    statsOut.hardSplitCount += hardSplitCount;
    return parts.map((part, idx) => {
      const html = part.htmlParts.join("\n\n");
      const text = part.textParts.join("\n");
      return {
        level,
        title: idx === 0 ? fallbackTitle : "",
        trail: makeBreadcrumb([...crumbBase, idx === 0 ? fallbackTitle : ""]),
        html,
        text,
        chars: part.chars,
        isContinuation: idx > 0,
        parts: [{ html, text, chars: part.chars }]
      };
    });
  }
  const { roots, preamble } = buildTree(blocks);
  const leaves = collectLeaves(roots);
  if (preamble.some((b) => normalizeText(b.text))) {
    leaves.unshift({ node: { level: headings[0].level, text: "\u524D\u8A00", blocks: preamble, children: [] }, trail: [...crumbBase, "\u524D\u8A00"] });
  }
  const processed = applySizeRules(leaves, cfg, statsOut);
  return processed.map((sec) => __spreadValues({
    level: Math.max(2, Math.min(6, sec.level)),
    title: sec.title || "",
    trail: makeBreadcrumb(sec.trail),
    html: sec.html,
    text: sec.text,
    chars: sec.chars,
    merged: !!sec.merged,
    isContinuation: !!sec.isContinuation
  }, sec.parts ? { parts: sec.parts } : {}));
}
function chunkBook(files, options = {}, overrides) {
  const stats = { hardSplitCount: 0, sections: 0 };
  const sections = [];
  for (const f of files) {
    const secs = chunkFile({ blocks: f.blocks, fileBreadcrumb: f.fileBreadcrumb, fileName: f.fileName, options }, stats);
    secs.forEach((s, i) => sections.push(__spreadProps(__spreadValues({}, s), { file: f.fileName, orderInFile: i })));
  }
  sections.forEach((s, idx) => {
    s.ordinal = idx;
    if (s.isContinuation) {
      const base = s.trail.length ? s.trail[s.trail.length - 1] : "\u7EED";
      s.trail = [...s.trail.slice(0, -1), `${base} (\u7EED)`];
    }
    if (!s.title)
      s.title = s.trail[s.trail.length - 1] || "\u7EED";
  });
  const final = applyOverrides(sections, overrides);
  stats.sections = final.length;
  return { sections: final, stats };
}

// src/tidme/import/pipeline/ingest-text.ts
function escapeHtml2(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function virtualBlock(text, isHeading = false, level = 0) {
  return { text, tag: isHeading ? "h" + level : "p", isHeading, level, virtualHtml: isHeading ? "" : `<p>${escapeHtml2(text)}</p>` };
}
function headingBlock(text, level) {
  return virtualBlock(text, true, Math.max(1, Math.min(6, level)));
}
function preBlock(text, cls = "tm-import-code", tag = "pre") {
  return {
    text,
    tag,
    isHeading: false,
    level: 0,
    atomic: true,
    virtualHtml: `<pre class="${cls}">${escapeHtml2(text)}</pre>`
  };
}
function blockquoteBlock(text) {
  return {
    text,
    tag: "blockquote",
    isHeading: false,
    level: 0,
    virtualHtml: `<blockquote>${escapeHtml2(text)}</blockquote>`
  };
}
function splitLines(text) {
  return String(text || "").replace(/\r\n?/g, "\n").split("\n");
}
function paragraphsOf(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const paras = normalized.split(/\n[ \t]*\n+/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  return paras.length ? paras : [normalized.trim()].filter(Boolean);
}
var FENCE_RE = /^\s*(```|~~~)\s*([^\s]*)\s*$/;
var ATX_RE = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
var SETEXT_RE = /^\s*(=+|-+)\s*$/;
var HR_RE = /^\s*([-*_])\s*\1\s*\1+\s*$/;
var LIST_RE = /^(\s*[-*+]\s+|\s*\d+[.)]\s+)/;
var TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
var TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
var QUOTE_RE = /^\s*>\s?/;
function isTableSeparator(line) {
  return TABLE_SEP_RE.test(line) && line.includes("-");
}
function collectTable(lines, start) {
  const rows = [lines[start]];
  let i = start + 1;
  if (i < lines.length && isTableSeparator(lines[i])) {
    rows.push(lines[i]);
    i++;
    while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && !isTableSeparator(lines[i])) {
      rows.push(lines[i]);
      i++;
    }
    return { rows, nextIndex: i };
  }
  return { rows: [], nextIndex: start + 1 };
}
function blocksFromMarkdown(text) {
  const lines = splitLines(text);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const fence = trimmed.match(FENCE_RE);
    if (fence) {
      const content = [];
      i++;
      while (i < lines.length && !/^\s*(```|~~~)\s*$/.test(lines[i])) {
        content.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(preBlock(content.join("\n"), fence[2] ? `tm-import-code ${fence[2]}` : "tm-import-code"));
      continue;
    }
    const atx = trimmed.match(ATX_RE);
    if (atx && !trimmed.startsWith("#!")) {
      blocks.push(headingBlock(atx[2].trim(), atx[1].length));
      i++;
      continue;
    }
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const { rows, nextIndex } = collectTable(lines, i);
      if (rows.length) {
        blocks.push(preBlock(rows.join("\n"), "tm-import-table", "table"));
        i = nextIndex;
        continue;
      }
    }
    if (trimmed && i + 1 < lines.length && SETEXT_RE.test(lines[i + 1]) && !HR_RE.test(line)) {
      blocks.push(headingBlock(trimmed, lines[i + 1].trim().startsWith("=") ? 1 : 2));
      i += 2;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const quote = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(lines[i].replace(QUOTE_RE, ""));
        i++;
      }
      blocks.push(blockquoteBlock(quote.join(" ")));
      continue;
    }
    if (HR_RE.test(trimmed)) {
      i++;
      continue;
    }
    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && (LIST_RE.test(lines[i]) || /^\s+\S/.test(lines[i]))) {
        items.push(lines[i]);
        i++;
      }
      blocks.push(preBlock(items.join("\n"), "tm-import-list", "pre"));
      continue;
    }
    if (trimmed) {
      const para = [trimmed];
      i++;
      while (i < lines.length && lines[i].trim() && !FENCE_RE.test(lines[i]) && !ATX_RE.test(lines[i]) && !QUOTE_RE.test(lines[i]) && !LIST_RE.test(lines[i]) && !HR_RE.test(lines[i].trim()) && !(TABLE_ROW_RE.test(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push(virtualBlock(para.join(" ")));
      continue;
    }
    i++;
  }
  return blocks.filter((b) => normalizeText(b.text));
}
function blocksFromWikitext(text) {
  const lines = splitLines(text);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const bang = trimmed.match(/^(!{1,6})\s*(.+)$/);
    if (bang && !trimmed.startsWith("![")) {
      blocks.push(headingBlock(bang[2].trim(), bang[1].length));
      i++;
      continue;
    }
    const htmlH = trimmed.match(/^<h([1-6])[^>]*>(.*?)<\/h\1>\s*$/i);
    if (htmlH) {
      blocks.push(headingBlock(htmlH[2].replace(/<[^>]+>/g, "").trim(), Number(htmlH[1])));
      i++;
      continue;
    }
    if (trimmed) {
      const para = [trimmed];
      i++;
      while (i < lines.length && lines[i].trim() && !/^!{1,6}\s/.test(lines[i].trim()) && !/^<h[1-6][^>]*>/i.test(lines[i].trim())) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push(virtualBlock(para.join(" ")));
      continue;
    }
    i++;
  }
  return blocks.filter((b) => normalizeText(b.text));
}
function blocksFromHtml(text) {
  if (typeof DOMParser === "undefined") {
    throw new Error("HTML \u89E3\u6790\u9700\u8981 DOMParser\uFF08\u6D4F\u89C8\u5668\u6216 jsdom\uFF09");
  }
  const doc = new DOMParser().parseFromString(String(text || ""), "text/html");
  return collectBlocks(doc);
}
function blocksFromPlainText(text) {
  return paragraphsOf(text).map((p) => virtualBlock(p)).filter((b) => normalizeText(b.text));
}
function sniffFormat(text) {
  const t = String(text || "").slice(0, 2e3);
  if (/^\s*<(?:!DOCTYPE\s+html|html|head|body|h[1-6]|div|p)\b/i.test(t))
    return "html";
  const hasMdHeading = /^\s*#{1,6}\s+\S/m.test(t);
  const hasMdFence = /^\s*(```|~~~)/m.test(t);
  const hasBangHeading = /^\s*!{1,6}\s+\S/m.test(t);
  if (hasBangHeading && !hasMdHeading && !hasMdFence)
    return "wikitext";
  if (hasMdHeading || hasMdFence || /^\s*[-*+]\s+\S/m.test(t) || /^\s*\d+[.)]\s+\S/m.test(t))
    return "markdown";
  return "txt";
}
function formatLabel(format) {
  return { epub: "\u5BFC\u5165\u81EA EPUB", markdown: "Markdown", wikitext: "Wikitext", html: "HTML", txt: "TXT" }[format] || format;
}
function guessTitle(text, format) {
  if (format === "markdown")
    return guessTitleFromMarkdown(text);
  if (format === "wikitext") {
    const m = text.match(/^\s*!\s+(.+)$/m);
    return m ? m[1].trim() : null;
  }
  if (format === "html") {
    const m = text.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    return m ? m[1].trim() : null;
  }
  return null;
}
function guessTitleFromMarkdown(text) {
  const m = text.match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}
function decodeBytes(bytes) {
  if (typeof TextDecoder === "undefined") {
    const buf = typeof Buffer !== "undefined" ? Buffer : null;
    if (buf)
      return buf.from(bytes).toString("utf8");
    return new TextDecoder().decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    try {
      return new TextDecoder("gbk").decode(bytes);
    } catch (e2) {
      return new TextDecoder().decode(bytes);
    }
  }
}

// src/tidme/core/paths.ts
var RESERVED = /* @__PURE__ */ new Set([
  "index",
  "default",
  "new",
  "edit",
  "config",
  "settings",
  "state"
]);
function slugify(name) {
  if (!name)
    return "";
  let s = String(name).normalize("NFKC").replace(/[《》「」『』「」]/g, "").replace(/[（()()【\[\]】]/g, "").replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, "-").replace(/[\-_.]+/g, "-").replace(/^[\-\.]+|[\-\.]+$/g, "").slice(0, 80);
  return s || "untitled";
}
function joinPath(...parts) {
  const clean = parts.map((p) => String(p ?? "").trim()).filter((p) => p.length > 0);
  if (!clean.length)
    throw new Error("joinPath: empty path");
  if (clean.some((p) => p.includes("//") || /^[.\s]|[.\s]$/.test(p))) {
    throw new Error("joinPath: invalid segment: " + JSON.stringify(clean));
  }
  if (clean.some((p) => RESERVED.has(p.toLowerCase()))) {
    throw new Error("joinPath: reserved segment: " + clean.find((p) => RESERVED.has(p.toLowerCase())));
  }
  return clean.join("/");
}
function bookRoot(bookTitle, docId) {
  const slug = slugify(bookTitle) || "untitled";
  const base = "Tidme/Books/" + slug;
  if (RESERVED.has(slug.toLowerCase()))
    throw new Error("bookRoot: reserved book title: " + slug);
  return uniqueFolder(base, docId);
}
function bookCardsRoot(bookTitle, docId) {
  const slug = slugify(bookTitle) || "untitled";
  const base = "Tidme/Decks/" + slug;
  return uniqueFolder(base, docId);
}
function deckSubsetPath(bookTitle, docId, purpose = "\u590D\u4E60\u672C\u4E66") {
  const root = bookCardsRoot(bookTitle, docId);
  return joinPath(root, slugify(purpose));
}
function sectionPath(bookTitle, docId, _breadcrumb, sectionId) {
  const root = bookRoot(bookTitle, docId);
  return joinPath(root, sectionId);
}
function extractPath(bookTitle, docId, sectionId) {
  const root = bookRoot(bookTitle, docId);
  return joinPath(root, sectionId + "--extract");
}
function cardPath(bookTitle, docId, sectionId, subkind) {
  const root = bookCardsRoot(bookTitle, docId);
  return joinPath(root, sectionId + "--" + subkind);
}
function itemPath(bookTitle, docId, _breadcrumb, sectionId, subkind) {
  if (subkind === "extract") {
    return extractPath(bookTitle, docId, sectionId);
  }
  return cardPath(bookTitle, docId, sectionId, subkind);
}
function docPageTitle(bookTitle, docId, docIndex = 1) {
  const root = bookRoot(bookTitle, docId);
  if (docIndex <= 1)
    return root;
  return joinPath(root, "~" + docIndex);
}
function insertedSectionTitle(bookTitle, docId, sectionCaption, sectionId) {
  const root = bookRoot(bookTitle, docId);
  return joinPath(root, "manual-" + slugify(sectionCaption) + "-" + sectionId);
}
function isTidmeContent(title) {
  const t = String(title ?? "");
  return t === "Tidme" || t.startsWith("Tidme/") || t.startsWith("Tidme");
}
function isInBook(title, bookTitle, docId) {
  const bookRoot_ = bookRoot(bookTitle, docId);
  const cardsRoot = bookCardsRoot(bookTitle, docId);
  return title === bookRoot_ || title.startsWith(bookRoot_ + "/") || title === cardsRoot || title.startsWith(cardsRoot + "/");
}
function uniqueFolder(baseFolder, docId, existing) {
  if (!existing || !existing.has(baseFolder))
    return baseFolder;
  const tag = "~" + String(docId).replace(/^d/, "").slice(0, 6);
  return baseFolder + tag;
}
var NS = {
  ROOT: "Tidme",
  BOOKS: "Tidme/Books",
  DECKS: "Tidme/Decks",
  CLIPS: "Tidme/Clips"
};

// src/tidme/core/schema.ts
function twDateString(d) {
  const p = (n, l) => String(n).padStart(l, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}${p(d.getUTCMilliseconds(), 3)}`;
}
function initialFsrsFields(now) {
  const t = twDateString(now);
  return {
    due: t,
    state: "0",
    reps: "0",
    lapses: "0",
    stability: "0",
    difficulty: "0",
    elapsed_days: "0",
    scheduled_days: "0",
    last_review: t
  };
}

// src/tidme/core/scheduler.ts
var PRIORITY_DEFAULT = 50;
function normalizePriority(v) {
  if (typeof v === "number" && Number.isFinite(v))
    return Math.max(0, Math.min(100, Math.round(v)));
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n))
      return Math.max(0, Math.min(100, n));
  }
  return PRIORITY_DEFAULT;
}
function afactorForText(chars) {
  const c = Number(chars) || 0;
  if (c <= 0)
    return 1.5;
  if (c < 800)
    return 2;
  if (c < 3e3)
    return 1.6;
  if (c < 1e4)
    return 1.4;
  return 1.3;
}

// src/tidme/import/pipeline/split.ts
function cleanTitle(title) {
  let t = String(title || "").trim();
  if (!t)
    return t;
  t = t.replace(/[（(【\[][^））】\]]*[）)】\]]/g, "").trim();
  t = t.split(/[:：——–]/)[0].trim();
  return t || title;
}
function formatFromType(type, text) {
  const t = String(type || "").toLowerCase();
  if (t.includes("markdown"))
    return "markdown";
  if (t.includes("tiddlywiki") || t === "text/x-tiddlywiki")
    return "wikitext";
  if (t.includes("html"))
    return "html";
  if (t === "text/plain")
    return "txt";
  return sniffFormat(text);
}
function blocksFor(format, text) {
  if (format === "markdown")
    return blocksFromMarkdown(text);
  if (format === "wikitext")
    return blocksFromWikitext(text);
  if (format === "html")
    return blocksFromHtml(text);
  return blocksFromPlainText(text);
}
function emitTiddlers(_0, _1, _2, _3, _4) {
  return __async(this, arguments, function* (docId, meta, bookTitle, sections, bag, autoDeck = true, priority = PRIORITY_DEFAULT) {
    const warnings = [];
    const format = meta.__format || "epub";
    const nowFields = initialFsrsFields(new Date());
    const syncFields = { bag, revision: "0" };
    const bookT = bookTitle || "\u672A\u547D\u540D\u5BFC\u5165";
    const docPagePath = bookRoot(bookT, docId);
    const docTitle = bookT;
    const cards = [];
    for (const s of sections) {
      if (!s.text.trim())
        continue;
      const trail = [docTitle, ...s.trail].map((t) => String(t || "").trim()).filter(Boolean);
      const id = yield makeSectionId(docId, trail, s.ordinal);
      const hash = yield contentFingerprint(s.text);
      const joined = trail.join(" \u203A ");
      const title = sectionPath(bookT, docId, trail, id);
      cards.push(__spreadValues(__spreadValues(__spreadProps(__spreadValues(__spreadValues({
        title,
        type: "text/vnd.tiddlywiki",
        caption: s.title || trail[trail.length - 1] || "",
        text: s.html
      }, nowFields), syncFields), {
        "tidme.doc": docId,
        "tidme.id": id,
        "tidme.hash": hash,
        "tidme.order": String(s.ordinal).padStart(6, "0"),
        "tidme.level": String(s.level),
        "tidme.kind": "topic",
        "tidme.subkind": "section",
        "tidme.chars": String(s.chars),
        "tidme.priority": String(normalizePriority(priority)),
        "tidme.afactor": String(afactorForText(s.chars)),
        "tidme.path": joined,
        "tidme.breadcrumb": joined,
        "tidme.source": meta.title || "",
        "tidme.author": meta.creator || "",
        "tidme.format": format
      }), s.merged ? { "tidme.merged": "yes" } : {}), s.file ? { "tidme.file": s.file } : {}));
    }
    const links = cards.map((t) => `* [[${t.title}]]`).join("\n");
    const docLines = [`//${formatLabel(format)}//`];
    if (meta.creator)
      docLines.push("\u4F5C\u8005\uFF1A" + meta.creator);
    if (meta.language)
      docLines.push("\u8BED\u8A00\uFF1A" + meta.language);
    if (meta.date)
      docLines.push("\u539F\u6587\u65E5\u671F\uFF1A" + meta.date);
    docLines.push("\u6587\u6863 ID\uFF1A" + docId);
    docLines.push(`\u5171 ${cards.length} \u8282\uFF1A`, "", links);
    const docTiddler = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({
      title: docPagePath,
      type: "text/vnd.tiddlywiki",
      tags: ["tidme-import-doc"],
      text: docLines.join("\n"),
      bag,
      revision: "0",
      "tidme.doc": docId
    }, meta.title ? { "tidme.source": meta.title } : {}), meta.author || meta.creator ? { "tidme.author": meta.author || meta.creator } : {}), meta.language ? { "tidme.language": meta.language } : {}), meta.url ? { "tidme.url": meta.url } : {}), meta.date ? { "tidme.date": meta.date } : {}), meta.license ? { "tidme.license": meta.license } : {});
    const tiddlers = [docTiddler, ...cards];
    return { tiddlers, warnings };
  });
}
function runSplit(input) {
  return __async(this, null, function* () {
    const text = String(input.text || "");
    if (!text.trim())
      throw new Error("\u5185\u5BB9\u4E3A\u7A7A");
    const format = formatFromType(input.type, text);
    const blocks = blocksFor(format, text);
    if (!blocks.length)
      throw new Error("\u65E0\u6CD5\u89E3\u6790\u51FA\u4EFB\u4F55\u5185\u5BB9\u5757");
    const meta = __spreadValues({
      title: input.title || guessTitle(text, format) || "\u672A\u547D\u540D\u5BFC\u5165"
    }, input.sourceFields || {});
    const bookTitle = meta.title;
    const docId = yield makeDocId({ title: bookTitle, creator: meta.creator || "", language: meta.language || "" });
    const { sections, stats } = chunkBook(
      [{ fileName: bookTitle, fileBreadcrumb: [], blocks }],
      { maxChars: input.maxChars, minChars: input.minChars },
      input.overrides
    );
    const metaWithFormat = __spreadProps(__spreadValues({}, meta), { __format: format });
    const { tiddlers, warnings } = yield emitTiddlers(docId, metaWithFormat, bookTitle, sections, input.bag || "default", input.autoDeck !== false, input.priority);
    return {
      bookTitle,
      docId,
      meta,
      format,
      sectionCount: stats.sections,
      stats,
      tiddlers,
      warnings,
      sections
    };
  });
}

// src/tidme/import/pipeline/main.ts
function importEpubBytes(bytes, fileName, options) {
  return __async(this, null, function* () {
    const book = yield readEpubBytes(bytes);
    let ncxTree = [];
    try {
      ncxTree = yield extractNavTree(book);
    } catch (e) {
    }
    if (!ncxTree.length)
      ncxTree = yield extractNcxTree(book);
    const resolveCrumb = makeBreadcrumbResolver(ncxTree, book.spine);
    const flatNav = flattenNcx(ncxTree);
    const files = [];
    for (let i = 0; i < book.spine.length; i++) {
      const href = book.spine[i].href;
      const file = book.zip.file(href);
      if (!file)
        continue;
      const raw = yield file.async("string");
      let doc;
      try {
        doc = new DOMParser().parseFromString(raw, "text/xml");
      } catch (err) {
        throw new Error(`\u89E3\u6790 ${href} \u5931\u8D25: ${err.message}`);
      }
      smartMergeParagraphs(doc);
      const blocks = collectBlocks(doc);
      const entries = flatNav.filter((n) => n.href === href && n.title);
      const boundaries = anchorBoundaries(doc, blocks, entries);
      const crumbTail = (resolveCrumb(i)[resolveCrumb(i).length - 1] || "").trim();
      for (let b = boundaries.length - 1; b >= 0; b--) {
        const { idx, entry } = boundaries[b];
        if (!entry.title)
          continue;
        if (entry.title.trim() === crumbTail && idx === 0)
          continue;
        const heading = {
          text: entry.title,
          tag: "h" + Math.max(1, Math.min(6, entry.depth + 1)),
          isHeading: true,
          level: Math.max(1, Math.min(6, entry.depth + 1))
        };
        blocks.splice(idx, 0, heading);
      }
      files.push({ fileName: href, fileBreadcrumb: resolveCrumb(i), blocks });
    }
    const { sections, stats } = chunkBook(files, options);
    const meta = __spreadProps(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, book.meta.title ? { title: book.meta.title } : {}), book.meta.creator ? { creator: book.meta.creator } : {}), book.meta.language ? { language: book.meta.language } : {}), book.meta.date ? { date: book.meta.date } : {}), {
      __format: "epub"
    });
    const docId = yield makeDocId(book.meta);
    const bookTitle = (meta.title || fileName.replace(/.*\//, "") || "\u672A\u547D\u540D\u5BFC\u5165").trim();
    const { tiddlers, warnings } = yield emitTiddlers(docId, meta, bookTitle, sections, options.bag || "default", true, options.priority);
    return {
      bookTitle,
      docId,
      meta,
      format: "epub",
      sectionCount: stats.sections,
      stats,
      tiddlers,
      warnings
    };
  });
}
function importTextBytes(bytes, fileName, options) {
  return __async(this, null, function* () {
    const text = decodeBytes(bytes);
    if (!text.trim())
      throw new Error("\u6587\u4EF6\u5185\u5BB9\u4E3A\u7A7A");
    const ext = fileName.toLowerCase();
    const type = /\.(md|markdown)$/.test(ext) ? "text/markdown" : /\.html?$/.test(ext) ? "text/html" : "text/plain";
    const base = fileName.replace(/.*\//, "").replace(/\.[a-z0-9]+$/i, "");
    const r = yield runSplit({
      text,
      title: base,
      type,
      bag: options.bag || "default",
      priority: options.priority,
      maxChars: options.maxChars,
      minChars: options.minChars
    });
    return {
      bookTitle: r.bookTitle,
      docId: r.docId,
      meta: r.meta,
      format: r.format,
      sectionCount: r.sectionCount,
      stats: r.stats,
      tiddlers: r.tiddlers,
      warnings: r.warnings
    };
  });
}
function runImport(_0, _1) {
  return __async(this, arguments, function* (bytes, fileName, options = {}) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".epub"))
      return importEpubBytes(bytes, fileName, options);
    if (/\.(md|markdown|txt|html?)$/.test(lower))
      return importTextBytes(bytes, fileName, options);
    throw new Error(`\u4E0D\u652F\u6301\u7684\u683C\u5F0F\uFF1A${fileName}\uFF08\u652F\u6301 .epub / .md / .txt / .html\uFF09`);
  });
}
function neighborsOf(orderedTitles, current) {
  const i = orderedTitles.indexOf(current);
  return {
    prev: i > 0 ? orderedTitles[i - 1] : null,
    next: i >= 0 && i < orderedTitles.length - 1 ? orderedTitles[i + 1] : null,
    index: i
  };
}
