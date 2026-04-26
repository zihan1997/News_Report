import { RawNewsItem, RankedNewsItem } from "../types";

export function generateMorningPrompt(rankedItems: RankedNewsItem[], today: string, previousContext: string): string {
  const newsList = rankedItems.map((item, i) => 
    `${i + 1}. [${item.source} | 类型: ${item.category || 'General'}] ${item.title}\n   Link: ${item.link}\n   Snippet: ${item.contentSnippet?.slice(0, 350)}...\n   系统预设置信度: ${item.confidence}\n   多源确认数: ${item.confirmationCount}`
  ).join("\n\n");

  return `
你是一名资深新闻总编（Editor-in-Chief），负责生成 America/Los_Angeles ${today} 的《科技与商业情报早报》。

### 1. 置信度判定准则 (Mandatory)：
我已经对候选新闻进行了初步的置信度分级（系统预设置信度），请以此为重要参考。
你的目标是基于目前的证据（多源确认数、来源权重、内容性质）生成最终报告。

- **置信度：高 (HIGH)**: 必须涉及官方声明、顶级权威媒体（Reuters, AP, BBC, Bloomberg, WSJ, FT, CNBC）或多源验证。
- **置信度：中 (MEDIUM)**: 来源于信誉良好的科技媒体（TechCrunch, The Verge等），但缺乏第二来源确认。
- **置信度：低 (LOW)**: 来源于社区讨论（HN）、匿名博客或尚未证实的爆料。

### 2. 输出结构标准：
- **确定事实 (Facts)**：仅限客观描述“发生的事实”。严禁包含动机推测、未来判断或夸张词汇。
- **来源详情 (Sources)**：
  - Primary: 原始或最权威来源。
  - Secondary: 补充或验证来源（如有）。
- **分析与影响 (Analysis)**：冷静、专业的逻辑推演（类似 Economist/Bloomberg 风格）。禁止使用“史诗级”、“颠覆”、“核爆级”、“生还战”等词汇。
- **风险提示/未知 (Risk/Unknown)**：指出尚未确认的数据、监管盲区或市场最关注但暂无答案的问题。

---

【历史背景参考】：
${previousContext || "无"}

---

【今日候选列表】：
${newsList}

---

### 输出格式 (Markdown)：

# ${today} 科技与商业情报（早报）

## 今日动态扫描

1. 标题（置信度：高/中/低）【分类：新动态/后续/持续关注/未证实】
   - **确定事实 (Facts)**：...
   - **来源详情 (Sources)**：Primary: [Name](Link); Secondary: [Name](Link)
   - **分析与影响 (Analysis)**：...
   - **风险提示/未知 (Risk/Unknown)**：...

(请按照信号重要性排序)
`;
}

export function generateEveningPrompt(rankedItems: RankedNewsItem[], today: string, previousContext: string): string {
  const newsList = rankedItems.map((item, i) => 
    `${i + 1}. [${item.source} | 类型: ${item.category || 'General'}] ${item.title}\n   Link: ${item.link}\n   Snippet: ${item.contentSnippet?.slice(0, 350)}...\n   系统预设置信度: ${item.confidence}\n   多源确认数: ${item.confirmationCount}`
  ).join("\n\n");

  return `
你是一名资深晚间校准编辑。任务是对当天的早报内容进行核实、去戏剧化修正和实时补充。
今天是 ${today} (America/Los_Angeles)。

### 晚间校准准则：
1. **去戏剧化**：纠正早报中可能出现的过度分析或情绪化语言。
2. **事实追溯**：利用晚间新增资讯（多源确认数增加的条目）对早报中的“低置信度”内容进行确认或证伪。
3. **信号优先**：顶级权威媒体 (Hard News) 的修正具有最高优先级。

早报背景内容：
---
${previousContext}
---

晚间新增/验证资讯列表：
---
${newsList}
---

### 输出格式：

# ${today} 情报汇总（晚间更新）

## 晚间总体态势
- **新增确认 (Confirmed)**：(早报未定论事件的最新进展)
- **修正与澄清 (Clarifications)**：(纠正早报的误读或过时信息)
- **待观察 (Pending)**：(仍缺乏足够证据的重大传闻)

## 详细更新条目
(针对早报中高价值条目的垂直追加更新，或列出晚间发生的重大突发事件)
`;
}
