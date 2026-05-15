import { LlmRuntime, NewsReport, RankedNewsItem, ReportDepth } from "../../types";
import { generateEveningPrompt, generateMorningPrompt } from "../../lib/news-helpers";
import { getMemoryContext } from "../../lib/memory";
import { StreamCallbacks, streamLlmReport } from "../../shared/lib/llm-stream";

const REPORT_DEPTH_OPTIONS: Record<ReportDepth, {
  candidateCount: number;
  outputRange: string;
  snippetLength: number;
  localTokens: number;
  cloudTokens: number;
}> = {
  fast: {
    candidateCount: 8,
    outputRange: "5-7",
    snippetLength: 220,
    localTokens: 2048,
    cloudTokens: 3072,
  },
  balanced: {
    candidateCount: 12,
    outputRange: "7-9",
    snippetLength: 260,
    localTokens: 3072,
    cloudTokens: 4096,
  },
  wide: {
    candidateCount: 15,
    outputRange: "8-10",
    snippetLength: 300,
    localTokens: 4096,
    cloudTokens: 4096,
  },
};

export async function generateNews(
  type: "morning" | "evening",
  report: NewsReport,
  runtime: LlmRuntime,
  depth: ReportDepth = "balanced",
  previousContext = "",
  callbacks: StreamCallbacks = {}
) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

  callbacks.onLog?.("Collecting RSS feeds...");
  const collectionResponse = await fetch("/api/collect-news");
  if (!collectionResponse.ok) {
    throw new Error("Failed to collect news from RSS");
  }

  const { news, stats }: { news: RankedNewsItem[]; stats?: { successCount: number; totalSources: number } } =
    await collectionResponse.json();
  callbacks.onLog?.(`RSS ready: ${stats?.successCount ?? news.length}/${stats?.totalSources ?? "?"} sources.`);

  const scope = REPORT_DEPTH_OPTIONS[depth];
  const memoryQuery = [
    type,
    previousContext.slice(0, 2500),
    news.slice(0, scope.candidateCount)
      .map((item) => `${item.title} ${item.category || ""} ${item.source}`)
      .join("\n"),
  ].join("\n\n");
  const memoryContext = await getMemoryContext(memoryQuery);
  if (memoryContext) {
    callbacks.onLog?.("Memory context loaded.");
  }

  const prompt = type === "morning"
    ? generateMorningPrompt(news, today, previousContext, memoryContext, scope)
    : generateEveningPrompt(news, today, previousContext, memoryContext, scope);

  callbacks.onLog?.(`Prompt ready: about ${Math.ceil(prompt.length / 4)} tokens by rough estimate.`);
  callbacks.onLog?.(`Coverage: ${depth} (${scope.candidateCount} candidates, ${scope.outputRange} final items).`);

  const tokenBudget = runtime === "cloud" ? scope.cloudTokens : scope.localTokens;
  callbacks.onLog?.(`Starting ${runtime} stream with ${tokenBudget} max output tokens...`);

  return streamLlmReport(prompt, report, runtime, callbacks, tokenBudget);
}
