# Scheduled Market and River Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Narrative River immediately readable and allow persistent LA-time market scans at 07:00, 10:30, 13:00, and 15:30 on weekdays.

**Architecture:** Keep schedule calculation in a small shared pure module. The Node server owns persisted settings, due-slot detection, generation, and report saving so schedules survive browser closure. The Market UI reads and updates scheduler state while retaining manual scans.

**Tech Stack:** TypeScript, Node test runner through `tsx`, Express, React, Tailwind CSS, date-fns-tz.

---

### Task 1: Pure Schedule Calculation

**Files:**
- Create: `src/features/market/market-schedule.ts`
- Create: `src/features/market/market-schedule.test.ts`

- [ ] Write tests for same-day next slot, weekend skipping, and due-slot idempotency.
- [ ] Run `npx.cmd tsx --test src/features/market/market-schedule.test.ts` and verify failure.
- [ ] Implement the pure schedule helpers.
- [ ] Run the schedule tests and verify pass.

### Task 2: Server-Owned Scheduler

**Files:**
- Modify: `server.ts`
- Create at runtime: `config/market-schedule.json`

- [ ] Add persisted schedule settings and scheduler status endpoints.
- [ ] Add a reusable server-side market scan job using the existing market prompt, LLM configuration, report storage, recent news, and recent market reports.
- [ ] Add due-slot polling with duplicate-slot protection and run-now endpoint.
- [ ] Log scheduled run start, completion, failure, and next run.

### Task 3: Scheduled Market Settings UI

**Files:**
- Create: `src/features/market/market-schedule-api.ts`
- Modify: `src/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/market/components/MarketView.tsx`

- [ ] Load scheduler state when the app opens and after runs.
- [ ] Add settings control for enable/disable, weekday slots, runtime, next run, and recent result.
- [ ] Preserve the manual market scan button.
- [ ] Refresh history after a scheduled run creates a report.

### Task 4: Narrative River Reading Guidance

**Files:**
- Modify: `docs/mockups/market-river-honest.html`

- [ ] Add a top-level “today’s key relationship” summary.
- [ ] Label each row as “新闻提出了什么 / 当前关系 / 市场如何回应”.
- [ ] Add numbered reading order and increase the visual weight of the relationship bridge.

### Task 5: Verification

- [ ] Run `npx.cmd tsx --test src/features/market/market-schedule.test.ts`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `git diff --check`.

