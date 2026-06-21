import { LlmRuntime, MarketQuote, MarketTicker, NewsReport } from "../../types";
import marketTemplate from "../../prompts/market-intelligence.md?raw";
import { fillTemplate } from "../../lib/prompt-template";
import { getMemoryContext } from "../../lib/memory";
import { StreamCallbacks, streamLlmReport } from "../../shared/lib/llm-stream";

export async function generateMarketIntelligence(
  report: NewsReport,
  runtime: LlmRuntime,
  newsContext = "",
  historyContext = "",
  callbacks: StreamCallbacks = {}
) {
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

  const memoryContext = await getMemoryContext([
    "market",
    newsContext.slice(0, 3500),
    historyContext.slice(0, 1500),
    tickerJson,
  ].join("\n\n"));
  if (memoryContext) {
    callbacks.onLog?.("Memory context loaded.");
  }

  const marketPrompt = fillTemplate(marketTemplate, {
    timeStr,
    dateStr,
    tickerJson,
    newsContext,
    historyContext,
    memoryContext: memoryContext || "无",
    marketStatusSummary,
  });

  callbacks.onLog?.(`Prompt ready: about ${Math.ceil(marketPrompt.length / 4)} tokens by rough estimate.`);

  const tokenBudget = runtime === "cloud" ? 4096 : 2048;
  callbacks.onLog?.(`Starting ${runtime} stream with ${tokenBudget} max output tokens...`);

  const content = await streamLlmReport(marketPrompt, report, runtime, callbacks, tokenBudget);
  return { content, tickers };
}
