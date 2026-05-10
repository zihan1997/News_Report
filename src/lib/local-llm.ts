import { LlmRuntime, MarketQuote, MarketTicker, NewsReport, RankedNewsItem, ReportDepth } from "../types";
import { generateMorningPrompt, generateEveningPrompt } from "./news-helpers";
import marketTemplate from "../prompts/market-intelligence.md?raw";
import { fillTemplate } from "./prompt-template";

type StreamCallbacks = {
  onLog?: (message: string) => void;
  onToken?: (delta: string, content: string) => void;
  onReasoning?: (delta: string, content: string) => void;
};

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

async function streamLocalReport(
  prompt: string,
  report: NewsReport,
  runtime: LlmRuntime,
  callbacks: StreamCallbacks = {},
  maxTokens = 2048
) {
  const response = await fetch("/api/generate-news-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, maxTokens, report, runtime }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || `Local llama request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      const dataLine = eventText.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const event = JSON.parse(dataLine.slice(6));
      if (event.type === "log") {
        callbacks.onLog?.(event.message);
      } else if (event.type === "token") {
        content += event.delta;
        callbacks.onToken?.(event.delta, content);
      } else if (event.type === "reasoning") {
        reasoning += event.delta;
        callbacks.onReasoning?.(event.delta, reasoning);
      } else if (event.type === "done") {
        callbacks.onLog?.(`Done. Streamed ${event.tokenCount} content chunks, ${event.reasoningCount || 0} reasoning chunks.`);
        return event.content || content;
      } else if (event.type === "error") {
        throw new Error(event.error || "Local llama stream failed.");
      }
    }
  }

  return content.trim();
}

export const generateNews = async (
  type: "morning" | "evening",
  report: NewsReport,
  runtime: LlmRuntime,
  depth: ReportDepth = "balanced",
  previousContext = "",
  callbacks: StreamCallbacks = {}
) => {
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
  const prompt = type === "morning"
    ? generateMorningPrompt(news, today, previousContext, scope)
    : generateEveningPrompt(news, today, previousContext, scope);

  callbacks.onLog?.(`Prompt ready: about ${Math.ceil(prompt.length / 4)} tokens by rough estimate.`);
  callbacks.onLog?.(`Coverage: ${depth} (${scope.candidateCount} candidates, ${scope.outputRange} final items).`);
  const tokenBudget = runtime === "cloud" ? scope.cloudTokens : scope.localTokens;
  callbacks.onLog?.(`Starting ${runtime} stream with ${tokenBudget} max output tokens...`);
  return streamLocalReport(prompt, report, runtime, callbacks, tokenBudget);
};

export const generateMarketIntelligence = async (
  report: NewsReport,
  runtime: LlmRuntime,
  newsContext = "",
  historyContext = "",
  callbacks: StreamCallbacks = {}
) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Los_Angeles",
  });

  callbacks.onLog?.("Fetching market snapshot...");
  const marketResponse = await fetch("/api/market-data");
  if (!marketResponse.ok) {
    throw new Error("Failed to fetch market data");
  }

  const { snapshot }: { snapshot: MarketQuote[] } = await marketResponse.json();
  const marketStatusSummary = snapshot.some((quote) => quote.marketStatus === "open") ? "Open" : "Closed";
  const tickerJson = JSON.stringify(snapshot.map((quote) => ({
    symbol: quote.name,
    price: quote.price !== null ? quote.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "Unknown",
    change: quote.change !== null ? (quote.change >= 0 ? "+" : "") + quote.change.toFixed(2) : "Unknown",
    changePercent: quote.changePercent !== null ? (quote.changePercent >= 0 ? "+" : "") + quote.changePercent.toFixed(2) + "%" : "Unknown",
    marketStatus: quote.marketStatus,
  })), null, 2);

  const tickers: MarketTicker[] = snapshot.map((quote) => ({
    symbol: quote.name,
    price: quote.price !== null ? quote.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "Unknown",
    change: quote.change !== null ? (quote.change >= 0 ? "+" : "") + quote.change.toFixed(2) : "Unknown",
    changePercent: quote.changePercent !== null ? (quote.changePercent >= 0 ? "+" : "") + quote.changePercent.toFixed(2) + "%" : "Unknown",
    trend: quote.change && quote.change > 0 ? "up" : quote.change && quote.change < 0 ? "down" : "neutral",
  }));

  const marketPrompt = fillTemplate(marketTemplate, {
    timeStr,
    dateStr,
    tickerJson,
    newsContext,
    historyContext,
    marketStatusSummary,
  });

  callbacks.onLog?.(`Prompt ready: about ${Math.ceil(marketPrompt.length / 4)} tokens by rough estimate.`);
  const tokenBudget = runtime === "cloud" ? 4096 : 2048;
  callbacks.onLog?.(`Starting ${runtime} stream with ${tokenBudget} max output tokens...`);
  const content = await streamLocalReport(marketPrompt, report, runtime, callbacks, tokenBudget);
  return { content, tickers };
};
