import { GoogleGenAI } from "@google/genai";
import { RankedNewsItem } from "../types";
import { generateMorningPrompt, generateEveningPrompt } from "./news-helpers";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * RSS-first News Generation Workflow
 */
export const generateNews = async (
  type: 'morning' | 'evening',
  provider: 'gemini' | 'ollama',
  previousContext: string = ''
) => {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/Los_Angeles'
  });

  let rankedNews: RankedNewsItem[] = [];

  try {
    // 1. Step: Collect and Rank news via our server-side collector
    const collectionResponse = await fetch("/api/collect-news");
    if (!collectionResponse.ok) {
      throw new Error("Failed to collect news from RSS");
    }
    const { news }: { news: RankedNewsItem[] } = await collectionResponse.json();
    rankedNews = news;

    // 2. Step: Verification / Fallback with Google Search if news count is too low
    let finalNews = news;
    const needsSearch = news.length < 8;

    // 3. Step: Generate Prompt
    const prompt = type === 'morning' 
      ? generateMorningPrompt(finalNews, today, previousContext)
      : generateEveningPrompt(finalNews, today, previousContext);

    // 4. Step: Call LLM
    if (provider === 'gemini') {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: needsSearch ? [{ googleSearch: {} }] : undefined,
        }
      });
      return response.text || "Failed to generate news content.";
    } else {
      const response = await fetch("/api/generate-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, prompt }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to generate news");
      }

      const data = await response.json();
      return data.content || "Failed to generate news content.";
    }
  } catch (error) {
    console.error("News Generation Workflow Error:", error);
    
    // FALLBACK MODE
    if (rankedNews.length > 0) {
      const topItems = rankedNews.slice(0, 5);
      let fallbackReport = `### ⚠️ AI Analysis Unavailable (Fallback Mode)\n\n*The news report was generated using raw RSS signals due to an LLM service interruption.*\n\n---\n\n`;
      
      topItems.forEach((item, i) => {
        fallbackReport += `### ${i + 1}. ${item.title}\n`;
        fallbackReport += `- **Source**: ${item.source} (${item.category})\n`;
        fallbackReport += `- **Confidence**: [${item.confidence}]\n`;
        if (item.publishedAt) fallbackReport += `- **Published**: ${new Date(item.publishedAt).toLocaleTimeString()}\n`;
        fallbackReport += `- **Quick Look**: ${(item.contentSnippet || "No snippet available").slice(0, 150)}...\n`;
        fallbackReport += `- **[Source Link](${item.link})**\n\n`;
      });
      
      return fallbackReport;
    }
    
    throw error;
  }
};

export const generateMarketIntelligence = async (
  provider: 'gemini' | 'ollama',
  newsContext: string = ''
) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/Los_Angeles'
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Los_Angeles'
  });

  let marketSnapshot: any[] = [];

  try {
    // 1. Fetch real market data from our API
    const marketResponse = await fetch("/api/market-data");
    if (!marketResponse.ok) {
      throw new Error("Failed to fetch market data");
    }
    const { snapshot } = await marketResponse.json();
    marketSnapshot = snapshot;

    // 2. Prepare the market data for the prompt
    const marketStatusSummary = snapshot.some((s: any) => s.marketStatus === 'open') ? 'Open' : 'Closed';
    const tickerJson = JSON.stringify(snapshot.map((s: any) => ({
      symbol: s.name,
      price: s.price !== null ? s.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "Unknown",
      change: s.change !== null ? (s.change >= 0 ? "+" : "") + s.change.toFixed(2) : "Unknown",
      changePercent: s.changePercent !== null ? (s.changePercent >= 0 ? "+" : "") + s.changePercent.toFixed(2) + "%" : "Unknown",
      marketStatus: s.marketStatus
    })), null, 2);

    const marketPrompt = `
你是一名首席市场分析师，风格克制、专业、基于证据（Institutional Style）。
当前扫描时间：LA Time ${timeStr} (${dateStr})

### 核心任务：
将最新的市场数据作为信号层，解读其对 ${dateStr} 候选新闻的“回声”与“反馈”。
你的目标不是预测涨跌，而是分析市场如何“定价”或“忽略”当前的新闻资讯（Priced-in vs Ignored）。

### 执行规范 (Truthfulness & Signal Guidelines):
1. **数据唯一性**：必须 **仅且只能** 使用下方提供的 [REAL_TIME_MARKET_SNAPSHOT] 数据。
2. **严禁编造**：禁止发明价格、期货、OTC 报价或非官方数据。
3. **降低过度归因 (Reduce Over-attribution)**：
   - 除非新闻上下文有明确因果证明，否则禁止使用 "because of", "driven by"。
   - 优先使用专业中性词汇："coincides with", "aligns with", "may reflect", "reinforces the narrative", "appears consistent with"。
4. **休市管理**：如果观测到休市状态 (${marketStatusSummary})，必须明确标注 "Market Closed"。重点分析“收盘已定价内容”或“当前新闻对下个开盘日的潜在情绪驱动”。
5. **专业语气**：
   - 禁止词汇：报复性上涨、硬核 AI 崇拜、疯涨、生死战、核爆级。
   - 替换为：strong rebound, infrastructure preference, notable signal, valuation pressure, cautious sentiment, sector leadership。
6. **合规提示**：在分析末尾请注明：This is informational analysis, not financial advice.

---

### [REAL_TIME_MARKET_SNAPSHOT] (Source: Finnhub API)
${tickerJson}

---

**背景参考 (当日候选新闻)**:
${newsContext}

---

### 输出要求：

# 市场反馈扫描 (Market Reaction Scan) - ${timeStr}

## 1. 市场开盘状态 (Market Status)
- US Equities: ${marketStatusSummary}
- Data Source: Finnhub Professional API
- 分析权重：以 [SNAPSHOT] 数据为准，结合 [NEWS] 背景进行中性解读。

## 2. 核心标的数据对照 (Tickers)
[JSON_TICKERS_BEGIN]
${JSON.stringify(snapshot.map((s: any) => ({
  symbol: s.name,
  price: s.price !== null ? s.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "Unknown",
  change: s.change !== null ? (s.change >= 0 ? "+" : "") + s.change.toFixed(2) : "Unknown",
  changePercent: s.changePercent !== null ? (s.changePercent >= 0 ? "+" : "") + s.changePercent.toFixed(2) + "%" : "Unknown",
  trend: s.change && s.change > 0 ? "up" : s.change && s.change < 0 ? "down" : "neutral"
})), null, 2)}
[JSON_TICKERS_END]

## 3. 情报解读：新闻与市场的“回声”
- **确认/定价 (Priced-in)**：(哪些新闻已反映在当前价格变动中？)
- **无视/钝化 (Ignored)**：(哪些新闻虽有热度，但市场反应平平？)
- **板块轮向 (Rotation)**：(受益或承压的具体行业分布，如半导体、大科技或宏观指数)

## 4. 市场错位观察 (Mispricing Watch)
- (哪些重大新闻暂未被明显定价？价格波动是否与新闻逻辑不一致？下一个交易日最值得观察的重新定价点是什么？)

## 5. AI 策略观察 (Strategic Feedback)
- (分析市场当前是在提前定价什么风险或机会？语气需专业、冷静，类似 Bloomberg Brief 工作简报。)

## 6. 🎓 标的/概念科普 (Glossary)
- (针对本次报告出现的 3-5 个核心标二或名词，提供准确、实用的科普。)

*Disclaimer: This is informational market analysis, not financial advice.*
`;

    if (provider === 'gemini') {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: marketPrompt,
      });
      return response.text || "Failed to generate market intelligence.";
    } else {
      const response = await fetch("/api/generate-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: 'market', prompt: marketPrompt }),
      });
      
      if (!response.ok) {
        throw new Error("LLM failure");
      }

      const data = await response.json();
      return data.content || "Failed to generate market intelligence.";
    }
  } catch (error) {
    console.error("Market Intelligence Error:", error);
    
    // FALLBACK MODE
    if (marketSnapshot.length > 0) {
      let fallbackReport = `### ⚠️ AI Analysis Unavailable (Fallback Mode)\n\n*Showing latest market data. AI insight unavailable at this time.*\n\n---\n\n`;
      
      const sorted = [...marketSnapshot].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
      const winners = sorted.slice(0, 3);
      const losers = sorted.slice(-3).reverse();

      fallbackReport += `### 📈 Top Gainers\n`;
      winners.forEach(s => {
        fallbackReport += `- **${s.name}**: ${s.price || 'N/A'} (${(s.changePercent || 0) > 0 ? '+' : ''}${s.changePercent?.toFixed(2)}%)\n`;
      });

      fallbackReport += `\n### 📉 Top Decliners\n`;
      losers.forEach(s => {
        fallbackReport += `- **${s.name}**: ${s.price || 'N/A'} (${(s.changePercent || 0) > 0 ? '+' : ''}${s.changePercent?.toFixed(2)}%)\n`;
      });

      fallbackReport += `\n---\n\n*Note: Ticker data is sourced directly from Finnhub API. Numerical discrepancies may occur during high volatility.*`;
      
      return fallbackReport;
    }
    
    throw error;
  }
};
