# Agent Guide

This repo is maintained with a strong separation between business flows and implementation details.

## Product

Signal Desk is a local-first news and market briefing app. It collects RSS/news data, enriches and ranks it, streams LLM-generated reports, stores reports as local files, and supports both local llama.cpp and cloud OpenAI-compatible model providers.

The product is not a generic news summarizer. Its value is saving the user from reading every article one by one by filtering noise, connecting related news across days, identifying information gaps, and maintaining a continuous view of technology, business, and market narratives.

When prompts or report logic change, preserve a strict evidence boundary: connections must be grounded in current candidates, previous local reports, or enrichment signals; gaps must be labeled as missing information; inferred implications must not be written as facts.

## Core Principle

Business flow files should read like a clean sequence of intent.

Good flow shape:

```ts
const news = await collectNews();
const ranked = rankNews(news);
const prompt = buildPrompt(ranked, options);
const report = await streamReport(prompt, runtime);
await saveReport(report);
```

Do not bury request parsing, provider quirks, markdown cleanup, prompt replacement, file naming, or fallback parsing inside flow code. Put that work in adapters/helpers.

## Current Structure

- `server.ts`
  - Express API routes
  - report file endpoints
  - LLM health and streaming endpoints
  - Vite middleware
- `src/App.tsx`
  - top-level app state and view orchestration
  - should stay thinner over time
- `src/features/*/components/`
  - feature-specific UI components
  - example: `features/news/components/GeneratePanel`
- `src/shared/components/`
  - reusable cross-feature UI components
  - example: `RunStatus`
- `src/features/news/news-flow.ts`
  - frontend news generation flow
  - RSS collection request, coverage selection, prompt build, LLM stream call
- `src/features/market/market-flow.ts`
  - frontend market scan flow
  - market snapshot request, prompt build, LLM stream call
- `src/shared/lib/llm-stream.ts`
  - shared SSE parsing and LLM stream request helper
- `src/lib/news-workflow.ts`
  - RSS collection, filtering, enrichment, ranking
- `src/lib/news-helpers.ts`
  - news prompt construction from ranked items
- `src/lib/storage.ts`
  - frontend report storage API wrapper
- `src/lib/report-format.ts`
  - markdown cleanup, ticker fallback parsing, display helpers
- `src/lib/prompt-template.ts`
  - small prompt template interpolation helper
- `src/prompts/`
  - editable prompt templates
- `reports/`
  - local generated reports, ignored by git

## Where New Code Should Go

- Business sequence or view orchestration: `src/App.tsx` for now, or a new `src/flows/*` if the flow grows.
- Feature-specific UI component: `src/features/<feature>/components/*`.
- Cross-feature UI component: `src/shared/components/*`.
- Prompt wording: `src/prompts/*`.
- Prompt variable assembly: `src/lib/news-helpers.ts` or a focused prompt builder.
- LLM stream request behavior: `src/shared/lib/llm-stream.ts`.
- News generation flow: `src/features/news/news-flow.ts`.
- Market scan flow: `src/features/market/market-flow.ts`.
- Markdown/report cleanup: `src/lib/report-format.ts`.
- Date/time utilities: create `src/lib/dates.ts` if repeated.
- Server report file logic: keep in `server.ts` for now, or extract to a server-side adapter if it grows.

## Style Rules

- Keep flow code clean and readable.
- Prefer typed constants over string casts.
- Do not add provider-specific behavior into UI components.
- Do not put long prompts in `.ts` files; use `src/prompts/`.
- Do not commit `.env.local`, `reports/`, `dist/`, or generated local files.
- Preserve the legacy localStorage key unless migration is intentionally redesigned.
- Use LA time (`America/Los_Angeles`) for report display and report metadata.

## Validation

Run these before handing off meaningful changes:

```bash
npm.cmd run lint
npm.cmd run build
git diff --check
```

PowerShell may block `npm`; use `npm.cmd`.

## Runtime Notes

Local llama.cpp is expected to expose an OpenAI-compatible endpoint:

```env
LOCAL_LLM_BASE_URL="http://127.0.0.1:8080/v1"
LOCAL_LLM_MODEL="Qwen3-8B-Q6_K.gguf"
```

Cloud providers should also expose OpenAI-compatible chat completions:

```env
CLOUD_LLM_BASE_URL="https://api.openai.com/v1"
CLOUD_LLM_MODEL="gpt-4.1-mini"
```

Compatibility is not perfect across providers. Watch streaming chunk shape, reasoning fields, token limit behavior, and unsupported parameters.

## Refactor Direction

Preferred next decomposition:

```text
src/features/history/components/
  ArchiveCalendar.tsx

src/features/market/components/
  MarketView.tsx
  MarketTickerTape.tsx

src/features/news/components/
  NewsView.tsx
  NewsGeneratingState.tsx

src/shared/components/
  AppShell.tsx

src/flows/
  generate-news-flow.ts
  generate-market-flow.ts
  archive-flow.ts

src/adapters/
  llm-client.ts
  market-data.ts
  report-files.ts
  rss-client.ts
```

Only introduce these when they reduce real complexity. Do not create empty architecture.
