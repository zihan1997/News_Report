import { MarketIntelligence, MarketTicker, NewsReport } from "../types";

export function getMarketTickers(report: MarketIntelligence): MarketTicker[] {
  if (report.tickers?.length) return report.tickers;

  return report.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("标的"))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length >= 4)
    .map((cells) => ({
      symbol: cells[0],
      price: cells[1],
      change: cells[2],
      changePercent: cells[2],
      trend: cells[3].includes("▼") || cells[2].startsWith("-")
        ? "down"
        : cells[3].includes("▲") || cells[2].startsWith("+")
          ? "up"
          : "neutral",
    }));
}

export function cleanMarketContent(content: string) {
  return content
    .replace(/\[JSON_TICKERS_BEGIN\][\s\S]*?\[JSON_TICKERS_END\]/g, "")
    .replace(/\n?\|[^\n]*(市场|状态|标的|收盘价|涨跌幅|趋势)[^\n]*\|\n\|[-:\s|]+\|\n(?:\|[^\n]*\|\n?)+/g, "\n")
    .replace(/([。；])\s*(分析：|限制：|观察：|风险：)/g, "$1\n\n$2")
    .replace(/(^|\n)(市场表现：|分析：|限制：|观察：|风险：)/g, "$1- **$2**")
    .replace(/- \*\*(市场表现：|分析：|限制：|观察：|风险：)\*\*/g, (_match, label: string) => `- **${label.slice(0, -1)}**：`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getReportTitle(report: NewsReport) {
  return report.content.split("\n")[0].replace(/^#\s*/, "") || (
    report.type === "market" ? "Market Intelligence" : "Daily Briefing"
  );
}

export function getReportKeywords(report: NewsReport) {
  return report.content
    .split("\n")
    .filter((line) => line.match(/^\d+\.\s/))
    .map((line) => line.replace(/^\d+\.\s/, "").split("（")[0])
    .slice(0, 2)
    .join(" · ");
}
