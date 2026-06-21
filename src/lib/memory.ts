import { LlmRuntime, NewsReport } from "../types";

type MemoryContextResponse = {
  context: string;
};

type MemoryUpdateResponse = {
  event: string | null;
  drafts: string | null;
  updates: string[];
  pendingConsolidations?: Array<{
    targetType: "story" | "narrative";
    targetId: string;
    fileName: string;
  }>;
  newCandidates: unknown[];
  skipped?: boolean;
  skippedOfficialUpdates?: boolean;
  reason?: "market_report" | string;
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

export type MemoryConsolidationProposal = {
  currentState?: string;
  resolved?: string[];
  openGaps?: string[];
  weakSignals?: string[];
  openQuestions?: string[];
  watchlist?: string[];
};

export type MemoryConsolidationReview = {
  fileName: string;
  action: "consolidate";
  targetType: "story" | "narrative";
  targetId: string;
  appliedAt: string;
  rolledBackAt?: string;
  runtime: string;
  status: "applied" | "rolled_back";
  before: {
    lastUpdated: string;
    sections: Record<string, string>;
    fullContent: string;
  };
  after: {
    lastUpdated: string;
    sections: Record<string, string>;
    fullContent: string;
  };
  proposal: MemoryConsolidationProposal;
};

export type MemoryPendingConsolidation = {
  fileName: string;
  action: "pending_consolidation";
  targetType: "story" | "narrative";
  targetId: string;
  proposedAt: string;
  runtime: string;
  status: "pending";
  sourceReportId: string;
  sourceReportType: "morning" | "evening" | "market";
  sourceReportDate: string;
  current: {
    lastUpdated: string;
    sections: Record<string, string>;
    fullContent: string;
  };
  proposal: MemoryConsolidationProposal;
};

export type MemoryConsolidationResponse = {
  targetType: "story" | "narrative";
  targetId: string;
  current: {
    lastUpdated: string;
    sections: Record<string, string>;
  };
  proposal: MemoryConsolidationProposal;
  metrics?: {
    responseMs?: number;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
  };
};

export type MemoryReviewResponse = {
  stories: MemoryItem[];
  narratives: MemoryItem[];
  events: MemoryEvent[];
  drafts: MemoryDraft[];
  reviewTrail: MemoryDraftReview[];
  consolidationTrail: MemoryConsolidationReview[];
  pendingConsolidations: MemoryPendingConsolidation[];
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

export async function proposeMemoryConsolidation(targetType: "story" | "narrative", targetId: string, runtime: LlmRuntime) {
  const response = await fetch("/api/memory/consolidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType, targetId, runtime }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Failed to propose memory consolidation.");
  }

  return await response.json() as MemoryConsolidationResponse;
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return "";
  try {
    const data = JSON.parse(text);
    return data.error || text;
  } catch {
    return text;
  }
}

export async function applyMemoryConsolidation(
  targetType: "story" | "narrative",
  targetId: string,
  proposal: MemoryConsolidationProposal,
  runtime: LlmRuntime
) {
  const response = await fetch("/api/memory/consolidate/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType, targetId, proposal, runtime }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to apply memory consolidation.");
  }

  return await response.json() as { ok: boolean; targetType: "story" | "narrative"; targetId: string; reviewRecord: string };
}

export async function rollbackMemoryConsolidation(reviewFileName: string) {
  const response = await fetch("/api/memory/consolidate/rollback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewFileName }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to rollback memory consolidation.");
  }

  return await response.json() as { ok: boolean; targetType: "story" | "narrative"; targetId: string; reviewRecord: string };
}

export async function applyPendingMemoryConsolidation(fileName: string, action: "apply" | "dismiss") {
  const response = await fetch("/api/memory/consolidate/pending/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, action }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Failed to update pending memory consolidation.");
  }

  return await response.json() as {
    ok: boolean;
    action: "apply" | "dismiss";
    targetType: "story" | "narrative";
    targetId: string;
    reviewRecord?: string;
  };
}
