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
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateWrapper = (obj, member, setter, getter) => {
  return {
    set _(value) {
      __privateSet(obj, member, value, setter);
    },
    get _() {
      return __privateGet(obj, member, getter);
    }
  };
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};
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

// src/tidme/core/ns.ts
var ns_exports = {};
__export(ns_exports, {
  AUTOPOSTPONE_LAST_TITLE: () => AUTOPOSTPONE_LAST_TITLE,
  BURIED_FIELD: () => BURIED_FIELD,
  BURY_SIBLINGS_TITLE: () => BURY_SIBLINGS_TITLE,
  CARD_OPEN_AT_TITLE: () => CARD_OPEN_AT_TITLE,
  CONFIG_TITLE_PREFIX: () => CONFIG_TITLE_PREFIX,
  CRUMB_SEP: () => CRUMB_SEP,
  DAILY_QUOTA_STATE_TITLE: () => DAILY_QUOTA_STATE_TITLE,
  DECK_LOG_SUFFIX: () => DECK_LOG_SUFFIX,
  DECK_PREFIX: () => DECK_PREFIX,
  DECK_TAG: () => DECK_TAG,
  DEFAULT_DECK_TITLE: () => DEFAULT_DECK_TITLE,
  DOC_TAG: () => DOC_TAG,
  FINAL_DRILL_STATE_TITLE: () => FINAL_DRILL_STATE_TITLE,
  FOLDED_STATE_PREFIX: () => FOLDED_STATE_PREFIX,
  IMPORT_BAG_TITLE: () => IMPORT_BAG_TITLE,
  INBOX_TAG: () => INBOX_TAG,
  LEARN_AHEAD_TITLE: () => LEARN_AHEAD_TITLE,
  LIMITS_SUPPRESS_NEW_TITLE: () => LIMITS_SUPPRESS_NEW_TITLE,
  LOG_RETENTION_TITLE: () => LOG_RETENTION_TITLE,
  NEW_PER_DAY_TITLE: () => NEW_PER_DAY_TITLE,
  NOTIFY_CLOZE: () => NOTIFY_CLOZE,
  NOTIFY_CONGRATULATION: () => NOTIFY_CONGRATULATION,
  NOTIFY_DONE: () => NOTIFY_DONE,
  NOTIFY_EXTRACT: () => NOTIFY_EXTRACT,
  NOTIFY_EXTRACT_NOTE: () => NOTIFY_EXTRACT_NOTE,
  NOTIFY_LATER: () => NOTIFY_LATER,
  NOTIFY_QA: () => NOTIFY_QA,
  NOTIFY_READPOINT: () => NOTIFY_READPOINT,
  NOTIFY_SECTION_DONE: () => NOTIFY_SECTION_DONE,
  NOTIFY_SELECT_FIRST: () => NOTIFY_SELECT_FIRST,
  NOTIFY_STUDY_ENDED: () => NOTIFY_STUDY_ENDED,
  NOTIFY_UNSUPPORTED: () => NOTIFY_UNSUPPORTED,
  NOT_DECK_FILTER: () => NOT_DECK_FILTER,
  NS_ASSETS: () => NS_ASSETS,
  NS_DECKS: () => NS_DECKS,
  NS_DECKS_STANDALONE: () => NS_DECKS_STANDALONE,
  NS_DOCS: () => NS_DOCS,
  OCR_TITLE: () => OCR_TITLE,
  PAGE_CARD_MANAGER: () => PAGE_CARD_MANAGER,
  PAGE_HELP_SHORTCUTS: () => PAGE_HELP_SHORTCUTS,
  PAGE_IMPORT_CENTER: () => PAGE_IMPORT_CENTER,
  PAGE_IMPORT_STATS: () => PAGE_IMPORT_STATS,
  PAGE_INCREMENTAL_LEARNING: () => PAGE_INCREMENTAL_LEARNING,
  PAGE_READING_LIST: () => PAGE_READING_LIST,
  PAGE_SETTINGS: () => PAGE_SETTINGS,
  PAGE_TODAY: () => PAGE_TODAY,
  PDF_PAGE_STATE_PREFIX: () => PDF_PAGE_STATE_PREFIX,
  PRIORITY_DYNAMICS_TITLE: () => PRIORITY_DYNAMICS_TITLE,
  QUEUE_EXCLUDE: () => QUEUE_EXCLUDE,
  QUEUE_MIX_TITLE: () => QUEUE_MIX_TITLE,
  QUEUE_MODE_TITLE: () => QUEUE_MODE_TITLE,
  REVIEWS_PER_DAY_TITLE: () => REVIEWS_PER_DAY_TITLE,
  ROLLOVER_HOUR_TITLE: () => ROLLOVER_HOUR_TITLE,
  SAVED_SEARCHES_TITLE: () => SAVED_SEARCHES_TITLE,
  SEMANTIC_SPLIT_TITLE: () => SEMANTIC_SPLIT_TITLE,
  STORY_LIST_TITLE: () => STORY_LIST_TITLE,
  TITLE_UNSAFE_CHARS: () => TITLE_UNSAFE_CHARS,
  TOPIC_QUEUE_FILTER: () => TOPIC_QUEUE_FILTER,
  buriedExcludeFilter: () => buriedExcludeFilter,
  deckLogTitle: () => deckLogTitle,
  docsToDecksRoot: () => docsToDecksRoot,
  isDeckLogTitle: () => isDeckLogTitle,
  isFilterSafeTitle: () => isFilterSafeTitle,
  pdfPageStateTitle: () => pdfPageStateTitle
});
function isFilterSafeTitle(s) {
  return !/[[\]{}]/.test(String(s ?? ""));
}
function pdfPageStateTitle(docId) {
  return PDF_PAGE_STATE_PREFIX + docId;
}
function docsToDecksRoot(title) {
  return title.startsWith(NS_DOCS) ? NS_DECKS + title.slice(NS_DOCS.length) : null;
}
function deckLogTitle(deck) {
  return deck + DECK_LOG_SUFFIX;
}
function isDeckLogTitle(title) {
  return title.startsWith(DECK_PREFIX) && title.endsWith(DECK_LOG_SUFFIX);
}
function buriedExcludeFilter(learningDay) {
  const day = String(learningDay || "").trim();
  if (!/^\d{8}$/.test(day))
    return "";
  return `-[${BURIED_FIELD}[${day}]]`;
}
var NS_DOCS, NS_ASSETS, NS_DECKS, NS_DECKS_STANDALONE, CRUMB_SEP, DECK_PREFIX, DEFAULT_DECK_TITLE, DOC_TAG, INBOX_TAG, STORY_LIST_TITLE, QUEUE_EXCLUDE, DECK_TAG, NOT_DECK_FILTER, TOPIC_QUEUE_FILTER, TITLE_UNSAFE_CHARS, FOLDED_STATE_PREFIX, CARD_OPEN_AT_TITLE, PDF_PAGE_STATE_PREFIX, AUTOPOSTPONE_LAST_TITLE, DECK_LOG_SUFFIX, CONFIG_TITLE_PREFIX, QUEUE_MODE_TITLE, QUEUE_MIX_TITLE, PRIORITY_DYNAMICS_TITLE, LOG_RETENTION_TITLE, ROLLOVER_HOUR_TITLE, NEW_PER_DAY_TITLE, REVIEWS_PER_DAY_TITLE, LIMITS_SUPPRESS_NEW_TITLE, LEARN_AHEAD_TITLE, DAILY_QUOTA_STATE_TITLE, BURY_SIBLINGS_TITLE, BURIED_FIELD, FINAL_DRILL_STATE_TITLE, OCR_TITLE, SEMANTIC_SPLIT_TITLE, SAVED_SEARCHES_TITLE, PAGE_INCREMENTAL_LEARNING, PAGE_TODAY, PAGE_READING_LIST, PAGE_IMPORT_CENTER, PAGE_CARD_MANAGER, PAGE_IMPORT_STATS, PAGE_HELP_SHORTCUTS, PAGE_SETTINGS, NOTIFY_EXTRACT, NOTIFY_CLOZE, NOTIFY_QA, NOTIFY_READPOINT, NOTIFY_SELECT_FIRST, NOTIFY_EXTRACT_NOTE, NOTIFY_SECTION_DONE, NOTIFY_LATER, NOTIFY_DONE, NOTIFY_UNSUPPORTED, NOTIFY_CONGRATULATION, NOTIFY_STUDY_ENDED, IMPORT_BAG_TITLE;
var init_ns = __esm({
  "src/tidme/core/ns.ts"() {
    NS_DOCS = "Tidme/Docs/";
    NS_ASSETS = "Tidme/Assets/";
    NS_DECKS = "Tidme/Decks/";
    NS_DECKS_STANDALONE = NS_DECKS + "standalone";
    CRUMB_SEP = " \u203A ";
    DECK_PREFIX = "$:/Deck/";
    DEFAULT_DECK_TITLE = DECK_PREFIX + "default";
    DOC_TAG = "tidme-doc";
    INBOX_TAG = "tidme-inbox";
    STORY_LIST_TITLE = "$:/StoryList";
    QUEUE_EXCLUDE = "!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]";
    DECK_TAG = "$:/tags/TidmeDeck";
    NOT_DECK_FILTER = `!tag[${DECK_TAG}]`;
    TOPIC_QUEUE_FILTER = `[all[shadows+tiddlers]!is[draft]tidme.kind[topic]${NOT_DECK_FILTER}!tidme.structure[sectioned]` + QUEUE_EXCLUDE + "]";
    TITLE_UNSAFE_CHARS = /[\\/:*?"<>|$[\]{}]/g;
    FOLDED_STATE_PREFIX = "$:/state/folded/";
    CARD_OPEN_AT_TITLE = "$:/temp/tidme/card-open-at";
    PDF_PAGE_STATE_PREFIX = "$:/state/tidme-pdf/page/";
    AUTOPOSTPONE_LAST_TITLE = "$:/temp/tidme/autopostpone/last";
    DECK_LOG_SUFFIX = "/log";
    CONFIG_TITLE_PREFIX = "$:/config/Tidme/";
    QUEUE_MODE_TITLE = CONFIG_TITLE_PREFIX + "QueueMode";
    QUEUE_MIX_TITLE = CONFIG_TITLE_PREFIX + "QueueMix";
    PRIORITY_DYNAMICS_TITLE = CONFIG_TITLE_PREFIX + "PriorityDynamics";
    LOG_RETENTION_TITLE = CONFIG_TITLE_PREFIX + "LogRetention";
    ROLLOVER_HOUR_TITLE = CONFIG_TITLE_PREFIX + "RolloverHour";
    NEW_PER_DAY_TITLE = CONFIG_TITLE_PREFIX + "NewPerDay";
    REVIEWS_PER_DAY_TITLE = CONFIG_TITLE_PREFIX + "ReviewsPerDay";
    LIMITS_SUPPRESS_NEW_TITLE = CONFIG_TITLE_PREFIX + "LimitsSuppressNew";
    LEARN_AHEAD_TITLE = CONFIG_TITLE_PREFIX + "LearnAhead";
    DAILY_QUOTA_STATE_TITLE = "$:/state/tidme/daily-quota";
    BURY_SIBLINGS_TITLE = CONFIG_TITLE_PREFIX + "BurySiblings";
    BURIED_FIELD = "tidme.buried";
    FINAL_DRILL_STATE_TITLE = "$:/state/tidme/final-drill";
    OCR_TITLE = CONFIG_TITLE_PREFIX + "Ocr";
    SEMANTIC_SPLIT_TITLE = CONFIG_TITLE_PREFIX + "SemanticSplit";
    SAVED_SEARCHES_TITLE = CONFIG_TITLE_PREFIX + "SavedSearches";
    PAGE_INCREMENTAL_LEARNING = "$:/IncrementalLearning";
    PAGE_TODAY = PAGE_INCREMENTAL_LEARNING;
    PAGE_READING_LIST = "$:/plugins/keepone/tidme/import/ui/reading-list";
    PAGE_IMPORT_CENTER = "$:/plugins/keepone/tidme/import/ui/import-center";
    PAGE_CARD_MANAGER = "$:/plugins/keepone/tidme/manager/ui/card-manager";
    PAGE_IMPORT_STATS = "$:/plugins/keepone/tidme/import/ui/stats";
    PAGE_HELP_SHORTCUTS = "$:/plugins/keepone/tidme/import/ui/help-shortcuts";
    PAGE_SETTINGS = "$:/plugins/keepone/tidme/manager/ui/settings";
    NOTIFY_EXTRACT = "$:/plugins/keepone/tidme/import/ui/notify-extract";
    NOTIFY_CLOZE = "$:/plugins/keepone/tidme/import/ui/notify-cloze";
    NOTIFY_QA = "$:/plugins/keepone/tidme/import/ui/notify-qa";
    NOTIFY_READPOINT = "$:/plugins/keepone/tidme/import/ui/notify-readpoint";
    NOTIFY_SELECT_FIRST = "$:/plugins/keepone/tidme/import/ui/notify-select-first";
    NOTIFY_EXTRACT_NOTE = "$:/plugins/keepone/tidme/import/ui/notify-extract-note";
    NOTIFY_SECTION_DONE = "$:/plugins/keepone/tidme/import/ui/notify-section-done";
    NOTIFY_LATER = "$:/plugins/keepone/tidme/import/ui/notify-later";
    NOTIFY_DONE = "$:/plugins/keepone/tidme/import/ui/notify-done";
    NOTIFY_UNSUPPORTED = "$:/plugins/keepone/tidme/import/ui/notify-unsupported";
    NOTIFY_CONGRATULATION = "$:/plugins/keepone/tidme/review/notify/congratulation";
    NOTIFY_STUDY_ENDED = "$:/plugins/keepone/tidme/review/notify/study-ended";
    IMPORT_BAG_TITLE = "$:/temp/tidme-import/bag";
  }
});

// src/tidme/core/schema.ts
var schema_exports = {};
__export(schema_exports, {
  FSRS_FIELDS: () => FSRS_FIELDS,
  KINDS: () => KINDS,
  SUBKINDS: () => SUBKINDS,
  addLearningDays: () => addLearningDays,
  assertCardFields: () => assertCardFields,
  escapeHtml: () => escapeHtml,
  initialFsrsFields: () => initialFsrsFields,
  learningDayDiff: () => learningDayDiff,
  learningDayOf: () => learningDayOf,
  missingFsrsFields: () => missingFsrsFields,
  parseTwDate: () => parseTwDate,
  todayKey: () => todayKey,
  tryParseTwDate: () => tryParseTwDate,
  twDateString: () => twDateString
});
function twDateString(d) {
  const p = (n, l) => String(n).padStart(l, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}${p(d.getUTCMilliseconds(), 3)}`;
}
function learningDayOf(now = new Date(), rolloverHour = 4) {
  const h = Math.min(23, Math.max(0, Math.floor(Number(rolloverHour) || 0)));
  const effective = new Date(now.getTime() - h * 36e5);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${effective.getFullYear()}${p(effective.getMonth() + 1)}${p(effective.getDate())}`;
}
function learningDayMs(day) {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
}
function addLearningDays(day, days) {
  const d = new Date(learningDayMs(day) + Math.round(days) * 864e5);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}
function learningDayDiff(from, to) {
  return Math.round((learningDayMs(to) - learningDayMs(from)) / 864e5);
}
function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10).replace(/-/g, "");
}
function tryParseTwDate(v) {
  const s = String(v || "");
  if (/^\d{17}$/.test(s)) {
    const d = new Date(Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
      Number(s.slice(12, 14)),
      Number(s.slice(14, 17))
    ));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!s)
    return null;
  const p = Date.parse(s);
  return Number.isNaN(p) ? null : new Date(p);
}
function parseTwDate(v, fallback = new Date()) {
  const s = String(v || "");
  if (/^\d{17}$/.test(s)) {
    const d = new Date(Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
      Number(s.slice(12, 14)),
      Number(s.slice(14, 17))
    ));
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  const p = Date.parse(s);
  return Number.isNaN(p) ? fallback : new Date(p);
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
function missingFsrsFields(fields) {
  return FSRS_FIELDS.filter((f) => fields[f] === void 0 || fields[f] === null || fields[f] === "");
}
function assertCardFields(fields) {
  const kind = fields["tidme.kind"];
  if (typeof kind !== "string" || !KINDS.includes(kind)) {
    throw new Error(`[tidme/core] \u5361\u7247\u7F3A/\u975E\u6CD5 tidme.kind: ${JSON.stringify(kind)}`);
  }
  const missing = missingFsrsFields(fields);
  if (missing.length) {
    throw new Error(`[tidme/core] ${kind} \u5361\u7F3A FSRS \u5B57\u6BB5: ${missing.join(", ")}`);
  }
}
function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var KINDS, SUBKINDS, FSRS_FIELDS;
var init_schema = __esm({
  "src/tidme/core/schema.ts"() {
    KINDS = ["topic", "item"];
    SUBKINDS = ["section", "extract", "concept", "cloze", "qa"];
    FSRS_FIELDS = [
      "due",
      "state",
      "reps",
      "lapses",
      "stability",
      "difficulty",
      "elapsed_days",
      "scheduled_days",
      "last_review"
    ];
  }
});

// src/tidme/core/paths.ts
var paths_exports = {};
__export(paths_exports, {
  docRoot: () => docRoot,
  insertedSectionTitle: () => insertedSectionTitle,
  joinPath: () => joinPath,
  leafIdOf: () => leafIdOf,
  sectionLeaf: () => sectionLeaf,
  slugify: () => slugify
});
function slugify(name) {
  if (!name)
    return "";
  let s = String(name).normalize("NFKC").replace(/[《》「」『』「」]/g, "").replace(/[（()()【\[\]】]/g, "").replace(NS_UNSAFE_CHARS, "").replace(/\s+/g, "-").replace(/[\-_.]+/g, "-").replace(/^[\-\.]+|[\-\.]+$/g, "").slice(0, 80);
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
function docRoot(docTitle) {
  const slug = slugify(docTitle) || "untitled";
  if (RESERVED.has(slug.toLowerCase()))
    throw new Error("docRoot: reserved doc title: " + slug);
  return NS_DOCS2 + slug;
}
function sectionLeaf(caption, sectionId) {
  const slug = slugify(caption);
  return (slug ? slug + "-" : "") + sectionId;
}
function leafIdOf(title) {
  const t = String(title ?? "");
  const i = t.lastIndexOf("/");
  return i >= 0 ? t.slice(i + 1) : t;
}
function insertedSectionTitle(docTitle, sectionCaption) {
  return joinPath(docRoot(docTitle), "manual-" + (slugify(sectionCaption) || "untitled"));
}
var ns, NS_DECKS2, NS_DOCS2, NS_UNSAFE_CHARS, RESERVED;
var init_paths = __esm({
  "src/tidme/core/paths.ts"() {
    ns = (init_ns(), __toCommonJS(ns_exports));
    NS_DECKS2 = ns.NS_DECKS;
    NS_DOCS2 = ns.NS_DOCS;
    NS_UNSAFE_CHARS = ns.TITLE_UNSAFE_CHARS;
    RESERVED = /* @__PURE__ */ new Set([
      "index",
      "default",
      "new",
      "edit",
      "config",
      "settings",
      "state"
    ]);
  }
});

// src/tidme/core/deck.ts
var deck_exports = {};
__export(deck_exports, {
  DECK_TAG: () => DECK_TAG2,
  DEFAULT_CARD_FILTER: () => DEFAULT_CARD_FILTER,
  DEFAULT_DECK: () => DEFAULT_DECK,
  STANDALONE_DECK: () => STANDALONE_DECK,
  SYSTEM_DECKS: () => SYSTEM_DECKS,
  burnSubsetDeck: () => burnSubsetDeck,
  configToFields: () => configToFields,
  createDeck: () => createDeck,
  deckCards: () => deckCards,
  deleteDeck: () => deleteDeck,
  getDeck: () => getDeck,
  isDeckFields: () => isDeckFields,
  isSubset: () => isSubset,
  listDecks: () => listDecks,
  previewMembership: () => previewMembership,
  titleOf: () => titleOf,
  updateDeck: () => updateDeck
});
function isDeckFields(fields) {
  return Array.isArray(fields?.tags) && fields.tags.includes(DECK_TAG2);
}
function titleOf(name) {
  const raw = String(name || "").trim();
  if (raw.startsWith(ns2.DECK_PREFIX) || raw.startsWith(ns2.NS_DECKS))
    return raw;
  const clean = raw.replace(ns2.TITLE_UNSAFE_CHARS, "-").replace(/[\s]+/g, "-");
  if (!clean || clean === "-")
    throw new Error("deck: invalid deck name: " + name);
  return ns2.DECK_PREFIX + clean;
}
function listDecks(wiki) {
  if (!wiki || typeof wiki.filterTiddlers !== "function")
    return [];
  return wiki.filterTiddlers(`[all[shadows+tiddlers]tag[${DECK_TAG2}]!is[draft]]`);
}
function getDeck(wiki, nameOrTitle) {
  if (!wiki || typeof wiki.getTiddler !== "function" || !nameOrTitle)
    return null;
  const title = titleOf(nameOrTitle);
  const t = wiki.getTiddler(title);
  if (!t)
    return null;
  const name = title.startsWith(ns2.DECK_PREFIX) ? title.slice(ns2.DECK_PREFIX.length) : title.split("/").pop() || title;
  return { title, name, fields: t.fields || {} };
}
function isSubset(deck) {
  return !!deck && deck.fields["tidme.subset-doc"] !== void 0 && deck.fields["tidme.subset-doc"] !== "";
}
function templateFields(wiki) {
  const def = getDeck(wiki, DEFAULT_DECK);
  return def ? { ...def.fields } : {};
}
function configToFields(wiki, cfg) {
  const tpl = templateFields(wiki);
  delete tpl.title;
  const fields = {
    ...tpl,
    tags: DECK_TAG2,
    order_learn: tpl.order_learn || "[sort[due]]",
    order_due: tpl.order_due || "[sort[due]]",
    order_new: tpl.order_new || "[sortan[title]]",
    state_learn: tpl.state_learn || "[state[1]] [state[3]] :filter[{!!due}compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>]",
    state_due: tpl.state_due || "[state[2]has[due]] -[!days:due[1]]",
    state_new: tpl.state_new || "[!has[state]] [state[0]]"
  };
  const set = (k, v, fallback) => {
    if (v === void 0) {
      fields[k] = fallback;
      return;
    }
    fields[k] = v === null || v === "" ? fallback || "" : v;
  };
  set("caption", cfg.caption, cfg.name);
  set("description", cfg.description, "");
  set("card", cfg.card, DEFAULT_CARD_FILTER);
  set("card_exclude", cfg.cardExclude, fields.card_exclude);
  set("card_unfold", cfg.cardUnfold, "");
  set("order", cfg.order, "due-new");
  if (cfg.leechThreshold !== void 0)
    fields.leech_threshold = String(cfg.leechThreshold);
  if (cfg.p !== void 0)
    fields.p = typeof cfg.p === "string" ? cfg.p : JSON.stringify(cfg.p);
  if (cfg.kind === "subset" && cfg.sourceDoc)
    fields["tidme.subset-doc"] = cfg.sourceDoc;
  return fields;
}
function previewMembership(wiki, card, selfTitle) {
  if (!wiki || typeof wiki.filterTiddlers !== "function" || !card || !card.trim())
    return { hits: 0, overlap: 0 };
  let hits;
  try {
    hits = wiki.filterTiddlers(card);
  } catch {
    return { hits: -1, overlap: 0 };
  }
  const others = /* @__PURE__ */ new Set();
  for (const d of listDecks(wiki)) {
    if (selfTitle && d === selfTitle)
      continue;
    for (const c of deckCards(wiki, d))
      others.add(c);
  }
  return { hits: hits.length, overlap: hits.filter((t) => others.has(t)).length };
}
function createDeck(wiki, cfg) {
  const title = titleOf(cfg.name);
  if (getDeck(wiki, title))
    throw new Error(`deck: deck already exists: ${title}`);
  wiki.addTiddler({ title, ...configToFields(wiki, cfg) });
  return title;
}
function updateDeck(wiki, nameOrTitle, patch) {
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck)
    throw new Error(`deck: deck not found: ${nameOrTitle}`);
  const fields = { ...deck.fields };
  for (const [k, v] of Object.entries(patch)) {
    if (v === void 0)
      continue;
    if (v === null)
      delete fields[k];
    else
      fields[k] = v;
  }
  wiki.addTiddler({ ...fields, title: deck.title });
}
function deleteDeck(wiki, nameOrTitle, opts = {}) {
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck)
    return 0;
  if (SYSTEM_DECKS.includes(deck.title))
    throw new Error("deck: system deck cannot be deleted: " + deck.title);
  let removed = 0;
  if (opts.alsoCards) {
    for (const c of deckCards(wiki, deck.title)) {
      if (wiki.getTiddler(c)) {
        wiki.deleteTiddler(c);
        removed++;
      }
    }
  }
  wiki.deleteTiddler(deck.title);
  wiki.deleteTiddler(ns2.deckLogTitle(deck.title));
  return removed;
}
function burnSubsetDeck(wiki, nameOrTitle) {
  if (!wiki || typeof wiki.deleteTiddler !== "function")
    return 0;
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck || !isSubset(deck))
    return 0;
  let n = 0;
  const log = ns2.deckLogTitle(deck.title);
  if (wiki.getTiddler(log)) {
    wiki.deleteTiddler(log);
    n++;
  }
  if (wiki.getTiddler(deck.title)) {
    wiki.deleteTiddler(deck.title);
    n++;
  }
  return n;
}
function deckCards(wiki, nameOrTitle, opts = {}) {
  const deck = getDeck(wiki, nameOrTitle);
  if (!deck)
    return [];
  if (!ns2.isFilterSafeTitle(deck.title)) {
    console.warn("[tidme] deck title \u542B\u8FC7\u6EE4\u5668\u4E0D\u5B89\u5168\u5B57\u7B26\uFF0C\u5DF2\u8DF3\u8FC7\u6210\u5458\u6C42\u503C:", deck.title);
    return [];
  }
  const strict = opts.strict !== false;
  const card = String(deck.fields.card || "");
  if (!card)
    return [];
  if (!strict)
    return wiki.filterTiddlers(`[subfilter{${deck.title}!!card}]`);
  const exclude = String(deck.fields.card_exclude || "");
  return exclude ? wiki.filterTiddlers(`[subfilter{${deck.title}!!card}!subfilter{${deck.title}!!card_exclude}]`) : wiki.filterTiddlers(`[subfilter{${deck.title}!!card}]`);
}
var ns2, DECK_TAG2, DEFAULT_DECK, STANDALONE_DECK, SYSTEM_DECKS, DEFAULT_CARD_FILTER;
var init_deck = __esm({
  "src/tidme/core/deck.ts"() {
    ns2 = (init_ns(), __toCommonJS(ns_exports));
    DECK_TAG2 = ns2.DECK_TAG;
    DEFAULT_DECK = ns2.DEFAULT_DECK_TITLE;
    STANDALONE_DECK = ns2.DECK_PREFIX + "standalone";
    SYSTEM_DECKS = [DEFAULT_DECK, STANDALONE_DECK, ns2.DECK_PREFIX + "\u6563\u5361"];
    DEFAULT_CARD_FILTER = `[all[shadows+tiddlers]tidme.kind[item]${ns2.QUEUE_EXCLUDE}]`;
  }
});

// src/tidme/core/config.ts
var config_exports = {};
__export(config_exports, {
  AUTOPOSTPONE_DEFAULTS: () => AUTOPOSTPONE_DEFAULTS,
  LEARN_AHEAD_DEFAULT_MINUTES: () => LEARN_AHEAD_DEFAULT_MINUTES,
  LOG_RETENTION_DEFAULT_DAYS: () => LOG_RETENTION_DEFAULT_DAYS,
  LOG_RETENTION_TITLE: () => LOG_RETENTION_TITLE2,
  NEW_PER_DAY_DEFAULT: () => NEW_PER_DAY_DEFAULT,
  OCR_TITLE: () => OCR_TITLE2,
  QUEUE_MIX_DEFAULT: () => QUEUE_MIX_DEFAULT,
  REVIEWS_PER_DAY_DEFAULT: () => REVIEWS_PER_DAY_DEFAULT,
  ROLLOVER_HOUR_DEFAULT: () => ROLLOVER_HOUR_DEFAULT,
  SEMANTIC_SPLIT_DEFAULTS: () => SEMANTIC_SPLIT_DEFAULTS,
  SEMANTIC_SPLIT_TITLE: () => SEMANTIC_SPLIT_TITLE2,
  mergeDeckPJson: () => mergeDeckPJson,
  readAutoPostpone: () => readAutoPostpone,
  readBurySiblings: () => readBurySiblings,
  readDefaultDeckParams: () => readDefaultDeckParams,
  readLearnAheadMinutes: () => readLearnAheadMinutes,
  readLimitsSuppressNew: () => readLimitsSuppressNew,
  readLogRetentionDays: () => readLogRetentionDays,
  readNewPerDay: () => readNewPerDay,
  readOcrConfig: () => readOcrConfig,
  readPriorityDynamics: () => readPriorityDynamics,
  readQueueOptions: () => readQueueOptions,
  readReviewsPerDay: () => readReviewsPerDay,
  readRolloverHour: () => readRolloverHour,
  readSavedSearches: () => readSavedSearches,
  readSemanticSplit: () => readSemanticSplit,
  removeSavedSearch: () => removeSavedSearch,
  saveSearch: () => saveSearch,
  writeAutoPostpone: () => writeAutoPostpone,
  writeBurySiblings: () => writeBurySiblings,
  writeDefaultDeckParams: () => writeDefaultDeckParams,
  writeLearnAheadMinutes: () => writeLearnAheadMinutes,
  writeLimitsSuppressNew: () => writeLimitsSuppressNew,
  writeLogRetentionDays: () => writeLogRetentionDays,
  writeNewPerDay: () => writeNewPerDay,
  writeOcrConfig: () => writeOcrConfig,
  writeQueueOptions: () => writeQueueOptions,
  writeReviewsPerDay: () => writeReviewsPerDay,
  writeRolloverHour: () => writeRolloverHour,
  writeSavedSearches: () => writeSavedSearches,
  writeSemanticSplit: () => writeSemanticSplit
});
function boolish(v, dflt) {
  if (v === void 0 || v === null || String(v).trim() === "")
    return dflt;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "no")
    return false;
  if (s === "true" || s === "1" || s === "yes")
    return true;
  return dflt;
}
function num(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n))
    return dflt;
  return Math.min(max, Math.max(min, n));
}
function readJson(wiki, title) {
  const raw = String(wiki.getTiddlerText?.(title, "") || wiki.getTiddler(title)?.fields?.text || "");
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function readAutoPostpone(wiki) {
  const raw = { ...AUTOPOSTPONE_DEFAULTS, ...readJson(wiki, sched.AUTOPOSTPONE_CONFIG_TITLE) };
  return {
    enable: boolish(raw.enable, AUTOPOSTPONE_DEFAULTS.enable),
    maxPriority: num(raw.maxPriority, AUTOPOSTPONE_DEFAULTS.maxPriority, 0, 100),
    postponeDays: num(raw.postponeDays, AUTOPOSTPONE_DEFAULTS.postponeDays, 1, 3650),
    keepTop: num(raw.keepTop, AUTOPOSTPONE_DEFAULTS.keepTop, 0, 1e5),
    maxOverdueThreshold: num(raw.maxOverdueThreshold, AUTOPOSTPONE_DEFAULTS.maxOverdueThreshold, 0, 1e5)
  };
}
function writeAutoPostpone(wiki, patch) {
  if (!wiki)
    return;
  const next = { ...readAutoPostpone(wiki), ...patch };
  wiki.addTiddler({ title: sched.AUTOPOSTPONE_CONFIG_TITLE, type: "application/json", text: JSON.stringify(next) });
}
function readSemanticSplit(wiki) {
  const raw = { ...SEMANTIC_SPLIT_DEFAULTS, ...readJson(wiki, ns3.SEMANTIC_SPLIT_TITLE) };
  return {
    enable: boolish(raw.enable, SEMANTIC_SPLIT_DEFAULTS.enable),
    apiKey: String(raw.apiKey ?? "").trim(),
    baseUrl: String(raw.baseUrl ?? "").trim(),
    model: String(raw.model ?? "").trim(),
    maxParas: num(raw.maxParas, SEMANTIC_SPLIT_DEFAULTS.maxParas, 1, 1e4)
  };
}
function writeSemanticSplit(wiki, patch) {
  if (!wiki)
    return;
  const next = { ...readSemanticSplit(wiki), ...patch };
  wiki.addTiddler({ title: ns3.SEMANTIC_SPLIT_TITLE, type: "application/json", text: JSON.stringify(next) });
}
function defaultMix() {
  const mm = /^(\d+)\s*[:：]\s*(\d+)$/.exec(QUEUE_MIX_DEFAULT);
  return { item: mm ? Number(mm[1]) : 4, topic: mm ? Number(mm[2]) : 1 };
}
function readQueueOptions(wiki) {
  const m = String(wiki.getTiddlerText?.(QUEUE_MODE_TITLE2, "") || "").trim();
  const topics = m !== "";
  const mode = topics && m === "strict" ? "strict" : "interleaved";
  const dflt = defaultMix();
  const mm = /^(\d+)\s*[:：]\s*(\d+)$/.exec(String(wiki.getTiddlerText?.(QUEUE_MIX_TITLE2, "") || "").trim());
  return {
    topics,
    mode,
    itemRatio: mm ? Math.max(1, Number(mm[1])) : dflt.item,
    topicRatio: mm ? Math.max(1, Number(mm[2])) : dflt.topic
  };
}
function writeQueueOptions(wiki, patch) {
  if (!wiki)
    return;
  const cur = readQueueOptions(wiki);
  const topics = patch.topics ?? cur.topics;
  const mode = patch.mode ?? cur.mode;
  wiki.addTiddler({ title: QUEUE_MODE_TITLE2, text: topics ? mode === "strict" ? "strict" : "interleaved" : "" });
  if (patch.itemRatio !== void 0 || patch.topicRatio !== void 0) {
    const ir = Math.max(1, Math.floor(Number(patch.itemRatio ?? cur.itemRatio) || 4));
    const tr = Math.max(1, Math.floor(Number(patch.topicRatio ?? cur.topicRatio) || 1));
    wiki.addTiddler({ title: QUEUE_MIX_TITLE2, text: `${ir}:${tr}` });
  }
}
function readPriorityDynamics(wiki) {
  const f = wiki?.getTiddler?.(PRIORITY_DYNAMICS_TITLE2)?.fields || {};
  return {
    enable: boolish(f.enable, true),
    again: f.again,
    hard: f.hard,
    good: f.good,
    easy: f.easy
  };
}
function readLogRetentionDays(wiki) {
  const raw = String(wiki.getTiddlerText?.(LOG_RETENTION_TITLE2, "") ?? "").trim();
  if (raw === "")
    return LOG_RETENTION_DEFAULT_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0)
    return LOG_RETENTION_DEFAULT_DAYS;
  return Math.floor(n);
}
function writeLogRetentionDays(wiki, days) {
  if (!wiki)
    return;
  const n = Math.max(0, Math.floor(Number(days) || 0));
  wiki.addTiddler({ title: LOG_RETENTION_TITLE2, text: String(n) });
}
function readRolloverHour(wiki) {
  if (!wiki)
    return ROLLOVER_HOUR_DEFAULT;
  const raw = String(wiki.getTiddlerText?.(ns3.ROLLOVER_HOUR_TITLE, "") || wiki.getTiddler?.(ns3.ROLLOVER_HOUR_TITLE)?.fields?.text || "").trim();
  if (raw === "")
    return ROLLOVER_HOUR_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 23)
    return ROLLOVER_HOUR_DEFAULT;
  return Math.floor(n);
}
function writeRolloverHour(wiki, hour) {
  if (!wiki)
    return;
  const n = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)));
  wiki.addTiddler({ title: ns3.ROLLOVER_HOUR_TITLE, text: String(n) });
}
function readNewPerDay(wiki) {
  if (!wiki)
    return NEW_PER_DAY_DEFAULT;
  const raw = String(wiki.getTiddlerText?.(ns3.NEW_PER_DAY_TITLE, "") || wiki.getTiddler?.(ns3.NEW_PER_DAY_TITLE)?.fields?.text || "").trim();
  if (raw === "")
    return NEW_PER_DAY_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0)
    return NEW_PER_DAY_DEFAULT;
  return Math.floor(n);
}
function writeNewPerDay(wiki, count) {
  if (!wiki)
    return;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  wiki.addTiddler({ title: ns3.NEW_PER_DAY_TITLE, text: String(n) });
}
function readReviewsPerDay(wiki) {
  if (!wiki)
    return REVIEWS_PER_DAY_DEFAULT;
  const raw = String(wiki.getTiddlerText?.(ns3.REVIEWS_PER_DAY_TITLE, "") || wiki.getTiddler?.(ns3.REVIEWS_PER_DAY_TITLE)?.fields?.text || "").trim();
  if (raw === "")
    return REVIEWS_PER_DAY_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0)
    return REVIEWS_PER_DAY_DEFAULT;
  return Math.floor(n);
}
function writeReviewsPerDay(wiki, count) {
  if (!wiki)
    return;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  wiki.addTiddler({ title: ns3.REVIEWS_PER_DAY_TITLE, text: String(n) });
}
function readLimitsSuppressNew(wiki) {
  if (!wiki)
    return true;
  const raw = wiki.getTiddlerText?.(ns3.LIMITS_SUPPRESS_NEW_TITLE, "") || wiki.getTiddler?.(ns3.LIMITS_SUPPRESS_NEW_TITLE)?.fields?.text;
  return boolish(raw, true);
}
function writeLimitsSuppressNew(wiki, suppress) {
  if (!wiki)
    return;
  wiki.addTiddler({ title: ns3.LIMITS_SUPPRESS_NEW_TITLE, text: suppress ? "yes" : "no" });
}
function readLearnAheadMinutes(wiki) {
  if (!wiki)
    return LEARN_AHEAD_DEFAULT_MINUTES;
  const raw = String(wiki.getTiddlerText?.(ns3.LEARN_AHEAD_TITLE, "") || wiki.getTiddler?.(ns3.LEARN_AHEAD_TITLE)?.fields?.text || "").trim();
  if (raw === "")
    return LEARN_AHEAD_DEFAULT_MINUTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1440)
    return LEARN_AHEAD_DEFAULT_MINUTES;
  return Math.floor(n);
}
function writeLearnAheadMinutes(wiki, minutes) {
  if (!wiki)
    return;
  const n = Math.min(1440, Math.max(0, Math.floor(Number(minutes) || 0)));
  wiki.addTiddler({ title: ns3.LEARN_AHEAD_TITLE, text: String(n) });
}
function readBurySiblings(wiki) {
  if (!wiki)
    return true;
  const raw = wiki.getTiddlerText?.(ns3.BURY_SIBLINGS_TITLE, "") || wiki.getTiddler?.(ns3.BURY_SIBLINGS_TITLE)?.fields?.text;
  return boolish(raw, true);
}
function writeBurySiblings(wiki, enable) {
  if (!wiki)
    return;
  wiki.addTiddler({ title: ns3.BURY_SIBLINGS_TITLE, text: enable ? "yes" : "no" });
}
function readOcrConfig(wiki) {
  const raw = { enable: false, model: "gpt-4o-mini", baseUrl: "", apiKey: "", ...readJson(wiki, OCR_TITLE2) };
  const cfg = {
    enable: boolish(raw.enable, false),
    model: String(raw.model ?? "") || "gpt-4o-mini",
    baseUrl: String(raw.baseUrl ?? ""),
    apiKey: String(raw.apiKey ?? "")
  };
  if (!cfg.apiKey) {
    const sem = readSemanticSplit(wiki);
    if (sem.apiKey)
      cfg.apiKey = String(sem.apiKey);
  }
  return cfg;
}
function writeOcrConfig(wiki, patch) {
  if (!wiki)
    return;
  const next = { ...readOcrConfig(wiki), ...patch };
  const stored = { enable: boolish(next.enable, false), model: next.model, baseUrl: next.baseUrl };
  const semKey = String(readSemanticSplit(wiki).apiKey || "");
  if (next.apiKey && next.apiKey !== semKey)
    stored.apiKey = next.apiKey;
  wiki.addTiddler({ title: OCR_TITLE2, type: "application/json", text: JSON.stringify(stored) });
}
function readSavedSearches(wiki) {
  const raw = readJson(wiki, ns3.SAVED_SEARCHES_TITLE);
  if (!Array.isArray(raw))
    return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object")
      continue;
    const name = String(item.name ?? "").trim();
    const query = String(item.query ?? "").trim();
    if (name && query)
      out.push({ name, query });
  }
  return out;
}
function writeSavedSearches(wiki, list) {
  if (!wiki)
    return;
  const clean = [];
  for (const s of list || []) {
    const name = String(s?.name ?? "").trim();
    const query = String(s?.query ?? "").trim();
    if (!name || !query)
      continue;
    const dup = clean.findIndex((x) => x.name === name);
    if (dup >= 0)
      clean.splice(dup, 1);
    clean.push({ name, query });
  }
  wiki.addTiddler({ title: ns3.SAVED_SEARCHES_TITLE, type: "application/json", text: JSON.stringify(clean) });
}
function saveSearch(wiki, name, query) {
  writeSavedSearches(wiki, [...readSavedSearches(wiki), { name, query }]);
  return readSavedSearches(wiki);
}
function removeSavedSearch(wiki, name) {
  const next = readSavedSearches(wiki).filter((s) => s.name !== name);
  writeSavedSearches(wiki, next);
  return next;
}
function readDefaultDeckParams(wiki) {
  const f = deckMod.getDeck(wiki, deckMod.DEFAULT_DECK)?.fields || {};
  let p = {};
  try {
    const v = JSON.parse(f.p || "{}");
    if (v && typeof v === "object")
      p = v;
  } catch {
  }
  return {
    order: DECK_ORDERS.includes(String(f.order)) ? String(f.order) : "due-new",
    leech_threshold: num(f.leech_threshold, sched.DECK_PARAM_DEFAULTS.leechThreshold, 1, 1e4),
    request_retention: num(p.request_retention, sched.DECK_PARAM_DEFAULTS.requestRetention, 0.5, 1),
    maximum_interval: num(p.maximum_interval, sched.DECK_PARAM_DEFAULTS.maximumInterval, 1, 365e3),
    learn_random: boolish(f.random_learn, false)
  };
}
function writeDefaultDeckParams(wiki, patch) {
  if (!wiki)
    return;
  const deck = deckMod.getDeck(wiki, deckMod.DEFAULT_DECK);
  if (!deck)
    return;
  const out = {};
  if (patch.order !== void 0 && DECK_ORDERS.includes(String(patch.order))) {
    out.order = String(patch.order);
  }
  if (patch.leech_threshold !== void 0) {
    const n = Number(patch.leech_threshold);
    if (Number.isFinite(n))
      out.leech_threshold = String(Math.max(1, Math.floor(n)));
  }
  if (patch.learn_random !== void 0) {
    out.random_learn = patch.learn_random ? "yes" : null;
  }
  if (patch.request_retention !== void 0 || patch.maximum_interval !== void 0) {
    let p = {};
    try {
      const v = JSON.parse(deck.fields.p || "{}");
      if (v && typeof v === "object")
        p = v;
    } catch {
    }
    if (patch.request_retention !== void 0) {
      const r = Number(patch.request_retention);
      if (Number.isFinite(r))
        p.request_retention = Math.min(1, Math.max(0.5, r));
    }
    if (patch.maximum_interval !== void 0) {
      const m = Number(patch.maximum_interval);
      if (Number.isFinite(m))
        p.maximum_interval = Math.max(1, Math.floor(m));
    }
    out.p = JSON.stringify(p);
  }
  deckMod.updateDeck(wiki, deckMod.DEFAULT_DECK, out);
}
function mergeDeckPJson(prevP, patch) {
  const out = {};
  try {
    const v = typeof prevP === "string" ? JSON.parse(prevP || "{}") : prevP;
    if (v && typeof v === "object")
      Object.assign(out, v);
  } catch {
  }
  let changed = false;
  if (patch.retentionPct !== void 0 && String(patch.retentionPct).trim() !== "") {
    const n = Number(patch.retentionPct);
    if (Number.isFinite(n)) {
      const clamped = Math.min(100, Math.max(50, n)) / 100;
      if (out.request_retention !== clamped)
        changed = true;
      out.request_retention = clamped;
    }
  }
  if (patch.maximumInterval !== void 0 && String(patch.maximumInterval).trim() !== "") {
    const n = Number(patch.maximumInterval);
    if (Number.isFinite(n)) {
      const clamped = Math.min(365e3, Math.max(1, Math.floor(n)));
      if (out.maximum_interval !== clamped)
        changed = true;
      out.maximum_interval = clamped;
    }
  }
  if (!changed)
    return null;
  return JSON.stringify(out);
}
var sched, deckMod, ns3, AUTOPOSTPONE_DEFAULTS, SEMANTIC_SPLIT_DEFAULTS, DECK_ORDERS, QUEUE_MIX_DEFAULT, QUEUE_MODE_TITLE2, QUEUE_MIX_TITLE2, PRIORITY_DYNAMICS_TITLE2, LOG_RETENTION_DEFAULT_DAYS, LOG_RETENTION_TITLE2, ROLLOVER_HOUR_DEFAULT, NEW_PER_DAY_DEFAULT, REVIEWS_PER_DAY_DEFAULT, LEARN_AHEAD_DEFAULT_MINUTES, OCR_TITLE2, SEMANTIC_SPLIT_TITLE2;
var init_config = __esm({
  "src/tidme/core/config.ts"() {
    sched = (init_scheduler(), __toCommonJS(scheduler_exports));
    deckMod = (init_deck(), __toCommonJS(deck_exports));
    ns3 = (init_ns(), __toCommonJS(ns_exports));
    AUTOPOSTPONE_DEFAULTS = {
      enable: false,
      ...sched.AUTOPOSTPONE_OPTS_DEFAULTS
    };
    SEMANTIC_SPLIT_DEFAULTS = {
      enable: false,
      apiKey: "",
      baseUrl: "",
      model: "",
      maxParas: 200
    };
    DECK_ORDERS = ["due-new", "new-due", "random"];
    QUEUE_MIX_DEFAULT = "4:1";
    QUEUE_MODE_TITLE2 = ns3.QUEUE_MODE_TITLE;
    QUEUE_MIX_TITLE2 = ns3.QUEUE_MIX_TITLE;
    PRIORITY_DYNAMICS_TITLE2 = ns3.PRIORITY_DYNAMICS_TITLE;
    LOG_RETENTION_DEFAULT_DAYS = 90;
    LOG_RETENTION_TITLE2 = ns3.LOG_RETENTION_TITLE;
    ROLLOVER_HOUR_DEFAULT = 4;
    NEW_PER_DAY_DEFAULT = 20;
    REVIEWS_PER_DAY_DEFAULT = 200;
    LEARN_AHEAD_DEFAULT_MINUTES = 20;
    OCR_TITLE2 = ns3.OCR_TITLE;
    SEMANTIC_SPLIT_TITLE2 = ns3.SEMANTIC_SPLIT_TITLE;
  }
});

// src/tidme/core/scheduler.ts
var scheduler_exports = {};
__export(scheduler_exports, {
  AFACTOR_CONTINUOUS: () => AFACTOR_CONTINUOUS,
  AFACTOR_DEFAULT: () => AFACTOR_DEFAULT,
  AUTOPOSTPONE_CONFIG_TITLE: () => AUTOPOSTPONE_CONFIG_TITLE,
  AUTOPOSTPONE_OPTS_DEFAULTS: () => AUTOPOSTPONE_OPTS_DEFAULTS,
  DECK_PARAM_DEFAULTS: () => DECK_PARAM_DEFAULTS,
  ITEM_FILTER: () => ITEM_FILTER,
  ITEM_PROTECTION_WEIGHT: () => ITEM_PROTECTION_WEIGHT,
  POSTPONE_DEFAULT_DAYS: () => POSTPONE_DEFAULT_DAYS,
  PRIORITY_BUCKET_BOUNDS: () => PRIORITY_BUCKET_BOUNDS,
  PRIORITY_DEFAULT: () => PRIORITY_DEFAULT,
  PRIORITY_TIERS: () => PRIORITY_TIERS,
  TOPIC_MIN_INTERVAL_DAYS: () => TOPIC_MIN_INTERVAL_DAYS,
  advanceCard: () => advanceCard,
  afactorForText: () => afactorForText,
  afactorOf: () => afactorOf,
  applyFuzz: () => applyFuzz,
  autoPostpone: () => autoPostpone,
  buryCards: () => buryCards,
  calculateFuzzRange: () => calculateFuzzRange,
  comparePriorityMixed: () => comparePriorityMixed,
  constrainedFuzzBounds: () => constrainedFuzzBounds,
  doneCard: () => doneCard,
  findSiblings: () => findSiblings,
  forgetCard: () => forgetCard,
  fuzzBounds: () => fuzzBounds,
  fuzzDelta: () => fuzzDelta,
  ignoreCard: () => ignoreCard,
  isBuriedToday: () => isBuriedToday,
  isCardOutOfQueue: () => isCardOutOfQueue,
  isDueNow: () => isDueNow,
  isDueNowFor: () => isDueNowFor,
  isInQueue: () => isInQueue,
  isQueueable: () => isQueueable,
  learningDayContext: () => learningDayContext,
  minimumReviewFuzzInterval: () => minimumReviewFuzzInterval,
  nextSchedulable: () => nextSchedulable,
  normalizeAFactor: () => normalizeAFactor,
  normalizePriority: () => normalizePriority,
  postponeCard: () => postponeCard,
  postponeTopicByAFactor: () => postponeTopicByAFactor,
  priorityBucket: () => priorityBucket,
  priorityDeltaForRating: () => priorityDeltaForRating,
  priorityMixedScore: () => priorityMixedScore,
  readDailyQuota: () => readDailyQuota,
  recordDailyQuota: () => recordDailyQuota,
  resetLeechCard: () => resetLeechCard,
  resolveDailyLimits: () => resolveDailyLimits,
  resolveRolloverHour: () => resolveRolloverHour,
  restoreCard: () => restoreCard,
  resumeCard: () => resumeCard,
  rollbackDailyQuota: () => rollbackDailyQuota,
  shiftPriority: () => shiftPriority,
  sortTopicQueue: () => sortTopicQueue,
  stateOf: () => stateOf,
  suspendCard: () => suspendCard,
  tierRandom: () => tierRandom,
  unburyCard: () => unburyCard,
  unburyCards: () => unburyCards,
  withReviewFuzz: () => withReviewFuzz
});
function protectionScore(fields) {
  return normalizePriority(fields["tidme.priority"]) + (fields["tidme.kind"] === "item" ? -ITEM_PROTECTION_WEIGHT : 0);
}
function sortTopicQueue(cards) {
  return [...cards].sort(
    (a, b) => a.priority - b.priority || (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0) || String(a.order).localeCompare(String(b.order))
  );
}
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
function priorityBucket(v) {
  const p = normalizePriority(v);
  if (p <= PRIORITY_BUCKET_BOUNDS.high)
    return "high";
  if (p <= PRIORITY_BUCKET_BOUNDS.medium)
    return "medium";
  return "low";
}
function tierRandom(tier, spread = 8) {
  const base = PRIORITY_TIERS[tier];
  return Math.max(0, Math.min(100, base + Math.round((Math.random() - 0.5) * 2 * spread)));
}
function priorityDeltaForRating(rating, cfg) {
  if (cfg && cfg.enable === false)
    return 0;
  const c = cfg || {};
  const r = String(rating).toLowerCase();
  if (r === "again" || r === "1")
    return Number(c.again) || 0;
  if (r === "hard" || r === "2")
    return Number(c.hard) || 0;
  if (r === "good" || r === "3")
    return Number(c.good) || 5;
  if (r === "easy" || r === "4")
    return Number(c.easy) || 10;
  return 0;
}
function adjustPriority(priority, delta) {
  return String(Math.max(0, Math.min(100, normalizePriority(priority) + delta)));
}
function shiftPriority(priority, step = 5) {
  return adjustPriority(priority, step);
}
function addDays(d, days) {
  return new Date(d.getTime() + days * 864e5);
}
function fuzzDelta(interval) {
  if (!(interval >= 2.5))
    return 0;
  return FUZZ_RANGES.reduce((delta, [start, end, factor]) => delta + factor * Math.max(0, Math.min(interval, end) - start), 1);
}
function fuzzBounds(interval) {
  const delta = fuzzDelta(interval);
  return { lower: Math.round(interval - delta), upper: Math.round(interval + delta) };
}
function constrainedFuzzBounds(interval, minimum, maximum) {
  const lo = Math.min(minimum, maximum);
  const clamped = Math.min(Math.max(interval, lo), maximum);
  const bounds = fuzzBounds(clamped);
  let lower = Math.min(Math.max(bounds.lower, lo), maximum);
  let upper = Math.min(Math.max(bounds.upper, lo), maximum);
  if (upper === lower && upper > 2 && upper < maximum)
    upper = lower + 1;
  return { lower, upper };
}
function minimumReviewFuzzInterval(interval, previousInterval, maximumInterval) {
  const rounded = Math.round(interval);
  const { upper } = constrainedFuzzBounds(interval, 1, maximumInterval);
  if (rounded > previousInterval)
    return previousInterval + 1;
  if (previousInterval <= upper)
    return previousInterval;
  return 0;
}
function withReviewFuzz(fuzzFactor, interval, minimum, maximum) {
  if (fuzzFactor === null) {
    return Math.min(Math.max(Math.round(interval), minimum), maximum);
  }
  const { lower, upper } = constrainedFuzzBounds(interval, minimum, maximum);
  return Math.floor(lower + fuzzFactor * (1 + upper - lower));
}
function calculateFuzzRange(interval, opts = {}) {
  const maximum = opts.maxInterval && opts.maxInterval > 0 ? Math.floor(opts.maxInterval) : DECK_PARAM_DEFAULTS.maximumInterval;
  const minimum = opts.prevInterval && opts.prevInterval > 0 ? minimumReviewFuzzInterval(interval, Math.floor(opts.prevInterval), maximum) : 1;
  const { lower, upper } = constrainedFuzzBounds(interval, minimum, maximum);
  return { minDelta: lower - Math.round(interval), maxDelta: upper - Math.round(interval) };
}
function applyFuzz(scheduledDays, opts = {}) {
  const maxInterval = opts.maxInterval && opts.maxInterval > 0 ? Math.floor(opts.maxInterval) : DECK_PARAM_DEFAULTS.maximumInterval;
  if (!(scheduledDays >= 2.5))
    return withReviewFuzz(null, scheduledDays, 1, maxInterval);
  const minimum = opts.prevInterval && opts.prevInterval > 0 ? minimumReviewFuzzInterval(scheduledDays, Math.floor(opts.prevInterval), maxInterval) : 1;
  const factor = typeof opts.randomFn === "function" ? opts.randomFn() : Math.random();
  return withReviewFuzz(factor, scheduledDays, minimum, maxInterval);
}
function postponeCard(fields, byDays = POSTPONE_DEFAULT_DAYS, now = new Date()) {
  const d = parseTwDate2(fields.due);
  const base = d.getTime() < now.getTime() ? now : d;
  return { due: twDateString2(addDays(base, byDays)) };
}
function advanceCard() {
  return { due: twDateString2(new Date()) };
}
function ignoreCard() {
  return { "tidme.ignored": "yes" };
}
function suspendCard() {
  return { "tidme.suspended": "yes" };
}
function resumeCard() {
  return { "tidme.suspended": void 0 };
}
function forgetCard() {
  const t = twDateString2(new Date());
  return {
    state: "0",
    reps: "0",
    lapses: "0",
    stability: "0",
    difficulty: "0",
    elapsed_days: "0",
    scheduled_days: "0",
    due: t,
    last_review: t
  };
}
function unburyCard() {
  return { [ns4.BURIED_FIELD]: void 0 };
}
function resetLeechCard() {
  return {
    "tidme.leech": void 0,
    "tidme.ignored": void 0,
    "tidme.suspended": void 0,
    ...unburyCard(),
    ...forgetCard()
  };
}
function isCardOutOfQueue(fields) {
  if (!fields)
    return false;
  return fields["tidme.done"] === "yes" || fields["tidme.ignored"] === "yes";
}
function isInQueue(fields) {
  if (!fields)
    return false;
  return fields["tidme.done"] !== "yes" && fields["tidme.ignored"] !== "yes" && fields["tidme.suspended"] !== "yes";
}
function doneCard() {
  return { "tidme.done": "yes" };
}
function restoreCard() {
  return { "tidme.done": void 0, "tidme.ignored": void 0, "tidme.suspended": void 0 };
}
function stateOf(fields) {
  const raw = fields ? fields.state : void 0;
  const s = raw === void 0 || raw === null ? "" : String(raw).trim();
  return s === "1" || s === "2" || s === "3" ? s : "0";
}
function isBuriedToday(fields, learningDay) {
  const buried = fields ? fields[ns4.BURIED_FIELD] : void 0;
  return buried !== void 0 && buried !== null && String(buried) === learningDay;
}
function isQueueable(fields, learningDay) {
  return isInQueue(fields) && !isBuriedToday(fields, learningDay);
}
function isDueNow(fields, now = new Date(), learnAheadMinutes = 0, rolloverHour = 4) {
  if (!isQueueable(fields, schema.learningDayOf(now, rolloverHour)))
    return false;
  const due = fields.due;
  if (due === void 0 || due === null || String(due) === "")
    return true;
  const parsed = tryParseTwDate2(due);
  if (!parsed)
    return false;
  const dueMs = parsed.getTime();
  const nowMs = now.getTime();
  if (dueMs <= nowMs)
    return true;
  const state = stateOf(fields);
  if (learnAheadMinutes > 0 && (state === "1" || state === "3")) {
    return dueMs <= nowMs + learnAheadMinutes * 6e4;
  }
  return false;
}
function configMod() {
  return init_config(), __toCommonJS(config_exports);
}
function resolveRolloverHour(wiki) {
  return configMod().readRolloverHour(wiki);
}
function learningDayContext(wiki, now = new Date()) {
  const config = configMod();
  const rolloverHour = config.readRolloverHour(wiki);
  return {
    now,
    rolloverHour,
    learningDay: schema.learningDayOf(now, rolloverHour),
    learnAheadMinutes: config.readLearnAheadMinutes(wiki)
  };
}
function isDueNowFor(wiki, fields, now = new Date()) {
  const ctx = learningDayContext(wiki, now);
  return isDueNow(fields, ctx.now, ctx.learnAheadMinutes, ctx.rolloverHour);
}
function writeDailyQuota(wiki, state) {
  if (wiki && typeof wiki.addTiddler === "function") {
    wiki.addTiddler({
      title: ns4.DAILY_QUOTA_STATE_TITLE,
      type: "application/json",
      text: JSON.stringify(state)
    });
  }
}
function readDailyQuota(wiki, now = new Date()) {
  const currentDay = schema.learningDayOf(now, resolveRolloverHour(wiki));
  const fallback = { learningDay: currentDay, newCount: 0, reviewCount: 0 };
  if (!wiki || typeof wiki.getTiddler !== "function")
    return fallback;
  const raw = wiki.getTiddlerText?.(ns4.DAILY_QUOTA_STATE_TITLE, "");
  if (!raw)
    return fallback;
  try {
    const data = JSON.parse(raw);
    if (data && data.learningDay === currentDay) {
      return {
        learningDay: currentDay,
        newCount: Math.max(0, Math.floor(Number(data.newCount) || 0)),
        reviewCount: Math.max(0, Math.floor(Number(data.reviewCount) || 0))
      };
    }
  } catch {
  }
  return fallback;
}
function recordDailyQuota(wiki, kind, now = new Date()) {
  const current = readDailyQuota(wiki, now);
  const updated = {
    learningDay: current.learningDay,
    newCount: current.newCount + (kind === "new" ? 1 : 0),
    reviewCount: current.reviewCount + (kind === "review" ? 1 : 0)
  };
  if (kind !== "learn")
    writeDailyQuota(wiki, updated);
  return updated;
}
function rollbackDailyQuota(wiki, kind, now = new Date()) {
  const current = readDailyQuota(wiki, now);
  const updated = {
    learningDay: current.learningDay,
    newCount: Math.max(0, current.newCount - (kind === "new" ? 1 : 0)),
    reviewCount: Math.max(0, current.reviewCount - (kind === "review" ? 1 : 0))
  };
  if (kind !== "learn")
    writeDailyQuota(wiki, updated);
  return updated;
}
function resolveDailyLimits(wiki, now = new Date()) {
  const config = configMod();
  const quota = readDailyQuota(wiki, now);
  const newCap = config.readNewPerDay(wiki);
  const reviewCap = config.readReviewsPerDay(wiki);
  const suppress = config.readLimitsSuppressNew(wiki);
  let reviewLimit = reviewCap > 0 ? Math.max(0, reviewCap - quota.reviewCount) : null;
  let newLimit = newCap > 0 ? Math.max(0, newCap - quota.newCount) : null;
  if (suppress && reviewLimit !== null) {
    const budget = Math.max(0, reviewLimit - quota.newCount);
    reviewLimit = budget;
    newLimit = newLimit === null ? budget : Math.min(newLimit, budget);
  }
  return {
    learningDay: quota.learningDay,
    rolloverHour: resolveRolloverHour(wiki),
    newCount: quota.newCount,
    reviewCount: quota.reviewCount,
    reviewLimit,
    newLimit
  };
}
function findSiblings(wiki, cardTitle) {
  if (!wiki || typeof wiki.filterTiddlers !== "function" || !cardTitle)
    return [];
  const f = wiki.getTiddler(cardTitle)?.fields;
  const parent = f?.["tidme.parent"];
  if (!parent || !ns4.isFilterSafeTitle(parent))
    return [];
  const raw = wiki.filterTiddlers(
    `[all[shadows+tiddlers]tidme.parent[${parent}]!is[draft]tidme.kind[item]]`
  );
  return raw.filter((t) => {
    if (t === cardTitle)
      return false;
    const sf = wiki.getTiddler(t)?.fields;
    if (!isInQueue(sf))
      return false;
    const state = stateOf(sf);
    return state !== "1" && state !== "3";
  });
}
function buryCards(wiki, titles, learningDay) {
  if (!wiki || typeof wiki.addTiddler !== "function" || !titles.length)
    return [];
  const buried = [];
  for (const t of titles) {
    const f = wiki.getTiddler(t)?.fields;
    if (f && f[ns4.BURIED_FIELD] !== learningDay) {
      wiki.addTiddler({ ...f, [ns4.BURIED_FIELD]: learningDay });
      buried.push(t);
    }
  }
  return buried;
}
function unburyCards(wiki, titles) {
  if (!wiki || typeof wiki.filterTiddlers !== "function")
    return 0;
  const targetTitles = titles || wiki.filterTiddlers(`[all[shadows+tiddlers]has[${ns4.BURIED_FIELD}]]`);
  let count = 0;
  for (const t of targetTitles) {
    const f = wiki.getTiddler(t)?.fields;
    if (f && f[ns4.BURIED_FIELD]) {
      wiki.addTiddler({ ...f, ...unburyCard() });
      count++;
    }
  }
  return count;
}
function nextSchedulable(ordered, cur, canLearn) {
  const start = cur === null || cur === void 0 ? 0 : ordered.indexOf(cur) + 1;
  for (let i = start; i < ordered.length; i++) {
    if (canLearn(ordered[i]))
      return ordered[i];
  }
  return null;
}
function priorityMixedScore(fields, overdueWeight = 0.5, now = new Date()) {
  const p = normalizePriority(fields["tidme.priority"]);
  const due = parseTwDate2(fields.due, new Date(0)).getTime();
  const days = due === 0 ? 0 : Math.max(0, (now.getTime() - due) / 864e5);
  return p - days * overdueWeight * 10;
}
function comparePriorityMixed(a, b, mode = "hybrid", overdueWeight = 0.5, now = new Date()) {
  const pa = normalizePriority(a.fields["tidme.priority"]);
  const pb = normalizePriority(b.fields["tidme.priority"]);
  const da = parseTwDate2(a.fields.due, new Date(0)).getTime();
  const db = parseTwDate2(b.fields.due, new Date(0)).getTime();
  if (mode === "priority-first") {
    if (pa !== pb)
      return pa - pb;
    return da - db;
  }
  if (mode === "due-first") {
    if (da !== db)
      return da - db;
    return pa - pb;
  }
  const scoreA = priorityMixedScore(a.fields, overdueWeight, now);
  const scoreB = priorityMixedScore(b.fields, overdueWeight, now);
  if (Math.abs(scoreA - scoreB) > 1e-3)
    return scoreA - scoreB;
  return pa - pb || da - db;
}
function normalizeAFactor(v, fallback = AFACTOR_DEFAULT) {
  let n;
  if (typeof v === "number")
    n = v;
  else {
    const s = String(v ?? "").trim();
    if (s === "")
      return fallback;
    n = parseFloat(s);
  }
  if (Number.isFinite(n) && n >= 1 && n <= 10)
    return Math.round(n * 100) / 100;
  return fallback;
}
function afactorForText(chars) {
  const c = Number(chars) || 0;
  if (c <= 0)
    return AFACTOR_DEFAULT;
  if (c < 800)
    return 2;
  if (c < 3e3)
    return 1.6;
  if (c < 1e4)
    return 1.4;
  return AFACTOR_CONTINUOUS;
}
function afactorOf(fields, fallback = AFACTOR_DEFAULT) {
  const raw = fields?.["tidme.afactor"];
  if (raw !== void 0 && raw !== null && String(raw).trim() !== "")
    return normalizeAFactor(raw, fallback);
  return afactorForText(Number(fields?.chars ?? fields?.["tidme.chars"]) || 0);
}
function postponeTopicByAFactor(fields, aFactor, minDays = TOPIC_MIN_INTERVAL_DAYS, now = new Date()) {
  const factor = aFactor !== void 0 ? normalizeAFactor(aFactor) : afactorOf(fields);
  const lastDate = parseTwDate2(fields.last_review || fields.due, new Date(now));
  const elapsedDays = Math.max(1, Math.round((now.getTime() - lastDate.getTime()) / 864e5));
  const currentInterval = Number(fields.scheduled_days) || elapsedDays;
  const newInterval = Math.max(minDays, Math.round(currentInterval * factor));
  const due = twDateString2(addDays(now, newInterval));
  const reps = String((Number(fields.reps) || 0) + 1);
  return {
    due,
    scheduled_days: String(newInterval),
    last_review: twDateString2(now),
    reps
  };
}
function autoPostpone(cards, opts = {}, now = new Date()) {
  const maxPriority = opts.maxPriority ?? AUTOPOSTPONE_OPTS_DEFAULTS.maxPriority;
  const postponeDays = opts.postponeDays ?? AUTOPOSTPONE_OPTS_DEFAULTS.postponeDays;
  const keepTop = opts.keepTop ?? AUTOPOSTPONE_OPTS_DEFAULTS.keepTop;
  const maxOverdueThreshold = opts.maxOverdueThreshold ?? AUTOPOSTPONE_OPTS_DEFAULTS.maxOverdueThreshold;
  const nowMs = now.getTime();
  const overdue = cards.filter((c) => isInQueue(c.fields) && parseTwDate2(c.fields.due, new Date(0)).getTime() < nowMs).sort((a, b) => {
    const pa = protectionScore(a.fields);
    const pb = protectionScore(b.fields);
    if (pa !== pb)
      return pa - pb;
    return parseTwDate2(a.fields.due).getTime() - parseTwDate2(b.fields.due).getTime();
  });
  if (overdue.length <= maxOverdueThreshold) {
    return {
      patches: [],
      stats: { overdue: overdue.length, postponed: 0, kept: overdue.length }
    };
  }
  const kept = overdue.slice(0, keepTop);
  const postponable = overdue.slice(keepTop).filter((c) => normalizePriority(c.fields["tidme.priority"]) >= maxPriority);
  return {
    patches: postponable.map((c) => ({
      title: c.title,
      fields: c.fields["tidme.kind"] === "topic" ? postponeTopicByAFactor(c.fields, void 0, TOPIC_MIN_INTERVAL_DAYS, now) : postponeCard(c.fields, postponeDays, now)
    })),
    stats: { overdue: overdue.length, postponed: postponable.length, kept: kept.length }
  };
}
var ns4, AUTOPOSTPONE_CONFIG_TITLE, PRIORITY_DEFAULT, AFACTOR_DEFAULT, AFACTOR_CONTINUOUS, TOPIC_MIN_INTERVAL_DAYS, ITEM_PROTECTION_WEIGHT, POSTPONE_DEFAULT_DAYS, AUTOPOSTPONE_OPTS_DEFAULTS, DECK_PARAM_DEFAULTS, PRIORITY_TIERS, ITEM_FILTER, schema, parseTwDate2, tryParseTwDate2, twDateString2, PRIORITY_BUCKET_BOUNDS, FUZZ_RANGES;
var init_scheduler = __esm({
  "src/tidme/core/scheduler.ts"() {
    ns4 = (init_ns(), __toCommonJS(ns_exports));
    AUTOPOSTPONE_CONFIG_TITLE = ns4.CONFIG_TITLE_PREFIX + "AutoPostpone";
    PRIORITY_DEFAULT = 50;
    AFACTOR_DEFAULT = 1.5;
    AFACTOR_CONTINUOUS = 1.3;
    TOPIC_MIN_INTERVAL_DAYS = 3;
    ITEM_PROTECTION_WEIGHT = 15;
    POSTPONE_DEFAULT_DAYS = 7;
    AUTOPOSTPONE_OPTS_DEFAULTS = {
      maxPriority: 60,
      postponeDays: POSTPONE_DEFAULT_DAYS,
      keepTop: 10,
      maxOverdueThreshold: 0
    };
    DECK_PARAM_DEFAULTS = {
      leechThreshold: 8,
      requestRetention: 0.9,
      maximumInterval: 36500
    };
    PRIORITY_TIERS = { high: 10, medium: 50, low: 90 };
    ITEM_FILTER = `[tidme.kind[item]]`;
    schema = (init_schema(), __toCommonJS(schema_exports));
    parseTwDate2 = schema.parseTwDate;
    tryParseTwDate2 = schema.tryParseTwDate;
    twDateString2 = schema.twDateString;
    PRIORITY_BUCKET_BOUNDS = { high: 33, medium: 66 };
    FUZZ_RANGES = [
      [2.5, 7, 0.15],
      [7, 20, 0.1],
      [20, Infinity, 0.05]
    ];
  }
});

// src/tidme/core/deck-engine.ts
var deck_engine_exports = {};
__export(deck_engine_exports, {
  applyQueueLimits: () => applyQueueLimits,
  clippedCount: () => clippedCount,
  composeDeckFilters: () => composeDeckFilters,
  composeGlobalLearningQueue: () => composeGlobalLearningQueue
});
function composeDeckFilters(deckTitle, fields = {}) {
  const d = deckTitle;
  if (!isFilterSafeTitle2(d)) {
    console.warn("[tidme] deck title \u542B\u8FC7\u6EE4\u5668\u4E0D\u5B89\u5168\u5B57\u7B26\uFF0C\u961F\u5217\u8FC7\u6EE4\u5668\u7F6E\u7A7A:", d);
    return { learn: "", due: "", newly: "", unfold: "", random: "", dueNew: "", newDue: "", randomCombo: "", queue: "" };
  }
  const learnSort = String(fields.random_learn || "") === "yes" ? " +[sortrandom[]]" : " +[sort[due]]";
  const learn = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_learn}]${learnSort}`;
  const due = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_due}subfilter{${d}!!order_due}]`;
  const newly = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_new}subfilter{${d}!!order_new}]`;
  const unfold = `[subfilter{${d}!!card_unfold}]`;
  const random = `${due} ${newly} +[sortrandom[]]`;
  const dueNew = `${learn} ${due} ${newly}`;
  const newDue = `${learn} ${newly} ${due}`;
  const randomCombo = `${learn} ${random}`;
  const order = fields.order || "due-new";
  const queue = order === "new-due" ? newDue : order === "random" ? randomCombo : dueNew;
  return { learn, due, newly, unfold, random, dueNew, newDue, randomCombo, queue };
}
function clippedCount(total, limit) {
  return limit === void 0 || limit === null ? total : Math.min(total, Math.max(0, Math.floor(limit)));
}
function applyQueueLimits(learnItems, dueItems, newItems, limits = {}) {
  return {
    learn: learnItems,
    due: dueItems.slice(0, clippedCount(dueItems.length, limits.reviewLimit)),
    newly: newItems.slice(0, clippedCount(newItems.length, limits.newLimit))
  };
}
function topicDueFilter() {
  return `${TOPIC_QUEUE_FILTER2} :filter[has[due]] :filter[{!!due}compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>] +[nsort[tidme.priority]]`;
}
function topicPendingFilter() {
  return `${TOPIC_QUEUE_FILTER2} +[!has[due]] +[nsort[tidme.priority]]`;
}
function composeGlobalLearningQueue(evaluate, opts = {}) {
  const defaultDeckFilters = composeDeckFilters(ns5.DEFAULT_DECK_TITLE);
  const mode = opts.mode || "interleaved";
  const includeTopics = opts.topics === true;
  const onDiscard = opts.onDiscard || ((title, reason) => console.warn(`[tidme] \u5B66\u4E60\u961F\u5217\u4E22\u5F03${reason === "system" ? "\u7CFB\u7EDF\u6761\u76EE" : "\u8FC7\u6EE4\u5668\u4F2A\u6807\u9898"}\uFF1A`, String(title).slice(0, 120)));
  const isSafeCard = (t2) => {
    if (!isFilterSafeTitle2(t2)) {
      onDiscard(t2, "unsafe");
      return false;
    }
    if (t2.startsWith("$:/")) {
      onDiscard(t2, "system");
      return false;
    }
    return true;
  };
  const bury = opts.learningDay ? ns5.buriedExcludeFilter(opts.learningDay) : "";
  const seg = (filter) => bury ? `${filter} ${bury}` : filter;
  const limited = applyQueueLimits(
    evaluate(seg(defaultDeckFilters.learn)).filter(isSafeCard),
    evaluate(seg(defaultDeckFilters.due)).filter(isSafeCard),
    evaluate(seg(defaultDeckFilters.newly)).filter(isSafeCard),
    opts
  );
  const learnItems = limited.learn;
  const dueItems = limited.due;
  const newItems = limited.newly;
  if (mode === "strict") {
    const dueAll = [...learnItems, ...dueItems];
    if (!includeTopics)
      return [...dueAll, ...newItems];
    const dueTopics = evaluate(topicDueFilter());
    const pendingTopics = evaluate(topicPendingFilter());
    return [...dueAll, ...dueTopics, ...newItems, ...pendingTopics];
  }
  const rawItems = [...learnItems, ...dueItems, ...newItems];
  const rawTopics = includeTopics ? [...evaluate(topicDueFilter()), ...evaluate(topicPendingFilter())] : [];
  const ratio = (v, dflt) => Math.max(1, Math.floor(Number(v)) || dflt);
  const itemRatio = ratio(opts.itemRatio, 4);
  const topicRatio = ratio(opts.topicRatio, 1);
  const result = [];
  let i = 0;
  let t = 0;
  while (i < rawItems.length || t < rawTopics.length) {
    let count = 0;
    while (i < rawItems.length && count < itemRatio) {
      result.push(rawItems[i++]);
      count++;
    }
    count = 0;
    while (t < rawTopics.length && count < topicRatio) {
      result.push(rawTopics[t++]);
      count++;
    }
  }
  return result;
}
var ns5, DECK_PREFIX2, TOPIC_QUEUE_FILTER2, isFilterSafeTitle2;
var init_deck_engine = __esm({
  "src/tidme/core/deck-engine.ts"() {
    ns5 = (init_ns(), __toCommonJS(ns_exports));
    DECK_PREFIX2 = ns5.DECK_PREFIX;
    TOPIC_QUEUE_FILTER2 = ns5.TOPIC_QUEUE_FILTER;
    isFilterSafeTitle2 = ns5.isFilterSafeTitle;
  }
});

// src/tidme/core/stats.ts
var stats_exports = {};
__export(stats_exports, {
  FOCUS_SEGMENT_MAX_SECONDS: () => FOCUS_SEGMENT_MAX_SECONDS,
  MATURE_INTERVAL_DAYS: () => MATURE_INTERVAL_DAYS,
  READTIME_TIDDLER: () => READTIME_TIDDLER,
  collectReviewLogs: () => collectReviewLogs,
  deckLoad: () => deckLoad,
  difficultyHistogram: () => difficultyHistogram,
  forecastSummary: () => forecastSummary,
  formatDuration: () => formatDuration,
  funnelCounts: () => funnelCounts,
  futureDueSchedule: () => futureDueSchedule,
  getReadTimeStats: () => getReadTimeStats,
  histogram: () => histogram,
  intervalHistogram: () => intervalHistogram,
  priorityBuckets: () => priorityBuckets,
  recordReadTime: () => recordReadTime,
  retentionByPeriod: () => retentionByPeriod,
  retentionFromLogs: () => retentionFromLogs,
  reviewCountToday: () => reviewCountToday,
  stabilityHistogram: () => stabilityHistogram,
  todayWorkload: () => todayWorkload,
  trueRetentionFromLogs: () => trueRetentionFromLogs
});
function deckLoad(cards, now = new Date()) {
  const load = { total: cards.length, learn: 0, due: 0, overdue: 0, newCount: 0 };
  const nowMs = now.getTime();
  for (const c of cards) {
    const f = c.fields;
    if (!isInQueue2(f))
      continue;
    const state = sched2.stateOf(f);
    if (state === "1" || state === "3")
      load.learn++;
    else if (state === "2") {
      const dueMs = parseTwDate3(f.due).getTime();
      if (dueMs <= nowMs) {
        load.due++;
        if (dueMs < nowMs)
          load.overdue++;
      }
    } else
      load.newCount++;
  }
  return load;
}
function retentionFromLogs(logEntries) {
  if (!logEntries.length)
    return { reviews: 0, againRate: 0, retention: 1 };
  let again = 0;
  for (const e of logEntries) {
    const r = Number(e.rating);
    if (r === 1)
      again++;
  }
  const againRate = again / logEntries.length;
  return { reviews: logEntries.length, againRate, retention: 1 - againRate };
}
function collectReviewLogs(wiki) {
  if (!wiki || typeof wiki.filterTiddlers !== "function")
    return [];
  const logs = [];
  for (const lt of wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${nsMod.DECK_PREFIX}]]`)) {
    if (!nsMod.isDeckLogTitle(lt))
      continue;
    const data = wiki.getTiddlerData(lt);
    if (!data || typeof data !== "object")
      continue;
    for (const k of Object.keys(data)) {
      const row = data[k];
      if (typeof row === "string") {
        try {
          logs.push({ at: k, ...JSON.parse(row) });
        } catch {
        }
      } else if (row && typeof row === "object") {
        logs.push({ at: k, ...row });
      }
    }
  }
  return logs;
}
function maturityOf(row) {
  return maturityWithThreshold(row, MATURE_INTERVAL_DAYS);
}
function maturityWithThreshold(row, matureIntervalDays) {
  const stateStr = String(row.state ?? "");
  if (!(stateStr === "2" || stateStr.toLowerCase() === "review"))
    return "other";
  const elapsed = Number(row.last_elapsed_days !== void 0 ? row.last_elapsed_days : row.elapsed_days);
  if (!Number.isFinite(elapsed))
    return "other";
  return elapsed >= matureIntervalDays ? "mature" : "young";
}
function emptyCell() {
  return { reviews: 0, pass: 0, again: 0, retention: 1 };
}
function fillCell(cell, isAgain) {
  cell.reviews++;
  if (isAgain)
    cell.again++;
  else
    cell.pass++;
}
function closeCell(cell) {
  cell.retention = cell.reviews > 0 ? cell.pass / cell.reviews : 1;
}
function retentionByPeriod(logEntries, now = new Date(), rolloverHour = 4) {
  const periods = ["today", "yesterday", "lastWeek", "lastMonth", "all"];
  const currentDay = schema2.learningDayOf(now, rolloverHour);
  const rows = new Map(
    periods.map((p) => [p, { period: p, mature: emptyCell(), young: emptyCell(), total: emptyCell() }])
  );
  for (const e of logEntries) {
    const at = schema2.tryParseTwDate(e.at);
    if (!at)
      continue;
    const diff = schema2.learningDayDiff(currentDay, schema2.learningDayOf(at, rolloverHour));
    if (diff > 0)
      continue;
    const maturity = maturityOf(e);
    if (maturity === "other")
      continue;
    const isAgain = Number(e.rating) === 1;
    const row = rows.get("all");
    fillCell(row[maturity], isAgain);
    for (const p of periods) {
      if (p === "all")
        continue;
      const inRange = p === "today" ? diff === 0 : p === "yesterday" ? diff === -1 : p === "lastWeek" ? diff >= -6 : diff >= -29;
      if (!inRange)
        continue;
      const r = rows.get(p);
      fillCell(r[maturity], isAgain);
    }
  }
  for (const r of rows.values()) {
    fillCellTotal(r);
  }
  return periods.map((p) => rows.get(p));
}
function fillCellTotal(row) {
  row.total = {
    reviews: row.mature.reviews + row.young.reviews,
    pass: row.mature.pass + row.young.pass,
    again: row.mature.again + row.young.again,
    retention: 1
  };
  closeCell(row.mature);
  closeCell(row.young);
  closeCell(row.total);
}
function histogram(values, edges, labels) {
  const bins = labels.map((label) => ({ label, count: 0 }));
  if (edges.length !== labels.length + 1)
    return bins;
  for (const v of values) {
    if (!Number.isFinite(v))
      continue;
    const last = labels.length - 1;
    if (v < edges[0])
      continue;
    let idx = last;
    for (let i = 0; i < labels.length; i++) {
      if (v < edges[i + 1]) {
        idx = i;
        break;
      }
    }
    bins[idx].count++;
  }
  return bins;
}
function reviewCardValues(cards, field) {
  const out = [];
  for (const c of cards) {
    const f = c?.fields;
    if (!f || !isInQueue2(f))
      continue;
    if (sched2.stateOf(f) !== "2")
      continue;
    const v = Number(f[field]);
    if (Number.isFinite(v) && v >= 0)
      out.push(v);
  }
  return out;
}
function intervalHistogram(cards) {
  return histogram(reviewCardValues(cards, "scheduled_days"), INTERVAL_EDGES, INTERVAL_LABELS);
}
function stabilityHistogram(cards) {
  return histogram(reviewCardValues(cards, "stability"), STABILITY_EDGES, STABILITY_LABELS);
}
function difficultyHistogram(cards) {
  const values = reviewCardValues(cards, "difficulty").map((d) => d <= 1 ? d * 100 : d * 10);
  return histogram(values, DIFFICULTY_EDGES, DIFFICULTY_LABELS);
}
function forecastSummary(cards, days = 30, now = new Date(), rolloverHour = 4) {
  const schedule = futureDueSchedule(cards, Math.max(1, days), now, rolloverHour);
  const total = schedule.reduce((n, d) => n + d.dueCount, 0);
  let burden = 0;
  for (const c of cards) {
    const f = c?.fields;
    if (!f || !isInQueue2(f))
      continue;
    if (f["tidme.kind"] !== "item")
      continue;
    if (sched2.stateOf(f) !== "2")
      continue;
    const ivl = Number(f.scheduled_days);
    if (Number.isFinite(ivl) && ivl > 0)
      burden += 1 / ivl;
  }
  return {
    days: schedule.length,
    total,
    averagePerDay: schedule.length > 0 ? total / schedule.length : 0,
    dueTomorrow: schedule.length > 1 ? schedule[1].dueCount : 0,
    burden
  };
}
function trueRetentionFromLogs(logEntries, matureIntervalDays = MATURE_INTERVAL_DAYS) {
  const result = {
    matureReviews: 0,
    maturePass: 0,
    matureAgain: 0,
    trueRetention: 1,
    youngReviews: 0,
    youngPass: 0,
    youngAgain: 0,
    youngRetention: 1,
    allReviews: logEntries.length,
    overallRetention: 1
  };
  if (!logEntries.length)
    return result;
  let totalAgain = 0;
  for (const e of logEntries) {
    const isAgain = Number(e.rating) === 1;
    if (isAgain)
      totalAgain++;
    const maturity = matureIntervalDays === MATURE_INTERVAL_DAYS ? maturityOf(e) : maturityWithThreshold(e, matureIntervalDays);
    if (maturity === "mature") {
      result.matureReviews++;
      if (isAgain)
        result.matureAgain++;
      else
        result.maturePass++;
    } else if (maturity === "young") {
      result.youngReviews++;
      if (isAgain)
        result.youngAgain++;
      else
        result.youngPass++;
    }
  }
  result.trueRetention = result.matureReviews > 0 ? result.maturePass / result.matureReviews : 1;
  result.youngRetention = result.youngReviews > 0 ? result.youngPass / result.youngReviews : 1;
  result.overallRetention = result.allReviews > 0 ? (result.allReviews - totalAgain) / result.allReviews : 1;
  return result;
}
function futureDueSchedule(cards, days = 30, now = new Date(), rolloverHour = 4) {
  const currentDay = schema2.learningDayOf(now, rolloverHour);
  const schedule = [];
  for (let i = 0; i < days; i++) {
    schedule.push({
      dayIndex: i,
      dateString: schema2.addLearningDays(currentDay, i),
      dueCount: 0,
      cumulativeDue: 0
    });
  }
  for (const c of cards) {
    const f = c.fields;
    if (!isInQueue2(f))
      continue;
    if (f["tidme.kind"] !== "item")
      continue;
    const state = sched2.stateOf(f);
    if (state === "0")
      continue;
    const dueStr = f.due;
    if (!dueStr)
      continue;
    const parsed = schema2.tryParseTwDate(dueStr);
    if (!parsed)
      continue;
    const dayDiff = schema2.learningDayDiff(currentDay, schema2.learningDayOf(parsed, rolloverHour));
    if (dayDiff <= 0) {
      schedule[0].dueCount++;
    } else if (dayDiff < days) {
      schedule[dayDiff].dueCount++;
    }
  }
  let runningTotal = 0;
  for (const day of schedule) {
    runningTotal += day.dueCount;
    day.cumulativeDue = runningTotal;
  }
  return schedule;
}
function funnelCounts(items) {
  const f = { docs: 0, sections: 0, extracts: 0, concepts: 0, cards: 0 };
  for (const c of items) {
    const kind = String(c.fields["tidme.kind"] || "");
    const sub = String(c.fields["tidme.subkind"] || "");
    if (Array.isArray(c.fields.tags) && c.fields.tags.includes(nsMod.DOC_TAG))
      f.docs++;
    else if (kind === "topic") {
      if (sub === "extract")
        f.extracts++;
      else if (sub === "concept")
        f.concepts++;
      else
        f.sections++;
    } else if (kind === "item")
      f.cards++;
  }
  return f;
}
function formatDuration(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60)
    return `${sec} s`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins} m ${remSec} s` : `${mins} m`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs} h ${remMins} m` : `${hrs} h`;
}
function readStatsRaw(wiki) {
  const raw = wiki.getTiddlerText ? wiki.getTiddlerText(READTIME_TIDDLER, "") : "";
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object")
        return v;
    } catch {
    }
  }
  return {};
}
function getReadTimeStats(wiki) {
  if (!wiki || typeof wiki.getTiddlerText !== "function") {
    return { totalSeconds: 0, todaySeconds: 0, docSeconds: {} };
  }
  const data = readStatsRaw(wiki);
  const totalSeconds = Number(data.totalSeconds) || 0;
  const todaySeconds = Number(data.days?.[readTimeDayKey(wiki)]) || 0;
  const docSeconds = typeof data.docs === "object" && data.docs ? { ...data.docs } : {};
  return { totalSeconds, todaySeconds, docSeconds };
}
function readTimeDayKey(wiki) {
  return sched2.learningDayContext(wiki).learningDay;
}
function recordReadTime(wiki, docId, seconds) {
  if (!wiki || !seconds || seconds <= 0)
    return;
  const data = readStatsRaw(wiki);
  if (!data.docs)
    data.docs = {};
  if (!data.days)
    data.days = {};
  const sec = Math.max(1, Math.round(seconds));
  const day = readTimeDayKey(wiki);
  data.totalSeconds = (Number(data.totalSeconds) || 0) + sec;
  data.days[day] = (Number(data.days[day]) || 0) + sec;
  if (docId) {
    data.docs[docId] = (Number(data.docs[docId]) || 0) + sec;
  }
  wiki.addTiddler({
    title: READTIME_TIDDLER,
    type: "application/json",
    text: JSON.stringify(data)
  });
}
function priorityBuckets(cards) {
  const b = { high: 0, medium: 0, low: 0, none: 0 };
  for (const c of cards) {
    const raw = c.fields["tidme.priority"];
    const unset = raw === void 0 || raw === null || String(raw).trim() === "";
    if (unset) {
      b.none++;
      continue;
    }
    b[sched2.priorityBucket(raw)]++;
  }
  return b;
}
function reviewCountToday(wiki) {
  if (!wiki || typeof wiki.filterTiddlers !== "function")
    return 0;
  const ctx = sched2.learningDayContext(wiki);
  let n = 0;
  for (const lt of wiki.filterTiddlers(`[prefix[${nsMod.DECK_PREFIX}]]`)) {
    if (!nsMod.isDeckLogTitle(lt))
      continue;
    const data = wiki.getTiddlerData(lt);
    if (data && typeof data === "object") {
      for (const k of Object.keys(data)) {
        const d = schema2.tryParseTwDate(k);
        if (d) {
          if (schema2.learningDayOf(d, ctx.rolloverHour) === ctx.learningDay)
            n += 1;
        } else if (String(k).startsWith(ctx.learningDay)) {
          n += 1;
        }
      }
    }
  }
  return n;
}
function todayWorkload(wiki) {
  const deckEngine = (init_deck_engine(), __toCommonJS(deck_engine_exports));
  const deckMod3 = (init_deck(), __toCommonJS(deck_exports));
  const limits = sched2.resolveDailyLimits(wiki);
  const f = deckEngine.composeDeckFilters(deckMod3.DEFAULT_DECK);
  const bury = nsMod.buriedExcludeFilter(limits.learningDay);
  const count = (filter) => wiki.filterTiddlers(bury ? `${filter} ${bury}` : filter).length;
  const learn = count(f.learn);
  const totalDue = count(f.due);
  const totalNew = count(f.newly);
  const due = deckEngine.clippedCount(totalDue, limits.reviewLimit);
  const newly = deckEngine.clippedCount(totalNew, limits.newLimit);
  return {
    learn,
    due,
    newly,
    todayToStudy: learn + due + newly,
    totalDue,
    totalNew,
    totalPool: learn + totalDue + totalNew,
    toRead: count(nsMod.TOPIC_QUEUE_FILTER)
  };
}
var schema2, parseTwDate3, sched2, nsMod, isCardOutOfQueue2, isInQueue2, INTERVAL_EDGES, INTERVAL_LABELS, STABILITY_EDGES, STABILITY_LABELS, DIFFICULTY_EDGES, DIFFICULTY_LABELS, MATURE_INTERVAL_DAYS, READTIME_TIDDLER, FOCUS_SEGMENT_MAX_SECONDS;
var init_stats = __esm({
  "src/tidme/core/stats.ts"() {
    schema2 = (init_schema(), __toCommonJS(schema_exports));
    parseTwDate3 = schema2.parseTwDate;
    sched2 = (init_scheduler(), __toCommonJS(scheduler_exports));
    nsMod = (init_ns(), __toCommonJS(ns_exports));
    isCardOutOfQueue2 = sched2.isCardOutOfQueue;
    isInQueue2 = sched2.isInQueue;
    INTERVAL_EDGES = [0, 1, 3, 7, 14, 30, 60, 120, 365, Infinity];
    INTERVAL_LABELS = ["1", "2-3", "4-7", "8-14", "15-30", "31-60", "61-120", "121-365", ">365"];
    STABILITY_EDGES = [0, 1, 3, 7, 30, 90, 180, 365, Infinity];
    STABILITY_LABELS = ["0-1", "1-3", "3-7", "7-30", "30-90", "90-180", "180-365", ">365"];
    DIFFICULTY_EDGES = [0, 20, 40, 60, 80, 100.0001];
    DIFFICULTY_LABELS = ["0-20%", "20-40%", "40-60%", "60-80%", "80-100%"];
    MATURE_INTERVAL_DAYS = 21;
    READTIME_TIDDLER = "$:/plugins/keepone/tidme/stats/readtime";
    FOCUS_SEGMENT_MAX_SECONDS = 3600;
  }
});

// src/tidme/core/undo.ts
var undo_exports = {};
__export(undo_exports, {
  MAX_UNDO_DEPTH: () => MAX_UNDO_DEPTH,
  clearUndo: () => clearUndo,
  popUndo: () => popUndo,
  pushUndo: () => pushUndo,
  undoDepth: () => undoDepth
});
function pushUndo(snapshot) {
  stack.push(snapshot);
  while (stack.length > MAX_UNDO_DEPTH)
    stack.shift();
  return stack.length;
}
function popUndo() {
  return stack.length ? stack.pop() : null;
}
function undoDepth() {
  return stack.length;
}
function clearUndo() {
  stack.length = 0;
}
var MAX_UNDO_DEPTH, stack;
var init_undo = __esm({
  "src/tidme/core/undo.ts"() {
    MAX_UNDO_DEPTH = 30;
    stack = [];
  }
});

// src/tidme/core/drill.ts
var drill_exports = {};
__export(drill_exports, {
  FINAL_DRILL_MAX_AGE_DAYS: () => FINAL_DRILL_MAX_AGE_DAYS,
  getFinalDrillQueue: () => getFinalDrillQueue,
  recordFinalDrill: () => recordFinalDrill,
  removeFinalDrill: () => removeFinalDrill
});
function writeEntries(wiki, entries) {
  wiki.addTiddler({
    title: ns6.FINAL_DRILL_STATE_TITLE,
    type: "application/json",
    text: JSON.stringify({ entries })
  });
}
function readEntries(wiki) {
  const data = wiki.getTiddlerData?.(ns6.FINAL_DRILL_STATE_TITLE);
  return Array.isArray(data?.entries) ? data.entries : [];
}
function getFinalDrillQueue(wiki, now = new Date(), maxAgeDays = FINAL_DRILL_MAX_AGE_DAYS) {
  if (!wiki || typeof wiki.getTiddlerData !== "function")
    return [];
  const list = readEntries(wiki);
  if (!list.length)
    return [];
  const nowMs = now.getTime();
  const maxAgeMs = maxAgeDays * 864e5;
  const validEntries = [];
  for (const item of list) {
    const t = item.title;
    if (!t || !wiki.getTiddler(t))
      continue;
    const addedTime = schema3.tryParseTwDate(item.addedAt)?.getTime() || 0;
    if (nowMs - addedTime > maxAgeMs)
      continue;
    validEntries.push(item);
  }
  if (validEntries.length !== list.length)
    writeEntries(wiki, validEntries);
  return validEntries.map((e) => e.title);
}
function recordFinalDrill(wiki, title, now = new Date()) {
  if (!wiki || typeof wiki.addTiddler !== "function" || !title)
    return;
  getFinalDrillQueue(wiki, now);
  const entries = [...readEntries(wiki)];
  const existing = entries.find((e) => e.title === title);
  if (existing) {
    existing.failCount = (existing.failCount || 1) + 1;
    existing.addedAt = schema3.twDateString(now);
  } else {
    entries.push({ title, addedAt: schema3.twDateString(now), failCount: 1 });
  }
  writeEntries(wiki, entries);
}
function removeFinalDrill(wiki, title) {
  if (!wiki || typeof wiki.getTiddlerData !== "function" || !title)
    return false;
  const entries = readEntries(wiki);
  const filtered = entries.filter((e) => e.title !== title);
  if (filtered.length === entries.length)
    return false;
  writeEntries(wiki, filtered);
  return true;
}
var ns6, schema3, FINAL_DRILL_MAX_AGE_DAYS;
var init_drill = __esm({
  "src/tidme/core/drill.ts"() {
    ns6 = (init_ns(), __toCommonJS(ns_exports));
    schema3 = (init_schema(), __toCommonJS(schema_exports));
    FINAL_DRILL_MAX_AGE_DAYS = 3;
  }
});

// src/tidme/core/session.ts
var session_exports = {};
__export(session_exports, {
  DECK_STUDY_SUFFIX: () => DECK_STUDY_SUFFIX,
  SESSION_TIDDLER: () => SESSION_TIDDLER,
  TEMP_PREFIX: () => TEMP_PREFIX,
  advanceSession: () => advanceSession,
  consumeFocusAnchor: () => consumeFocusAnchor,
  endSession: () => endSession,
  enterCard: () => enterCard,
  getActiveStudy: () => getActiveStudy,
  getSession: () => getSession,
  modifiedMs: () => modifiedMs,
  prepareCardFold: () => prepareCardFold,
  readFocusAnchor: () => readFocusAnchor,
  removeFromSession: () => removeFromSession,
  removeFromSessionMany: () => removeFromSessionMany,
  setSession: () => setSession,
  settleFocusAnchor: () => settleFocusAnchor,
  startCramSession: () => startCramSession,
  startFinalDrill: () => startFinalDrill,
  startGlobalLearningSession: () => startGlobalLearningSession,
  touchFocusAnchor: () => touchFocusAnchor
});
function getSession(wiki) {
  if (!wiki || typeof wiki.getTiddler !== "function")
    return null;
  const f = wiki.getTiddler(SESSION_TIDDLER)?.fields;
  if (!f)
    return null;
  const list = Array.isArray(f.list) ? [...f.list] : String(f.list || "").split(" ").filter(Boolean);
  if (!list.length)
    return null;
  return {
    list,
    mode: f.mode !== void 0 ? String(f.mode) : void 0,
    currentIndex: f.current_index !== void 0 ? String(f.current_index) : void 0
  };
}
function setSession(wiki, session2) {
  if (!wiki || typeof wiki.addTiddler !== "function")
    return;
  if (!Array.isArray(session2.list) || !session2.list.length) {
    wiki.deleteTiddler?.(SESSION_TIDDLER);
    return;
  }
  const fields = { title: SESSION_TIDDLER, list: session2.list };
  if (session2.mode !== void 0)
    fields.mode = session2.mode;
  if (session2.currentIndex !== void 0)
    fields.current_index = session2.currentIndex;
  wiki.addTiddler(fields);
}
function removeFromSession(wiki, title) {
  return removeFromSessionMany(wiki, [title]);
}
function removeFromSessionMany(wiki, titles) {
  const s = getSession(wiki);
  if (!s)
    return false;
  const kill = titles instanceof Set ? titles : new Set(titles);
  const next = s.list.filter((t) => !kill.has(t));
  if (next.length === s.list.length)
    return false;
  setSession(wiki, { list: next, mode: s.mode, currentIndex: s.currentIndex });
  return true;
}
function advanceSession(wiki, cur, canLearn) {
  const s = getSession(wiki);
  if (!s)
    return null;
  const ctx = sched3.learningDayContext(wiki);
  const freeMode = s.mode === "cram" || s.mode === "final-drill";
  const learn = canLearn ? canLearn : (t) => {
    const f = wiki.getTiddler(t);
    if (!f)
      return false;
    return freeMode ? sched3.isQueueable(f.fields, ctx.learningDay) : sched3.isDueNow(f.fields, ctx.now, ctx.learnAheadMinutes, ctx.rolloverHour);
  };
  return sched3.nextSchedulable(s.list, cur, learn);
}
function startGlobalLearningSession(wiki) {
  if (!wiki || typeof wiki.filterTiddlers !== "function")
    return null;
  const config = (init_config(), __toCommonJS(config_exports));
  const deckEngine = (init_deck_engine(), __toCommonJS(deck_engine_exports));
  const opts = config.readQueueOptions(wiki);
  const limits = sched3.resolveDailyLimits(wiki);
  const queue = deckEngine.composeGlobalLearningQueue((filter) => wiki.filterTiddlers(filter), {
    mode: opts.mode,
    topics: opts.topics,
    itemRatio: opts.itemRatio,
    topicRatio: opts.topicRatio,
    newLimit: limits.newLimit,
    reviewLimit: limits.reviewLimit,
    learningDay: limits.learningDay
  });
  if (!queue || !queue.length)
    return null;
  const first = queue[0];
  setSession(wiki, {
    list: queue,
    currentIndex: "0",
    mode: opts.mode === "strict" ? "global-strict" : opts.topics ? "global-interleaved" : "items-only"
  });
  wiki.addTiddler({ title: deckMod2.DEFAULT_DECK + DECK_STUDY_SUFFIX, list: queue });
  enterCard(wiki, first);
  return first;
}
function modifiedMs(v) {
  if (v instanceof Date)
    return v.getTime();
  if (typeof v === "number" && Number.isFinite(v))
    return v;
  return schema4.tryParseTwDate(v)?.getTime() ?? 0;
}
function getActiveStudy(wiki) {
  if (!wiki || typeof wiki.getTiddler !== "function")
    return null;
  const s = getSession(wiki);
  if (s && s.list.length)
    return { list: s.list, source: "global" };
  let best = null;
  for (const d of deckMod2.listDecks(wiki)) {
    const study = wiki.getTiddler(d + DECK_STUDY_SUFFIX);
    const list = study && Array.isArray(study.fields.list) ? study.fields.list : [];
    if (!list.length)
      continue;
    const at = modifiedMs(study?.fields?.modified);
    if (!best || at > best.at)
      best = { title: d, list, at };
  }
  return best ? { list: best.list, source: "deck", deckTitle: best.title } : null;
}
function endSession(wiki) {
  if (!wiki || typeof wiki.deleteTiddler !== "function")
    return 0;
  undo.clearUndo();
  settleFocusAnchor(wiki);
  let n = 0;
  if (wiki.getTiddler(SESSION_TIDDLER)) {
    wiki.deleteTiddler(SESSION_TIDDLER);
    n++;
  }
  for (const d of deckMod2.listDecks(wiki)) {
    const t = d + DECK_STUDY_SUFFIX;
    if (wiki.getTiddler(t)) {
      wiki.deleteTiddler(t);
      n++;
    }
    n += deckMod2.burnSubsetDeck(wiki, d);
  }
  for (const t of wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${TEMP_PREFIX}]]`)) {
    wiki.deleteTiddler(t);
    n++;
  }
  return n;
}
function startFinalDrill(wiki, now = new Date()) {
  if (!wiki)
    return null;
  const queue = drill.getFinalDrillQueue(wiki, now);
  if (!queue || !queue.length)
    return null;
  setSession(wiki, { list: queue, mode: "final-drill", currentIndex: "0" });
  enterCard(wiki, queue[0], now);
  undo.clearUndo();
  return { list: queue, mode: "final-drill" };
}
function startCramSession(wiki, filterOrList, now = new Date()) {
  if (!wiki)
    return null;
  let list = [];
  if (Array.isArray(filterOrList)) {
    list = filterOrList.filter(Boolean);
  } else if (typeof filterOrList === "string" && typeof wiki.filterTiddlers === "function") {
    list = wiki.filterTiddlers(filterOrList);
  }
  if (!list.length)
    return null;
  setSession(wiki, { list, mode: "cram", currentIndex: "0" });
  enterCard(wiki, list[0], now);
  undo.clearUndo();
  return { list, mode: "cram" };
}
function prepareCardFold(wiki, title) {
  if (!wiki || typeof wiki.filterTiddlers !== "function" || !title)
    return;
  const f = wiki.getTiddler(title)?.fields;
  if (!f || f["tidme.kind"] !== "item")
    return;
  let text = "hide";
  for (const d of deckMod2.listDecks(wiki)) {
    if (!ns7.isFilterSafeTitle(d))
      continue;
    const unfoldFilter = String(wiki.getTiddler(d)?.fields?.card_unfold || "").trim();
    if (!unfoldFilter)
      continue;
    if (wiki.filterTiddlers(`[subfilter{${d}!!card_unfold}]`).includes(title)) {
      text = "show";
      break;
    }
  }
  wiki.addTiddler({ title: ns7.FOLDED_STATE_PREFIX + title, text });
}
function readFocusAnchor(wiki) {
  if (!wiki || typeof wiki.getTiddler !== "function")
    return null;
  const fields = wiki.getTiddler(ns7.CARD_OPEN_AT_TITLE)?.fields;
  if (!fields)
    return null;
  const at = schema4.tryParseTwDate(fields.text);
  if (!at)
    return null;
  return { card: String(fields.card || ""), at };
}
function recordFocus(wiki, card, at, now) {
  const sec = Math.round((now.getTime() - at.getTime()) / 1e3);
  if (sec < 0)
    return 0;
  if (sec > statsMod.FOCUS_SEGMENT_MAX_SECONDS) {
    console.warn("[tidme] \u4E13\u6CE8\u6BB5\u8D85\u4E0A\u9650\uFF0C\u6574\u6BB5\u4E22\u5F03:", card || "(\u672A\u77E5\u5361)", sec + "s");
    return 0;
  }
  const counted = Math.max(1, sec);
  const docId = String(wiki.getTiddler?.(card)?.fields?.["tidme.doc"] || "");
  statsMod.recordReadTime(wiki, docId, counted);
  return counted;
}
function settleFocusAnchor(wiki, now = new Date()) {
  if (!wiki || typeof wiki.deleteTiddler !== "function")
    return 0;
  const anchor = readFocusAnchor(wiki);
  wiki.deleteTiddler(ns7.CARD_OPEN_AT_TITLE);
  if (!anchor)
    return 0;
  return recordFocus(wiki, anchor.card, anchor.at, now);
}
function touchFocusAnchor(wiki, title, now = new Date()) {
  if (!wiki || typeof wiki.addTiddler !== "function")
    return;
  const cur = readFocusAnchor(wiki);
  if (cur && title && cur.card === title)
    return;
  if (cur)
    settleFocusAnchor(wiki, now);
  if (!title)
    return;
  if (wiki.getTiddler?.(title)?.fields?.["tidme.kind"] !== "item")
    return;
  wiki.addTiddler({ title: ns7.CARD_OPEN_AT_TITLE, text: schema4.twDateString(now), card: title });
}
function consumeFocusAnchor(wiki, title, now = new Date()) {
  const anchor = readFocusAnchor(wiki);
  if (!anchor) {
    if (wiki && typeof wiki.deleteTiddler === "function")
      wiki.deleteTiddler(ns7.CARD_OPEN_AT_TITLE);
    return 0;
  }
  if (anchor.card && anchor.card !== title) {
    settleFocusAnchor(wiki, now);
    return 0;
  }
  wiki.deleteTiddler(ns7.CARD_OPEN_AT_TITLE);
  return recordFocus(wiki, anchor.card || String(title || ""), anchor.at, now);
}
function enterCard(wiki, title, now = new Date()) {
  prepareCardFold(wiki, title);
  touchFocusAnchor(wiki, title, now);
}
var sched3, deckMod2, ns7, schema4, statsMod, undo, drill, DECK_STUDY_SUFFIX, TEMP_PREFIX, SESSION_TIDDLER;
var init_session = __esm({
  "src/tidme/core/session.ts"() {
    sched3 = (init_scheduler(), __toCommonJS(scheduler_exports));
    deckMod2 = (init_deck(), __toCommonJS(deck_exports));
    ns7 = (init_ns(), __toCommonJS(ns_exports));
    schema4 = (init_schema(), __toCommonJS(schema_exports));
    statsMod = (init_stats(), __toCommonJS(stats_exports));
    undo = (init_undo(), __toCommonJS(undo_exports));
    drill = (init_drill(), __toCommonJS(drill_exports));
    DECK_STUDY_SUFFIX = "/study";
    TEMP_PREFIX = "$:/temp/tidme/";
    SESSION_TIDDLER = "$:/state/tidme/learning-session";
  }
});

// src/tidme/core/title.ts
var title_exports = {};
__export(title_exports, {
  freeTitle: () => freeTitle,
  isTitleTaken: () => isTitleTaken
});
function isTitleTaken(wiki, title, pending) {
  const t = String(title || "");
  if (!t)
    return false;
  if (pending) {
    for (const p of pending)
      if (String(p || "") === t)
        return true;
  }
  return !!(wiki && typeof wiki.getTiddler === "function" && wiki.getTiddler(t));
}
function freeTitle(wiki, base, pending) {
  const b = String(base || "");
  if (!b)
    return b;
  let title = b;
  let i = 2;
  while (isTitleTaken(wiki, title, pending))
    title = `${b}-${i++}`;
  return title;
}
var init_title = __esm({
  "src/tidme/core/title.ts"() {
  }
});

// src/tidme/import/parse/main.ts
var main_exports = {};
__export(main_exports, {
  IMPORT_BAG_TITLE: () => IMPORT_BAG_TITLE,
  cleanTitle: () => cleanTitle,
  contentFingerprint: () => contentFingerprint,
  docRoot: () => docRoot,
  insertedSectionTitle: () => insertedSectionTitle,
  joinPath: () => joinPath,
  leafIdOf: () => leafIdOf,
  makeDocId: () => makeDocId,
  makeSectionId: () => makeSectionId,
  neighborsOf: () => neighborsOf,
  runImport: () => runImport,
  runSplit: () => runSplit,
  sectionLeaf: () => sectionLeaf,
  slugify: () => slugify
});
module.exports = __toCommonJS(main_exports);

// src/tidme/core/ids.ts
init_ns();
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
var SHA256_K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function sha256HexBytes(bytes) {
  const rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
  const l = bytes.length;
  const total = l + 9 + 63 & ~63;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[l] = 128;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(l / 536870912));
  dv.setUint32(total - 4, l << 3 >>> 0);
  const h = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++)
      w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = hh + S1 + ch + SHA256_K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++)
    out += h[i].toString(16).padStart(8, "0");
  return out;
}
async function hashHex(str) {
  const bytes = getEncoder().encode(str);
  try {
    const digest = await getSubtle().digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return sha256HexBytes(bytes);
  }
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
  const basis = [docId, breadcrumb.join(CRUMB_SEP), String(ordinal)].join("|");
  return "s" + await shortHash(basis, 12);
}

// src/tidme/import/parse/chunker.ts
init_schema();
var DEFAULTS = { maxChars: 4e3, minChars: 600 };
function cleanOptions(options = {}) {
  const out = {};
  if (Number.isFinite(options.maxChars) && options.maxChars > 0)
    out.maxChars = options.maxChars;
  if (Number.isFinite(options.minChars) && options.minChars >= 0)
    out.minChars = options.minChars;
  return out;
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
  const stack2 = [{ level: 0, children: roots }];
  let current = null;
  const preamble = [];
  for (const b of blocks) {
    if (b.isHeading) {
      while (stack2.length > 1 && stack2[stack2.length - 1].level >= b.level)
        stack2.pop();
      const parent = stack2[stack2.length - 1];
      const node = { level: b.level, text: b.text, blocks: [], children: [] };
      parent.children.push(node);
      stack2.push({ level: b.level, children: node.children });
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
function finalizeSections(sections) {
  sections.forEach((sec, i) => {
    deriveSection(sec);
    sec.ordinal = i;
  });
  return sections;
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
    const fallbackTitle = crumbBase[crumbBase.length - 1] || String(p.fileName || "").replace(/.*\//, "").replace(/\.[a-z0-9]+$/i, "") || "Body";
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
    leaves.unshift({ node: { level: headings[0].level, text: "Preface", blocks: preamble, children: [] }, trail: [...crumbBase, "Preface"] });
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
function chunkBook(files, options = {}) {
  const stats = { hardSplitCount: 0, sections: 0 };
  const sections = [];
  for (const f of files) {
    const secs = chunkFile({ blocks: f.blocks, fileBreadcrumb: f.fileBreadcrumb, fileName: f.fileName, options }, stats);
    secs.forEach((s, i) => sections.push(__spreadProps(__spreadValues({}, s), { file: f.fileName, orderInFile: i })));
  }
  sections.forEach((s, idx) => {
    s.ordinal = idx;
    if (s.isContinuation) {
      const base = s.trail.length ? s.trail[s.trail.length - 1] : "Cont.";
      s.trail = [...s.trail.slice(0, -1), `${base} (cont.)`];
    }
    if (!s.title)
      s.title = s.trail[s.trail.length - 1] || "Cont.";
  });
  const final = finalizeSections(sections);
  stats.sections = final.length;
  return { sections: final, stats };
}

// src/tidme/import/parse/vendor/foliate/epubcfi.js
var findIndices = (arr, f) => arr.map((x, i, a) => f(x, i, a) ? i : null).filter((x) => x != null);
var splitAt = (arr, is) => [-1, ...is, arr.length].reduce(({ xs, a }, b) => {
  var _a;
  return { xs: (_a = xs == null ? void 0 : xs.concat([arr.slice(a + 1, b)])) != null ? _a : [], a: b };
}, {}).xs;
var concatArrays = (a, b) => a.slice(0, -1).concat([a[a.length - 1].concat(b[0])]).concat(b.slice(1));
var isNumber = /\d/;
var isCFI = /^epubcfi\((.*)\)$/;
var escapeCFI = (str) => str.replace(/[\^[\](),;=]/g, "^$&");
var wrap = (x) => isCFI.test(x) ? x : `epubcfi(${x})`;
var unwrap = (x) => {
  var _a, _b;
  return (_b = (_a = x.match(isCFI)) == null ? void 0 : _a[1]) != null ? _b : x;
};
var lift = (f) => (...xs) => `epubcfi(${f(...xs.map((x) => {
  var _a, _b;
  return (_b = (_a = x.match(isCFI)) == null ? void 0 : _a[1]) != null ? _b : x;
}))})`;
var joinIndir = lift((...xs) => xs.join("!"));
var tokenizer = (str) => {
  const tokens = [];
  let state, escape, value = "";
  const push = (x) => (tokens.push(x), state = null, value = "");
  const cat = (x) => (value += x, escape = false);
  for (const char of Array.from(str.trim()).concat("")) {
    if (char === "^" && !escape) {
      escape = true;
      continue;
    }
    if (state === "!")
      push(["!"]);
    else if (state === ",")
      push([","]);
    else if (state === "/" || state === ":") {
      if (isNumber.test(char)) {
        cat(char);
        continue;
      } else
        push([state, parseInt(value)]);
    } else if (state === "~") {
      if (isNumber.test(char) || char === ".") {
        cat(char);
        continue;
      } else
        push(["~", parseFloat(value)]);
    } else if (state === "@") {
      if (char === ":") {
        push(["@", parseFloat(value)]);
        state = "@";
        continue;
      }
      if (isNumber.test(char) || char === ".") {
        cat(char);
        continue;
      } else
        push(["@", parseFloat(value)]);
    } else if (state === "[") {
      if (char === ";" && !escape) {
        push(["[", value]);
        state = ";";
      } else if (char === "," && !escape) {
        push(["[", value]);
        state = "[";
      } else if (char === "]" && !escape)
        push(["[", value]);
      else
        cat(char);
      continue;
    } else if (state == null ? void 0 : state.startsWith(";")) {
      if (char === "=" && !escape) {
        state = `;${value}`;
        value = "";
      } else if (char === ";" && !escape) {
        push([state, value]);
        state = ";";
      } else if (char === "]" && !escape)
        push([state, value]);
      else
        cat(char);
      continue;
    }
    if (char === "/" || char === ":" || char === "~" || char === "@" || char === "[" || char === "!" || char === ",")
      state = char;
  }
  return tokens;
};
var findTokens = (tokens, x) => findIndices(tokens, ([t]) => t === x);
var parser = (tokens) => {
  var _a, _b;
  const parts = [];
  let state;
  for (const [type, val] of tokens) {
    if (type === "/")
      parts.push({ index: val });
    else {
      const last = parts[parts.length - 1];
      if (type === ":")
        last.offset = val;
      else if (type === "~")
        last.temporal = val;
      else if (type === "@")
        last.spatial = ((_a = last.spatial) != null ? _a : []).concat(val);
      else if (type === ";s")
        last.side = val;
      else if (type === "[") {
        if (state === "/" && val)
          last.id = val;
        else {
          last.text = ((_b = last.text) != null ? _b : []).concat(val);
          continue;
        }
      }
    }
    state = type;
  }
  return parts;
};
var parserIndir = (tokens) => splitAt(tokens, findTokens(tokens, "!")).map(parser);
var parse = (cfi) => {
  const tokens = tokenizer(unwrap(cfi));
  const commas = findTokens(tokens, ",");
  if (!commas.length)
    return parserIndir(tokens);
  const [parent, start, end] = splitAt(tokens, commas).map(parserIndir);
  return { parent, start, end };
};
var partToString = ({ index, id, offset, temporal, spatial, text, side }) => {
  var _a, _b;
  const param = side ? `;s=${side}` : "";
  return `/${index}` + (id ? `[${escapeCFI(id)}${param}]` : "") + (offset != null && index % 2 ? `:${offset}` : "") + (temporal ? `~${temporal}` : "") + (spatial ? `@${spatial.join(":")}` : "") + (text || !id && side ? "[" + ((_b = (_a = text == null ? void 0 : text.map(escapeCFI)) == null ? void 0 : _a.join(",")) != null ? _b : "") + param + "]" : "");
};
var toInnerString = (parsed) => parsed.parent ? [parsed.parent, parsed.start, parsed.end].map(toInnerString).join(",") : parsed.map((parts) => parts.map(partToString).join("")).join("!");
var toString = (parsed) => wrap(toInnerString(parsed));
var collapse = (x, toEnd) => typeof x === "string" ? toString(collapse(parse(x), toEnd)) : x.parent ? concatArrays(x.parent, x[toEnd ? "end" : "start"]) : x;
var isTextNode = ({ nodeType }) => nodeType === 3 || nodeType === 4;
var isElementNode = ({ nodeType }) => nodeType === 1;
var getChildNodes = (node, filter) => {
  const nodes = Array.from(node.childNodes).filter((node2) => isTextNode(node2) || isElementNode(node2));
  return filter ? nodes.map((node2) => {
    const accept = filter(node2);
    if (accept === NodeFilter.FILTER_REJECT)
      return null;
    else if (accept === NodeFilter.FILTER_SKIP)
      return getChildNodes(node2, filter);
    else
      return node2;
  }).flat().filter((x) => x) : nodes;
};
var indexChildNodes = (node, filter) => {
  const nodes = getChildNodes(node, filter).reduce((arr, node2) => {
    let last = arr[arr.length - 1];
    if (!last)
      arr.push(node2);
    else if (isTextNode(node2)) {
      if (Array.isArray(last))
        last.push(node2);
      else if (isTextNode(last))
        arr[arr.length - 1] = [last, node2];
      else
        arr.push(node2);
    } else {
      if (isElementNode(last))
        arr.push(null, node2);
      else
        arr.push(node2);
    }
    return arr;
  }, []);
  if (isElementNode(nodes[0]))
    nodes.unshift("first");
  if (isElementNode(nodes[nodes.length - 1]))
    nodes.push("last");
  nodes.unshift("before");
  nodes.push("after");
  return nodes;
};
var partsToNode = (node, parts, filter) => {
  var _a, _b;
  const { id } = parts[parts.length - 1];
  if (id) {
    const el = node.ownerDocument.getElementById(id);
    if (el)
      return { node: el, offset: 0 };
  }
  for (const { index } of parts) {
    const newNode = node ? indexChildNodes(node, filter)[index] : null;
    if (newNode === "first")
      return { node: (_a = node.firstChild) != null ? _a : node };
    if (newNode === "last")
      return { node: (_b = node.lastChild) != null ? _b : node };
    if (newNode === "before")
      return { node, before: true };
    if (newNode === "after")
      return { node, after: true };
    node = newNode;
  }
  const { offset } = parts[parts.length - 1];
  if (!Array.isArray(node))
    return { node, offset };
  let sum = 0;
  for (const n of node) {
    const { length } = n.nodeValue;
    if (sum + length >= offset)
      return { node: n, offset: offset - sum };
    sum += length;
  }
};
var nodeToParts = (node, offset, filter) => {
  const { parentNode, id } = node;
  const indexed = indexChildNodes(parentNode, filter);
  const index = indexed.findIndex((x) => Array.isArray(x) ? x.some((x2) => x2 === node) : x === node);
  const chunk = indexed[index];
  if (Array.isArray(chunk)) {
    let sum = 0;
    for (const x of chunk) {
      if (x === node) {
        sum += offset;
        break;
      } else
        sum += x.nodeValue.length;
    }
    offset = sum;
  }
  const part = { id, index, offset };
  return (parentNode !== node.ownerDocument.documentElement ? nodeToParts(parentNode, null, filter).concat(part) : [part]).filter((x) => x.index !== -1);
};
var toRange = (doc, parts, filter) => {
  const startParts = collapse(parts);
  const endParts = collapse(parts, true);
  const root = doc.documentElement;
  const start = partsToNode(root, startParts[0], filter);
  const end = partsToNode(root, endParts[0], filter);
  const range = doc.createRange();
  if (start.before)
    range.setStartBefore(start.node);
  else if (start.after)
    range.setStartAfter(start.node);
  else
    range.setStart(start.node, start.offset);
  if (end.before)
    range.setEndBefore(end.node);
  else if (end.after)
    range.setEndAfter(end.node);
  else
    range.setEnd(end.node, end.offset);
  return range;
};
var fromElements = (elements) => {
  const results = [];
  const { parentNode } = elements[0];
  const parts = nodeToParts(parentNode);
  for (const [index, node] of indexChildNodes(parentNode).entries()) {
    const el = elements[results.length];
    if (node === el) {
      results.push(toString([parts.concat({ id: el.id, index })]));
    }
  }
  return results;
};
var toElement = (doc, parts) => partsToNode(doc.documentElement, collapse(parts)).node;

// src/tidme/import/parse/vendor/foliate/epub.js
var EventTarget = globalThis.EventTarget || class EventTarget2 {
  addEventListener() {
  }
  removeEventListener() {
  }
  dispatchEvent() {
    return true;
  }
};
var CustomEvent = globalThis.CustomEvent || class CustomEvent2 {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : void 0;
  }
};
var NS = {
  CONTAINER: "urn:oasis:names:tc:opendocument:xmlns:container",
  XHTML: "http://www.w3.org/1999/xhtml",
  OPF: "http://www.idpf.org/2007/opf",
  EPUB: "http://www.idpf.org/2007/ops",
  DC: "http://purl.org/dc/elements/1.1/",
  DCTERMS: "http://purl.org/dc/terms/",
  ENC: "http://www.w3.org/2001/04/xmlenc#",
  NCX: "http://www.daisy.org/z3986/2005/ncx/",
  XLINK: "http://www.w3.org/1999/xlink",
  SMIL: "http://www.w3.org/ns/SMIL"
};
var MIME = {
  XML: "application/xml",
  NCX: "application/x-dtbncx+xml",
  XHTML: "application/xhtml+xml",
  HTML: "text/html",
  CSS: "text/css",
  SVG: "image/svg+xml",
  JS: /\/(x-)?(javascript|ecmascript)/
};
var PREFIX = {
  a11y: "http://www.idpf.org/epub/vocab/package/a11y/#",
  dcterms: "http://purl.org/dc/terms/",
  marc: "http://id.loc.gov/vocabulary/",
  media: "http://www.idpf.org/epub/vocab/overlays/#",
  onix: "http://www.editeur.org/ONIX/book/codelists/current.html#",
  rendition: "http://www.idpf.org/vocab/rendition/#",
  schema: "http://schema.org/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  msv: "http://www.idpf.org/epub/vocab/structure/magazine/#",
  prism: "http://www.prismstandard.org/specifications/3.0/PRISM_CV_Spec_3.0.htm#"
};
var RELATORS = {
  art: "artist",
  aut: "author",
  clr: "colorist",
  edt: "editor",
  ill: "illustrator",
  nrt: "narrator",
  trl: "translator",
  pbl: "publisher"
};
var ONIX5 = {
  "02": "isbn",
  "06": "doi",
  "15": "isbn",
  "26": "doi",
  "34": "issn"
};
var camel = (x) => x.toLowerCase().replace(/[-:](.)/g, (_, g) => g.toUpperCase());
var normalizeWhitespace = (str) => str ? str.replace(/[\t\n\f\r ]+/g, " ").replace(/^[\t\n\f\r ]+/, "").replace(/[\t\n\f\r ]+$/, "") : "";
var filterAttribute = (attr, value, isList) => isList ? (el) => {
  var _a, _b;
  return (_b = (_a = el.getAttribute(attr)) == null ? void 0 : _a.split(/\s/)) == null ? void 0 : _b.includes(value);
} : typeof value === "function" ? (el) => value(el.getAttribute(attr)) : (el) => el.getAttribute(attr) === value;
var getAttributes = (...xs) => (el) => el ? Object.fromEntries(xs.map((x) => [camel(x), el.getAttribute(x)])) : null;
var getElementText = (el) => normalizeWhitespace(el == null ? void 0 : el.textContent);
var childGetter = (doc, ns9) => {
  const useNS = doc.lookupNamespaceURI(null) === ns9 || doc.lookupPrefix(ns9);
  const f = useNS ? (el, name) => (el2) => el2.namespaceURI === ns9 && el2.localName === name : (el, name) => (el2) => el2.localName === name;
  return {
    $: (el, name) => [...el.children].find(f(el, name)),
    $$: (el, name) => [...el.children].filter(f(el, name)),
    $$$: useNS ? (el, name) => [...el.getElementsByTagNameNS(ns9, name)] : (el, name) => [...el.getElementsByTagName(name)]
  };
};
var resolveURL = (url, relativeTo) => {
  try {
    url = url.replace(/%2c/, ",");
    if (relativeTo.includes(":") && !relativeTo.startsWith("OEBPS"))
      return new URL(url, relativeTo);
    const root = "https://invalid.invalid/";
    const obj = new URL(url, root + relativeTo);
    obj.search = "";
    return decodeURI(obj.href.replace(root, ""));
  } catch (e) {
    console.warn(e);
    return url;
  }
};
var isExternal = (uri) => /^(?!blob)\w+:/i.test(uri);
var pathRelative = (from, to) => {
  if (!from)
    return to;
  const as = from.replace(/\/$/, "").split("/");
  const bs = to.replace(/\/$/, "").split("/");
  const i = (as.length > bs.length ? as : bs).findIndex((_, i2) => as[i2] !== bs[i2]);
  return i < 0 ? "" : Array(as.length - i).fill("..").concat(bs.slice(i)).join("/");
};
var pathDirname = (str) => str.slice(0, str.lastIndexOf("/") + 1);
var replaceSeries = (str, regex, f) => __async(void 0, null, function* () {
  const matches = [];
  str.replace(regex, (...args) => (matches.push(args), null));
  const results = [];
  for (const args of matches)
    results.push(yield f(...args));
  return str.replace(regex, () => results.shift());
});
var regexEscape = (str) => str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
var tidy = (obj) => {
  for (const [key, val] of Object.entries(obj)) {
    if (val == null)
      delete obj[key];
    else if (Array.isArray(val)) {
      obj[key] = val.filter((x) => x).map((x) => typeof x === "object" && !Array.isArray(x) ? tidy(x) : x);
      if (!obj[key].length)
        delete obj[key];
      else if (obj[key].length === 1)
        obj[key] = obj[key][0];
    } else if (typeof val === "object") {
      obj[key] = tidy(val);
      if (!Object.keys(val).length)
        delete obj[key];
    }
  }
  const keys = Object.keys(obj);
  if (keys.length === 1 && keys[0] === "name")
    return obj[keys[0]];
  return obj;
};
var getPrefixes = (doc) => {
  const map = new Map(Object.entries(PREFIX));
  const value = doc.documentElement.getAttributeNS(NS.EPUB, "prefix") || doc.documentElement.getAttribute("prefix");
  if (value) {
    for (const [, prefix, url] of value.matchAll(/(.+): +(.+)[ \t\r\n]*/g))
      map.set(prefix, url);
  }
  return map;
};
var getPropertyURL = (value, prefixes) => {
  if (!value)
    return null;
  const [a, b] = value.split(":");
  const prefix = b ? a : null;
  const reference = b ? b : a;
  const baseURL = prefixes.get(prefix);
  return baseURL ? baseURL + reference : null;
};
var getMetadata = (opf) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K;
  const { $ } = childGetter(opf, NS.OPF);
  const $metadata = $(opf.documentElement, "metadata");
  const els = Object.groupBy($metadata.children, (el) => el.namespaceURI === NS.DC ? "dc" : el.namespaceURI === NS.OPF && el.localName === "meta" ? el.hasAttribute("name") ? "legacyMeta" : "meta" : "");
  const baseLang = (_b = (_a = $metadata.getAttribute("xml:lang")) != null ? _a : opf.documentElement.getAttribute("xml:lang")) != null ? _b : "und";
  const prefixes = getPrefixes(opf);
  const parse2 = (el) => {
    var _a2, _b2;
    const property = el.getAttribute("property");
    const scheme = el.getAttribute("scheme");
    return {
      property: (_a2 = getPropertyURL(property, prefixes)) != null ? _a2 : property,
      scheme: (_b2 = getPropertyURL(scheme, prefixes)) != null ? _b2 : scheme,
      lang: el.getAttribute("xml:lang"),
      value: getElementText(el),
      props: getProperties(el),
      attrs: Object.fromEntries(
        Array.from(el.attributes).filter((attr) => attr.namespaceURI === NS.OPF).map((attr) => [attr.localName, attr.value])
      )
    };
  };
  const refines = Map.groupBy((_c = els.meta) != null ? _c : [], (el) => el.getAttribute("refines"));
  const getProperties = (el) => {
    const els2 = refines.get(el ? "#" + el.getAttribute("id") : null);
    if (!els2)
      return null;
    return Object.groupBy(els2.map(parse2), (x) => x.property);
  };
  const dc = Object.fromEntries(
    Object.entries(Object.groupBy(els.dc || [], (el) => el.localName)).map(([name, els2]) => [name, els2.map(parse2)])
  );
  const properties = (_d = getProperties()) != null ? _d : {};
  const legacyMeta = Object.fromEntries((_f = (_e = els.legacyMeta) == null ? void 0 : _e.map((el) => [el.getAttribute("name"), el.getAttribute("content")])) != null ? _f : []);
  const one = (x) => {
    var _a2;
    return (_a2 = x == null ? void 0 : x[0]) == null ? void 0 : _a2.value;
  };
  const prop = (x, p) => {
    var _a2;
    return one((_a2 = x == null ? void 0 : x.props) == null ? void 0 : _a2[p]);
  };
  const makeLanguageMap = (x) => {
    var _a2, _b2, _c2, _d2, _e2;
    if (!x)
      return null;
    const alts = (_b2 = (_a2 = x.props) == null ? void 0 : _a2["alternate-script"]) != null ? _b2 : [];
    const altRep = x.attrs["alt-rep"];
    if (!alts.length && (!x.lang || x.lang === baseLang) && !altRep)
      return x.value;
    const map = { [(_c2 = x.lang) != null ? _c2 : baseLang]: x.value };
    if (altRep)
      map[x.attrs["alt-rep-lang"]] = altRep;
    for (const y of alts)
      (_e2 = map[_d2 = y.lang]) != null ? _e2 : map[_d2] = y.value;
    return map;
  };
  const makeContributor = (x) => {
    var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _i2;
    return x ? {
      name: makeLanguageMap(x),
      sortAs: (_c2 = makeLanguageMap((_b2 = (_a2 = x.props) == null ? void 0 : _a2["file-as"]) == null ? void 0 : _b2[0])) != null ? _c2 : x.attrs["file-as"],
      role: (_g2 = (_f2 = (_e2 = (_d2 = x.props) == null ? void 0 : _d2.role) == null ? void 0 : _e2.filter((x2) => x2.scheme === PREFIX.marc + "relators")) == null ? void 0 : _f2.map((x2) => x2.value)) != null ? _g2 : [x.attrs.role],
      code: (_h2 = prop(x, "term")) != null ? _h2 : x.attrs.term,
      scheme: (_i2 = prop(x, "authority")) != null ? _i2 : x.attrs.authority
    } : null;
  };
  const makeCollection = (x) => {
    var _a2;
    return {
      name: makeLanguageMap(x),
      position: one((_a2 = x.props) == null ? void 0 : _a2["group-position"])
    };
  };
  const makeAltIdentifier = (x) => {
    var _a2;
    const { value } = x;
    if (/^urn:/i.test(value))
      return value;
    if (/^doi:/i.test(value))
      return `urn:${value}`;
    const type = (_a2 = x.props) == null ? void 0 : _a2["identifier-type"];
    if (!type) {
      const scheme = x.attrs.scheme;
      if (!scheme)
        return value;
      if (/^(doi|isbn|uuid)$/i.test(scheme))
        return `urn:${scheme}:${value}`;
      return { scheme, value };
    }
    if (type.scheme === PREFIX.onix + "codelist5") {
      const nid = ONIX5[type.value];
      if (nid)
        return `urn:${nid}:${value}`;
    }
    return value;
  };
  const belongsTo = Object.groupBy((_g = properties["belongs-to-collection"]) != null ? _g : [], (x) => prop(x, "collection-type") === "series" ? "series" : "collection");
  const mainTitle = (_j = (_h = dc.title) == null ? void 0 : _h.find((x) => prop(x, "title-type") === "main")) != null ? _j : (_i = dc.title) == null ? void 0 : _i[0];
  const metadata = {
    identifier: getIdentifier(opf),
    title: makeLanguageMap(mainTitle),
    sortAs: (_o = (_n = makeLanguageMap((_l = (_k = mainTitle == null ? void 0 : mainTitle.props) == null ? void 0 : _k["file-as"]) == null ? void 0 : _l[0])) != null ? _n : (_m = mainTitle == null ? void 0 : mainTitle.attrs) == null ? void 0 : _m["file-as"]) != null ? _o : legacyMeta == null ? void 0 : legacyMeta["calibre:title_sort"],
    subtitle: (_q = (_p = dc.title) == null ? void 0 : _p.find((x) => prop(x, "title-type") === "subtitle")) == null ? void 0 : _q.value,
    language: (_r = dc.language) == null ? void 0 : _r.map((x) => x.value),
    description: one(dc.description),
    publisher: makeContributor((_s = dc.publisher) == null ? void 0 : _s[0]),
    published: (_v = (_u = (_t = dc.date) == null ? void 0 : _t.find((x) => x.attrs.event === "publication")) == null ? void 0 : _u.value) != null ? _v : one(dc.date),
    modified: (_y = one(properties[PREFIX.dcterms + "modified"])) != null ? _y : (_x = (_w = dc.date) == null ? void 0 : _w.find((x) => x.attrs.event === "modification")) == null ? void 0 : _x.value,
    subject: (_z = dc.subject) == null ? void 0 : _z.map(makeContributor),
    belongsTo: {
      collection: (_A = belongsTo.collection) == null ? void 0 : _A.map(makeCollection),
      series: ((_C = (_B = belongsTo.series) == null ? void 0 : _B.map(makeCollection)) != null ? _C : legacyMeta == null ? void 0 : legacyMeta["calibre:series"]) ? {
        name: legacyMeta == null ? void 0 : legacyMeta["calibre:series"],
        position: parseFloat(legacyMeta == null ? void 0 : legacyMeta["calibre:series_index"])
      } : null
    },
    altIdentifier: (_D = dc.identifier) == null ? void 0 : _D.map(makeAltIdentifier),
    source: (_E = dc.source) == null ? void 0 : _E.map(makeAltIdentifier),
    rights: one(dc.rights)
  };
  const remapContributor = (defaultKey) => (x) => {
    var _a2;
    const keys = new Set((_a2 = x.role) == null ? void 0 : _a2.map((role) => {
      var _a3;
      return (_a3 = RELATORS[role]) != null ? _a3 : defaultKey;
    }));
    return [keys.size ? keys : [defaultKey], x];
  };
  for (const [keys, val] of [].concat(
    (_H = (_G = (_F = dc.creator) == null ? void 0 : _F.map(makeContributor)) == null ? void 0 : _G.map(remapContributor("author"))) != null ? _H : [],
    (_K = (_J = (_I = dc.contributor) == null ? void 0 : _I.map(makeContributor)) == null ? void 0 : _J.map(remapContributor("contributor"))) != null ? _K : []
  )) {
    for (const key of keys) {
      if (metadata[key])
        metadata[key].push(val);
      else
        metadata[key] = [val];
    }
  }
  tidy(metadata);
  if (metadata.altIdentifier === metadata.identifier) {
    delete metadata.altIdentifier;
  }
  const rendition = {};
  const media = {};
  for (const [key, val] of Object.entries(properties)) {
    if (key.startsWith(PREFIX.rendition)) {
      rendition[camel(key.replace(PREFIX.rendition, ""))] = one(val);
    } else if (key.startsWith(PREFIX.media)) {
      media[camel(key.replace(PREFIX.media, ""))] = one(val);
    }
  }
  if (media.duration)
    media.duration = parseClock(media.duration);
  return { metadata, rendition, media };
};
var parseNav = (doc, resolve = (f) => f) => {
  var _a, _b;
  const { $, $$, $$$ } = childGetter(doc, NS.XHTML);
  const resolveHref = (href) => href ? decodeURI(resolve(href)) : null;
  const parseLI = (getType) => ($li) => {
    var _a2, _b2;
    const $a = (_a2 = $($li, "a")) != null ? _a2 : $($li, "span");
    const $ol = $($li, "ol");
    const href = resolveHref($a == null ? void 0 : $a.getAttribute("href"));
    const label = getElementText($a) || ($a == null ? void 0 : $a.getAttribute("title"));
    const result = { label, href, subitems: parseOL($ol) };
    if (getType)
      result.type = (_b2 = $a == null ? void 0 : $a.getAttributeNS(NS.EPUB, "type")) == null ? void 0 : _b2.split(/\s/);
    return result;
  };
  const parseOL = ($ol, getType) => $ol ? $$($ol, "li").map(parseLI(getType)) : null;
  const parseNav2 = ($nav, getType) => parseOL($($nav, "ol"), getType);
  const $$nav = $$$(doc, "nav");
  let toc = null, pageList = null, landmarks = null, others = [];
  for (const $nav of $$nav) {
    const type = (_b = (_a = $nav.getAttributeNS(NS.EPUB, "type")) == null ? void 0 : _a.split(/\s/)) != null ? _b : [];
    if (type.includes("toc"))
      toc != null ? toc : toc = parseNav2($nav);
    else if (type.includes("page-list"))
      pageList != null ? pageList : pageList = parseNav2($nav);
    else if (type.includes("landmarks"))
      landmarks != null ? landmarks : landmarks = parseNav2($nav, true);
    else {
      others.push({
        label: getElementText($nav.firstElementChild),
        type,
        list: parseNav2($nav)
      });
    }
  }
  return { toc, pageList, landmarks, others };
};
var parseNCX = (doc, resolve = (f) => f) => {
  const { $, $$ } = childGetter(doc, NS.NCX);
  const resolveHref = (href) => href ? decodeURI(resolve(href)) : null;
  const parseItem = (el) => {
    const $label = $(el, "navLabel");
    const $content = $(el, "content");
    const label = getElementText($label);
    const href = resolveHref($content.getAttribute("src"));
    if (el.localName === "navPoint") {
      const els = $$(el, "navPoint");
      return { label, href, subitems: els.length ? els.map(parseItem) : null };
    }
    return { label, href };
  };
  const parseList = (el, itemName) => $$(el, itemName).map(parseItem);
  const getSingle = (container, itemName) => {
    const $container = $(doc.documentElement, container);
    return $container ? parseList($container, itemName) : null;
  };
  return {
    toc: getSingle("navMap", "navPoint"),
    pageList: getSingle("pageList", "pageTarget"),
    others: $$(doc.documentElement, "navList").map((el) => ({
      label: getElementText($(el, "navLabel")),
      list: parseList(el, "navTarget")
    }))
  };
};
var parseClock = (str) => {
  if (!str)
    return;
  const parts = str.split(":").map((x2) => parseFloat(x2));
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 60 * 60 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  const [x, unit] = str.split(/(?=[^\d.])/);
  const n = parseFloat(x);
  const f = unit === "h" ? 60 * 60 : unit === "min" ? 60 : unit === "ms" ? 1e-3 : 1;
  return n * f;
};
var _entries, _lastMediaOverlayItem, _sectionIndex, _audioIndex, _itemIndex, _audio, _volume, _rate, _state, _loadSMIL, loadSMIL_fn, _activeAudio, activeAudio_get, _activeItem, activeItem_get, _error, error_fn, _highlight, highlight_fn, _unhighlight, unhighlight_fn, _play, play_fn, _stop, stop_fn;
var MediaOverlay = class extends EventTarget {
  constructor(book, loadXML) {
    super();
    __privateAdd(this, _loadSMIL);
    __privateAdd(this, _activeAudio);
    __privateAdd(this, _activeItem);
    __privateAdd(this, _error);
    __privateAdd(this, _highlight);
    __privateAdd(this, _unhighlight);
    __privateAdd(this, _play);
    __privateAdd(this, _stop);
    __privateAdd(this, _entries, void 0);
    __privateAdd(this, _lastMediaOverlayItem, void 0);
    __privateAdd(this, _sectionIndex, void 0);
    __privateAdd(this, _audioIndex, void 0);
    __privateAdd(this, _itemIndex, void 0);
    __privateAdd(this, _audio, void 0);
    __privateAdd(this, _volume, 1);
    __privateAdd(this, _rate, 1);
    __privateAdd(this, _state, void 0);
    this.book = book;
    this.loadXML = loadXML;
  }
  start(sectionIndex, filter = () => true) {
    return __async(this, null, function* () {
      var _a;
      (_a = __privateGet(this, _audio)) == null ? void 0 : _a.pause();
      const section = this.book.sections[sectionIndex];
      const href = section == null ? void 0 : section.id;
      if (!href)
        return;
      const { mediaOverlay } = section;
      if (!mediaOverlay)
        return this.start(sectionIndex + 1);
      __privateSet(this, _sectionIndex, sectionIndex);
      yield __privateMethod(this, _loadSMIL, loadSMIL_fn).call(this, mediaOverlay);
      for (let i = 0; i < __privateGet(this, _entries).length; i++) {
        const { items } = __privateGet(this, _entries)[i];
        for (let j = 0; j < items.length; j++) {
          if (items[j].text.split("#")[0] === href && filter(items[j], j, items)) {
            return __privateMethod(this, _play, play_fn).call(this, i, j).catch((e) => __privateMethod(this, _error, error_fn).call(this, e));
          }
        }
      }
    });
  }
  pause() {
    var _a;
    __privateSet(this, _state, "paused");
    (_a = __privateGet(this, _audio)) == null ? void 0 : _a.pause();
  }
  resume() {
    var _a;
    __privateSet(this, _state, "playing");
    (_a = __privateGet(this, _audio)) == null ? void 0 : _a.play().catch((e) => __privateMethod(this, _error, error_fn).call(this, e));
  }
  stop() {
    __privateSet(this, _state, "stopped");
    __privateMethod(this, _stop, stop_fn).call(this);
  }
  prev() {
    if (__privateGet(this, _itemIndex) > 0)
      __privateMethod(this, _play, play_fn).call(this, __privateGet(this, _audioIndex), __privateGet(this, _itemIndex) - 1);
    else if (__privateGet(this, _audioIndex) > 0)
      __privateMethod(this, _play, play_fn).call(this, __privateGet(this, _audioIndex) - 1, __privateGet(this, _entries)[__privateGet(this, _audioIndex) - 1].items.length - 1);
    else if (__privateGet(this, _sectionIndex) > 0) {
      this.start(__privateGet(this, _sectionIndex) - 1, (_, i, items) => i === items.length - 1);
    }
  }
  next() {
    __privateMethod(this, _play, play_fn).call(this, __privateGet(this, _audioIndex), __privateGet(this, _itemIndex) + 1);
  }
  setVolume(volume) {
    __privateSet(this, _volume, volume);
    if (__privateGet(this, _audio))
      __privateGet(this, _audio).volume = volume;
  }
  setRate(rate) {
    __privateSet(this, _rate, rate);
    if (__privateGet(this, _audio))
      __privateGet(this, _audio).playbackRate = rate;
  }
};
_entries = new WeakMap();
_lastMediaOverlayItem = new WeakMap();
_sectionIndex = new WeakMap();
_audioIndex = new WeakMap();
_itemIndex = new WeakMap();
_audio = new WeakMap();
_volume = new WeakMap();
_rate = new WeakMap();
_state = new WeakMap();
_loadSMIL = new WeakSet();
loadSMIL_fn = function(item) {
  return __async(this, null, function* () {
    if (__privateGet(this, _lastMediaOverlayItem) === item)
      return;
    const doc = yield this.loadXML(item.href);
    const resolve = (href) => href ? resolveURL(href, item.href) : null;
    const { $, $$$ } = childGetter(doc, NS.SMIL);
    __privateSet(this, _audioIndex, -1);
    __privateSet(this, _itemIndex, -1);
    __privateSet(this, _entries, $$$(doc, "par").reduce((arr, $par) => {
      var _a;
      const text = resolve((_a = $($par, "text")) == null ? void 0 : _a.getAttribute("src"));
      const $audio = $($par, "audio");
      if (!text || !$audio)
        return arr;
      const src = resolve($audio.getAttribute("src"));
      const begin = parseClock($audio.getAttribute("clipBegin"));
      const end = parseClock($audio.getAttribute("clipEnd"));
      const last = arr.at(-1);
      if ((last == null ? void 0 : last.src) === src)
        last.items.push({ text, begin, end });
      else
        arr.push({ src, items: [{ text, begin, end }] });
      return arr;
    }, []));
    __privateSet(this, _lastMediaOverlayItem, item);
  });
};
_activeAudio = new WeakSet();
activeAudio_get = function() {
  return __privateGet(this, _entries)[__privateGet(this, _audioIndex)];
};
_activeItem = new WeakSet();
activeItem_get = function() {
  var _a, _b;
  return (_b = (_a = __privateGet(this, _activeAudio, activeAudio_get)) == null ? void 0 : _a.items) == null ? void 0 : _b[__privateGet(this, _itemIndex)];
};
_error = new WeakSet();
error_fn = function(e) {
  console.error(e);
  this.dispatchEvent(new CustomEvent("error", { detail: e }));
};
_highlight = new WeakSet();
highlight_fn = function() {
  this.dispatchEvent(new CustomEvent("highlight", { detail: __privateGet(this, _activeItem, activeItem_get) }));
};
_unhighlight = new WeakSet();
unhighlight_fn = function() {
  this.dispatchEvent(new CustomEvent("unhighlight", { detail: __privateGet(this, _activeItem, activeItem_get) }));
};
_play = new WeakSet();
play_fn = function(audioIndex, itemIndex) {
  return __async(this, null, function* () {
    var _a, _b;
    __privateMethod(this, _stop, stop_fn).call(this);
    __privateSet(this, _audioIndex, audioIndex);
    __privateSet(this, _itemIndex, itemIndex);
    const src = (_a = __privateGet(this, _activeAudio, activeAudio_get)) == null ? void 0 : _a.src;
    if (!src || !__privateGet(this, _activeItem, activeItem_get))
      return this.start(__privateGet(this, _sectionIndex) + 1);
    const url = URL.createObjectURL(yield this.book.loadBlob(src));
    const audio = new Audio(url);
    __privateSet(this, _audio, audio);
    audio.volume = __privateGet(this, _volume);
    audio.playbackRate = __privateGet(this, _rate);
    audio.addEventListener("timeupdate", () => {
      var _a2, _b2;
      if (audio.paused)
        return;
      const t = audio.currentTime;
      const { items } = __privateGet(this, _activeAudio, activeAudio_get);
      if (t > ((_a2 = __privateGet(this, _activeItem, activeItem_get)) == null ? void 0 : _a2.end)) {
        __privateMethod(this, _unhighlight, unhighlight_fn).call(this);
        if (__privateGet(this, _itemIndex) === items.length - 1) {
          __privateMethod(this, _play, play_fn).call(this, __privateGet(this, _audioIndex) + 1, 0).catch((e) => __privateMethod(this, _error, error_fn).call(this, e));
          return;
        }
      }
      const oldIndex = __privateGet(this, _itemIndex);
      while (((_b2 = items[__privateGet(this, _itemIndex) + 1]) == null ? void 0 : _b2.begin) <= t)
        __privateWrapper(this, _itemIndex)._++;
      if (__privateGet(this, _itemIndex) !== oldIndex)
        __privateMethod(this, _highlight, highlight_fn).call(this);
    });
    audio.addEventListener("error", () => __privateMethod(this, _error, error_fn).call(this, new Error(`Failed to load ${src}`)));
    audio.addEventListener("playing", () => __privateMethod(this, _highlight, highlight_fn).call(this));
    audio.addEventListener("ended", () => {
      __privateMethod(this, _unhighlight, unhighlight_fn).call(this);
      URL.revokeObjectURL(url);
      __privateSet(this, _audio, null);
      __privateMethod(this, _play, play_fn).call(this, audioIndex + 1, 0).catch((e) => __privateMethod(this, _error, error_fn).call(this, e));
    });
    if (__privateGet(this, _state) === "paused") {
      __privateMethod(this, _highlight, highlight_fn).call(this);
      audio.currentTime = (_b = __privateGet(this, _activeItem, activeItem_get).begin) != null ? _b : 0;
    } else {
      audio.addEventListener("canplaythrough", () => {
        var _a2;
        audio.currentTime = (_a2 = __privateGet(this, _activeItem, activeItem_get).begin) != null ? _a2 : 0;
        __privateSet(this, _state, "playing");
        audio.play().catch((e) => __privateMethod(this, _error, error_fn).call(this, e));
      }, { once: true });
    }
  });
};
_stop = new WeakSet();
stop_fn = function() {
  if (__privateGet(this, _audio)) {
    __privateGet(this, _audio).pause();
    URL.revokeObjectURL(__privateGet(this, _audio).src);
    __privateSet(this, _audio, null);
    __privateMethod(this, _unhighlight, unhighlight_fn).call(this);
  }
};
var isUUID = /([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})/;
var getUUID = (opf) => {
  for (const el of opf.getElementsByTagNameNS(NS.DC, "identifier")) {
    const [id] = getElementText(el).split(":").slice(-1);
    if (isUUID.test(id))
      return id;
  }
  return "";
};
var getIdentifier = (opf) => {
  var _a;
  return getElementText(
    (_a = opf.getElementById(opf.documentElement.getAttribute("unique-identifier"))) != null ? _a : opf.getElementsByTagNameNS(NS.DC, "identifier")[0]
  );
};
var deobfuscate = (key, length, blob) => __async(void 0, null, function* () {
  const array = new Uint8Array(yield blob.slice(0, length).arrayBuffer());
  length = Math.min(length, array.length);
  for (var i = 0; i < length; i++)
    array[i] = array[i] ^ key[i % key.length];
  return new Blob([array, blob.slice(length)], { type: blob.type });
});
var WebCryptoSHA1 = (str) => __async(void 0, null, function* () {
  const data = new TextEncoder().encode(str);
  const buffer = yield globalThis.crypto.subtle.digest("SHA-1", data);
  return new Uint8Array(buffer);
});
var deobfuscators = (sha1 = WebCryptoSHA1) => ({
  "http://www.idpf.org/2008/embedding": {
    key: (opf) => sha1(
      getIdentifier(opf).replaceAll(/[\u0020\u0009\u000d\u000a]/g, "")
    ),
    decode: (key, blob) => deobfuscate(key, 1040, blob)
  },
  "http://ns.adobe.com/pdf/enc#RC": {
    key: (opf) => {
      const uuid = getUUID(opf).replaceAll("-", "");
      return Uint8Array.from({ length: 16 }, (_, i) => parseInt(uuid.slice(i * 2, i * 2 + 2), 16));
    },
    decode: (key, blob) => deobfuscate(key, 1024, blob)
  }
});
var _uris, _decoders, _algorithms;
var Encryption = class {
  constructor(algorithms) {
    __privateAdd(this, _uris, /* @__PURE__ */ new Map());
    __privateAdd(this, _decoders, /* @__PURE__ */ new Map());
    __privateAdd(this, _algorithms, void 0);
    __privateSet(this, _algorithms, algorithms);
  }
  init(encryption, opf) {
    return __async(this, null, function* () {
      if (!encryption)
        return;
      const data = Array.from(
        encryption.getElementsByTagNameNS(NS.ENC, "EncryptedData"),
        (el) => {
          var _a, _b;
          return {
            algorithm: (_a = el.getElementsByTagNameNS(NS.ENC, "EncryptionMethod")[0]) == null ? void 0 : _a.getAttribute("Algorithm"),
            uri: (_b = el.getElementsByTagNameNS(NS.ENC, "CipherReference")[0]) == null ? void 0 : _b.getAttribute("URI")
          };
        }
      );
      for (const { algorithm, uri } of data) {
        if (!__privateGet(this, _decoders).has(algorithm)) {
          const algo = __privateGet(this, _algorithms)[algorithm];
          if (!algo) {
            console.warn("Unknown encryption algorithm");
            continue;
          }
          const key = yield algo.key(opf);
          __privateGet(this, _decoders).set(algorithm, (blob) => algo.decode(key, blob));
        }
        __privateGet(this, _uris).set(uri, algorithm);
      }
    });
  }
  getDecoder(uri) {
    var _a;
    return (_a = __privateGet(this, _decoders).get(__privateGet(this, _uris).get(uri))) != null ? _a : (x) => x;
  }
};
_uris = new WeakMap();
_decoders = new WeakMap();
_algorithms = new WeakMap();
var Resources = class {
  constructor({ opf, resolveHref }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    this.opf = opf;
    const { $, $$, $$$ } = childGetter(opf, NS.OPF);
    const $manifest = $(opf.documentElement, "manifest");
    const $spine = $(opf.documentElement, "spine");
    const $$itemref = $$($spine, "itemref");
    this.manifest = $$($manifest, "item").map(getAttributes("href", "id", "media-type", "properties", "media-overlay")).map((item) => {
      var _a2;
      item.href = resolveHref(item.href);
      item.properties = (_a2 = item.properties) == null ? void 0 : _a2.split(/\s/);
      return item;
    });
    this.spine = $$itemref.map(getAttributes("idref", "id", "linear", "properties")).map((item) => {
      var _a2;
      return item.properties = (_a2 = item.properties) == null ? void 0 : _a2.split(/\s/), item;
    });
    this.pageProgressionDirection = $spine.getAttribute("page-progression-direction");
    this.navPath = (_a = this.getItemByProperty("nav")) == null ? void 0 : _a.href;
    this.ncxPath = (_c = (_b = this.getItemByID($spine.getAttribute("toc"))) != null ? _b : this.manifest.find((item) => item.mediaType === MIME.NCX)) == null ? void 0 : _c.href;
    const $guide = $(opf.documentElement, "guide");
    if ($guide) {
      this.guide = $$($guide, "reference").map(getAttributes("type", "title", "href")).map(({ type, title, href }) => ({
        label: title,
        type: type.split(/\s/),
        href: resolveHref(href)
      }));
    }
    this.cover = (_i = (_f = (_e = this.getItemByProperty("cover-image")) != null ? _e : this.getItemByID((_d = $$$(opf, "meta").find(filterAttribute("name", "cover"))) == null ? void 0 : _d.getAttribute("content"))) != null ? _f : this.manifest.find(
      (item) => item.href.includes("cover") && item.mediaType.startsWith("image")
    )) != null ? _i : this.getItemByHref(
      (_h = (_g = this.guide) == null ? void 0 : _g.find((ref) => ref.type.includes("cover"))) == null ? void 0 : _h.href
    );
    this.cfis = fromElements($$itemref);
  }
  getItemByID(id) {
    return this.manifest.find((item) => item.id === id);
  }
  getItemByHref(href) {
    return this.manifest.find((item) => item.href === href);
  }
  getItemByProperty(prop) {
    return this.manifest.find((item) => {
      var _a;
      return (_a = item.properties) == null ? void 0 : _a.includes(prop);
    });
  }
  resolveCFI(cfi) {
    var _a;
    const parts = parse(cfi);
    const top = ((_a = parts.parent) != null ? _a : parts).shift();
    let $itemref = toElement(this.opf, top);
    if ($itemref && $itemref.nodeName !== "idref") {
      top.at(-1).id = null;
      $itemref = toElement(this.opf, top);
    }
    const idref = $itemref == null ? void 0 : $itemref.getAttribute("idref");
    const index = this.spine.findIndex((item) => item.idref === idref);
    const anchor = (doc) => toRange(doc, parts);
    return { index, anchor };
  }
};
var _cache, _children, _refCount;
var Loader = class {
  constructor({ loadText, loadBlob, resources }) {
    __privateAdd(this, _cache, /* @__PURE__ */ new Map());
    __privateAdd(this, _children, /* @__PURE__ */ new Map());
    __privateAdd(this, _refCount, /* @__PURE__ */ new Map());
    __publicField(this, "allowScript", false);
    __publicField(this, "eventTarget", new EventTarget());
    this.loadText = loadText;
    this.loadBlob = loadBlob;
    this.manifest = resources.manifest;
    this.assets = resources.manifest;
  }
  createURL(href, data, type, parent) {
    return __async(this, null, function* () {
      if (!data)
        return "";
      const detail = { data, type };
      Object.defineProperty(detail, "name", { value: href });
      const event = new CustomEvent("data", { detail });
      this.eventTarget.dispatchEvent(event);
      const newData = yield event.detail.data;
      const newType = yield event.detail.type;
      const url = URL.createObjectURL(new Blob([newData], { type: newType }));
      __privateGet(this, _cache).set(href, url);
      __privateGet(this, _refCount).set(href, 1);
      if (parent) {
        const childList = __privateGet(this, _children).get(parent);
        if (childList)
          childList.push(href);
        else
          __privateGet(this, _children).set(parent, [href]);
      }
      return url;
    });
  }
  ref(href, parent) {
    const childList = __privateGet(this, _children).get(parent);
    if (!(childList == null ? void 0 : childList.includes(href))) {
      __privateGet(this, _refCount).set(href, __privateGet(this, _refCount).get(href) + 1);
      if (childList)
        childList.push(href);
      else
        __privateGet(this, _children).set(parent, [href]);
    }
    return __privateGet(this, _cache).get(href);
  }
  unref(href) {
    if (!__privateGet(this, _refCount).has(href))
      return;
    const count = __privateGet(this, _refCount).get(href) - 1;
    if (count < 1) {
      URL.revokeObjectURL(__privateGet(this, _cache).get(href));
      __privateGet(this, _cache).delete(href);
      __privateGet(this, _refCount).delete(href);
      const childList = __privateGet(this, _children).get(href);
      if (childList)
        while (childList.length)
          this.unref(childList.pop());
      __privateGet(this, _children).delete(href);
    } else
      __privateGet(this, _refCount).set(href, count);
  }
  loadItem(_0) {
    return __async(this, arguments, function* (item, parents = []) {
      if (!item)
        return null;
      const { href, mediaType } = item;
      const isScript = MIME.JS.test(item.mediaType);
      if (isScript && !this.allowScript)
        return null;
      const parent = parents.at(-1);
      if (__privateGet(this, _cache).has(href))
        return this.ref(href, parent);
      const shouldReplace = (isScript || [MIME.XHTML, MIME.HTML, MIME.CSS, MIME.SVG].includes(mediaType)) && parents.every((p) => p !== href);
      if (shouldReplace)
        return this.loadReplaced(item, parents);
      const tryLoadBlob = Promise.resolve().then(() => this.loadBlob(href));
      return this.createURL(href, tryLoadBlob, mediaType, parent);
    });
  }
  loadHref(_0, _1) {
    return __async(this, arguments, function* (href, base, parents = []) {
      if (isExternal(href))
        return href;
      const path = resolveURL(href, base);
      const item = this.manifest.find((item2) => item2.href === path);
      if (!item)
        return href;
      return this.loadItem(item, parents.concat(base));
    });
  }
  loadReplaced(_0) {
    return __async(this, arguments, function* (item, parents = []) {
      var _a, _b, _c;
      const { href, mediaType } = item;
      const parent = parents.at(-1);
      let str = "";
      try {
        str = yield this.loadText(href);
      } catch (e) {
        return this.createURL(href, Promise.reject(e), mediaType, parent);
      }
      if (!str)
        return null;
      if ([MIME.XHTML, MIME.HTML, MIME.SVG].includes(mediaType)) {
        let doc = new DOMParser().parseFromString(str, mediaType);
        if (mediaType === MIME.XHTML && (doc.querySelector("parsererror") || !((_a = doc.documentElement) == null ? void 0 : _a.namespaceURI))) {
          console.warn((_c = (_b = doc.querySelector("parsererror")) == null ? void 0 : _b.innerText) != null ? _c : "Invalid XHTML");
          item.mediaType = MIME.HTML;
          doc = new DOMParser().parseFromString(str, item.mediaType);
        }
        if ([MIME.XHTML, MIME.SVG].includes(item.mediaType)) {
          let child = doc.firstChild;
          while (child instanceof ProcessingInstruction) {
            if (child.data) {
              const replacedData = yield replaceSeries(child.data, /(?:^|\s*)(href\s*=\s*['"])([^'"]*)(['"])/i, (_, p1, p2, p3) => this.loadHref(p2, href, parents).then((p22) => `${p1}${p22}${p3}`));
              child.replaceWith(doc.createProcessingInstruction(
                child.target,
                replacedData
              ));
            }
            child = child.nextSibling;
          }
        }
        const replace = (el, attr) => __async(this, null, function* () {
          return el.setAttribute(attr, yield this.loadHref(el.getAttribute(attr), href, parents));
        });
        for (const el of doc.querySelectorAll("link[href]"))
          yield replace(el, "href");
        for (const el of doc.querySelectorAll("[src]"))
          yield replace(el, "src");
        for (const el of doc.querySelectorAll("[poster]"))
          yield replace(el, "poster");
        for (const el of doc.querySelectorAll("object[data]"))
          yield replace(el, "data");
        for (const el of doc.querySelectorAll("[*|href]:not([href])")) {
          el.setAttributeNS(
            NS.XLINK,
            "href",
            yield this.loadHref(
              el.getAttributeNS(NS.XLINK, "href"),
              href,
              parents
            )
          );
        }
        for (const el of doc.querySelectorAll("style")) {
          if (el.textContent)
            el.textContent = yield this.replaceCSS(el.textContent, href, parents);
        }
        for (const el of doc.querySelectorAll("[style]")) {
          el.setAttribute("style", yield this.replaceCSS(el.getAttribute("style"), href, parents));
        }
        const result2 = new XMLSerializer().serializeToString(doc);
        return this.createURL(href, result2, item.mediaType, parent);
      }
      const result = mediaType === MIME.CSS ? yield this.replaceCSS(str, href, parents) : yield this.replaceString(str, href, parents);
      return this.createURL(href, result, mediaType, parent);
    });
  }
  replaceCSS(_0, _1) {
    return __async(this, arguments, function* (str, href, parents = []) {
      const replacedUrls = yield replaceSeries(str, /url\(\s*["']?([^'"\n]*?)\s*["']?\s*\)/gi, (_, url) => this.loadHref(url, href, parents).then((url2) => `url("${url2}")`));
      return replaceSeries(replacedUrls, /@import\s*["']([^"'\n]*?)["']/gi, (_, url) => this.loadHref(url, href, parents).then((url2) => `@import "${url2}"`));
    });
  }
  replaceString(str, href, parents = []) {
    const assetMap = /* @__PURE__ */ new Map();
    const urls = this.assets.map((asset) => {
      if (asset.href === href)
        return;
      const relative = pathRelative(pathDirname(href), asset.href);
      const relativeEnc = encodeURI(relative);
      const rootRelative = "/" + asset.href;
      const rootRelativeEnc = encodeURI(rootRelative);
      const set = /* @__PURE__ */ new Set([relative, relativeEnc, rootRelative, rootRelativeEnc]);
      for (const url of set)
        assetMap.set(url, asset);
      return Array.from(set);
    }).flat().filter((x) => x);
    if (!urls.length)
      return str;
    const regex = new RegExp(urls.map(regexEscape).join("|"), "g");
    return replaceSeries(str, regex, (match) => __async(this, null, function* () {
      return this.loadItem(assetMap.get(match.replace(/^\//, "")), parents.concat(href));
    }));
  }
  unloadItem(item) {
    this.unref(item == null ? void 0 : item.href);
  }
  destroy() {
    for (const url of __privateGet(this, _cache).values())
      URL.revokeObjectURL(url);
  }
};
_cache = new WeakMap();
_children = new WeakMap();
_refCount = new WeakMap();
var getHTMLFragment = (doc, id) => {
  var _a;
  return (_a = doc.getElementById(id)) != null ? _a : doc.querySelector(`[name="${CSS.escape(id)}"]`);
};
var getPageSpread = (properties) => {
  for (const p of properties) {
    if (p === "page-spread-left" || p === "rendition:page-spread-left") {
      return "left";
    }
    if (p === "page-spread-right" || p === "rendition:page-spread-right") {
      return "right";
    }
    if (p === "rendition:page-spread-center")
      return "center";
  }
};
var getDisplayOptions = (doc) => {
  if (!doc)
    return null;
  return {
    fixedLayout: getElementText(doc.querySelector('option[name="fixed-layout"]')),
    openToSpread: getElementText(doc.querySelector('option[name="open-to-spread"]'))
  };
};
var _loader, _encryption, _loadXML, loadXML_fn;
var EPUB = class {
  constructor({ loadText, loadBlob, getSize, sha1 }) {
    __privateAdd(this, _loadXML);
    __publicField(this, "parser", new DOMParser());
    __privateAdd(this, _loader, void 0);
    __privateAdd(this, _encryption, void 0);
    this.loadText = loadText;
    this.loadBlob = loadBlob;
    this.getSize = getSize;
    __privateSet(this, _encryption, new Encryption(deobfuscators(sha1)));
  }
  init() {
    return __async(this, null, function* () {
      var _a, _b, _c, _d, _e, _f;
      const $container = yield __privateMethod(this, _loadXML, loadXML_fn).call(this, "META-INF/container.xml");
      if (!$container)
        throw new Error("Failed to load container file");
      const opfs = Array.from(
        $container.getElementsByTagNameNS(NS.CONTAINER, "rootfile"),
        getAttributes("full-path", "media-type")
      ).filter((file) => file.mediaType === "application/oebps-package+xml");
      if (!opfs.length)
        throw new Error("No package document defined in container");
      const opfPath = opfs[0].fullPath;
      const opf = yield __privateMethod(this, _loadXML, loadXML_fn).call(this, opfPath);
      if (!opf)
        throw new Error("Failed to load package document");
      const $encryption = yield __privateMethod(this, _loadXML, loadXML_fn).call(this, "META-INF/encryption.xml");
      yield __privateGet(this, _encryption).init($encryption, opf);
      this.resources = new Resources({
        opf,
        resolveHref: (url) => resolveURL(url, opfPath)
      });
      __privateSet(this, _loader, new Loader({
        loadText: this.loadText,
        loadBlob: (uri) => Promise.resolve(this.loadBlob(uri)).then(__privateGet(this, _encryption).getDecoder(uri)),
        resources: this.resources
      }));
      this.transformTarget = __privateGet(this, _loader).eventTarget;
      this.sections = this.resources.spine.map((spineItem, index) => {
        const { idref, linear, properties = [] } = spineItem;
        const item = this.resources.getItemByID(idref);
        if (!item) {
          console.warn(`Could not find item with ID "${idref}" in manifest`);
          return null;
        }
        return {
          id: item.href,
          load: () => __privateGet(this, _loader).loadItem(item),
          unload: () => __privateGet(this, _loader).unloadItem(item),
          createDocument: () => this.loadDocument(item),
          size: this.getSize(item.href),
          cfi: this.resources.cfis[index],
          linear,
          pageSpread: getPageSpread(properties),
          resolveHref: (href) => resolveURL(href, item.href),
          mediaOverlay: item.mediaOverlay ? this.resources.getItemByID(item.mediaOverlay) : null
        };
      }).filter((s) => s);
      const { navPath, ncxPath } = this.resources;
      if (navPath) {
        try {
          const resolve = (url) => resolveURL(url, navPath);
          const nav = parseNav(yield __privateMethod(this, _loadXML, loadXML_fn).call(this, navPath), resolve);
          this.toc = nav.toc;
          this.pageList = nav.pageList;
          this.landmarks = nav.landmarks;
        } catch (e) {
          console.warn(e);
        }
      }
      if (!this.toc && ncxPath) {
        try {
          const resolve = (url) => resolveURL(url, ncxPath);
          const ncx = parseNCX(yield __privateMethod(this, _loadXML, loadXML_fn).call(this, ncxPath), resolve);
          this.toc = ncx.toc;
          this.pageList = ncx.pageList;
        } catch (e) {
          console.warn(e);
        }
      }
      (_a = this.landmarks) != null ? _a : this.landmarks = this.resources.guide;
      const { metadata, rendition, media } = getMetadata(opf);
      this.metadata = metadata;
      this.rendition = rendition;
      this.media = media;
      this.dir = this.resources.pageProgressionDirection;
      const displayOptions = getDisplayOptions(
        (_b = yield __privateMethod(this, _loadXML, loadXML_fn).call(this, "META-INF/com.apple.ibooks.display-options.xml")) != null ? _b : yield __privateMethod(this, _loadXML, loadXML_fn).call(this, "META-INF/com.kobobooks.display-options.xml")
      );
      if (displayOptions) {
        if (displayOptions.fixedLayout === "true") {
          (_d = (_c = this.rendition).layout) != null ? _d : _c.layout = "pre-paginated";
        }
        if (displayOptions.openToSpread === "false") {
          (_f = (_e = this.sections.find((section) => section.linear !== "no")).pageSpread) != null ? _f : _e.pageSpread = this.dir === "rtl" ? "left" : "right";
        }
      }
      return this;
    });
  }
  loadDocument(item) {
    return __async(this, null, function* () {
      const str = yield this.loadText(item.href);
      return this.parser.parseFromString(str, item.mediaType);
    });
  }
  getMediaOverlay() {
    return new MediaOverlay(this, __privateMethod(this, _loadXML, loadXML_fn).bind(this));
  }
  resolveCFI(cfi) {
    return this.resources.resolveCFI(cfi);
  }
  resolveHref(href) {
    const [path, hash] = href.split("#");
    const item = this.resources.getItemByHref(decodeURI(path));
    if (!item)
      return null;
    const index = this.resources.spine.findIndex(({ idref }) => idref === item.id);
    const anchor = hash ? (doc) => getHTMLFragment(doc, hash) : () => 0;
    return { index, anchor };
  }
  splitTOCHref(href) {
    var _a;
    return (_a = href == null ? void 0 : href.split("#")) != null ? _a : [];
  }
  getTOCFragment(doc, id) {
    var _a;
    return (_a = doc.getElementById(id)) != null ? _a : doc.querySelector(`[name="${CSS.escape(id)}"]`);
  }
  isExternal(uri) {
    return isExternal(uri);
  }
  getCover() {
    return __async(this, null, function* () {
      var _a;
      const cover = (_a = this.resources) == null ? void 0 : _a.cover;
      return (cover == null ? void 0 : cover.href) ? new Blob([yield this.loadBlob(cover.href)], { type: cover.mediaType }) : null;
    });
  }
  getCalibreBookmarks() {
    return __async(this, null, function* () {
      const txt = yield this.loadText("META-INF/calibre_bookmarks.txt");
      const magic = "encoding=json+base64:";
      if (txt == null ? void 0 : txt.startsWith(magic)) {
        const json = atob(txt.slice(magic.length));
        return JSON.parse(json);
      }
    });
  }
  destroy() {
    var _a;
    (_a = __privateGet(this, _loader)) == null ? void 0 : _a.destroy();
  }
};
_loader = new WeakMap();
_encryption = new WeakMap();
_loadXML = new WeakSet();
loadXML_fn = function(uri) {
  return __async(this, null, function* () {
    const str = yield this.loadText(uri);
    if (!str)
      return null;
    const doc = this.parser.parseFromString(str, MIME.XML);
    if (doc.querySelector("parsererror")) {
      throw new Error(`XML parsing error: ${uri}
${doc.querySelector("parsererror").innerText}`);
    }
    return doc;
  });
};

// src/tidme/import/parse/epub.ts
var _JSZip = null;
function JSZipLib() {
  if (!_JSZip)
    _JSZip = require("$:/plugins/keepone/tidme/import/jszip");
  return _JSZip;
}
function localName(node) {
  return String(node && (node.localName || node.tagName) || "").toLowerCase();
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
function normalizePath(p) {
  return String(p || "").replace(/^\.\//, "").replace(/\\/g, "/").split("#")[0];
}
function metaStr(v) {
  if (typeof v === "string")
    return v.trim();
  if (v && typeof v === "object" && typeof v.value === "string")
    return v.value.trim();
  return "";
}
function tocToNodes(items, depth = 0) {
  const out = [];
  for (const it of items || []) {
    const href = String((it == null ? void 0 : it.href) || "");
    const hash = href.indexOf("#");
    const text = String((it == null ? void 0 : it.label) || "").replace(/\s+/g, " ").trim();
    if (!href && !text)
      continue;
    out.push({
      text,
      href: hash === -1 ? href : href.slice(0, hash),
      frag: hash === -1 ? "" : href.slice(hash + 1),
      depth,
      children: tocToNodes(it == null ? void 0 : it.subitems, depth + 1)
    });
  }
  return out;
}
function readEpubBytes(bytes) {
  return __async(this, null, function* () {
    var _a;
    const zip = yield JSZipLib().loadAsync(bytes);
    const fileOf = (name) => name ? zip.file(name) : null;
    const epub = new EPUB({
      loadText: (name) => __async(this, null, function* () {
        const f = fileOf(name);
        return f ? yield f.async("string") : null;
      }),
      loadBlob: (name) => __async(this, null, function* () {
        const f = fileOf(name);
        return f ? yield f.async("blob") : null;
      }),
      getSize: () => 0
    });
    yield epub.init();
    const meta = {};
    const m = epub.metadata || {};
    if (metaStr(m.title))
      meta.title = metaStr(m.title);
    const creator = Array.isArray(m.author) ? m.author[0] : (_a = m.author) != null ? _a : m.creator;
    if (metaStr(creator))
      meta.creator = metaStr(creator);
    const language = Array.isArray(m.language) ? m.language[0] : m.language;
    if (metaStr(language))
      meta.language = metaStr(language);
    if (metaStr(m.publisher))
      meta.publisher = metaStr(m.publisher);
    if (metaStr(m.date))
      meta.date = metaStr(m.date);
    return {
      meta,
      spine: (epub.sections || []).map((s) => ({ idref: s.id, href: s.id })),
      toc: tocToNodes(epub.toc),
      loadDocumentAt: (i) => __async(this, null, function* () {
        var _a2;
        const s = (_a2 = epub.sections) == null ? void 0 : _a2[i];
        if (!s)
          return null;
        const doc = yield s.createDocument();
        return doc && typeof doc.getElementsByTagName === "function" ? doc : null;
      })
    };
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
var SKIP_TAGS = /* @__PURE__ */ new Set(["script", "style", "svg", "head", "template"]);
function hasBlockDescendant(el, depth = 0) {
  if (depth > 12)
    return true;
  for (const c of Array.from(el.childNodes || [])) {
    if (c.nodeType !== 1)
      continue;
    if (BLOCK_TAGS.has(localName(c)))
      return true;
    if (hasBlockDescendant(c, depth + 1))
      return true;
  }
  return false;
}
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
      if (SKIP_TAGS.has(local))
        continue;
      if (!BLOCK_TAGS.has(local)) {
        walk(child);
        continue;
      }
      const hasBlockChild = hasBlockDescendant(child);
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

// src/tidme/import/parse/ingest-text.ts
init_schema();

// src/tidme/core/text-structure.ts
function isMarkdownAtxHeading(line) {
  const s = String(line || "").trim();
  if (!s || s.startsWith("#!"))
    return false;
  return /^#{1,6}\s+\S/.test(s);
}
function isWikitextHeading(line) {
  return /^!{1,6}\s+\S/.test(String(line || "").trim());
}
function isHtmlHeading(line) {
  return /^<h[1-6][\s>]/i.test(String(line || "").trim());
}

// src/tidme/import/parse/ingest-text.ts
function virtualBlock(text, isHeading = false, level = 0) {
  return { text, tag: isHeading ? "h" + level : "p", isHeading, level, virtualHtml: isHeading ? "" : `<p>${escapeHtml(text)}</p>` };
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
    virtualHtml: `<pre class="${cls}">${escapeHtml(text)}</pre>`
  };
}
function blockquoteBlock(text) {
  return {
    text,
    tag: "blockquote",
    isHeading: false,
    level: 0,
    virtualHtml: `<blockquote>${escapeHtml(text)}</blockquote>`
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
  const lines = t.split("\n");
  if (lines.some((l) => /^\s*<(?:!DOCTYPE\s+html|html|head|body|div|p|h[1-6])\b/i.test(l)))
    return "html";
  const hasMdHeading = lines.some((l) => isMarkdownAtxHeading(l));
  const hasMdFence = /^\s*(```|~~~)/m.test(t);
  const hasBangHeading = lines.some((l) => isWikitextHeading(l));
  const hasHtmlHeading = lines.some((l) => isHtmlHeading(l));
  if (hasHtmlHeading && !hasMdHeading)
    return "html";
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

// src/tidme/import/parse/smart-merge.ts
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

// src/tidme/import/parse/split.ts
init_ns();
init_paths();
init_scheduler();
init_schema();

// src/tidme/core/card-factory.ts
var schema5 = (init_schema(), __toCommonJS(schema_exports));
var paths = (init_paths(), __toCommonJS(paths_exports));
var session = (init_session(), __toCommonJS(session_exports));
var sched4 = (init_scheduler(), __toCommonJS(scheduler_exports));
var ns8 = (init_ns(), __toCommonJS(ns_exports));
var titleMod = (init_title(), __toCommonJS(title_exports));
var escapeHtml2 = schema5.escapeHtml;
function buildDocPageFields(opts) {
  const base = {
    title: opts.title,
    type: "text/vnd.tiddlywiki",
    tags: [ns8.DOC_TAG],
    "tidme.kind": "topic",
    "tidme.doc": opts.docId,
    "tidme.docpage": opts.title,
    "tidme.structure": opts.structure
  };
  if (opts.caption !== void 0 && opts.caption !== "")
    base.caption = opts.caption;
  if (opts.text !== void 0)
    base.text = opts.text;
  if (opts.format)
    base["tidme.format"] = opts.format;
  return { ...base, ...opts.extra || {} };
}
function buildSectionCardFields(opts) {
  const text = opts.text === void 0 ? "" : String(opts.text);
  const chars = opts.chars === void 0 ? text.length : Number(opts.chars);
  const base = {
    title: opts.title,
    type: "text/vnd.tiddlywiki",
    ...schema5.initialFsrsFields(new Date()),
    "tidme.kind": "topic",
    "tidme.subkind": "section",
    "tidme.doc": opts.docId,
    "tidme.chars": String(chars),
    "tidme.priority": String(sched4.normalizePriority(opts.priority)),
    "tidme.afactor": String(opts.afactor === void 0 ? sched4.afactorForText(chars) : opts.afactor)
  };
  if (opts.caption !== void 0)
    base.caption = opts.caption;
  if (opts.text !== void 0)
    base.text = text;
  if (opts.docPage)
    base["tidme.docpage"] = opts.docPage;
  if (opts.breadcrumb)
    base["tidme.breadcrumb"] = opts.breadcrumb;
  return { ...base, ...opts.extra || {} };
}

// src/tidme/import/parse/split.ts
function cleanTitle(title) {
  let t = String(title || "").trim();
  if (!t)
    return t;
  t = t.replace(/[（(【\[][^））】\]]*[）)】\]]/g, "").trim();
  t = t.split(/[:：——–]/)[0].trim();
  return t || title;
}
function resolveDocRoot(bookTitle, docId, folderOccupied) {
  const base = docRoot(bookTitle);
  const owner = folderOccupied ? folderOccupied(base) : null;
  if (owner && String(owner) !== String(docId)) {
    return base + "~" + String(docId).replace(/^d/, "").slice(0, 6);
  }
  return base;
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
  return __async(this, arguments, function* (docId, meta, bookTitle, sections, bag, autoDeck = true, priority = PRIORITY_DEFAULT, folderOccupied) {
    const warnings = [];
    const format = meta.__format || "epub";
    const nowFields = initialFsrsFields(new Date());
    const syncFields = { bag, revision: "0" };
    const bookT = bookTitle || "Untitled Import";
    const docRoot2 = resolveDocRoot(bookT, docId, folderOccupied);
    const docTitle = bookT;
    const cards = [];
    for (const s of sections) {
      if (!s.text.trim())
        continue;
      const trail = [docTitle, ...s.trail].map((t) => String(t || "").trim()).filter(Boolean);
      const id = yield makeSectionId(docId, trail, s.ordinal);
      const hash = yield contentFingerprint(s.text);
      const joined = trail.join(CRUMB_SEP);
      const capText = s.title || trail[trail.length - 1] || "";
      const title = joinPath(docRoot2, sectionLeaf(capText, id));
      cards.push(buildSectionCardFields({
        title,
        caption: capText,
        text: s.html,
        docId,
        docPage: docRoot2,
        chars: s.chars,
        priority,
        breadcrumb: joined,
        extra: __spreadValues(__spreadValues(__spreadProps(__spreadValues(__spreadValues({}, nowFields), syncFields), {
          "tidme.id": id,
          "tidme.hash": hash,
          "tidme.order": String(s.ordinal).padStart(6, "0"),
          "tidme.level": String(s.level),
          "tidme.source": meta.title || "",
          "tidme.author": meta.creator || "",
          "tidme.format": format
        }), s.merged ? { "tidme.merged": "yes" } : {}), s.file ? { "tidme.file": s.file } : {})
      }));
    }
    const links = cards.map((t) => `* [[${t.caption || t.title}|${t.title}]]`).join("\n");
    const docLines = [`//${formatLabel(format)}//`];
    if (meta.creator)
      docLines.push("Author: " + meta.creator);
    if (meta.language)
      docLines.push("Language: " + meta.language);
    if (meta.date)
      docLines.push("Date: " + meta.date);
    docLines.push("Document ID: " + docId);
    docLines.push(`Total ${cards.length} sections:`, "", links);
    const docTiddler = buildDocPageFields({
      title: docRoot2,
      caption: docTitle,
      docId,
      structure: "sectioned",
      format,
      text: docLines.join("\n"),
      extra: __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({
        bag,
        revision: "0"
      }, meta.title ? { "tidme.source": meta.title } : {}), meta.author || meta.creator ? { "tidme.author": meta.author || meta.creator } : {}), meta.language ? { "tidme.language": meta.language } : {}), meta.url ? { "tidme.url": meta.url } : {}), meta.date ? { "tidme.date": meta.date } : {}), meta.license ? { "tidme.license": meta.license } : {})
    });
    const tiddlers = [docTiddler, ...cards];
    return { tiddlers, warnings };
  });
}
function runSplit(input) {
  return __async(this, null, function* () {
    const text = String(input.text || "");
    if (!text.trim())
      throw new Error("Content is empty");
    const format = formatFromType(input.type, text);
    const blocks = blocksFor(format, text);
    if (!blocks.length)
      throw new Error("Cannot parse any content blocks");
    const meta = __spreadValues({
      title: input.title || guessTitle(text, format) || "Untitled Import"
    }, input.sourceFields || {});
    const bookTitle = meta.title;
    const docId = yield makeDocId({ title: bookTitle, creator: meta.creator || "", language: meta.language || "" });
    const { sections, stats } = chunkBook(
      [{ fileName: bookTitle, fileBreadcrumb: [], blocks }],
      { maxChars: input.maxChars, minChars: input.minChars }
    );
    const metaWithFormat = __spreadProps(__spreadValues({}, meta), { __format: format });
    const { tiddlers, warnings } = yield emitTiddlers(
      docId,
      metaWithFormat,
      bookTitle,
      sections,
      input.bag || "default",
      input.autoDeck !== false,
      input.priority,
      input.folderOccupied
    );
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

// src/tidme/import/parse/main.ts
init_ns();
init_paths();
function importEpubBytes(bytes, fileName, options) {
  return __async(this, null, function* () {
    const book = yield readEpubBytes(bytes);
    const resolveCrumb = makeBreadcrumbResolver(book.toc, book.spine);
    const flatNav = flattenNcx(book.toc);
    const files = [];
    for (let i = 0; i < book.spine.length; i++) {
      const href = book.spine[i].href;
      let doc = null;
      try {
        doc = yield book.loadDocumentAt(i);
      } catch (err) {
        throw new Error(`\u89E3\u6790 ${href} \u5931\u8D25: ${(err == null ? void 0 : err.message) || err}`);
      }
      if (!doc)
        continue;
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
    const { tiddlers, warnings } = yield emitTiddlers(docId, meta, bookTitle, sections, options.bag || "default", true, options.priority, options.folderOccupied);
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
      folderOccupied: options.folderOccupied,
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
    throw new Error(`\u4E0D\u652F\u6301\u7684\u683C\u5F0F\uFF1A${fileName}\uFF08\u652F\u6301 .epub / .pdf / .md / .txt / .html\uFF09`);
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
