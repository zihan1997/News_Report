import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const memoryRoot = path.join(root, "memory");
const storiesDir = path.join(memoryRoot, "stories");
const narrativesDir = path.join(memoryRoot, "narratives");
const consolidationsDir = path.join(memoryRoot, "review", "consolidations");

const STORY_HEADINGS = [
  "Current State",
  "Timeline",
  "Resolved",
  "Open Gaps",
  "Related Narratives",
  "Evidence",
  "Source Reports",
];

const NARRATIVE_HEADINGS = [
  "Current State",
  "Supporting Stories",
  "Evidence For",
  "Weak Signals / Evidence Against",
  "Open Questions",
  "Watchlist",
  "Related Reports",
];

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".md") && !name.startsWith(".") && !name.startsWith("_"))
    .map((name) => {
      const filePath = path.join(dir, name);
      const content = fs.readFileSync(filePath, "utf8");
      const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || name.replace(/\.md$/, "");
      return { name, id: name.replace(/\.md$/, ""), title, filePath, content };
    });
}

function section(content, heading) {
  return content.match(new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim() || "";
}

function headings(content) {
  return [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
}

function lineItems(text) {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s+/, "").trim());
}

function parseLaUpdated(value) {
  const normalized = value.replace(/\s+LA$/i, "").replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function latestReportTimestamp(content) {
  const matches = [...content.matchAll(/-\s+(2026-\d\d-\d\d)\s+(\d\d:\d\d)\s+(morning|evening):/g)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((match) => Date.parse(`${match[1]}T${match[2]}`)).filter(Number.isFinite));
}

const stories = readMarkdownFiles(storiesDir);
const narratives = readMarkdownFiles(narrativesDir);
const storyTitles = new Set(stories.map((item) => item.title));
const narrativeTitles = new Set(narratives.map((item) => item.title));
const issues = [];

for (const item of stories) {
  const actual = headings(item.content);
  const missing = STORY_HEADINGS.filter((heading) => !actual.includes(heading));
  if (missing.length) issues.push(`${item.name}: missing story headings: ${missing.join(", ")}`);

  const extra = actual.filter((heading) => !STORY_HEADINGS.includes(heading));
  if (extra.length) issues.push(`${item.name}: unexpected story headings: ${extra.join(", ")}`);

  for (const related of lineItems(section(item.content, "Related Narratives"))) {
    if (!narrativeTitles.has(related)) issues.push(`${item.name}: related narrative is not official: ${related}`);
  }
}

for (const item of narratives) {
  const actual = headings(item.content);
  const missing = NARRATIVE_HEADINGS.filter((heading) => !actual.includes(heading));
  if (missing.length) issues.push(`${item.name}: missing narrative headings: ${missing.join(", ")}`);

  const extra = actual.filter((heading) => !NARRATIVE_HEADINGS.includes(heading));
  if (extra.length) issues.push(`${item.name}: unexpected narrative headings: ${extra.join(", ")}`);

  for (const supporting of lineItems(section(item.content, "Supporting Stories"))) {
    if (!storyTitles.has(supporting)) issues.push(`${item.name}: supporting story is not official: ${supporting}`);
  }
}

for (const item of [...stories, ...narratives]) {
  if (/2026-05-15\s+08:37\s+market|65dc7c51|-\s+\d{4}-\d\d-\d\d\s+\d\d:\d\d\s+market:/.test(item.content)) {
    issues.push(`${item.name}: contains active market memory reference`);
  }

  const lastUpdated = item.content.match(/^Last Updated:\s*(.+)$/m)?.[1]?.trim() || "";
  const parsedUpdated = parseLaUpdated(lastUpdated);
  const latestReport = latestReportTimestamp(item.content);
  if (parsedUpdated && latestReport && parsedUpdated + 60_000 < latestReport) {
    issues.push(`${item.name}: Last Updated is older than latest source report`);
  }
}

if (fs.existsSync(consolidationsDir)) {
  for (const name of fs.readdirSync(consolidationsDir).filter((file) => file.endsWith(".json"))) {
    const filePath = path.join(consolidationsDir, name);
    try {
      const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (record.action !== "consolidate") issues.push(`${name}: consolidation action must be "consolidate"`);
      if (!["story", "narrative"].includes(record.targetType)) issues.push(`${name}: invalid targetType`);
      if (!record.targetId) issues.push(`${name}: missing targetId`);
      if (!["applied", "rolled_back"].includes(record.status)) issues.push(`${name}: invalid consolidation status`);
      if (!record.before?.fullContent || !record.after?.fullContent) issues.push(`${name}: missing rollback fullContent`);
    } catch (error) {
      issues.push(`${name}: invalid consolidation JSON (${error.message})`);
    }
  }
}

if (issues.length) {
  console.error(`Memory audit found ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Memory audit passed: ${stories.length} stories, ${narratives.length} narratives.`);
