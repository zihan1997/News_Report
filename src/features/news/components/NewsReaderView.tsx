import { Calendar, Moon, Newspaper, Sun } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import ReactMarkdown from "react-markdown";
import { RunStatus } from "../../../shared/components/RunStatus";
import { cn } from "../../../shared/lib/classnames";
import { HistoryFilter, LlmRuntime, NewsHistory, NewsReport, ReportDepth, RSSHealthStats } from "../../../types";
import { GeneratePanel, REPORT_DEPTHS } from "./GeneratePanel";

const LA_TZ = "America/Los_Angeles";

type NewsReaderViewProps = {
  history: NewsHistory;
  selectedReport: NewsReport | null;
  isGenerating: boolean;
  activeGeneration: "morning" | "evening" | "market" | null;
  generationLog: string[];
  streamingContent: string;
  reasoningContent: string;
  llmRuntime: LlmRuntime;
  modelName?: string;
  healthStatus: "loading" | "ok" | "error";
  reportDepth: ReportDepth;
  rssStats: RSSHealthStats | null;
  error: string | null;
  onRuntimeChange: (runtime: LlmRuntime) => void;
  onReportDepthChange: (depth: ReportDepth) => void;
  onGenerate: (type: "morning" | "evening") => void;
  onSelectReport: (report: NewsReport) => void;
  onViewChange: (view: "reader" | "history" | "markets" | "memory") => void;
  onHistoryFilterChange: (filter: HistoryFilter) => void;
};

export function NewsReaderView({
  history,
  selectedReport,
  isGenerating,
  activeGeneration,
  generationLog,
  streamingContent,
  reasoningContent,
  llmRuntime,
  modelName,
  healthStatus,
  reportDepth,
  rssStats,
  error,
  onRuntimeChange,
  onReportDepthChange,
  onGenerate,
  onSelectReport,
  onViewChange,
  onHistoryFilterChange,
}: NewsReaderViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12">
      <div className="space-y-8">
        {isGenerating && activeGeneration !== "market" ? (
          <NewsGenerationStatus
            activeGeneration={activeGeneration}
            logs={generationLog}
            content={streamingContent}
            reasoning={reasoningContent}
            modelName={modelName || llmRuntime}
            reportDepth={reportDepth}
          />
        ) : selectedReport && selectedReport.type !== "market" ? (
          <NewsArticle report={selectedReport} />
        ) : (
          <EmptyNewsState />
        )}
      </div>

      <aside className="space-y-8">
        <GeneratePanel
          isGenerating={isGenerating}
          llmRuntime={llmRuntime}
          onRuntimeChange={onRuntimeChange}
          healthStatus={healthStatus}
          modelName={modelName}
          reportDepth={reportDepth}
          onReportDepthChange={onReportDepthChange}
          onGenerate={onGenerate}
          error={error}
        />

        <FeedStatus stats={rssStats} />
        <ArchiveByDate
          history={history}
          selectedReport={selectedReport}
          onSelectReport={onSelectReport}
          onViewChange={onViewChange}
          onHistoryFilterChange={onHistoryFilterChange}
        />
      </aside>
    </div>
  );
}

function NewsGenerationStatus({
  activeGeneration,
  logs,
  content,
  reasoning,
  modelName,
  reportDepth,
}: {
  activeGeneration: "morning" | "evening" | "market" | null;
  logs: string[];
  content: string;
  reasoning: string;
  modelName: string;
  reportDepth: ReportDepth;
}) {
  const isEvening = activeGeneration === "evening";

  return (
    <div className="min-h-[62vh] grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-10">
      <div className="flex flex-col justify-center space-y-6">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl",
            isEvening ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
          )}>
            {isEvening ? <Moon className="h-7 w-7" /> : <Sun className="h-7 w-7" />}
          </div>
          <div>
            <h3 className="text-3xl font-serif font-bold tracking-tight">
              {isEvening ? "Generating Evening Update" : "Generating Morning Briefing"}
            </h3>
            <p className="text-black/40">
              Collecting feeds, ranking signals, and streaming the report into your local archive.
            </p>
          </div>
        </div>
        <RunStatus
          isGenerating
          logs={logs}
          content={content}
          reasoning={reasoning}
          tone="light"
        />
      </div>
      <aside className="hidden xl:block border-l border-black/5 pl-10">
        <div className="sticky top-24 space-y-5 text-sm text-black/45">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-black/25">Model</div>
            <div className="mt-1 font-mono text-xs text-black/60">{modelName}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-black/25">Coverage</div>
            <div className="mt-1 text-xs text-black/60">
              {REPORT_DEPTHS.find((option) => option.value === reportDepth)?.label || "Balanced"}
            </div>
          </div>
          <p className="text-xs leading-relaxed">
            Draft files are written while tokens stream, then replaced by the final report when generation completes.
          </p>
        </div>
      </aside>
    </div>
  );
}

function NewsArticle({ report }: { report: NewsReport }) {
  return (
    <article className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-3 mb-4">
        <span className={cn(
          "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
          report.type === "morning" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
        )}>
          {report.type === "morning" ? (
            <span className="flex items-center gap-1"><Sun className="w-3 h-3" /> Morning Briefing</span>
          ) : (
            <span className="flex items-center gap-1"><Moon className="w-3 h-3" /> Evening Update</span>
          )}
        </span>
        <span className="text-sm text-black/40 font-medium">
          {formatInTimeZone(new Date(report.date), LA_TZ, "MMMM do, yyyy")}
        </span>
      </div>

      <div className="markdown-body">
        <ReactMarkdown>{report.content}</ReactMarkdown>
      </div>
    </article>
  );
}

function EmptyNewsState() {
  return (
    <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-black/5 rounded-3xl">
      <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center">
        <Newspaper className="w-8 h-8 text-black/20" />
      </div>
      <div>
        <h3 className="text-xl font-serif font-bold">No reports yet</h3>
        <p className="text-black/40 max-w-xs mx-auto">Generate your first daily briefing to get started.</p>
      </div>
    </div>
  );
}

function FeedStatus({ stats }: { stats: RSSHealthStats | null }) {
  if (!stats) return null;

  return (
    <div className="bg-white border border-black/5 p-6 rounded-[2rem] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Feed Status</h3>
        <span className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-full",
          stats.failedCount === 0 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
        )}>
          {stats.successCount} / {stats.totalSources} Healthy
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-black/[0.02] rounded-2xl">
          <div className="text-[10px] uppercase font-bold tracking-widest text-black/20 mb-1">Refresh</div>
          <div className="text-sm font-serif font-bold">{stats.lastRefresh}</div>
        </div>
        <div className="p-3 bg-black/[0.02] rounded-2xl">
          <div className="text-[10px] uppercase font-bold tracking-widest text-black/20 mb-1">Failures</div>
          <div className="text-sm font-serif font-bold text-red-500">{stats.failedCount}</div>
        </div>
      </div>

      {stats.failures.length > 0 && (
        <div className="space-y-1 mt-2">
          {stats.failures.slice(0, 3).map((failure, index) => (
            <div key={index} className="text-[10px] text-red-400 font-medium truncate">
              ⚠️ {failure.source}: {failure.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchiveByDate({
  history,
  selectedReport,
  onSelectReport,
  onViewChange,
  onHistoryFilterChange,
}: {
  history: NewsHistory;
  selectedReport: NewsReport | null;
  onSelectReport: (report: NewsReport) => void;
  onViewChange: (view: "reader" | "history" | "markets" | "memory") => void;
  onHistoryFilterChange: (filter: HistoryFilter) => void;
}) {
  const groupedReports = Object.entries(
    history.reduce((acc, report) => {
      const dateKey = formatInTimeZone(new Date(report.date), LA_TZ, "yyyy-MM-dd");
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(report);
      return acc;
    }, {} as Record<string, NewsReport[]>)
  )
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Archive by Date</h3>
        <button
          type="button"
          onClick={() => {
            onHistoryFilterChange("news");
            onViewChange("history");
          }}
          className="text-[10px] font-bold uppercase tracking-widest text-black/25 hover:text-black transition-colors"
        >
          View all
        </button>
      </div>
      <div className="space-y-4">
        {groupedReports.map(([date, reports]) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-30 px-2">
              <Calendar className="w-3 h-3" />
              {formatInTimeZone(new Date(reports[0].date), LA_TZ, "MMMM d, yyyy")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["morning", "evening"] as const).map((type) => {
                const report = reports.find((item) => item.type === type);
                return (
                  <button
                    key={type}
                    disabled={!report}
                    onClick={() => {
                      if (report) {
                        onSelectReport(report);
                        onViewChange("reader");
                      }
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all border",
                      !report
                        ? "bg-black/[0.02] border-transparent text-black/10 cursor-not-allowed"
                        : selectedReport?.id === report.id
                          ? "bg-white border-black/10 shadow-sm text-black"
                          : "bg-transparent border-transparent text-black/40 hover:bg-black/5 hover:text-black"
                    )}
                  >
                    {type === "morning" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
