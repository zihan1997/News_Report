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

  try {
    // 1. Step: Collect and Rank news via our server-side collector
    const collectionResponse = await fetch("/api/collect-news");
    if (!collectionResponse.ok) {
      throw new Error("Failed to collect news from RSS");
    }
    const { news }: { news: RankedNewsItem[] } = await collectionResponse.json();

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
          // If we need search because of low item count, we enable it here
          // But our instruction to Gemini is to mostly use provided context
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

  const searchToolName = provider === 'gemini' ? 'Google Search' : 'web_search';

  const marketPrompt = `
你是一名首席市场分析师，风格克制、稳健、基于数据。
当前扫描时间：LA Time ${timeStr} (${dateStr})

### 核心任务：
提供实时、深度、非戏剧化的市场情报分析。

### 执行规范 (Truthfulness Guidelines)：
1. **开盘状态检查**：必须首先确认当前时间点 (${timeStr}) 美股及全球主要市场是否处于交易时段。如果休市，必须明确标注 "Market Closed"，且不得编造实时变动。
2. **拒绝戏剧化**：禁止使用“垂直落体”、“血流成河”、“疯涨”等情绪化词汇。使用“下跌”、“波动”、“回调”、“上涨”等中性词。
3. **数据真实性**：
   - 恐惧/贪婪指数、个股价格、期货必须来自可靠来源。
   - 如果无法获取精确数据，请标注 "Unknown" 或 "Data not available"。
   - 区分：【实时行情 (Live)】、【市场叙事 (Narrative)】、【情境风险 (Risks)】。
4. **Ticker 规范**：使用易读的完整名称。

---

**背景参考 (当日快讯)**:
${newsContext}

---

### 输出要求：

# 市场情报 (Market Intelligence) - ${timeStr} Scan

## 1. 核心标的动态 (Tickers)
[JSON_TICKERS_BEGIN]
[
  {"symbol": "S&P 500 Index", "price": "...", "change": "...", "changePercent": "...", "trend": "up/down/neutral"},
  {"symbol": "Nasdaq 100 Index", "price": "...", "change": "...", "changePercent": "...", "trend": "up/down/neutral"},
  {"symbol": "10-Year Treasury Yield", "price": "...", "change": "...", "changePercent": "...", "trend": "up/down/neutral"},
  {"symbol": "NVIDIA (NVDA)", "price": "...", "change": "...", "changePercent": "...", "trend": "up/down/neutral"},
  {"symbol": "Bitcoin (BTC)", "price": "...", "change": "...", "changePercent": "...", "trend": "up/down/neutral"}
]
[JSON_TICKERS_END]
*注：如果休市，以上数据为盘后或昨日收盘价，请加注说明。*

## 2. 市场深度透视
- **盘面总结**：(当前市场的主导逻辑是什么？)
- **情绪指标**：(恐惧与贪婪指数状态及因果分析)
- **重要异动**：(哪些板块或个股表现背离了常态？)

## 3. 🎓 专业名词/标的科普 (Glossary)
> 针对报告中出现的关键金融术语或复杂标的，提供克制、准确、实用的科普。

## 4. 风险/机会预警 (Intelligence Alert)
(基于当前数据的中性预警，不得包含预测性指令)
`;

  try {
    if (provider === 'gemini') {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro",
        contents: marketPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      return response.text || "Failed to generate market intelligence.";
    } else {
      // Fallback for custom server if needed, using the same pattern as generateNews
      const response = await fetch("/api/generate-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: 'market', prompt: marketPrompt }),
      });
      const data = await response.json();
      return data.content || "Failed to generate market intelligence.";
    }
  } catch (error) {
    console.error("Market Intelligence Error:", error);
    throw error;
  }
};
