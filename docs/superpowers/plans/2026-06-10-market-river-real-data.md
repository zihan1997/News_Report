# Market River Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder market-river content with one real local narrative and its report/market evidence.

**Architecture:** A shared static JavaScript dataset contains the selected narrative, dated evidence, impact clusters, and latest market reaction. Two standalone HTML files consume that dataset with different visual grammars.

**Tech Stack:** HTML, CSS, vanilla JavaScript

---

### Task 1: Shared Real Dataset

**Files:**
- Create: `docs/mockups/market-river-real-data.js`

- [x] Add the real AI infrastructure narrative, evidence timeline, impact clusters, and June 10 market reaction.
- [x] Keep display summaries concise while retaining report dates and source types.

### Task 2: Event Shockwave View

**Files:**
- Modify: `docs/mockups/market-river-wave-a.html`

- [x] Render major real evidence clusters as shockwaves and narrative water-level changes.
- [x] Add cluster detail interaction and current market divergence.

### Task 3: Continuous Evidence View

**Files:**
- Modify: `docs/mockups/market-river-wave-b.html`

- [x] Render each real evidence item as a support, friction, or market-response observation.
- [x] Add evidence filters and an interactive detail panel.

### Task 4: Verify

- [x] Run `git diff --check`.
- [x] Open both HTML files and verify that real Chinese content, interactions, and responsive layouts render correctly.
