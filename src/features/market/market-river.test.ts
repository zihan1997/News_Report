import assert from "node:assert/strict";
import test from "node:test";
import { parseMarketRiver } from "./market-river.ts";

const report = `
# Market Reaction Scan

## 1. Market Read

市场正在差异化定价 AI 商业化路径。

## 3. News-to-Stock Map

### OpenAI 聚焦企业市场，Apple 和 Google 瞄准消费端 AI

- **相关新闻主线**：AI 商业化路径分化
- **相关标的**：AAPL、GOOGL、MSFT
- **市场反馈**：AAPL +0.55%、GOOGL -2.68%、MSFT -3.24%
- **连接判断**：AAPL 方向一致，但其他标的表现分化，无法单一归因
- **缺口**：缺少采用率和收入数据

### AI 安全攻击面持续扩大

- **相关新闻主线**：AI 安全威胁
- **相关标的**：缺少对应行情覆盖
- **市场反馈**：未观察到直接反馈
- **连接判断**：market has not clearly confirmed
- **缺口**：缺少网络安全板块行情覆盖

## 4. Market Ignored / Not Confirmed
`;

test("parseMarketRiver maps News-to-Stock sections into river nodes", () => {
  const result = parseMarketRiver(report);
  assert.equal(result.marketRead, "市场正在差异化定价 AI 商业化路径。");
  assert.equal(result.nodes.length, 2);
  assert.deepEqual(result.nodes[0], {
    title: "OpenAI 聚焦企业市场，Apple 和 Google 瞄准消费端 AI",
    newsTheme: "AI 商业化路径分化",
    targets: "AAPL、GOOGL、MSFT",
    marketFeedback: "AAPL +0.55%、GOOGL -2.68%、MSFT -3.24%",
    connection: "AAPL 方向一致，但其他标的表现分化，无法单一归因",
    gap: "缺少采用率和收入数据",
    relationship: "mixed",
  });
  assert.equal(result.nodes[1].relationship, "unknown");
});

test("parseMarketRiver returns an empty river when the report has no map", () => {
  assert.deepEqual(parseMarketRiver("# Market Scan\n\nNo map yet."), {
    marketRead: "",
    nodes: [],
  });
});

test("parseMarketRiver understands real Chinese relationship language", () => {
  const marketRead = "\u5E02\u573A\u6B63\u5728\u6D4B\u8BD5\u65B0\u95FB\u4E0E\u80A1\u4EF7\u7684\u5173\u7CFB\u3002";
  const title = "\u4F01\u4E1A AI \u65B0\u95FB";
  const connection = "AAPL \u65B9\u5411\u4E00\u81F4\uFF0C\u4F46\u4ECD\u65E0\u6CD5\u5355\u4E00\u5F52\u56E0";
  const report = [
    "# Market Reaction Scan",
    "",
    "## 1. Market Read",
    "",
    marketRead,
    "",
    "## 3. News-to-Stock Map",
    "",
    `### ${title}`,
    "- **x**\uFF1AAI \u5546\u4E1A\u5316",
    "- **x**\uFF1AAAPL\u3001GOOGL",
    "- **x**\uFF1AAAPL +1.20%",
    `- **x**\uFF1A${connection}`,
    "- **x**\uFF1A\u7F3A\u5C11\u91C7\u7528\u7387\u6570\u636E",
  ].join("\n");

  const result = parseMarketRiver(report);
  assert.equal(result.marketRead, marketRead);
  assert.equal(result.nodes[0].title, title);
  assert.equal(result.nodes[0].connection, connection);
  assert.equal(result.nodes[0].relationship, "mixed");
});
