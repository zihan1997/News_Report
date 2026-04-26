import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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

  const searchToolName = provider === 'gemini' ? 'Google Search' : 'web_search';

  const morningPrompt = `
你是我的每日新闻情报编辑。目标：生成 America/Los_Angeles 当地日期 ${today} 的“当日新闻态势扫描”。

**核心指令：时效性校验**
- 你必须确保所选新闻的发生时间 or 发布时间是在 America/Los_Angeles 当地时间的 ${today}（或过去24小时内）。
- **严禁**包含 ${today} 之前已经过时或已经完成的旧闻（除非该旧闻在今天有重大的实质性新进展）。
- 如果某个事件（如 NASA 任务）在几天前已经发生且今天没有新动态，请勿将其列入。

**核心指令：历史对比 (Memory)**
以下是最近几天的历史新闻背景：
---
${previousContext}
---
- 若今日话题在上述历史背景中连续出现，请在该条目标题后标注【持续关注】。
- 若今日话题是上述历史背景中某个事件的实质性新进展，请标注【后续】。

信息源（优先关注）：
1) Hacker News (https://news.ycombinator.com)
2) The Verge (https://www.theverge.com)
3) Wired (https://www.wired.com)
4) ZDNET (https://www.zdnet.com)
5) BBC Technology (https://www.bbc.com/news/technology)
6) Reuters (https://www.reuters.com)
7) AP News (https://apnews.com)
8) Bloomberg (https://www.bloomberg.com)
9) Los Angeles Times (https://www.latimes.com)

获取规则：
- 使用 ${searchToolName} 检索上述来源的最新内容。
- 每个源尽量选择 2–4 条重要内容。
- 以“事件/主题”为单位聚合：同一事件多家媒体报道只保留一条，在条目下列出多个来源。
- 去重后保留 10–15 条最重要内容。

排序优先级：
a) 重大政策变化、监管、利率、宏观经济
b) 影响美国科技就业或企业环境的重大新闻
c) 涉及签证、国际学生、入境、USCIS、移民政策的变化（自动提升优先级）
d) 安全漏洞、数据泄露、网络风险
e) 重大科技发布或行业趋势
f) 其他一般科技与商业新闻

事实规则：
- 单一来源或未被确认的信息必须标注【未证实】。
- 若有 ≥2 个独立可靠来源支持，可标为“已确认”。

输出格式（必须使用中文）：

# ${today} 新闻汇总（早报）

## 今日要点（按重要性排序）

1. 标题（置信度：高/中/低）【持续关注/后续/未证实】
   - 结论：
   - 摘要：
   - 影响：
   - 来源：媒体A(链接)、媒体B(链接)
`;

  const eveningPrompt = `
你是我的晚间新闻校准编辑。目标：对今天的早报进行核实、修正和补充。
今天是 ${today} (America/Los_Angeles)。

**核心指令：时效性校验**
- 只关注 America/Los_Angeles 当地时间 ${today} 当天新增的内容。
- 检查早报中的条目，如果发现任何条目在 ${today} 实际上没有新进展，或者属于旧闻误报，请在【澄清/修正】中予以指出。
- 严禁重复 ${today} 之前的旧闻。

先前背景（早报内容）：
${previousContext}

执行步骤：
1) 读取早报中的“## 今日要点”部分。
2) 识别以下优先级条目进行跟进：
   a) 标注【未证实】或置信度为中/低的条目
   b) 涉及宏观政策、利率、监管、签证、移民、科技就业的条目
   c) 涉及安全漏洞或重大突发的条目

3) 使用 ${searchToolName} 查询当天最新进展：
   - 优先使用 Reuters、AP、Bloomberg、LA Times 等主流媒体。
   - 只关注当天新增内容，不做跨日深挖。

更新规则：
A) 若获得实质新进展：在该条目下追加【后续 - 晚间更新】。
B) 若被证实为误导或夸大：追加【澄清/修正】。
C) 若无可靠更新：不必追加内容。

输出格式（必须使用中文）：
请基于早报内容，输出一个完整的更新版本。保留原有的条目，但在相关条目下追加更新内容。

最后，在文件末尾追加：
---
## 晚间总体更新（LA时间）
- 新增确认的事件：
- 被修正或澄清的事件：
- 仍待确认的事件：
`;

  const prompt = type === 'morning' ? morningPrompt : eveningPrompt;

  try {
    if (provider === 'gemini') {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
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
    console.error("LLM API Error:", error);
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
你是我的首席市场战略官。
当前扫描时间：LA Time ${timeStr} (${dateStr})

目标：基于上述精确时间点，提供实时深度市场情报分析。

**核心考量**：
1. **实时盘面**：你必须寻找当前时间点 (${timeStr}) 左右的行情。
2. **名称规范化**：在 Tickers 数据中，必须使用**易读的名称**（例如 "Nasdaq 100 Futures" 而非 "NQ1!"，"Sony (Tokyo)" 而非 "6758"）。
3. **记忆链条**：参考背景中的 [PREVIOUS MARKET SCAN]，指出相对于上一次扫描，市场逻辑发生了什么变化。

**背景参考 (当日快讯与情报历史)**:
---
${newsContext}
---

**输出指令**：
- **数据提取 (Tickers)**：你必须包含一个 JSON 数组格式的 Tickers 信息。
  - **重要**：symbol 字段必须是人类可读的名称（如 "S&P 500", "NVIDIA", "Brent Oil"）。
  - **关键枚举**：trend 字段的值必须**严格**限定在 ["up", "down", "neutral"] 三者之一（分别对应上涨、落地、持平/未知）。
- **深度分析 (要求)**：
  - 【市场情绪】：当前恐惧/贪婪状态，并对比前次扫描的变化。
  - 【核心动向】：此时此刻 Mag 7 与指数的强弱对比。
  - 【增量追踪】：今日市场的新因果逻辑是否有发酵？
  - 【异动个股】：此时此刻谁在领跑？谁在垂直落体？
  - 【小白科普】：针对本报告提到的 3-5 个核心标的，用最通俗易懂的语言解释它们是什么（例如：什么是纳指？什么是基准利率？），确保投资小白也能看懂。
  - 【Intelligence Alert】：基于当前时间点，投资者最该警惕的一个风险或机会。

**输出格式建议 (Markdown)**:

# 市场情报 (Market Intelligence) - ${timeStr} Scan

## 核心标的快览
[JSON_TICKERS_BEGIN]
[
  {"symbol": "Nasdaq 100 Futures", "price": "18,450.25", "change": "+120.40", "changePercent": "+0.65%", "trend": "up"},
  {"symbol": "NVIDIA (NVDA)", "price": "850.15", "change": "-12.30", "changePercent": "-1.42%", "trend": "down"},
  {"symbol": "Crude Oil", "price": "82.40", "change": "+0.10", "changePercent": "+0.12%", "trend": "up"}
]
[JSON_TICKERS_END]

## 市场情绪与盘面追踪
(对比上次扫描的分析...)

## 关键/异动个股透视
(分析...)

## 🎓 小白科普 (Glossary)
> 这里的科普应该通俗、生动、直播，解释报告中出现的关键名词。

## Intelligence Alert
(结论...)
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
