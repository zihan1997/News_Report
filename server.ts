import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import OpenAI from "openai";
import dotenv from "dotenv";
import { formatInTimeZone } from "date-fns-tz";
import { collectNewsFromRSS, filterRecentNews, dedupeNews, rankNews, enrichNewsItems } from "./src/lib/news-workflow.ts";
import { fetchMarketSnapshot } from "./src/lib/finnhub.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, "reports");
const MEMORY_DIR = path.join(__dirname, "memory");
const STORIES_DIR = path.join(MEMORY_DIR, "stories");
const NARRATIVES_DIR = path.join(MEMORY_DIR, "narratives");
const MEMORY_EVENTS_DIR = path.join(MEMORY_DIR, "events");
const MEMORY_DRAFTS_DIR = path.join(MEMORY_DIR, "drafts");
const MEMORY_REVIEW_DIR = path.join(MEMORY_DIR, "review");
const MEMORY_PROMOTED_DIR = path.join(MEMORY_REVIEW_DIR, "promoted");
const MEMORY_DISMISSED_DIR = path.join(MEMORY_REVIEW_DIR, "dismissed");
const SYSTEM_PROMPT_PATH = path.join(__dirname, "src", "prompts", "system-report.md");
const FINAL_OUTPUT_INSTRUCTION_PATH = path.join(__dirname, "src", "prompts", "final-output-instruction.md");
const MEMORY_PATCH_PROMPT_PATH = path.join(__dirname, "src", "prompts", "memory-patch.md");
const LA_TZ = "America/Los_Angeles";

dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

function estimateTokens(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) return 0;
  const asciiWords = normalized.match(/[A-Za-z0-9_]+/g)?.length || 0;
  const cjkChars = normalized.match(/[\u3400-\u9fff]/g)?.length || 0;
  const otherChars = normalized.replace(/[A-Za-z0-9_\s\u3400-\u9fff]/g, "").length;
  return Math.max(1, Math.ceil(asciiWords * 1.35 + cjkChars * 0.65 + otherChars * 0.4));
}

function formatElapsedMs(ms: number) {
  return `${Math.max(0, Math.round(ms)).toLocaleString()} ms`;
}

function completionUsageMetrics(response: any) {
  const usage = response?.usage || {};
  return {
    promptTokens: Number(usage.prompt_tokens || usage.promptTokens || 0) || null,
    completionTokens: Number(usage.completion_tokens || usage.completionTokens || 0) || null,
    totalTokens: Number(usage.total_tokens || usage.totalTokens || 0) || null,
  };
}
dotenv.config({ path: path.join(__dirname, ".env"), override: false });

type StoredReport = {
  id: string;
  date: string;
  type: "morning" | "evening" | "market";
  content: string;
  timestamp: number;
  tickers?: unknown[];
};

type MemoryFile = {
  kind: "story" | "narrative";
  name: string;
  path: string;
  content: string;
  timestamp: number;
};

type MemoryPatchUpdate = {
  targetType: "story" | "narrative";
  targetId: string;
  action: "append_timeline";
  summary: string;
  evidence: string[];
  openGaps: string[];
};

type MemoryDraftCandidate = {
  targetType: "story" | "narrative";
  title: string;
  reason: string;
  evidence: string[];
};

type MemoryDraftAction = "promote" | "dismiss";

type MemoryEventFile = {
  name: string;
  path: string;
  data: any;
  timestamp: number;
};

class MissingJsonObjectError extends Error {
  constructor() {
    super("Memory update did not return a JSON object.");
    this.name = "MissingJsonObjectError";
  }
}

function reportBaseName(report: StoredReport) {
  const sourceTime = Number(report.timestamp) || new Date(report.date).getTime();
  const stamp = Number.isNaN(sourceTime)
    ? String(report.timestamp || Date.now())
    : formatInTimeZone(new Date(sourceTime), LA_TZ, "yyyy-MM-dd'T'HH-mm-ss");
  const safeType = report.type.replace(/[^a-z0-9-]/gi, "");
  const safeId = report.id.replace(/[^a-z0-9-]/gi, "").slice(0, 12);
  return `${stamp}-${safeType}-${safeId}`;
}

async function ensureReportsDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function readStoredReports(): Promise<StoredReport[]> {
  await ensureReportsDir();
  const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith(".draft.json"))
    .map((entry) => entry.name);

  const reports = await Promise.all(
    jsonFiles.map(async (fileName) => {
      try {
        const raw = await fs.readFile(path.join(REPORTS_DIR, fileName), "utf8");
        return JSON.parse(raw) as StoredReport;
      } catch (error) {
        console.error(`Failed to read report ${fileName}:`, error);
        return null;
      }
    })
  );

  return reports
    .filter((report): report is StoredReport => Boolean(report))
    .sort((a, b) => b.timestamp - a.timestamp);
}

async function fileBelongsToReport(fileName: string, reportId: string) {
  const safeId = reportId.replace(/[^a-z0-9-]/gi, "").slice(0, 12);
  if (fileName.includes(safeId)) {
    return true;
  }

  const filePath = path.join(REPORTS_DIR, fileName);
  if (fileName.endsWith(".json")) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return (JSON.parse(raw) as Partial<StoredReport>)?.id === reportId;
    } catch {
      return false;
    }
  }

  if (fileName.endsWith(".md")) {
    try {
      const frontmatter = (await fs.readFile(filePath, "utf8")).split("\n").slice(0, 8).join("\n");
      return frontmatter.includes(`id: ${reportId}`);
    } catch {
      return false;
    }
  }

  return false;
}

function reportMarkdown(report: StoredReport) {
  return [
    "---",
    `id: ${report.id}`,
    `type: ${report.type}`,
    `date: ${report.date}`,
    `timezone: ${LA_TZ}`,
    `timestamp: ${report.timestamp}`,
    "---",
    "",
    report.content,
    "",
  ].join("\n");
}

async function ensureMemoryDirs() {
  await fs.mkdir(STORIES_DIR, { recursive: true });
  await fs.mkdir(NARRATIVES_DIR, { recursive: true });
  await fs.mkdir(MEMORY_EVENTS_DIR, { recursive: true });
  await fs.mkdir(MEMORY_DRAFTS_DIR, { recursive: true });
  await fs.mkdir(MEMORY_PROMOTED_DIR, { recursive: true });
  await fs.mkdir(MEMORY_DISMISSED_DIR, { recursive: true });
}

function tokenizeForSearch(text: string) {
  const english = text.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const chineseBlocks = text.match(/[\u4e00-\u9fa5]+/g) || [];
  const chinese = chineseBlocks.flatMap((block) => {
    if (block.length <= 2) return [block];
    return Array.from({ length: block.length - 1 }, (_, index) => block.slice(index, index + 2));
  });
  return new Set([...english, ...chinese].slice(0, 900));
}

function scoreMemory(queryTokens: Set<string>, memory: MemoryFile) {
  const memoryTokens = tokenizeForSearch(`${memory.name}\n${memory.content}`);
  let score = 0;
  for (const token of queryTokens) {
    if (memoryTokens.has(token)) score += 1;
  }
  return score;
}

async function readMemoryFiles(): Promise<MemoryFile[]> {
  await ensureMemoryDirs();
  const readKind = async (kind: "story" | "narrative", dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter((entry) =>
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      !entry.name.startsWith("_") &&
      !entry.name.startsWith(".")
    );
    return Promise.all(files.map(async (entry) => {
      const filePath = path.join(dir, entry.name);
      const stat = await fs.stat(filePath);
      return {
        kind,
        name: entry.name.replace(/\.md$/, ""),
        path: filePath,
        content: await fs.readFile(filePath, "utf8"),
        timestamp: stat.mtimeMs,
      };
    }));
  };

  return [
    ...(await readKind("story", STORIES_DIR)),
    ...(await readKind("narrative", NARRATIVES_DIR)),
  ];
}

function parseMemorySummary(content: string) {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Untitled";
  const status = content.match(/^Status:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  const confidence = content.match(/^Confidence:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  const lastUpdated = content.match(/^Last Updated:\s*(.+)$/m)?.[1]?.trim() || "";
  const currentState = content.match(/## Current State\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() || "";
  return { title, status, confidence, lastUpdated, currentState };
}

function parseMemoryUpdatedTime(lastUpdated: string, fallback: number) {
  const normalized = lastUpdated
    .replace(/\s+LA$/i, "")
    .replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function memoryReviewItem(memory: MemoryFile) {
  const summary = parseMemorySummary(memory.content);
  return {
    id: memory.name,
    ...summary,
    content: memory.content,
    sortTime: parseMemoryUpdatedTime(summary.lastUpdated, memory.timestamp),
  };
}

async function readJsonFiles(dir: string): Promise<MemoryEventFile[]> {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  const loaded = await Promise.all(files.map(async (entry) => {
    const filePath = path.join(dir, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const stat = await fs.stat(filePath);
      return { name: entry.name, path: filePath, data: JSON.parse(raw), timestamp: stat.mtimeMs };
    } catch (error) {
      console.error(`Failed to read memory json ${entry.name}:`, error);
      return null;
    }
  }));

  return loaded
    .filter((item): item is MemoryEventFile => Boolean(item))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function compactMemoryContent(content: string, maxChars = 2200) {
  return content.length > maxChars ? `${content.slice(0, maxChars)}\n...` : content;
}

function truncateText(value: unknown, maxChars: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function slugifyMemoryTitle(title: string) {
  const ascii = title
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return ascii || `memory-${Date.now()}`;
}

function safeMemoryJsonName(fileName: unknown) {
  const clean = path.basename(String(fileName || ""));
  if (!clean.endsWith(".json") || clean !== String(fileName || "")) return "";
  return clean;
}

function normalizeStringArray(value: unknown, maxItems: number, maxChars: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => truncateText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function memoryIdList(memories: MemoryFile[], kind: "story" | "narrative") {
  return memories
    .filter((memory) => memory.kind === kind)
    .map((memory) => memory.name)
    .sort();
}

function formatTargetList(memories: MemoryFile[]) {
  return [
    "[STORY TARGET IDS]",
    ...memoryIdList(memories, "story").map((id) => `- ${id}`),
    "",
    "[NARRATIVE TARGET IDS]",
    ...memoryIdList(memories, "narrative").map((id) => `- ${id}`),
  ].join("\n");
}

function validateMemoryPatch(raw: any, memories: MemoryFile[]) {
  const existingTargets = new Map(memories.map((memory) => [`${memory.kind}:${memory.name}`, memory]));
  const updates: MemoryPatchUpdate[] = [];
  const newCandidates: MemoryDraftCandidate[] = [];

  for (const item of Array.isArray(raw?.updates) ? raw.updates.slice(0, 10) : []) {
    const targetType = item?.targetType === "narrative" ? "narrative" : item?.targetType === "story" ? "story" : null;
    const targetId = truncateText(item?.targetId, 120);
    const action = item?.action === "append_timeline" ? "append_timeline" : null;
    const summary = truncateText(item?.summary, 420);
    if (!targetType || !targetId || !action || !summary) continue;
    if (!existingTargets.has(`${targetType}:${targetId}`)) continue;

    updates.push({
      targetType,
      targetId,
      action,
      summary,
      evidence: normalizeStringArray(item?.evidence, 4, 260),
      openGaps: normalizeStringArray(item?.openGaps, 4, 220),
    });
  }

  for (const item of Array.isArray(raw?.newCandidates) ? raw.newCandidates.slice(0, 2) : []) {
    const targetType = item?.targetType === "narrative" ? "narrative" : item?.targetType === "story" ? "story" : null;
    const title = truncateText(item?.title, 120);
    const reason = truncateText(item?.reason, 420);
    if (!targetType || !title || !reason) continue;

    newCandidates.push({
      targetType,
      title,
      reason,
      evidence: normalizeStringArray(item?.evidence, 4, 260),
    });
  }

  return { updates, newCandidates };
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return cleaned.slice(start);
}

function parseJsonObject(text: string) {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    throw new MissingJsonObjectError();
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    const withoutTrailingCommas = jsonText.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(withoutTrailingCommas);
  }
}

async function repairMemoryJson(client: any, model: string, invalidContent: string, parseError: unknown) {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You repair invalid JSON. Return only one valid JSON object and no markdown." },
      {
        role: "user",
        content: [
          "Repair this memory update JSON so it exactly matches this shape:",
          "{\"updates\":[],\"newCandidates\":[]}",
          "",
          "Rules:",
          "- Return valid JSON only.",
          "- Preserve factual content from the invalid JSON when possible.",
          "- Drop any broken or incomplete array item rather than guessing missing facts.",
          "- Keep at most 8 updates and 2 newCandidates.",
          "",
          `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          "",
          "[INVALID JSON]",
          invalidContent.slice(0, 16000),
        ].join("\n"),
      },
    ],
    temperature: 0,
    max_tokens: 2200,
  } as any);

  return (completion.choices[0].message as any).content || "";
}

async function createMemoryUpdateCompletion(client: any, model: string, messages: any[]) {
  const baseParams = {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 1600,
  };

  try {
    return await client.chat.completions.create({
      ...baseParams,
      response_format: { type: "json_object" },
    } as any);
  } catch (error: any) {
    console.warn(`Memory update JSON mode unavailable; retrying without response_format. ${error?.status || ""} ${error?.message || ""}`.trim());
    return await client.chat.completions.create(baseParams as any);
  }
}

function memoryEventBaseName(report: StoredReport) {
  const sourceTime = Number(report.timestamp) || new Date(report.date).getTime();
  const stamp = Number.isNaN(sourceTime)
    ? String(report.timestamp || Date.now())
    : formatInTimeZone(new Date(sourceTime), LA_TZ, "yyyy-MM-dd'T'HH-mm-ss");
  const safeType = report.type.replace(/[^a-z0-9-]/gi, "");
  const safeId = report.id.replace(/[^a-z0-9-]/gi, "").slice(0, 12);
  return `${stamp}-${safeType}-${safeId}`;
}

function updateLastUpdated(content: string, report: StoredReport) {
  const stamp = formatInTimeZone(new Date(report.timestamp || Date.now()), LA_TZ, "yyyy-MM-dd HH:mm");
  if (/^Last Updated: .+$/m.test(content)) {
    return content.replace(/^Last Updated: .+$/m, `Last Updated: ${stamp} LA`);
  }
  return content;
}

function appendBulletsToSection(content: string, heading: string, bullets: string[]) {
  const cleanBullets = bullets.map((bullet) => truncateText(bullet, 500)).filter(Boolean);
  if (cleanBullets.length === 0) return content;

  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (headingIndex === -1) {
    return [
      content.trimEnd(),
      "",
      `## ${heading}`,
      ...cleanBullets.map((bullet) => `- ${bullet}`),
      "",
    ].join("\n");
  }

  let insertIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      insertIndex = index;
      break;
    }
  }

  const existing = new Set(lines.slice(headingIndex + 1, insertIndex).map((line) => line.trim()));
  const newLines = cleanBullets
    .map((bullet) => `- ${bullet}`)
    .filter((line) => !existing.has(line));

  if (newLines.length === 0) return content;
  const needsSpacer = insertIndex > 0 && lines[insertIndex - 1].trim() !== "";
  const needsTrailingSpacer = insertIndex < lines.length && lines[insertIndex].trim() !== "";
  lines.splice(insertIndex, 0, ...(needsSpacer ? [""] : []), ...newLines, ...(needsTrailingSpacer ? [""] : []));
  return lines.join("\n");
}

function appendLinesToSection(content: string, heading: string, rawLines: string[]) {
  const cleanLines = rawLines.map((line) => line.trimEnd()).filter((line) => line.trim());
  if (cleanLines.length === 0) return content;

  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (headingIndex === -1) {
    return [
      content.trimEnd(),
      "",
      `## ${heading}`,
      ...cleanLines,
      "",
    ].join("\n");
  }

  let insertIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      insertIndex = index;
      break;
    }
  }

  const parentLine = cleanLines[0]?.trim();
  const existing = new Set(lines.slice(headingIndex + 1, insertIndex).map((line) => line.trim()));
  if (parentLine && existing.has(parentLine)) return content;

  const needsSpacer = insertIndex > 0 && lines[insertIndex - 1].trim() !== "";
  const needsTrailingSpacer = insertIndex < lines.length && lines[insertIndex].trim() !== "";
  lines.splice(insertIndex, 0, ...(needsSpacer ? [""] : []), ...cleanLines, ...(needsTrailingSpacer ? [""] : []));
  return lines.join("\n");
}

function groupedMemoryUpdateLines(summaryLine: string, children: string[]) {
  const parent = truncateText(summaryLine, 500);
  const nested = children
    .map((child) => truncateText(child, 420))
    .filter(Boolean)
    .map((child) => `  - ${child}`);
  return [`- ${parent}`, ...nested];
}

async function writeMemoryEvent(report: StoredReport, updates: MemoryPatchUpdate[], newCandidates: MemoryDraftCandidate[]) {
  await ensureMemoryDirs();
  const fileName = `${memoryEventBaseName(report)}.json`;
  const event = {
    reportId: report.id,
    reportType: report.type,
    reportDate: report.date,
    createdAt: new Date(report.timestamp || Date.now()).toISOString(),
    updates,
    newCandidates,
  };
  await fs.writeFile(path.join(MEMORY_EVENTS_DIR, fileName), JSON.stringify(event, null, 2), "utf8");
  return fileName;
}

async function writeMemoryDrafts(report: StoredReport, newCandidates: MemoryDraftCandidate[]) {
  if (newCandidates.length === 0) return null;
  await ensureMemoryDirs();
  const fileName = `${memoryEventBaseName(report)}-candidates.json`;
  await fs.writeFile(
    path.join(MEMORY_DRAFTS_DIR, fileName),
    JSON.stringify({ reportId: report.id, reportType: report.type, reportDate: report.date, newCandidates }, null, 2),
    "utf8"
  );
  return fileName;
}

async function writeDraftReviewRecord({
  action,
  draftFileName,
  candidateIndex,
  candidate,
  draft,
  promoted,
}: {
  action: MemoryDraftAction;
  draftFileName: string;
  candidateIndex: number;
  candidate: MemoryDraftCandidate;
  draft: any;
  promoted: { targetType: "story" | "narrative"; targetId: string } | null;
}) {
  await ensureMemoryDirs();
  const reviewedAt = new Date().toISOString();
  const targetDir = action === "promote" ? MEMORY_PROMOTED_DIR : MEMORY_DISMISSED_DIR;
  const safeTitle = slugifyMemoryTitle(candidate.title).slice(0, 48);
  const stamp = formatInTimeZone(new Date(reviewedAt), LA_TZ, "yyyy-MM-dd'T'HH-mm-ss");
  const fileName = `${stamp}-${action}-${safeTitle}.json`;
  const record = {
    action,
    reviewedAt,
    draftFileName,
    candidateIndex,
    sourceReportId: String(draft?.reportId || ""),
    sourceReportType: draft?.reportType || "unknown",
    sourceReportDate: String(draft?.reportDate || ""),
    candidate,
    promoted,
  };
  await fs.writeFile(path.join(targetDir, fileName), JSON.stringify(record, null, 2), "utf8");
  return fileName;
}

function candidateToMemoryContent(candidate: MemoryDraftCandidate, reportDate: string, reportId: string) {
  const stamp = formatInTimeZone(new Date(reportDate || Date.now()), LA_TZ, "yyyy-MM-dd HH:mm");
  const source = reportId ? `Draft candidate from ${reportId}` : "Draft candidate";
  if (candidate.targetType === "story") {
    return [
      `# ${candidate.title}`,
      "",
      "Status: developing",
      "Confidence: medium",
      `Last Updated: ${stamp} LA`,
      "",
      "## Current State",
      candidate.reason,
      "",
      "## Timeline",
      `- ${formatInTimeZone(new Date(reportDate || Date.now()), LA_TZ, "yyyy-MM-dd")} draft: ${candidate.reason}`,
      "",
      "## Resolved",
      "- None yet.",
      "",
      "## Open Gaps",
      "- Needs follow-up confirmation from future reports.",
      "",
      "## Related Narratives",
      "- TBD",
      "",
      "## Evidence",
      ...(candidate.evidence.length ? candidate.evidence.map((item) => `- ${item}`) : ["- No evidence bullets were attached to this draft."]),
      "",
      "## Source Reports",
      `- ${source}`,
      "",
    ].join("\n");
  }

  return [
    `# ${candidate.title}`,
    "",
    "Status: developing",
    "Confidence: medium",
    `Last Updated: ${stamp} LA`,
    "",
    "## Thesis",
    candidate.reason,
    "",
    "## Why It Matters",
    "- This narrative was promoted from a draft candidate and needs future reports to validate its durability.",
    "",
    "## Evidence For",
    ...(candidate.evidence.length ? candidate.evidence.map((item) => `- ${item}`) : ["- No evidence bullets were attached to this draft."]),
    "",
    "## Evidence Against",
    "- None yet.",
    "",
    "## Open Questions",
    "- Which future reports confirm, weaken, or narrow this narrative?",
    "",
    "## Related Stories",
    "- TBD",
    "",
    "## Related Reports",
    `- ${source}`,
    "",
  ].join("\n");
}

async function applyMemoryDraftAction(fileName: string, candidateIndex: number, action: MemoryDraftAction) {
  await ensureMemoryDirs();
  const safeName = safeMemoryJsonName(fileName);
  if (!safeName) {
    throw new Error("Invalid draft file name.");
  }

  const draftPath = path.join(MEMORY_DRAFTS_DIR, safeName);
  const raw = await fs.readFile(draftPath, "utf8");
  const draft = JSON.parse(raw);
  const candidates = Array.isArray(draft?.newCandidates) ? draft.newCandidates : [];
  const candidate = candidates[candidateIndex] as MemoryDraftCandidate | undefined;
  if (!candidate) {
    throw new Error("Draft candidate not found.");
  }

  let promoted: { targetType: "story" | "narrative"; targetId: string } | null = null;
  if (action === "promote") {
    const targetId = slugifyMemoryTitle(candidate.title);
    const targetDir = candidate.targetType === "narrative" ? NARRATIVES_DIR : STORIES_DIR;
    const targetPath = path.join(targetDir, `${targetId}.md`);
    try {
      await fs.access(targetPath);
      throw new Error(`Memory item already exists: ${targetId}`);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }

    await fs.writeFile(
      targetPath,
      candidateToMemoryContent(candidate, String(draft.reportDate || Date.now()), String(draft.reportId || "")).trimEnd() + "\n",
      "utf8"
    );
    promoted = { targetType: candidate.targetType, targetId };
  }

  const reviewRecord = await writeDraftReviewRecord({
    action,
    draftFileName: safeName,
    candidateIndex,
    candidate,
    draft,
    promoted,
  });

  const nextCandidates = candidates.filter((_: unknown, index: number) => index !== candidateIndex);
  if (nextCandidates.length === 0) {
    await fs.unlink(draftPath);
  } else {
    await fs.writeFile(draftPath, JSON.stringify({ ...draft, newCandidates: nextCandidates }, null, 2), "utf8");
  }

  return { promoted, remaining: nextCandidates.length, reviewRecord };
}

async function applyMemoryUpdates(report: StoredReport, updates: MemoryPatchUpdate[], memories: MemoryFile[]) {
  const written: string[] = [];
  const sourceReport = `${formatInTimeZone(new Date(report.timestamp || Date.now()), LA_TZ, "yyyy-MM-dd HH:mm")} ${report.type}: ${report.id}`;

  for (const update of updates) {
    const memory = memories.find((item) => item.kind === update.targetType && item.name === update.targetId);
    if (!memory) continue;

    const summaryLine = `${formatInTimeZone(new Date(report.timestamp || Date.now()), LA_TZ, "yyyy-MM-dd")} ${report.type}: ${update.summary}`;
    let nextContent = updateLastUpdated(memory.content, report);

    if (update.targetType === "story") {
      nextContent = appendBulletsToSection(nextContent, "Timeline", [summaryLine]);
      nextContent = appendLinesToSection(nextContent, "Evidence", groupedMemoryUpdateLines(summaryLine, update.evidence));
      nextContent = appendLinesToSection(nextContent, "Open Gaps", groupedMemoryUpdateLines(summaryLine, update.openGaps));
      nextContent = appendBulletsToSection(nextContent, "Source Reports", [sourceReport]);
    } else {
      nextContent = appendLinesToSection(nextContent, "Evidence For", groupedMemoryUpdateLines(summaryLine, update.evidence));
      nextContent = appendLinesToSection(nextContent, "Open Questions", groupedMemoryUpdateLines(summaryLine, update.openGaps));
      nextContent = appendBulletsToSection(nextContent, "Related Reports", [sourceReport]);
    }

    await fs.writeFile(memory.path, nextContent.trimEnd() + "\n", "utf8");
    memory.content = nextContent;
    written.push(`${update.targetType}:${update.targetId}`);
  }

  return written;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const systemReportPrompt = await fs
    .readFile(SYSTEM_PROMPT_PATH, "utf8")
    .catch(() => "You are a high-signal news intelligence assistant. Provide a final, polished markdown report in Chinese.");
  const finalOutputInstruction = await fs
    .readFile(FINAL_OUTPUT_INSTRUCTION_PATH, "utf8")
    .catch(() => "/no_think\n\nPlease output only the final Markdown report.");
  const memoryPatchPrompt = await fs
    .readFile(MEMORY_PATCH_PROMPT_PATH, "utf8")
    .catch(() => "Return JSON memory patches from the report.");

  app.use(express.json({ limit: "5mb" }));

  app.post("/api/memory/context", async (req, res) => {
    try {
      const query = String(req.body?.query || "");
      const limit = Math.min(Number(req.body?.limit) || 6, 10);
      const memories = await readMemoryFiles();
      if (!query.trim() || memories.length === 0) {
        res.json({ context: "" });
        return;
      }

      const queryTokens = tokenizeForSearch(query);
      const selected = memories
        .map((memory) => ({ memory, score: scoreMemory(queryTokens, memory) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const context = selected.map(({ memory }) => [
        `### ${memory.kind.toUpperCase()}: ${memory.name}`,
        compactMemoryContent(memory.content),
      ].join("\n")).join("\n\n---\n\n");

      res.json({ context });
    } catch (error: any) {
      console.error("Memory Context Error:", error);
      res.status(500).json({ error: "Failed to read memory context." });
    }
  });

  app.get("/api/memory", async (_req, res) => {
    try {
      const memories = await readMemoryFiles();
      const events = await readJsonFiles(MEMORY_EVENTS_DIR);
      const drafts = await readJsonFiles(MEMORY_DRAFTS_DIR);
      const promotedReviews = await readJsonFiles(MEMORY_PROMOTED_DIR);
      const dismissedReviews = await readJsonFiles(MEMORY_DISMISSED_DIR);
      const reviewTrail = [...promotedReviews, ...dismissedReviews]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 40);

      res.json({
        stories: memories
          .filter((memory) => memory.kind === "story")
          .map(memoryReviewItem)
          .sort((a, b) => b.sortTime - a.sortTime),
        narratives: memories
          .filter((memory) => memory.kind === "narrative")
          .map(memoryReviewItem)
          .sort((a, b) => b.sortTime - a.sortTime),
        events: events.slice(0, 40).map((event) => ({ fileName: event.name, ...event.data })),
        drafts: drafts.slice(0, 40).map((draft) => ({ fileName: draft.name, ...draft.data })),
        reviewTrail: reviewTrail.map((review) => ({ fileName: review.name, ...review.data })),
      });
    } catch (error: any) {
      console.error("Memory Read Error:", error);
      res.status(500).json({ error: "Failed to read memory." });
    }
  });

  app.post("/api/memory/drafts/action", async (req, res) => {
    try {
      const fileName = String(req.body?.fileName || "");
      const candidateIndex = Number(req.body?.candidateIndex);
      const action = req.body?.action === "promote" ? "promote" : req.body?.action === "dismiss" ? "dismiss" : null;
      if (!fileName || !Number.isInteger(candidateIndex) || candidateIndex < 0 || !action) {
        res.status(400).json({ error: "Invalid draft action payload." });
        return;
      }

      const result = await applyMemoryDraftAction(fileName, candidateIndex, action);
      res.json({ ok: true, action, ...result });
    } catch (error: any) {
      console.error("Memory Draft Action Error:", error);
      res.status(500).json({ error: error.message || "Failed to apply draft action." });
    }
  });

  app.post("/api/memory/update", async (req, res) => {
    const memoryStarted = Date.now();
    try {
      const report = req.body?.report as StoredReport;
      const runtime = normalizeRuntime(req.body?.runtime);
      if (!report?.id || !report?.type || !report?.content || !report?.timestamp) {
        res.status(400).json({ error: "Invalid report payload." });
        return;
      }
      const draftOnly = report.type === "market";

      const { client, config } = getLlmClient(runtime);
      const existingMemories = await readMemoryFiles();
      const queryTokens = tokenizeForSearch(report.content);
      const existingMemoryContext = existingMemories
        .map((memory) => ({ memory, score: scoreMemory(queryTokens, memory) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ memory }) => [
          `### EXISTING ${memory.kind.toUpperCase()}: ${memory.name}`,
          compactMemoryContent(memory.content, 1800),
        ].join("\n"))
        .join("\n\n---\n\n") || "No existing relevant memory.";

      const memoryMessages = [
          { role: "system", content: "You propose structured local memory patches. Do not think step by step. Return only valid JSON." },
          {
            role: "user",
            content: [
              memoryPatchPrompt,
              draftOnly
                ? "Market report rule: return no updates. Market reports may only create newCandidates for human review when they reveal a genuinely new high-value story or narrative. Do not update existing official memory from a market report."
                : "",
              "",
              "[AVAILABLE TARGET IDS]",
              formatTargetList(existingMemories),
              "",
              "[EXISTING MEMORY]",
              existingMemoryContext,
              "",
              "[REPORT]",
              `type: ${report.type}`,
              `date: ${report.date}`,
              report.content.slice(0, 12000),
            ].join("\n"),
          },
        ];
      const memoryPromptText = memoryMessages.map((message) => String(message.content || "")).join("\n\n");
      const promptTokenEstimate = estimateTokens(memoryPromptText);
      const completionStarted = Date.now();
      const completion = await createMemoryUpdateCompletion(client, config.model, memoryMessages);
      const completionMs = Date.now() - completionStarted;
      const usage = completionUsageMetrics(completion);

      const content = (completion.choices[0].message as any).content || "";
      let rawPatch: any;
      const parseStarted = Date.now();
      try {
        rawPatch = parseJsonObject(content);
      } catch (parseError) {
        if (parseError instanceof MissingJsonObjectError) {
          res.json({
            event: null,
            drafts: null,
            updates: [],
            newCandidates: [],
            skipped: true,
            error: "Memory update returned no JSON object.",
            metrics: {
              promptTokensEstimate: promptTokenEstimate,
              responseMs: completionMs,
              parseMs: Date.now() - parseStarted,
              outputTokensEstimate: estimateTokens(content),
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              totalMs: Date.now() - memoryStarted,
            },
          });
          return;
        }
        console.warn(`Memory update JSON parse failed; trying repair. ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        try {
          const repairedContent = await repairMemoryJson(client, config.model, content, parseError);
          rawPatch = parseJsonObject(repairedContent);
        } catch (repairError) {
          console.warn(`Memory update skipped after JSON repair failed. ${repairError instanceof Error ? repairError.message : String(repairError)}`);
          res.json({
            event: null,
            drafts: null,
            updates: [],
            newCandidates: [],
            skipped: true,
            error: repairError instanceof Error ? repairError.message : "Invalid memory JSON.",
            metrics: {
              promptTokensEstimate: promptTokenEstimate,
              responseMs: completionMs,
              parseMs: Date.now() - parseStarted,
              outputTokensEstimate: estimateTokens(content),
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              totalMs: Date.now() - memoryStarted,
            },
          });
          return;
        }
      }
      const parseMs = Date.now() - parseStarted;
      await ensureMemoryDirs();
      const patch = validateMemoryPatch(rawPatch, existingMemories);
      if (draftOnly) {
        patch.updates = [];
      }
      if (patch.updates.length === 0 && patch.newCandidates.length === 0) {
        res.json({
          event: null,
          drafts: null,
          updates: [],
          newCandidates: [],
          skipped: true,
          reason: draftOnly ? "market_draft_review_empty" : undefined,
          metrics: {
            promptTokensEstimate: promptTokenEstimate,
            responseMs: completionMs,
            parseMs,
            outputTokensEstimate: estimateTokens(content),
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            totalMs: Date.now() - memoryStarted,
          },
        });
        return;
      }

      const event = draftOnly ? null : await writeMemoryEvent(report, patch.updates, patch.newCandidates);
      const drafts = await writeMemoryDrafts(report, patch.newCandidates);
      const written = draftOnly ? [] : await applyMemoryUpdates(report, patch.updates, existingMemories);
      res.json({
        event,
        drafts,
        updates: written,
        newCandidates: patch.newCandidates,
        skippedOfficialUpdates: draftOnly,
        reason: draftOnly ? "market_draft_review" : undefined,
        metrics: {
          promptTokensEstimate: promptTokenEstimate,
          responseMs: completionMs,
          parseMs,
          outputTokensEstimate: estimateTokens(content),
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          totalMs: Date.now() - memoryStarted,
        },
      });
    } catch (error: any) {
      console.error("Memory Update Error:", error);
      res.status(500).json({ error: error.message || "Failed to update memory." });
    }
  });

  app.get("/api/reports", async (_req, res) => {
    try {
      const reports = await readStoredReports();
      res.json({ reports });
    } catch (error: any) {
      console.error("Report Read Error:", error);
      res.status(500).json({ error: "Failed to read reports." });
    }
  });

  app.post("/api/reports", async (req, res) => {
    try {
      const report = req.body as StoredReport;
      if (!report?.id || !report?.date || !report?.type || !report?.content || !report?.timestamp) {
        res.status(400).json({ error: "Invalid report payload." });
        return;
      }

      await ensureReportsDir();
      const baseName = reportBaseName(report);
      await fs.writeFile(
        path.join(REPORTS_DIR, `${baseName}.json`),
        JSON.stringify(report, null, 2),
        "utf8"
      );
      await fs.writeFile(path.join(REPORTS_DIR, `${baseName}.md`), reportMarkdown(report), "utf8");
      const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
      const safeId = report.id.replace(/[^a-z0-9-]/gi, "").slice(0, 12);
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.includes(safeId) && entry.name.includes(".draft."))
          .map((entry) => fs.unlink(path.join(REPORTS_DIR, entry.name)))
      );

      const reports = await readStoredReports();
      res.json({ report, reports });
    } catch (error: any) {
      console.error("Report Save Error:", error);
      res.status(500).json({ error: "Failed to save report." });
    }
  });

  app.delete("/api/reports/drafts", async (_req, res) => {
    try {
      await ensureReportsDir();
      const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
      const targets = entries.filter((entry) => entry.isFile() && entry.name.includes(".draft."));
      await Promise.all(targets.map((entry) => fs.unlink(path.join(REPORTS_DIR, entry.name))));
      const reports = await readStoredReports();
      res.json({ reports, deletedCount: targets.length });
    } catch (error: any) {
      console.error("Draft Clear Error:", error);
      res.status(500).json({ error: "Failed to clear draft reports." });
    }
  });

  app.delete("/api/reports/:id", async (req, res) => {
    try {
      await ensureReportsDir();
      const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
      const fileChecks = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => ({
            entry,
            matches: await fileBelongsToReport(entry.name, req.params.id),
          }))
      );
      const targets = fileChecks.filter((check) => check.matches).map((check) => check.entry);

      await Promise.all(targets.map((entry) => fs.unlink(path.join(REPORTS_DIR, entry.name))));
      const reports = await readStoredReports();
      res.json({ reports });
    } catch (error: any) {
      console.error("Report Delete Error:", error);
      res.status(500).json({ error: "Failed to delete report." });
    }
  });

  app.delete("/api/reports", async (_req, res) => {
    try {
      await ensureReportsDir();
      const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".md")))
          .map((entry) => fs.unlink(path.join(REPORTS_DIR, entry.name)))
      );
      res.json({ reports: [] });
    } catch (error: any) {
      console.error("Report Clear Error:", error);
      res.status(500).json({ error: "Failed to clear reports." });
    }
  });

  // API Route for news collection from RSS
  app.get("/api/collect-news", async (req, res) => {
    try {
      const { items, stats } = await collectNewsFromRSS();
      const recent = filterRecentNews(items);
      const deduped = dedupeNews(recent);
      const ranked = rankNews(deduped);
      const enriched = await enrichNewsItems(ranked);
      res.json({ news: enriched, stats });
    } catch (error: any) {
      console.error("RSS Collection Error:", error);
      res.status(500).json({ error: "Failed to collect news from RSS feeds." });
    }
  });

  // API Route for market data from Finnhub
  app.get("/api/market-data", async (req, res) => {
    try {
      const symbols = req.query.symbols ? (req.query.symbols as string).split(",") : undefined;
      const snapshot = await fetchMarketSnapshot(symbols);
      res.json({ snapshot });
    } catch (error: any) {
      console.error("Market Data Error:", error);
      res.status(500).json({ error: "Failed to fetch market data." });
    }
  });

  type LlmRuntime = "local" | "cloud";

  function getRuntimeConfig(runtime: LlmRuntime = "local") {
    if (runtime === "cloud") {
      return {
        runtime,
        apiKey: process.env.CLOUD_LLM_API_KEY || "",
        baseUrl: process.env.CLOUD_LLM_BASE_URL || "",
        model: process.env.CLOUD_LLM_MODEL || "",
      };
    }

    return {
      runtime,
      apiKey: process.env.LOCAL_LLM_API_KEY || process.env.LLAMA_API_KEY || "local",
      baseUrl: process.env.LOCAL_LLM_BASE_URL || process.env.LLAMA_BASE_URL || "http://127.0.0.1:8080/v1",
      model: process.env.LOCAL_LLM_MODEL || process.env.LLAMA_MODEL || "Qwen3-8B-Q6_K.gguf",
    };
  }

  function getLlmClient(runtime: LlmRuntime) {
    const config = getRuntimeConfig(runtime);
    if (!config.baseUrl || !config.model) {
      throw new Error(`${runtime} LLM is not configured.`);
    }
    return {
      config,
      client: new OpenAI({
        apiKey: config.apiKey || "local",
        baseURL: config.baseUrl,
      }),
    };
  }

  function normalizeRuntime(value: unknown): LlmRuntime {
    return value === "cloud" ? "cloud" : "local";
  }

  function buildCompletionParams(model: string, prompt: string, maxTokens?: number, stream = false) {
    return {
      model,
      messages: [
        {
          role: "system",
          content: systemReportPrompt,
        },
        {
          role: "user",
          content: `${prompt}\n\n${finalOutputInstruction}`,
        },
      ],
      temperature: 0.7,
      max_tokens: Math.min(Number(maxTokens) || 2048, 4096),
      stream,
    };
  }

  function cleanLlmContent(content: string) {
    return content
      .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, "")
      .replace(/^(鎴戝皢|I will|Searching|姝ｅ湪鎼滅储)[\s\S]*?(:|\n)/i, "")
      .trim();
  }

  function extractMarkdownReport(text: string) {
    const cleaned = cleanLlmContent(text);
    const headingMatch = cleaned.match(/(^|\n)#\s+/);
    if (!headingMatch || headingMatch.index === undefined) {
      return "";
    }

    const reportStart = headingMatch.index + (headingMatch[1] ? headingMatch[1].length : 0);
    return cleaned.slice(reportStart).trim();
  }

  // API Route for news generation
  app.post("/api/generate-news", async (req, res) => {
    const { prompt, maxTokens, runtime } = req.body;

    try {
      const { client, config } = getLlmClient(normalizeRuntime(runtime));
      const completionParams: any = {
        model: config.model,
        messages: [
          { 
            role: "system", 
            content: systemReportPrompt,
          },
          { role: "user", content: `${prompt}\n\n${finalOutputInstruction}` }
        ],
        temperature: 0.7,
        max_tokens: Math.min(Number(maxTokens) || 2048, 4096),
      };

      const started = Date.now();
      const response = await client.chat.completions.create(completionParams);
      const usage = completionUsageMetrics(response);

      const message = response.choices[0].message as any;
      let content = message.content || message.reasoning_content || message.reasoning || "";
      
      // Clean up the content:
      // 1. Remove [TOOL_CALL]...[/TOOL_CALL] blocks
      content = content.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, "");
      
      // 2. Remove common "thinking" or "searching" prefixes
      // Matches patterns like "鎴戝皢鎼滅储..." or "I will search..." at the beginning
      content = content.replace(/^(鎴戝皢|I will|Searching|姝ｅ湪鎼滅储)[\s\S]*?(锛殀:|\n)/i, "");
      
      // 3. Final trim
      content = content.trim();

      if (!content) {
        throw new Error("The model returned an empty response or only intermediate steps.");
      }

      res.json({
        content,
        metrics: {
          responseMs: Date.now() - started,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedInputTokens: estimateTokens(`${systemReportPrompt}\n\n${prompt}\n\n${finalOutputInstruction}`),
          estimatedOutputTokens: estimateTokens(content),
        },
      });
    } catch (error: any) {
      console.error("LLM API Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate news" });
    }
  });

  app.post("/api/generate-news-stream", async (req, res) => {
    const { prompt, maxTokens, report, runtime } = req.body;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    let draftPath: string | null = null;
    let draftJsonPath: string | null = null;
    let draftReport: StoredReport | null = null;

    try {
      const { client, config } = getLlmClient(normalizeRuntime(runtime));
      if (report?.id && report?.type && report?.date && report?.timestamp) {
        await ensureReportsDir();
        draftReport = { ...report, content: "" } as StoredReport;
        const baseName = `${reportBaseName(draftReport)}.draft`;
        draftPath = path.join(REPORTS_DIR, `${baseName}.md`);
        draftJsonPath = path.join(REPORTS_DIR, `${baseName}.json`);
        await fs.writeFile(draftPath, reportMarkdown(draftReport), "utf8");
        await fs.writeFile(draftJsonPath, JSON.stringify(draftReport, null, 2), "utf8");
        send({ type: "log", message: `Draft file: reports/${path.basename(draftPath)}` });
      }

      const completionParams = buildCompletionParams(config.model, prompt, maxTokens, true);
      const promptText = `${systemReportPrompt}\n\n${prompt}\n\n${finalOutputInstruction}`;
      const promptTokenEstimate = estimateTokens(promptText);
      const maxOutputTokens = Math.min(Number(maxTokens) || 2048, 4096);
      send({ type: "log", message: `Runtime: ${config.runtime}` });
      send({ type: "log", message: `Connecting to ${config.baseUrl}` });
      send({ type: "log", message: `Model: ${config.model}` });
      send({ type: "log", message: `Prompt ready. Estimated input tokens: ${promptTokenEstimate.toLocaleString()}. Max output tokens: ${maxOutputTokens.toLocaleString()}.` });
      const requestStarted = Date.now();
      const stream = await client.chat.completions.create(completionParams as any);
      send({ type: "log", message: `LLM stream opened in ${formatElapsedMs(Date.now() - requestStarted)}.` });
      let content = "";
      let reasoningContent = "";
      let preContentBuffer = "";
      let finalContentStarted = false;
      let tokenCount = 0;
      let reasoningCount = 0;
      let emptyChunkCount = 0;
      let finishReason = "";
      let firstChunkLogged = false;

      for await (const chunk of stream as any) {
        const choice = chunk.choices?.[0] || {};
        finishReason = choice.finish_reason || finishReason;
        const deltaPayload = choice.delta || {};
        const delta = deltaPayload.content || "";
        const reasoningDelta = deltaPayload.reasoning_content || deltaPayload.reasoning || "";
        if (!firstChunkLogged && (delta || reasoningDelta)) {
          firstChunkLogged = true;
          send({ type: "log", message: `First model output after ${formatElapsedMs(Date.now() - requestStarted)}.` });
        }
        if (reasoningDelta) {
          reasoningContent += reasoningDelta;
          reasoningCount += 1;
          send({ type: "reasoning", delta: reasoningDelta, reasoningCount });
        }
        if (!delta) {
          emptyChunkCount += 1;
          continue;
        }

        let contentDelta = delta;
        if (!finalContentStarted) {
          preContentBuffer += delta;
          const headingMatch = preContentBuffer.match(/(^|\n)#\s+/);
          if (!headingMatch || headingMatch.index === undefined) {
            reasoningContent += delta;
            reasoningCount += 1;
            send({ type: "reasoning", delta, reasoningCount });
            continue;
          }

          const reportStart = headingMatch.index + (headingMatch[1] ? headingMatch[1].length : 0);
          const reasoningPrefix = preContentBuffer.slice(0, reportStart);
          if (reasoningPrefix) {
            reasoningContent += reasoningPrefix;
            reasoningCount += 1;
            send({ type: "reasoning", delta: reasoningPrefix, reasoningCount });
          }
          contentDelta = preContentBuffer.slice(reportStart);
          preContentBuffer = "";
          finalContentStarted = true;
        }

        if (contentDelta) {
          content += contentDelta;
          tokenCount += 1;
          if (draftReport && draftPath && draftJsonPath && (tokenCount % 16 === 0 || contentDelta.includes("\n"))) {
            draftReport.content = content;
            await fs.writeFile(draftPath, reportMarkdown(draftReport), "utf8");
            await fs.writeFile(draftJsonPath, JSON.stringify(draftReport, null, 2), "utf8");
          }
          send({ type: "token", delta: contentDelta, tokenCount });
        }
      }

      content = cleanLlmContent(content);
      if (!content && reasoningContent) {
        const recovered = extractMarkdownReport(reasoningContent);
        if (recovered) {
          content = recovered;
          send({ type: "log", message: "Recovered final markdown from reasoning stream." });
        }
      }
      if (!content && preContentBuffer) {
        const recovered = extractMarkdownReport(preContentBuffer);
        if (recovered) {
          content = recovered;
          send({ type: "log", message: "Recovered final markdown from buffered stream." });
        }
      }
      if (!content) {
        send({ type: "log", message: "No streamed final content; retrying once without streaming." });
        const retryStarted = Date.now();
        const retry = await client.chat.completions.create(buildCompletionParams(config.model, prompt, maxTokens, false) as any);
        const retryUsage = completionUsageMetrics(retry);
        send({
          type: "log",
          message: `Retry finished in ${formatElapsedMs(Date.now() - retryStarted)}. Tokens: prompt ${retryUsage.promptTokens?.toLocaleString() || "n/a"}, completion ${retryUsage.completionTokens?.toLocaleString() || "n/a"}.`,
        });
        const retryMessage = retry.choices?.[0]?.message as any;
        content = cleanLlmContent(retryMessage?.content || retryMessage?.reasoning_content || retryMessage?.reasoning || "");
      }
      if (!content) {
        throw new Error(`The model returned reasoning but no final content. Reasoning chunks: ${reasoningCount}; empty chunks: ${emptyChunkCount}.`);
      }
      if (finishReason === "length") {
        throw new Error("The model hit the max output token limit before finishing. Try Cloud mode, rerun, or reduce the report scope.");
      }

      if (draftReport && draftPath && draftJsonPath) {
        draftReport.content = content;
        await fs.writeFile(draftPath, reportMarkdown(draftReport), "utf8");
        await fs.writeFile(draftJsonPath, JSON.stringify(draftReport, null, 2), "utf8");
        send({ type: "log", message: `Draft saved: reports/${path.basename(draftPath)}` });
      }

      send({
        type: "log",
        message: `Finished response in ${formatElapsedMs(Date.now() - requestStarted)}. Content chunks: ${tokenCount.toLocaleString()}, reasoning chunks: ${reasoningCount.toLocaleString()}, output estimate: ${estimateTokens(content).toLocaleString()} tokens.`,
      });
      send({ type: "done", content, tokenCount, reasoningCount, finishReason });
      res.end();
    } catch (error: any) {
      console.error("LLM Stream Error:", error);
      send({ type: "error", error: error.message || "Failed to generate news" });
      res.end();
    }
  });

  // Health check endpoint to verify LLM connection
  app.get("/api/health", async (req, res) => {
    try {
      const runtime = normalizeRuntime(req.query.runtime);
      const { client, config } = getLlmClient(runtime);
      // Simple test call to verify the API key and base URL
      await client.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      });
      
      res.json({ 
        status: "ok", 
        message: `${runtime} LLM connection successful`,
        runtime,
        model: config.model,
        baseUrl: config.baseUrl
      });
    } catch (error: any) {
      console.error("Health Check Failed:", error);
      const runtime = normalizeRuntime(req.query.runtime);
      const config = getRuntimeConfig(runtime);
      res.status(500).json({ 
        status: "error", 
        message: error.message || `Failed to connect to ${runtime} LLM`,
        runtime,
        model: config.model,
        baseUrl: config.baseUrl
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
