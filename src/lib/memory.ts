import { LlmRuntime, NewsReport } from "../types";

type MemoryContextResponse = {
  context: string;
};

type MemoryUpdateResponse = {
  event: string | null;
  drafts: string | null;
  updates: string[];
  newCandidates: unknown[];
  skipped?: boolean;
  metrics?: {
    promptTokensEstimate?: number;
    responseMs?: number;
    parseMs?: number;
    outputTokensEstimate?: number;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    totalMs?: number;
  };
};

export type MemoryItem = {
  id: string;
  title: string;
  status: string;
  confidence: string;
  lastUpdated: string;
  currentState: string;
  content: string;
  sortTime?: number;
};

export type MemoryEvent = {
  fileName: string;
  reportId: string;
  reportType: "morning" | "evening" | "market";
  reportDate: string;
  createdAt: string;
  updates: Array<{
    targetType: "story" | "narrative";
    targetId: string;
    action: string;
    summary: string;
    evidence: string[];
    openGaps: string[];
  }>;
  newCandidates: unknown[];
};

export type MemoryDraft = {
  fileName: string;
  reportId: string;
  reportType: "morning" | "evening" | "market";
  reportDate: string;
  newCandidates: Array<{
    targetType: "story" | "narrative";
    title: string;
    reason: string;
    evidence: string[];
  }>;
};

export type MemoryDraftReview = {
  fileName: string;
  action: "promote" | "dismiss";
  reviewedAt: string;
  draftFileName: string;
  candidateIndex: number;
  sourceReportId: string;
  sourceReportType: "morning" | "evening" | "market" | "unknown";
  sourceReportDate: string;
  candidate: {
    targetType: "story" | "narrative";
    title: string;
    reason: string;
    evidence: string[];
  };
  promoted: { targetType: "story" | "narrative"; targetId: string } | null;
};

export type MemoryReviewResponse = {
  stories: MemoryItem[];
  narratives: MemoryItem[];
  events: MemoryEvent[];
  drafts: MemoryDraft[];
  reviewTrail: MemoryDraftReview[];
};

export async function getMemoryContext(query: string, limit = 6) {
  const response = await fetch("/api/memory/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });

  if (!response.ok) {
    return "";
  }

  const data = await response.json() as MemoryContextResponse;
  return data.context || "";
}

export async function updateMemoryFromReport(report: NewsReport, runtime: LlmRuntime) {
  const response = await fetch("/api/memory/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report, runtime }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to update memory.");
  }

  return await response.json() as MemoryUpdateResponse;
}

export async function getMemoryReview() {
  const response = await fetch("/api/memory");
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to load memory.");
  }

  return await response.json() as MemoryReviewResponse;
}

export async function applyMemoryDraftAction(fileName: string, candidateIndex: number, action: "promote" | "dismiss") {
  const response = await fetch("/api/memory/drafts/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, candidateIndex, action }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to apply draft action.");
  }

  return await response.json() as {
    ok: boolean;
    action: "promote" | "dismiss";
    promoted: { targetType: "story" | "narrative"; targetId: string } | null;
    remaining: number;
    reviewRecord: string;
  };
}
