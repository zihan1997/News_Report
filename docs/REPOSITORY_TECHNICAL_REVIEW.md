# Repository Technical Review

## 1. Executive Summary

### What this project currently does
This repository implements a personal intelligence dashboard with three core capabilities:
1. RSS aggregation from a curated source list.
2. Heuristic ranking and de-duplication of recent stories.
3. LLM-generated Morning/Evening briefings and a Market Reaction Scan based on Finnhub quotes.

### Current maturity stage
This project is a **prototype / advanced demo**, not production-ready.

### Strongest parts
- Clear intent: “high-signal personal intelligence,” not social feed mechanics.
- RSS-first pipeline before model generation.
- Distinct market-analysis lane, separated from news lane.
- Pragmatic prompt scaffolding with confidence and risk sections.

### Biggest architectural risks
- Provider boundary and key handling are inconsistent (frontend has Gemini SDK usage while backend also has model routes).
- Reliability is weak (no retries/backoff/caching/job scheduling/persistent store).
- Ranking and duplicate detection are title-centric and can mis-rank or collapse distinct stories.
- Output contract with LLM is mostly markdown text; schema stability is low.

---

## 2. Current Architecture

### System flow (as implemented)
1. **RSS/feed collection**: backend parses all configured feeds serially.
2. **Processing**: filter by 24h window, de-duplicate by normalized title string includes, rank by source weight + keywords + recency + category bonuses.
3. **Frontend generation flow**:
   - Calls `/api/collect-news`.
   - Builds prompt from ranked list + history context.
   - Calls Gemini directly (SDK in frontend path) or `/api/generate-news` for Ollama path.
4. **Market flow**:
   - Calls `/api/market-data` for quotes.
   - Embeds snapshot in prompt and asks model for analysis.
   - Extracts ticker JSON from markdown tags.
5. **Persistence**: localStorage only.

### API routes
- `GET /api/collect-news`
- `GET /api/market-data`
- `POST /api/generate-news` (used for Ollama path, also market fallback)
- `GET /api/health` (checks Ollama/OpenAI-compatible route)

### Error handling and retries
- Per-feed `try/catch` exists; failures are logged and skipped.
- No retry/backoff/circuit breaker.
- No timeout strategy.
- No job queue or scheduled refresh.

### Text architecture diagram
```text
[Browser React App]
   |-- fetch /api/collect-news ---------------------> [Express server]
   |                                                   |-- RSS parse feeds
   |                                                   |-- filter/dedupe/rank
   |
   |-- (provider=gemini) local SDK call -----------> [Gemini API]
   |-- (provider=ollama) POST /api/generate-news --> [Express -> OpenAI client -> Ollama]
   |
   |-- fetch /api/market-data ----------------------> [Express -> Finnhub]
   |-- prompt + market context ---------------------> [Gemini or Ollama]
   |
   |-- save reports/history ------------------------> [localStorage]
```

---

## 3. File-by-File Analysis

## `server.ts`
**Responsibility:** HTTP API + dev server middleware + model proxy path for Ollama.

**What is clear:** route surface is straightforward.

**Issues:**
- Server owns route wiring + model behavior + prompt hygiene (output cleanup) in one file.
- `/api/health` validates only Ollama path; does not represent selected provider end-to-end.
- No request-level validation (e.g., zod schema).

## `src/App.tsx`
**Responsibility:** entire UI + orchestration + generation rules + history operations.

**What is clear:** user interaction flow is complete.

**Issues:**
- Doing too much: view state, orchestration, domain policy (evening timing rule), data extraction/parsing, and rendering in one component.
- Market ticker extraction via regex on model output is brittle.
- Hard to test due to mixed concerns.

## `src/lib/news-workflow.ts`
**Responsibility:** source list, RSS ingestion, recency filtering, dedupe, scoring.

**What is clear:** pipeline sequence and scoring intent.

**Issues:**
- Source registry, pipeline, model helper methods, and prompt generation imports are mixed in one module.
- `verifyWithGoogleSearchIfNeeded` is effectively a stub.
- De-dup and confirmation rely heavily on title string normalization and prefix matching.

## `src/lib/gemini.ts`
**Responsibility:** frontend-side generation workflows and prompts assembly trigger.

**Issues:**
- Mixed provider orchestration and prompt composition in client-side runtime.
- Potential key-boundary risk from frontend SDK usage.
- Uses large markdown prompts where deterministic extraction should be code-first.

## `src/lib/news-helpers.ts`
**Responsibility:** longform prompt templates for morning/evening.

**Strength:** explicit confidence/risk language.

**Issue:** output contract remains free-form markdown; no strict schema.

## `src/lib/finnhub.ts`
**Responsibility:** quote fetch and market-open heuristic.

**Issue:** market status heuristic is simplistic (no holidays/half-days/pre/post separation).

## `src/lib/storage.ts`
**Responsibility:** localStorage-based report history.

**Issue:** no versioning/migrations, no cross-device persistence, no server trust log.

## `src/types.ts`
**Responsibility:** shared types for reports/news/market models.

**Issue:** lacks first-class provenance/confidence/duplicate-group metadata for robust pipeline guarantees.

## Other files
- `README.md`: minimal run instructions only.
- `.env.example`: contains Ollama vars; does not document all active runtime vars (e.g., Gemini/Finnhub).

---

## 4. Data Flow and Type Design

### Current data contracts
- `RawNewsItem` includes title/link/source/category/publishedAt/snippet/weight.
- `RankedNewsItem` adds score/matchedKeywords/confirmationCount.
- `NewsReport` stores markdown content and type.

### Contract stability assessment
- Enough for demo rendering.
- Not enough for trust-oriented intelligence system because it lacks explicit evidence model and event identity.

### Missing fields (recommended)
- `sourceDomain`, `sourceTier`, `fetchedAt`, `language`
- `eventId`, `duplicateGroupId`, `canonicalTitle`
- `evidence[]` (url, publisher, publishedAt, quote)
- `confidenceScore` (0-1), `confidenceReason`
- `stalenessMinutes`, `relevanceReason`
- `pipelineVersion`

### Suggested interfaces
```ts
export interface NewsEvidence {
  url: string;
  publisher: string;
  publishedAt: string;
  title: string;
  snippet?: string;
  tier: 1 | 2 | 3;
}

export interface NormalizedNewsItem {
  id: string;
  canonicalTitle: string;
  sourceDomain: string;
  sourceCategory: 'hard_news' | 'tech_ai' | 'markets' | 'security' | 'community' | 'policy';
  publishedAt: string;
  fetchedAt: string;
  language: string;
  evidence: NewsEvidence[];
  entities: string[];
  keywords: string[];
  duplicateGroupId?: string;
}

export interface RankedStory {
  eventId: string;
  title: string;
  summary: string;
  rankScore: number;
  confidenceScore: number; // 0..1
  confidenceReason: string;
  freshnessScore: number;
  corroborationScore: number;
  relevanceScore: number;
  evidence: NewsEvidence[];
  updatedAt: string;
  pipelineVersion: string;
}
```

---

## 5. RSS Feed Strategy

### Current feed list quality
Current list covers hard news, business, policy, tech media, security specialist, and community signal. This is good breadth for a personal dashboard.

### Current weaknesses
- Market-specific primary sources are light (you rely mostly on Finnhub quotes, less on macro/news wires).
- Community and tech feeds can overwhelm hard-news signals without stronger gating.
- Weights are static and manually tuned; no observed performance feedback loop.

### Recommended source buckets
1. **Hard News (Tier-1):** Reuters/AP/BBC/FT/WSJ (global facts)
2. **Tech/AI (Tier-2):** The Verge/WIRED/TechCrunch/Ars
3. **Markets/Macro (Tier-1/2):** Bloomberg/MarketWatch/Fed releases/Treasury releases
4. **Security (Tier-2):** BleepingComputer/THN/Krebs
5. **Community Signal (Tier-3):** Hacker News/selected blogs
6. **Personal Compass Inputs:** user watchlist sources + policy docs + company IR pages

### Practical feed policy
- Daily fixed budget: e.g., max N stories per bucket entering ranking.
- Tier-aware confirmations: two Tier-3 sources should not equal one Tier-1 confirmation.

---

## 6. Ranking and Deduplication

### Current ranking signals
- Source weight
- Keyword matches across priority topics
- Category bonuses
- Recency bonuses
- Confirmation count by normalized title prefix
- Community source penalty/bonus logic

### Risks
- Title-prefix confirmation collisions.
- Substring-based dedupe false positives/false negatives.
- Score inflation via stacked keyword hits.

### Proposed deterministic scoring formula
```text
score(event) =
  0.30 * sourceAuthority
+ 0.20 * recency
+ 0.20 * corroboration
+ 0.15 * topicFit
+ 0.10 * entityPriority
+ 0.05 * marketImpactProxy
- 0.20 * uncertaintyPenalty
```

Where each component is normalized [0, 100], then transformed to [0,1].

### Dedup strategy upgrade
1. Build canonical token set (lowercase/lemmatized/title cleaned).
2. Compute similarity using:
   - title similarity (Jaccard/cosine)
   - entity overlap
   - publication time proximity window
3. Merge into event cluster when score exceeds threshold (e.g., 0.82).
4. Assign `duplicateGroupId` and maintain all evidence links.

### AI relevance usage
Use LLM only for tie-break explanation or semantic topicality where heuristics are ambiguous; never for primary dedupe identity.

---

## 7. Prompt and AI Usage Review

### Current prompt quality
- Strong editorial tone and anti-sensational constraints.
- However, output remains loosely structured markdown and may drift.

### Where code should replace model work
- Confidence computation should be rule-based first.
- Citation normalization should be deterministic, not free-text.
- JSON extraction via regex markers should be replaced with explicit schema responses.

### Production-oriented prompt patterns

#### 1) Daily News Brief prompt (structured)
```text
System:
You are an intelligence editor. Only use supplied EVIDENCE objects. Never fabricate URLs.
Return strict JSON matching schema DailyBriefV1.

User payload:
- timezone: America/Los_Angeles
- date
- rankedStories[] with evidence[] and confidenceScore

Required output schema:
{
  "headlineSummary": string,
  "topStories": [
    {
      "eventId": string,
      "title": string,
      "whyItMatters": string,
      "confidence": number,
      "unknowns": string[],
      "citations": ["url1", "url2"]
    }
  ],
  "watchlist": string[]
}
```

#### 2) Compass / Personal Position prompt
```text
System:
You are a decision-support analyst, not a forecaster.
Use only given facts, user profile, constraints, and current portfolio/watchlist.
Return CompassV1 JSON.

Output focus:
- What changed in my world today?
- What assumptions are now weaker/stronger?
- What should I monitor in next 24h/7d?
```

#### 3) Action Recommendations prompt
```text
System:
Produce actionable but non-financial-advice recommendations.
Each action must include trigger, owner(me/team), effort, deadline, and confidence.
No action without at least one citation.
Return ActionPlanV1 JSON.
```

---

## 8. Product Design Review

### Should it have multiple tabs?
Yes, but tabs should map to layers of cognition.

### Recommended tabs
1. **News Brief** (information layer)
   - top ranked events, confidence, citations, deltas from previous run
2. **Compass / Where I Stand** (decision layer)
   - what these events mean for your priorities and risk posture
3. **Action** (execution layer)
   - concrete tasks/checks with triggers and deadlines
4. **Sources / Debug** (trust layer)
   - feed health, dropped items, dedupe clusters, scoring breakdown

### Principle
- Keep “News Brief” descriptive.
- Keep “Compass/Action” prescriptive but evidence-linked.

---

## 9. Reliability and Trustworthiness

### Findings
- Source links are present in inputs but generated summaries may omit or alter references.
- Multi-source confirmation is heuristic and title-centric.
- Timezone is partially handled with LA timezone, but consistency can drift across modules.
- Empty/malformed feeds are logged but no quality status surfaced to user.

### Improvements
1. Enforce citation pass-through: each output claim maps to evidence URLs.
2. Add confidence pipeline:
   - code computes base confidence
   - LLM only explains confidence, cannot raise above computed cap.
3. Add feed health status endpoint and UI panel.
4. If feed count below threshold, show degraded-mode banner.
5. Reject/flag AI-generated links not present in evidence list.

---

## 10. Performance and Cost

### Current strengths
- RSS-first design avoids always-on web-search costs.

### Current waste points
- Full prompt regeneration with long history blocks can inflate token usage.
- No caching of ranked feed results.
- No incremental diff mode for evening updates.

### Recommendations
1. Cache RSS snapshots per source (TTL 5-15 min).
2. Cache ranked event clusters (TTL 15-30 min).
3. Evening mode should process only new/changed events since morning baseline.
4. Use compact structured payloads instead of raw markdown history chunks.
5. Introduce token budget guardrail and truncation policy.

---

## 11. Missing Production Features

1. Persistent backend storage (Postgres/SQLite at minimum).
2. User preference profile (topic weights, source trust adjustments, watchlist).
3. Feed management UI (enable/disable source, weight tuning).
4. Observability (structured logs, error rates, latency, token cost).
5. Scheduler/worker for morning-evening auto runs.
6. Retry/backoff and timeout policies.
7. Test coverage (unit + integration for pipeline/ranking/routes).
8. Environment variable validation at startup.
9. Hardened deployment with reverse proxy, TLS, and secrets management.

---

## 12. Refactor Plan

### Phase 1: Stabilize
- Move all model calls server-side.
- Add provider-aware `/api/health` checks.
- Add env validation and defensive request schema validation.
- Replace regex JSON extraction with schema-validated JSON output.

### Phase 2: Separate Concerns
- Split `App.tsx` into feature views + hooks.
- Extract ranking/dedupe into isolated services with tests.
- Add `sources/debug` API for transparency.

### Phase 3: Add Compass
- Introduce profile model (priorities/risk/time horizon).
- Build Compass pipeline from ranked events + profile.
- Add Action tab with trigger-based tasks.

### Phase 4: Productionize
- Add database and scheduled pipelines.
- Add caching + queue + retries.
- Add observability dashboards.
- Add CI tests and deployment hardening.

---

## 13. Concrete Code Recommendations

### Suggested folder structure
```text
src/
  features/
    news/
      ingest.ts
      dedupe.ts
      rank.ts
      summarize.ts
      types.ts
    market/
      snapshot.ts
      analyze.ts
    compass/
      evaluate.ts
      actions.ts
  api/
    routes/
      news.ts
      market.ts
      health.ts
      debug.ts
    schemas/
      requests.ts
      responses.ts
  shared/
    config/
    logging/
    errors/
```

### Suggested scoring function (TypeScript sketch)
```ts
function scoreStory(s: StoryFeatures): number {
  const score =
    0.30 * s.sourceAuthority +
    0.20 * s.recency +
    0.20 * s.corroboration +
    0.15 * s.topicFit +
    0.10 * s.entityPriority +
    0.05 * s.marketImpact -
    0.20 * s.uncertainty;
  return Math.max(0, Math.min(100, score * 100));
}
```

### Suggested prompt files
- `prompts/news/dailyBrief.system.txt`
- `prompts/compass/position.system.txt`
- `prompts/action/recommendation.system.txt`
- `prompts/schemas/*.json` for structured output contracts

### Suggested API design
- `GET /api/news/collect?windowHours=24`
- `POST /api/news/rank`
- `POST /api/news/brief`
- `POST /api/compass/evaluate`
- `POST /api/actions/recommend`
- `GET /api/sources/health`
- `GET /api/health?provider=gemini|ollama|finnhub`

---

## 14. Final Verdict

### Is this architecture worth continuing?
**Yes — as a foundation.** The core product thesis is strong.

### What should be kept?
- RSS-first worldview.
- Morning/Evening cadence.
- Separate market analysis lane.
- Source-weight + recency + priority-topic concept.

### What should be rewritten?
- Key/runtime boundary (all LLM calls to backend).
- Dedup/confirmation model (event clustering, not title includes).
- Monolithic frontend orchestration (`App.tsx`) into modular layers.
- Output contract to strict JSON + citation validation.

### Single most important next step
**Move all model calls behind backend APIs with strict schema output and citation enforcement.**

That one step simultaneously improves security, reliability, observability, and long-term maintainability.
