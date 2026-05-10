import { RankedNewsItem } from "../types";
import morningTemplate from "../prompts/morning-report.md?raw";
import eveningTemplate from "../prompts/evening-report.md?raw";
import { fillTemplate } from "./prompt-template";

type PromptScope = {
  candidateCount: number;
  outputRange: string;
  snippetLength: number;
};

const DEFAULT_SCOPE: PromptScope = {
  candidateCount: 12,
  outputRange: "7-9",
  snippetLength: 260,
};

export function generateMorningPrompt(
  rankedItems: RankedNewsItem[],
  today: string,
  previousContext: string,
  scope: PromptScope = DEFAULT_SCOPE
): string {
  const selectedItems = rankedItems.slice(0, scope.candidateCount);
  const newsList = selectedItems.map((item, i) => {
    let enrichmentInfo = "";
    if (item.enrichment) {
      enrichmentInfo = `\n   [补充信号] 多源确认: ${item.enrichment.sources.join(" / ")}; 最新标题: ${item.enrichment.latestHeadline}; 信号置信度: ${item.enrichment.confidenceAdjustment}`;
    }
    return `${i + 1}. [${item.source} | 类型: ${item.category || 'General'}] ${item.title}\n   Link: ${item.link}\n   Snippet: ${item.contentSnippet?.slice(0, scope.snippetLength)}...\n   系统预设置信度: ${item.confidence}\n   多源确认数: ${item.confirmationCount}${enrichmentInfo}`;
  }).join("\n\n");

  return fillTemplate(morningTemplate, {
    today,
    outputRange: scope.outputRange,
    previousContext: previousContext || "无",
    newsList,
  });
}

export function generateEveningPrompt(
  rankedItems: RankedNewsItem[],
  today: string,
  previousContext: string,
  scope: PromptScope = DEFAULT_SCOPE
): string {
  const selectedItems = rankedItems.slice(0, scope.candidateCount);
  const newsList = selectedItems.map((item, i) => {
    let enrichmentInfo = "";
    if (item.enrichment) {
      enrichmentInfo = `\n   [补充信号] 多源确认: ${item.enrichment.sources.join(" / ")}; 最新标题: ${item.enrichment.latestHeadline}; 信号置信度: ${item.enrichment.confidenceAdjustment}`;
    }
    return `${i + 1}. [${item.source} | 类型: ${item.category || 'General'}] ${item.title}\n   Link: ${item.link}\n   Snippet: ${item.contentSnippet?.slice(0, scope.snippetLength)}...\n   系统预设置信度: ${item.confidence}\n   多源确认数: ${item.confirmationCount}${enrichmentInfo}`;
  }).join("\n\n");

  return fillTemplate(eveningTemplate, {
    today,
    outputRange: scope.outputRange,
    previousContext,
    newsList,
  });
}
