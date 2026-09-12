# Tidme

<div align="center">

**✨ Lifelong knowledge, deep in mind ✨**

_Incremental Reading & FSRS Spaced Repetition System for TiddlyWiki 5_

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/badge/Release-v1.18.0-success.svg)](https://github.com/keepone/Tidme/releases)
[![TiddlyWiki 5](https://img.shields.io/badge/TiddlyWiki-5.3%2B-orange.svg)](https://tiddlywiki.com)
[![Tests](https://img.shields.io/badge/Tests-484%20passed-brightgreen.svg)]()

[English](README.md) · [简体中文](README-zh-Hans.md)

</div>

---

## 📖 Introduction

**Tidme** is a comprehensive lifelong learning system deeply integrated into [TiddlyWiki 5](https://tiddlywiki.com).

Combining the **Incremental Reading** methodology from SuperMemo with the cutting-edge **FSRS** (Free Spaced Repetition Scheduler) algorithm, Tidme delivers a complete, local-first, distraction-free workflow: **"Import & Split Long Documents → Incremental Reading & Extracting → Atomic Flashcard Creation → Intelligent Spaced Repetition"**.

---

## 🌟 Key Features

### 1. Incremental Reading

- **Multi-format Import & Splitting**: Drag and drop EPUB e-books, PDF documents, or Markdown articles directly into the import center. Tidme parses chapters, table of contents, or heading hierarchies and splits them into connected section cards automatically.
- **Persistent Read Points**: Set an anchor at your exact reading location (`Ctrl+F7`). Returning later lets you jump directly back to that location (`Alt+F7`) with text fragment highlighting.
- **Interactive Section Bar**: Every reading piece features a dedicated navigation header supporting "Previous / Next" browsing, "Mark as Read (Done)", "Postpone (Later, scheduled via A-Factor)", "Advance", and "Ignore".

### 2. In-place Card Creation

- **Selection Bubble & Omni Creator**: Select any text while reading to bring up the instant creation bubble, or press `Alt+K` from any view to summon the global Omni Card Creator modal.
- **Rich Card Types**:
  - **Extract (`Alt+X`)**: Distill core paragraphs into extract cards, maintaining full context and parent references;
  - **Cloze (`Alt+Z`)**: Contextual fill-in-the-blank cards (`<<C "text" "c1">>`);
  - **Question & Answer (`Alt+Q`)**: Classic two-sided flashcards;
  - **Image Box Selection**: Rectangular crop directly from PDF pages to generate image QA cards.
- **Rigorous Provenance**: Every derived card tracks its document source and ancestor context, allowing one-click navigation back to the original source.

### 3. Modern FSRS Scheduling Engine

- **Cognitive Science-backed Algorithm**: Moving beyond outdated SM-2 heuristics, FSRS models memory **Stability** and **Difficulty**, providing accurate intervals tailored to individual forgetting curves.
- **Fuzzing (Anti-Clustering)**: Intelligent interval fuzzing prevents card spikes on specific dates.
- **Configurable Rollover Hour**: Tailor your daily reset time (defaulting to 04:00 AM) so late-night study sessions count towards the correct learning day.
- **Flexible Study Modes**: Standard due reviews, end-of-day **Final Drill**, pre-exam **Cram**, and one-click rating **Undo**.

### 4. Dual-Track Queues & Deck Engine

- **Orthogonal Separation**: Reading materials (Topic queue) and memory test cards (Item queue) are scheduled independently, keeping your flashcard reviews fast and focused.
- **Built-in Decks**:
  - `$:/Deck/default`: Global collection of all due memory items across the wiki;
  - `$:/Deck/standalone`: Dedicated deck for standalone cards created independently from reading materials;
  - Custom decks based on documents, tags, or arbitrary TiddlyWiki filters.
- **Comprehensive Card Manager**: Drawer-based management interface supporting Document, Deck, and Flat views with batch operations (postpone, advance, suspend, reset, delete).

---

## ⌨️ Shortcut Cheatsheet

| Shortcut              | Action              | Description                                                    |
| :-------------------- | :------------------ | :------------------------------------------------------------- |
| **Alt + K**           | Omni Card Creator   | Open the global card creator modal from anywhere               |
| **Alt + X**           | Extract Card        | Create an extract card from selected text with full provenance |
| **Alt + Z**           | Cloze Card          | Create a cloze deletion card from selected text                |
| **Alt + Q**           | Q&A Card            | Create a question & answer card from selected text             |
| **Ctrl + F7**         | Set Read Point      | Anchor a reading checkpoint at current text selection          |
| **Alt + F7**          | Jump to Read Point  | Jump back to the read point and highlight the excerpt          |
| **Shift + Ctrl + F7** | Clear Read Point    | Remove the read checkpoint for the current document            |
| **← / →**             | Prev / Next Section | Navigate between sequential sections during reading            |
| **Space**             | Flip / Unfold       | Reveal answer during review, or expand folded content          |
| **1 / 2 / 3 / 4**     | Review Grades       | Grade card: `1` Again, `2` Hard, `3` Good, `4` Easy            |
| **p / n**             | Pause / Next        | Pause study session or skip to next item                       |

---

## ⬇️ Installation

### Method 1: Drag & Drop (Recommended)

1. Download the latest release bundles from [Releases](https://github.com/keepone/Tidme/releases):
   - **`$__plugins_keepone_tidme.json`** (Core plugin)
   - **`$__tidme_languages_zh-Hans.json`** (Optional Chinese language pack)
2. Drag and drop the downloaded JSON file(s) into your TiddlyWiki in the browser;
3. Click **Import** in the confirmation dialogue;
4. Save your wiki and reload the page.

### Method 2: Node.js TiddlyWiki

Copy the built plugin directories into your wiki's `plugins/` folder and include them in `tiddlywiki.info`:

```json
{
  "plugins": [
    "keepone/tidme",
    "tidme/languages/zh-Hans"
  ]
}
```

---

## 🛠️ Local Development & Testing

Built with TypeScript and modern Node.js tooling, running tests directly without bundling overhead.

### Prerequisites

- **Node.js** >= 22 (managed via `fnm` or `nvm`)

### Common Commands

```bash
# 1. Install dependencies
npm install

# 2. Compile plugins (builds TS and produces plugin JSON files in bin/)
node tools/build-plugins.cjs

# 3. Run full test suite (480+ unit, integration, and E2E tests)
npm test

# 4. Run test coverage
npm run test:coverage

# 5. Start dev server (defaults to port 8080)
npm run dev
```

---

## 📄 License & Acknowledgements

- Licensed under the [MIT License](LICENSE).
- Tidme represents a modern architectural rewrite originating from [oflg/Tidme](https://github.com/oflg/Tidme). Deep gratitude to [@oflg](https://github.com/oflg) and the early contributors for their pioneering work on spaced repetition in TiddlyWiki.
