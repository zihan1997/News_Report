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
const SYSTEM_PROMPT_PATH = path.join(__dirname, "src", "prompts", "system-report.md");
const FINAL_OUTPUT_INSTRUCTION_PATH = path.join(__dirname, "src", "prompts", "final-output-instruction.md");
const LA_TZ = "America/Los_Angeles";

dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });
dotenv.config({ path: path.join(__dirname, ".env"), override: false });

type StoredReport = {
  id: string;
  date: string;
  type: "morning" | "evening" | "market";
  content: string;
  timestamp: number;
  tickers?: unknown[];
};

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

async function startServer() {
  const app = express();
  const PORT = 3000;
  const systemReportPrompt = await fs
    .readFile(SYSTEM_PROMPT_PATH, "utf8")
    .catch(() => "You are a high-signal news intelligence assistant. Provide a final, polished markdown report in Chinese.");
  const finalOutputInstruction = await fs
    .readFile(FINAL_OUTPUT_INSTRUCTION_PATH, "utf8")
    .catch(() => "/no_think\n\nPlease output only the final Markdown report.");

  app.use(express.json());

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

      const response = await client.chat.completions.create(completionParams);

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

      res.json({ content });
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

      send({ type: "log", message: `Runtime: ${config.runtime}` });
      send({ type: "log", message: `Connecting to ${config.baseUrl}` });
      send({ type: "log", message: `Model: ${config.model}` });
      const stream = await client.chat.completions.create(buildCompletionParams(config.model, prompt, maxTokens, true) as any);
      let content = "";
      let reasoningContent = "";
      let preContentBuffer = "";
      let finalContentStarted = false;
      let tokenCount = 0;
      let reasoningCount = 0;
      let emptyChunkCount = 0;
      let finishReason = "";

      for await (const chunk of stream as any) {
        const choice = chunk.choices?.[0] || {};
        finishReason = choice.finish_reason || finishReason;
        const deltaPayload = choice.delta || {};
        const delta = deltaPayload.content || "";
        const reasoningDelta = deltaPayload.reasoning_content || deltaPayload.reasoning || "";
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
