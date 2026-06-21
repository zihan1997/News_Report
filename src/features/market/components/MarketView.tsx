import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarClock, Check, ChevronRight, CircleHelp, Link2, Loader2, Play, RefreshCw, Settings2, TrendingUp, Waves } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import ReactMarkdown from "react-markdown";
import { RunStatus } from "../../../shared/components/RunStatus";
import { cn } from "../../../shared/lib/classnames";
import { cleanMarketContent, getMarketTickers } from "../../../lib/report-format";
import { LlmRuntime, MarketIntelligence, MarketScheduleState, NewsHistory, NewsReport } from "../../../types";
import { MarketRiverNode, parseMarketRiver } from "../market-river";

const LA_TZ = "America/Los_Angeles";

type MarketViewProps = {
  history: NewsHistory;
  selectedReport: NewsReport | null;
  isGenerating: boolean;
  generationLog: string[];
  streamingContent: string;
  reasoningContent: string;
  llmRuntime: LlmRuntime;
  modelName?: string;
  schedule: MarketScheduleState | null;
  onGenerateMarket: () => void;
  onUpdateSchedule: (enabled: boolean, slots: string[], runtime: LlmRuntime) => void;
  onRunScheduledNow: () => void;
  onSelectReport: (report: NewsReport) => void;
  onViewMarketHistory: () => void;
};

export function MarketView({
  history,
  selectedReport,
  isGenerating,
  generationLog,
  streamingContent,
  reasoningContent,
  llmRuntime,
  modelName,
  schedule,
  onGenerateMarket,
  onUpdateSchedule,
  onRunScheduledNow,
  onSelectReport,
  onViewMarketHistory,
}: MarketViewProps) {
  const marketReports = history
    .filter((report) => report.type === "market")
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="space-y-12">
      <MarketHeader
        isGenerating={isGenerating}
        schedule={schedule}
        onGenerateMarket={onGenerateMarket}
        onUpdateSchedule={onUpdateSchedule}
        onRunScheduledNow={onRunScheduledNow}
      />

      {isGenerating ? (
        <MarketGenerationStatus
          logs={generationLog}
          content={streamingContent}
          reasoning={reasoningContent}
          llmRuntime={llmRuntime}
          modelName={modelName}
        />
      ) : selectedReport && selectedReport.type === "market" ? (
        <MarketRiverWorkspace
          report={selectedReport as MarketIntelligence}
          reports={marketReports}
          selectedReport={selectedReport}
          onSelectReport={onSelectReport}
          onViewMarketHistory={onViewMarketHistory}
        />
      ) : (
        <EmptyMarketState onGenerateMarket={onGenerateMarket} />
      )}
    </div>
  );
}

function MarketHeader({
  isGenerating,
  schedule,
  onGenerateMarket,
  onUpdateSchedule,
  onRunScheduledNow,
}: {
  isGenerating: boolean;
  schedule: MarketScheduleState | null;
  onGenerateMarket: () => void;
  onUpdateSchedule: (enabled: boolean, slots: string[], runtime: LlmRuntime) => void;
  onRunScheduledNow: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-serif font-bold tracking-tight">Market Intelligence</h1>
            <p className="text-black/40 font-medium">News proposes a thesis. Markets provide feedback.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen((current) => !current)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold border transition-all",
              settingsOpen ? "bg-indigo-50 border-indigo-100 text-indigo-700" : "bg-white border-black/5 text-black/55 hover:text-black"
            )}
          >
            <Settings2 className="w-4 h-4" />
            Schedule
          </button>
          <button
            disabled={isGenerating}
            onClick={onGenerateMarket}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl text-sm font-bold shadow-lg hover:bg-black/90 transition-all disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh Scan
          </button>
        </div>
      </div>

      {settingsOpen && (
        <MarketSchedulePanel
          schedule={schedule}
          onUpdateSchedule={onUpdateSchedule}
          onRunScheduledNow={onRunScheduledNow}
        />
      )}
    </div>
  );
}

function MarketSchedulePanel({
  schedule,
  onUpdateSchedule,
  onRunScheduledNow,
}: {
  schedule: MarketScheduleState | null;
  onUpdateSchedule: (enabled: boolean, slots: string[], runtime: LlmRuntime) => void;
  onRunScheduledNow: () => void;
}) {
  const slots = schedule?.slots || ["07:00", "10:30", "13:00", "15:30"];
  const runtime = schedule?.runtime || "cloud";
  const updateSlots = (slot: string) => {
    const next = slots.includes(slot) ? slots.filter((item) => item !== slot) : [...slots, slot].sort();
    if (next.length > 0) onUpdateSchedule(schedule?.enabled || false, next, runtime);
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 p-6 bg-white border border-black/5 rounded-3xl shadow-sm">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold">Scheduled Market</h2>
            <p className="text-xs text-black/40 mt-1">Runs from the Node server on LA weekdays, even when this browser tab is closed.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {["07:00", "10:30", "13:00", "15:30"].map((slot) => (
            <button
              key={slot}
              onClick={() => updateSlots(slot)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-mono font-bold transition-all",
                slots.includes(slot) ? "bg-black text-white border-black" : "bg-white text-black/35 border-black/10"
              )}
            >
              {slots.includes(slot) && <Check className="w-3 h-3" />}
              {slot}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/30">Runtime</span>
          {(["cloud", "local"] as LlmRuntime[]).map((option) => (
            <button
              key={option}
              onClick={() => onUpdateSchedule(schedule?.enabled || false, slots, option)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest",
                runtime === option ? "bg-indigo-50 text-indigo-700" : "text-black/30 hover:text-black/60"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-[290px] xl:border-l xl:border-black/5 xl:pl-6 space-y-4">
        <button
          onClick={() => onUpdateSchedule(!(schedule?.enabled || false), slots, runtime)}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all",
            schedule?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-black/45"
          )}
        >
          <span>{schedule?.enabled ? "Schedule active" : "Schedule paused"}</span>
          <span className={cn("w-10 h-6 rounded-full p-1 transition-colors", schedule?.enabled ? "bg-emerald-500" : "bg-black/15")}>
            <span className={cn("block w-4 h-4 bg-white rounded-full transition-transform", schedule?.enabled && "translate-x-4")} />
          </span>
        </button>
        <div className="text-xs text-black/45 leading-relaxed">
          <div className="font-bold text-black/70">Next run</div>
          <div>{schedule?.nextRun ? formatInTimeZone(new Date(schedule.nextRun.scheduledFor), LA_TZ, "EEE, MMM d - HH:mm 'LA'") : "No run scheduled"}</div>
          {schedule?.lastRunAt && (
            <div className="mt-2">
              Last run: {formatInTimeZone(new Date(schedule.lastRunAt), LA_TZ, "MMM d - HH:mm")} - {schedule.lastRunStatus}
            </div>
          )}
        </div>
        <button
          disabled={schedule?.running}
          onClick={onRunScheduledNow}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-black/10 text-xs font-bold hover:bg-black hover:text-white transition-all disabled:opacity-40"
        >
          {schedule?.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run server scan now
        </button>
      </div>
    </section>
  );
}

function MarketGenerationStatus({
  logs,
  content,
  reasoning,
  llmRuntime,
  modelName,
}: {
  logs: string[];
  content: string;
  reasoning: string;
  llmRuntime: LlmRuntime;
  modelName?: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10">
      <div className="min-h-[48vh] flex flex-col justify-center space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <TrendingUp className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-3xl font-serif font-bold tracking-tight">Analyzing Markets</h3>
            <p className="text-black/40">Streaming a local read of market data and today&apos;s news.</p>
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
      <aside className="hidden lg:block border-l border-black/5 pl-10">
        <div className="sticky top-24 space-y-4 text-sm text-black/45">
          <div className="text-[10px] font-bold uppercase tracking-widest text-black/25">{llmRuntime} Model</div>
          <div className="font-mono text-xs text-black/60">{modelName || "Qwen3-8B-Q6_K.gguf"}</div>
          <div className="text-xs leading-relaxed">Draft output is written to the reports folder while tokens stream.</div>
        </div>
      </aside>
    </div>
  );
}

function MarketRiverWorkspace({
  report,
  reports,
  selectedReport,
  onSelectReport,
  onViewMarketHistory,
}: {
  report: MarketIntelligence;
  reports: NewsReport[];
  selectedReport: NewsReport | null;
  onSelectReport: (report: NewsReport) => void;
  onViewMarketHistory: () => void;
}) {
  const river = parseMarketRiver(report.content);
  const tickers = getMarketTickers(report);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <div className="flex flex-col gap-6 border-b border-black/5 px-6 py-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="max-w-4xl">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-600">
              <Waves className="h-4 w-4" />
              Narrative River
            </div>
            <h2 className="font-serif text-3xl font-bold tracking-tight">Today&apos;s key relationships</h2>
            <p className="mt-2 text-sm leading-relaxed text-black/50">
              {river.marketRead || "The report has not produced a concise market read yet. The river below preserves only explicit news-to-market links."}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">
            <CircleHelp className="h-4 w-4" />
            Relationship, not causation
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] border-b border-black/5 bg-black/[0.02] px-8 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-black/35 lg:grid">
          <span>News proposes</span>
          <span className="text-center">Relationship</span>
          <span>Market responds</span>
        </div>

        {river.nodes.length > 0 ? (
          <div className="divide-y divide-black/5">
            {river.nodes.map((node, index) => <MarketRiverRow key={`${node.title}-${index}`} node={node} index={index} />)}
          </div>
        ) : (
          <div className="px-8 py-12 text-center text-sm text-black/35">
            This report has no structured News-to-Stock Map. Open the full report below for the original analysis.
          </div>
        )}
      </section>

      {tickers.length > 0 && (
        <section>
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-black/30">Market tape</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tickers.map((ticker, idx) => (
              <div key={idx} className="flex min-w-0 items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  ticker.trend === "up" ? "bg-emerald-50 text-emerald-600" :
                    ticker.trend === "down" ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"
                )}>
                  {ticker.trend === "up" ? <ArrowUpRight className="h-4 w-4" /> :
                    ticker.trend === "down" ? <ArrowDownRight className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">{ticker.symbol}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-bold">{ticker.price}</span>
                    <span className={cn(
                      "text-[10px] font-bold",
                      ticker.trend === "up" ? "text-emerald-600" :
                        ticker.trend === "down" ? "text-rose-600" : "text-slate-600"
                    )}>{ticker.changePercent}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <details className="group rounded-[2rem] border border-black/5 bg-white shadow-sm" open>
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/30">Deep read</div>
              <div className="mt-1 font-serif text-xl font-bold">Full market report</div>
            </div>
            <ChevronRight className="h-5 w-5 text-black/30 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-black/5 px-6 py-8 lg:px-10">
            <MarketReport report={report} />
          </div>
        </details>
        <MarketSessions reports={reports} selectedReport={selectedReport} onSelectReport={onSelectReport} onViewMarketHistory={onViewMarketHistory} />
      </div>
    </div>
  );
}

function MarketRiverRow({ node, index }: { node: MarketRiverNode; index: number }) {
  const relationship = {
    aligned: { label: "Aligned", tone: "bg-emerald-50 text-emerald-700 border-emerald-100", line: "bg-emerald-400" },
    diverged: { label: "Diverged", tone: "bg-rose-50 text-rose-700 border-rose-100", line: "bg-rose-400" },
    mixed: { label: "Mixed", tone: "bg-amber-50 text-amber-700 border-amber-100", line: "bg-amber-400" },
    unknown: { label: "Unconfirmed", tone: "bg-slate-50 text-slate-600 border-slate-100", line: "bg-slate-300" },
  }[node.relationship];

  return (
    <article className="grid gap-5 px-6 py-7 transition-colors hover:bg-black/[0.015] lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] lg:items-center lg:px-8">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold text-indigo-500">{String(index + 1).padStart(2, "0")}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/30">News thesis</span>
        </div>
        <h3 className="font-serif text-xl font-bold leading-tight">{node.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-black/55">{node.newsTheme || "No distinct news theme was extracted."}</p>
        {node.gap && <p className="mt-3 text-xs leading-relaxed text-black/35">Evidence gap: {node.gap}</p>}
      </div>

      <div className="relative flex min-h-24 flex-col items-center justify-center text-center">
        <div className={cn("absolute left-0 right-0 top-1/2 hidden h-px lg:block", relationship.line)} />
        <div className={cn("relative z-10 flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-widest", relationship.tone)}>
          <Link2 className="h-3.5 w-3.5" />
          {relationship.label}
        </div>
        <p className="relative z-10 mt-2 max-w-[170px] bg-white px-2 text-[10px] leading-relaxed text-black/40">{node.connection || "No explicit relationship judgment."}</p>
      </div>

      <div className="min-w-0">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-black/30">Market feedback</div>
        <p className="text-sm font-medium leading-relaxed text-black/70">{node.marketFeedback || "No clear market response was observed."}</p>
        <div className="mt-3 inline-flex rounded-lg bg-black/[0.04] px-2.5 py-1.5 font-mono text-[10px] font-bold text-black/45">
          {node.targets || "No mapped ticker"}
        </div>
      </div>
    </article>
  );
}

function MarketReport({ report }: { report: MarketIntelligence }) {
  return (
    <article className="markdown-body">
      <ReactMarkdown>{cleanMarketContent(report.content)}</ReactMarkdown>
    </article>
  );
}

function MarketSessions({
  reports,
  selectedReport,
  onSelectReport,
  onViewMarketHistory,
}: {
  reports: NewsReport[];
  selectedReport: NewsReport | null;
  onSelectReport: (report: NewsReport) => void;
  onViewMarketHistory: () => void;
}) {
  return (
    <div className="bg-white border border-black/5 p-8 rounded-[3rem] space-y-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Market Sessions</h3>
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {reports.map((report) => (
          <button
            key={report.id}
            onClick={() => onSelectReport(report)}
            className={cn(
              "w-full text-left p-4 rounded-2xl border transition-all",
              selectedReport?.id === report.id ? "bg-indigo-50 border-indigo-100" : "border-transparent hover:bg-black/5"
            )}
          >
            <div className="text-[10px] font-bold text-black/30 uppercase tracking-widest mb-1">
              {formatInTimeZone(new Date(report.date), LA_TZ, "MMM d, yyyy")}
            </div>
            <div className="font-bold text-sm">
              {formatInTimeZone(new Date(report.date), LA_TZ, "HH:mm")} Market Intelligence
            </div>
          </button>
        ))}

        {reports.length === 0 && (
          <div className="text-center py-8 opacity-20">
            <p className="text-[10px] font-bold uppercase tracking-widest">No previous scans</p>
          </div>
        )}
      </div>

      <button
        onClick={onViewMarketHistory}
        className="w-full py-3 text-[10px] font-bold uppercase tracking-widest text-black/40 hover:text-black hover:bg-black/5 rounded-2xl transition-all"
      >
        View Full History
      </button>
    </div>
  );
}

function EmptyMarketState({ onGenerateMarket }: { onGenerateMarket: () => void }) {
  return (
    <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 border-2 border-dashed border-black/5 rounded-[4rem]">
      <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
        <TrendingUp className="w-10 h-10 text-indigo-400" />
      </div>
      <div className="max-w-md">
        <h3 className="text-2xl font-serif font-bold mb-2">No Market Intelligence Data</h3>
        <p className="text-black/40 mb-8 px-8">Run an AI market scan to synthesize today&apos;s financial movers with high-signal news.</p>
        <button
          onClick={onGenerateMarket}
          className="px-8 py-4 bg-indigo-500 text-white rounded-2xl font-bold hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-100"
        >
          Initialize First Market Scan
        </button>
      </div>
    </div>
  );
}
