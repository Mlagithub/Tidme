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
  CARD_OPEN_AT_TITLE: () => CARD_OPEN_AT_TITLE,
  CONFIG_TITLE_PREFIX: () => CONFIG_TITLE_PREFIX,
  CRUMB_SEP: () => CRUMB_SEP,
  DECK_LOG_SUFFIX: () => DECK_LOG_SUFFIX,
  DECK_PREFIX: () => DECK_PREFIX,
  DECK_TAG: () => DECK_TAG,
  FOLDED_STATE_PREFIX: () => FOLDED_STATE_PREFIX,
  IMPORT_BAG_TITLE: () => IMPORT_BAG_TITLE,
  LOG_RETENTION_TITLE: () => LOG_RETENTION_TITLE,
  NOTIFY_CLOZE: () => NOTIFY_CLOZE,
  NOTIFY_CONGRATULATION: () => NOTIFY_CONGRATULATION,
  NOTIFY_DONE: () => NOTIFY_DONE,
  NOTIFY_EXTRACT: () => NOTIFY_EXTRACT,
  NOTIFY_EXTRACT_NOTE: () => NOTIFY_EXTRACT_NOTE,
  NOTIFY_LATER: () => NOTIFY_LATER,
  NOTIFY_READPOINT: () => NOTIFY_READPOINT,
  NOTIFY_SECTION_DONE: () => NOTIFY_SECTION_DONE,
  NOTIFY_SELECT_FIRST: () => NOTIFY_SELECT_FIRST,
  NOTIFY_STUDY_ENDED: () => NOTIFY_STUDY_ENDED,
  NOTIFY_UNSUPPORTED: () => NOTIFY_UNSUPPORTED,
  NOT_DECK_FILTER: () => NOT_DECK_FILTER,
  NS_ASSETS: () => NS_ASSETS,
  NS_DECKS: () => NS_DECKS,
  NS_DECKS_SCATTER: () => NS_DECKS_SCATTER,
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
  SEMANTIC_SPLIT_TITLE: () => SEMANTIC_SPLIT_TITLE,
  TITLE_UNSAFE_CHARS: () => TITLE_UNSAFE_CHARS,
  TOPIC_QUEUE_FILTER: () => TOPIC_QUEUE_FILTER,
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
var NS_DOCS, NS_ASSETS, NS_DECKS, NS_DECKS_SCATTER, CRUMB_SEP, DECK_PREFIX, QUEUE_EXCLUDE, DECK_TAG, NOT_DECK_FILTER, TOPIC_QUEUE_FILTER, TITLE_UNSAFE_CHARS, FOLDED_STATE_PREFIX, CARD_OPEN_AT_TITLE, PDF_PAGE_STATE_PREFIX, AUTOPOSTPONE_LAST_TITLE, DECK_LOG_SUFFIX, CONFIG_TITLE_PREFIX, QUEUE_MODE_TITLE, QUEUE_MIX_TITLE, PRIORITY_DYNAMICS_TITLE, LOG_RETENTION_TITLE, OCR_TITLE, SEMANTIC_SPLIT_TITLE, PAGE_INCREMENTAL_LEARNING, PAGE_TODAY, PAGE_READING_LIST, PAGE_IMPORT_CENTER, PAGE_CARD_MANAGER, PAGE_IMPORT_STATS, PAGE_HELP_SHORTCUTS, PAGE_SETTINGS, NOTIFY_EXTRACT, NOTIFY_CLOZE, NOTIFY_READPOINT, NOTIFY_SELECT_FIRST, NOTIFY_EXTRACT_NOTE, NOTIFY_SECTION_DONE, NOTIFY_LATER, NOTIFY_DONE, NOTIFY_UNSUPPORTED, NOTIFY_CONGRATULATION, NOTIFY_STUDY_ENDED, IMPORT_BAG_TITLE;
var init_ns = __esm({
  "src/tidme/core/ns.ts"() {
    NS_DOCS = "Tidme/Docs/";
    NS_ASSETS = "Tidme/Assets/";
    NS_DECKS = "Tidme/Decks/";
    NS_DECKS_SCATTER = NS_DECKS + "\u6563\u5361";
    CRUMB_SEP = " \u203A ";
    DECK_PREFIX = "$:/Deck/";
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
    OCR_TITLE = CONFIG_TITLE_PREFIX + "Ocr";
    SEMANTIC_SPLIT_TITLE = CONFIG_TITLE_PREFIX + "SemanticSplit";
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
  assertCardFields: () => assertCardFields,
  escapeHtml: () => escapeHtml,
  initialFsrsFields: () => initialFsrsFields,
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
  let s = String(name).normalize("NFKC").replace(/[《》「」『』「」]/g, "").replace(/[（()()【\[\]】]/g, "").replace(TITLE_UNSAFE_CHARS, "").replace(/\s+/g, "-").replace(/[\-_.]+/g, "-").replace(/^[\-\.]+|[\-\.]+$/g, "").slice(0, 80);
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
  return NS_DOCS + slug;
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
var RESERVED;
var init_paths = __esm({
  "src/tidme/core/paths.ts"() {
    init_ns();
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
  autoPostpone: () => autoPostpone,
  comparePriorityMixed: () => comparePriorityMixed,
  doneCard: () => doneCard,
  forgetCard: () => forgetCard,
  ignoreCard: () => ignoreCard,
  isCardOutOfQueue: () => isCardOutOfQueue,
  isDueNow: () => isDueNow,
  isInQueue: () => isInQueue,
  nextSchedulable: () => nextSchedulable,
  normalizeAFactor: () => normalizeAFactor,
  normalizePriority: () => normalizePriority,
  postponeCard: () => postponeCard,
  postponeTopicByAFactor: () => postponeTopicByAFactor,
  priorityBucket: () => priorityBucket,
  priorityDeltaForRating: () => priorityDeltaForRating,
  restoreCard: () => restoreCard,
  resumeCard: () => resumeCard,
  shiftPriority: () => shiftPriority,
  sortTopicQueue: () => sortTopicQueue,
  suspendCard: () => suspendCard,
  tierRandom: () => tierRandom
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
function isDueNow(fields, now = new Date()) {
  if (!isInQueue(fields))
    return false;
  const due = fields.due;
  if (due === void 0 || due === null || String(due) === "")
    return true;
  const parsed = tryParseTwDate2(due);
  return parsed ? parsed.getTime() <= now.getTime() : false;
}
function nextSchedulable(ordered, cur, canLearn) {
  const start = cur === null || cur === void 0 ? 0 : ordered.indexOf(cur) + 1;
  for (let i = start; i < ordered.length; i++) {
    if (canLearn(ordered[i]))
      return ordered[i];
  }
  return null;
}
function comparePriorityMixed(a, b, mode = "hybrid", overdueWeight = 0.5, now = new Date()) {
  const nowMs = now.getTime();
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
  const overMs = (d) => d === 0 ? 0 : Math.max(0, (nowMs - d) / 864e5);
  const daysA = overMs(da);
  const daysB = overMs(db);
  const scoreA = pa - daysA * overdueWeight * 10;
  const scoreB = pb - daysB * overdueWeight * 10;
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
var ns, AUTOPOSTPONE_CONFIG_TITLE, PRIORITY_DEFAULT, AFACTOR_DEFAULT, AFACTOR_CONTINUOUS, TOPIC_MIN_INTERVAL_DAYS, ITEM_PROTECTION_WEIGHT, POSTPONE_DEFAULT_DAYS, AUTOPOSTPONE_OPTS_DEFAULTS, DECK_PARAM_DEFAULTS, PRIORITY_TIERS, ITEM_FILTER, schema, parseTwDate2, tryParseTwDate2, twDateString2, PRIORITY_BUCKET_BOUNDS;
var init_scheduler = __esm({
  "src/tidme/core/scheduler.ts"() {
    ns = (init_ns(), __toCommonJS(ns_exports));
    AUTOPOSTPONE_CONFIG_TITLE = ns.CONFIG_TITLE_PREFIX + "AutoPostpone";
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
  }
});

// src/tidme/core/deck.ts
var deck_exports = {};
__export(deck_exports, {
  DECK_TAG: () => DECK_TAG2,
  DEFAULT_CARD_FILTER: () => DEFAULT_CARD_FILTER,
  DEFAULT_DECK: () => DEFAULT_DECK,
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
  if (cfg.newPerDay !== void 0 && Number(cfg.newPerDay) > 0) {
    const base = String(fields.order_new || "[sortan[title]]");
    if (!/limit\[\d+\]/.test(base))
      fields.order_new = `${base}limit[${Math.floor(Number(cfg.newPerDay))}]`;
  }
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
  if (deck.title === DEFAULT_DECK)
    throw new Error("deck: default deck cannot be deleted");
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
var ns2, DECK_TAG2, DEFAULT_DECK, DEFAULT_CARD_FILTER;
var init_deck = __esm({
  "src/tidme/core/deck.ts"() {
    ns2 = (init_ns(), __toCommonJS(ns_exports));
    DECK_TAG2 = ns2.DECK_TAG;
    DEFAULT_DECK = ns2.DECK_PREFIX + "default";
    DEFAULT_CARD_FILTER = `[all[shadows+tiddlers]tidme.kind[item]${ns2.QUEUE_EXCLUDE}]`;
  }
});

// src/tidme/core/stats.ts
var stats_exports = {};
__export(stats_exports, {
  FOCUS_SEGMENT_MAX_SECONDS: () => FOCUS_SEGMENT_MAX_SECONDS,
  READTIME_TIDDLER: () => READTIME_TIDDLER,
  deckLoad: () => deckLoad,
  formatDuration: () => formatDuration,
  funnelCounts: () => funnelCounts,
  getReadTimeStats: () => getReadTimeStats,
  priorityBuckets: () => priorityBuckets,
  recordReadTime: () => recordReadTime,
  retentionFromLogs: () => retentionFromLogs
});
function deckLoad(cards, now = new Date()) {
  const load = { total: cards.length, learn: 0, due: 0, overdue: 0, newCount: 0 };
  const nowMs = now.getTime();
  for (const c of cards) {
    const f = c.fields;
    if (!isInQueue2(f))
      continue;
    const state = String(f.state || "0");
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
function funnelCounts(items) {
  const f = { docs: 0, sections: 0, extracts: 0, concepts: 0, cards: 0 };
  for (const c of items) {
    const kind = String(c.fields["tidme.kind"] || "");
    const sub = String(c.fields["tidme.subkind"] || "");
    if (Array.isArray(c.fields.tags) && c.fields.tags.includes("tidme-doc"))
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
  const todaySeconds = Number(data.days?.[todayKey2()]) || 0;
  const docSeconds = typeof data.docs === "object" && data.docs ? { ...data.docs } : {};
  return { totalSeconds, todaySeconds, docSeconds };
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
  data.totalSeconds = (Number(data.totalSeconds) || 0) + sec;
  data.days[todayKey2()] = (Number(data.days[todayKey2()]) || 0) + sec;
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
    b[sched.priorityBucket(raw)]++;
  }
  return b;
}
var schema2, parseTwDate3, sched, nsMod, isCardOutOfQueue2, isInQueue2, todayKey2, READTIME_TIDDLER, FOCUS_SEGMENT_MAX_SECONDS;
var init_stats = __esm({
  "src/tidme/core/stats.ts"() {
    schema2 = (init_schema(), __toCommonJS(schema_exports));
    parseTwDate3 = schema2.parseTwDate;
    sched = (init_scheduler(), __toCommonJS(scheduler_exports));
    nsMod = (init_ns(), __toCommonJS(ns_exports));
    isCardOutOfQueue2 = sched.isCardOutOfQueue;
    isInQueue2 = sched.isInQueue;
    todayKey2 = schema2.todayKey;
    READTIME_TIDDLER = "$:/plugins/keepone/tidme/stats/readtime";
    FOCUS_SEGMENT_MAX_SECONDS = 3600;
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
  prepareCardFold: () => prepareCardFold,
  removeFromSession: () => removeFromSession,
  removeFromSessionMany: () => removeFromSessionMany,
  setSession: () => setSession,
  settleFocusAnchor: () => settleFocusAnchor,
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
  const learn = canLearn ? canLearn : (t) => {
    const f = wiki.getTiddler(t);
    return f ? sched2.isDueNow(f.fields) : false;
  };
  return sched2.nextSchedulable(s.list, cur, learn);
}
function modifiedMs(v) {
  if (v instanceof Date)
    return v.getTime();
  if (typeof v === "number" && Number.isFinite(v))
    return v;
  return schema3.tryParseTwDate(v)?.getTime() ?? 0;
}
function getActiveStudy(wiki) {
  if (!wiki || typeof wiki.getTiddler !== "function")
    return null;
  const s = getSession(wiki);
  if (s && s.list.length)
    return { list: s.list, source: "global" };
  let best = null;
  for (const d of deckMod.listDecks(wiki)) {
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
  settleFocusAnchor(wiki);
  let n = 0;
  if (wiki.getTiddler(SESSION_TIDDLER)) {
    wiki.deleteTiddler(SESSION_TIDDLER);
    n++;
  }
  for (const d of deckMod.listDecks(wiki)) {
    const t = d + DECK_STUDY_SUFFIX;
    if (wiki.getTiddler(t)) {
      wiki.deleteTiddler(t);
      n++;
    }
    n += deckMod.burnSubsetDeck(wiki, d);
  }
  for (const t of wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${TEMP_PREFIX}]]`)) {
    wiki.deleteTiddler(t);
    n++;
  }
  return n;
}
function prepareCardFold(wiki, title) {
  if (!wiki || typeof wiki.filterTiddlers !== "function" || !title)
    return;
  const f = wiki.getTiddler(title)?.fields;
  if (!f || f["tidme.kind"] !== "item")
    return;
  let text = "hide";
  for (const d of deckMod.listDecks(wiki)) {
    if (!ns3.isFilterSafeTitle(d))
      continue;
    const unfoldFilter = String(wiki.getTiddler(d)?.fields?.card_unfold || "").trim();
    if (!unfoldFilter)
      continue;
    if (wiki.filterTiddlers(`[subfilter{${d}!!card_unfold}]`).includes(title)) {
      text = "show";
      break;
    }
  }
  wiki.addTiddler({ title: ns3.FOLDED_STATE_PREFIX + title, text });
}
function readFocusAnchor(wiki) {
  if (!wiki || typeof wiki.getTiddler !== "function")
    return null;
  const fields = wiki.getTiddler(ns3.CARD_OPEN_AT_TITLE)?.fields;
  if (!fields)
    return null;
  const at = schema3.tryParseTwDate(fields.text);
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
  wiki.deleteTiddler(ns3.CARD_OPEN_AT_TITLE);
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
  wiki.addTiddler({ title: ns3.CARD_OPEN_AT_TITLE, text: schema3.twDateString(now), card: title });
}
function consumeFocusAnchor(wiki, title, now = new Date()) {
  const anchor = readFocusAnchor(wiki);
  if (!anchor) {
    if (wiki && typeof wiki.deleteTiddler === "function")
      wiki.deleteTiddler(ns3.CARD_OPEN_AT_TITLE);
    return 0;
  }
  if (anchor.card && anchor.card !== title) {
    settleFocusAnchor(wiki, now);
    return 0;
  }
  wiki.deleteTiddler(ns3.CARD_OPEN_AT_TITLE);
  return recordFocus(wiki, anchor.card || String(title || ""), anchor.at, now);
}
function enterCard(wiki, title, now = new Date()) {
  prepareCardFold(wiki, title);
  touchFocusAnchor(wiki, title, now);
}
var sched2, deckMod, ns3, schema3, statsMod, DECK_STUDY_SUFFIX, TEMP_PREFIX, SESSION_TIDDLER;
var init_session = __esm({
  "src/tidme/core/session.ts"() {
    sched2 = (init_scheduler(), __toCommonJS(scheduler_exports));
    deckMod = (init_deck(), __toCommonJS(deck_exports));
    ns3 = (init_ns(), __toCommonJS(ns_exports));
    schema3 = (init_schema(), __toCommonJS(schema_exports));
    statsMod = (init_stats(), __toCommonJS(stats_exports));
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

// src/tidme/import/parse/epub.ts
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
var schema4 = (init_schema(), __toCommonJS(schema_exports));
var paths = (init_paths(), __toCommonJS(paths_exports));
var session = (init_session(), __toCommonJS(session_exports));
var sched3 = (init_scheduler(), __toCommonJS(scheduler_exports));
var ns4 = (init_ns(), __toCommonJS(ns_exports));
var titleMod = (init_title(), __toCommonJS(title_exports));
var escapeHtml2 = schema4.escapeHtml;
function buildDocPageFields(opts) {
  const base = {
    title: opts.title,
    type: "text/vnd.tiddlywiki",
    tags: ["tidme-doc"],
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
    ...schema4.initialFsrsFields(new Date()),
    "tidme.kind": "topic",
    "tidme.subkind": "section",
    "tidme.doc": opts.docId,
    "tidme.chars": String(chars),
    "tidme.priority": String(sched3.normalizePriority(opts.priority)),
    "tidme.afactor": String(opts.afactor === void 0 ? sched3.afactorForText(chars) : opts.afactor)
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
