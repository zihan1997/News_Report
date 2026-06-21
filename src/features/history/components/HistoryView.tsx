import { ArrowLeft, History, Moon, Newspaper, Sun, Trash2, TrendingUp } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import ReactMarkdown from "react-markdown";
import { cn } from "../../../shared/lib/classnames";
import { cleanMarketContent, getMarketTickers, getReportKeywords, getReportTitle } from "../../../lib/report-format";
import { HistoryFilter, MarketIntelligence, NewsHistory, NewsReport } from "../../../types";

const LA_TZ = "America/Los_Angeles";
const HISTORY_FILTERS: HistoryFilter[] = ["all", "news", "market"];

type HistoryViewProps = {
  history: NewsHistory;
  selectedReport: NewsReport | null;
  historyFilter: HistoryFilter;
  onHistoryFilterChange: (filter: HistoryFilter) => void;
  onSelectReport: (report: NewsReport) => void;
  onDeleteReport: (id: string) => void;
  onImportReports: () => void;
  onClearDrafts: () => void;
  onClearHistory: () => void;
  onBackToReader: () => void;
};

export function HistoryView({
  history,
  selectedReport,
  historyFilter,
  onHistoryFilterChange,
  onSelectReport,
  onDeleteReport,
  onImportReports,
  onClearDrafts,
  onClearHistory,
  onBackToReader,
}: HistoryViewProps) {
  const groupedReports = Object.entries(
    history.reduce((acc, report) => {
      const dateKey = formatInTimeZone(new Date(report.date), LA_TZ, "yyyy-MM-dd");
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(report);
      return acc;
    }, {} as Record<string, NewsReport[]>)
  ).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight mb-1">Archive</h1>
          <p className="text-black/40 text-sm">Browse your collection of past briefings.</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onImportReports}
            className="flex items-center gap-2 px-4 py-2 border border-black/10 text-black/50 rounded-xl text-xs font-bold hover:bg-black/5 hover:text-black transition-all"
          >
            Import JSON
          </button>
          <button
            onClick={onClearDrafts}
            className="flex items-center gap-2 px-4 py-2 border border-black/10 text-black/50 rounded-xl text-xs font-bold hover:bg-black/5 hover:text-black transition-all"
          >
            Clear Drafts
          </button>
          <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl mr-4">
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => onHistoryFilterChange(filter)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  historyFilter === filter
                    ? "bg-white text-black shadow-sm"
                    : "text-black/30 hover:text-black/60"
                )}
              >
                {filter}
              </button>
            ))}
          </div>
          <button
            onClick={onClearHistory}
            disabled={history.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
          <button
            onClick={onBackToReader}
            className="flex items-center gap-2 text-sm font-bold hover:gap-3 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Reader
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-8 min-h-0 overflow-hidden">
        <div className="w-[44%] overflow-y-auto pr-4 custom-scrollbar">
          <div className="grid grid-cols-1 gap-4">
            {groupedReports.map(([dateKey, reports]) => (
              <HistoryDateCard
                key={dateKey}
                reports={reports}
                selectedReport={selectedReport}
                historyFilter={historyFilter}
                onSelectReport={onSelectReport}
                onDeleteReport={onDeleteReport}
              />
            ))}

            {history.length === 0 && (
              <div className="py-12 text-center space-y-4 opacity-20">
                <History className="w-12 h-12 mx-auto" />
                <p className="text-sm font-bold uppercase tracking-widest">Empty Archive</p>
              </div>
            )}
          </div>
        </div>

        <ReportPreview selectedReport={selectedReport} />
      </div>
    </div>
  );
}

function HistoryDateCard({
  reports,
  selectedReport,
  historyFilter,
  onSelectReport,
  onDeleteReport,
}: {
  reports: NewsReport[];
  selectedReport: NewsReport | null;
  historyFilter: HistoryFilter;
  onSelectReport: (report: NewsReport) => void;
  onDeleteReport: (id: string) => void;
}) {
  const sortedReports = [...reports].sort((a, b) => b.timestamp - a.timestamp);
  const visibleReports = sortedReports.filter((report) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "news") return report.type !== "market";
    return report.type === "market";
  });
  if (visibleReports.length === 0) return null;

  const morning = sortedReports.find((report) => report.type === "morning");
  const evening = sortedReports.find((report) => report.type === "evening");
  const markets = sortedReports.filter((report) => report.type === "market");
  const dayDate = new Date(sortedReports[0].date);

  return (
    <section className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold text-black/35">
            {formatInTimeZone(dayDate, LA_TZ, "EEEE")}
          </div>
          <h2 className="font-serif text-2xl font-bold tracking-tight">
            {formatInTimeZone(dayDate, LA_TZ, "MMMM d")}
          </h2>
        </div>
        <div className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-semibold text-black/40">
          {reports.length} item{reports.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {historyFilter !== "market" && (
          <>
            <NewsSlot
              label="Morning"
              report={morning}
              selected={selectedReport?.id === morning?.id}
              onSelectReport={onSelectReport}
              onDeleteReport={onDeleteReport}
            />
            <NewsSlot
              label="Evening"
              report={evening}
              selected={selectedReport?.id === evening?.id}
              onSelectReport={onSelectReport}
              onDeleteReport={onDeleteReport}
            />
          </>
        )}
      </div>

      {historyFilter !== "news" && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 px-1 text-xs font-semibold text-black/35">
            <TrendingUp className="h-3.5 w-3.5" />
            Market scans
          </div>
          {markets.length > 0 ? markets.map((report, index) => (
            <MarketScanRow
              key={report.id}
              report={report}
              label={`Scan ${markets.length - index}`}
              selected={selectedReport?.id === report.id}
              onSelectReport={onSelectReport}
              onDeleteReport={onDeleteReport}
            />
          )) : (
            <div className="rounded-xl border border-dashed border-black/10 px-4 py-3 text-xs text-black/25">
              No market scans
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NewsSlot({
  label,
  report,
  selected,
  onSelectReport,
  onDeleteReport,
}: {
  label: "Morning" | "Evening";
  report?: NewsReport;
  selected: boolean;
  onSelectReport: (report: NewsReport) => void;
  onDeleteReport: (id: string) => void;
}) {
  const isMorning = label === "Morning";

  if (!report) {
    return (
      <div className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-dashed border-black/10 bg-black/[0.015] px-4 py-3 text-black/25">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/[0.03]">
          {isMorning ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </div>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-1 text-xs">No report</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "group relative flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all",
      selected ? "border-black/15 bg-white shadow-sm" : "border-black/5 bg-black/[0.025] hover:border-black/10 hover:bg-white"
    )}>
      <button type="button" onClick={() => onSelectReport(report)} className="absolute inset-0 rounded-2xl" aria-label={`Open ${label.toLowerCase()} report`} />
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        isMorning ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"
      )}>
        {isMorning ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-black">{label}</span>
          <span className="text-xs text-black/35">
            {formatInTimeZone(new Date(report.date), LA_TZ, "HH:mm")}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-black/45">{getReportKeywords(report) || getReportTitle(report)}</div>
      </div>
      <button
        type="button"
        onClick={() => onDeleteReport(report.id)}
        title={`Delete ${label.toLowerCase()} report`}
        className="relative z-10 shrink-0 rounded-lg p-2 text-black/20 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5 pointer-events-none" />
      </button>
    </div>
  );
}

function MarketScanRow({
  report,
  label,
  selected,
  onSelectReport,
  onDeleteReport,
}: {
  report: NewsReport;
  label: string;
  selected: boolean;
  onSelectReport: (report: NewsReport) => void;
  onDeleteReport: (id: string) => void;
}) {
  return (
    <div className={cn(
      "group relative flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all",
      selected ? "border-purple-100 bg-purple-50" : "border-black/5 bg-black/[0.02] hover:border-black/10 hover:bg-white"
    )}>
      <button type="button" onClick={() => onSelectReport(report)} className="absolute inset-0 rounded-xl" aria-label={`Open ${label.toLowerCase()}`} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-black">{label}</div>
        <div className="mt-0.5 truncate text-xs text-black/40">
          {formatInTimeZone(new Date(report.date), LA_TZ, "HH:mm")} · {getMarketTickers(report as MarketIntelligence).length || "Market"} signals
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDeleteReport(report.id)}
        title="Delete market scan"
        className="relative z-10 shrink-0 rounded-lg p-2 text-black/20 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5 pointer-events-none" />
      </button>
    </div>
  );
}

function ReportPreview({ selectedReport }: { selectedReport: NewsReport | null }) {
  return (
    <div className="flex-1 bg-white border border-black/5 rounded-[3rem] overflow-y-auto p-12 custom-scrollbar shadow-sm">
      {selectedReport ? (
        <article className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="flex items-center gap-3 mb-8">
            <span className={cn(
              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
              selectedReport.type === "morning" ? "bg-amber-100 text-amber-700" :
                selectedReport.type === "evening" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"
            )}>
              {selectedReport.type === "morning" ? "Morning" :
                selectedReport.type === "evening" ? "Evening" : "Market"}
            </span>
            <span className="text-xs text-black/40 font-bold uppercase tracking-widest">
              {formatInTimeZone(new Date(selectedReport.date), LA_TZ, "MMMM do, yyyy · HH:mm")}
            </span>
          </div>

          {selectedReport.type === "market" && getMarketTickers(selectedReport as MarketIntelligence).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {getMarketTickers(selectedReport as MarketIntelligence).map((ticker, idx) => (
                <div key={idx} className="bg-black/5 px-3 py-2 rounded-xl flex items-center gap-2">
                  <span className="text-[10px] font-bold opacity-30">{ticker.symbol}</span>
                  <span className="text-xs font-bold">{ticker.price}</span>
                  <span className={cn(
                    "text-[10px] font-bold",
                    ticker.trend === "up" ? "text-emerald-600" :
                      ticker.trend === "down" ? "text-rose-600" : "text-slate-600"
                  )}>{ticker.changePercent}</span>
                </div>
              ))}
            </div>
          )}

          <div className="markdown-body">
            <ReactMarkdown>{selectedReport.type === "market" ? cleanMarketContent(selectedReport.content) : selectedReport.content}</ReactMarkdown>
          </div>
        </article>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-10">
          <Newspaper className="w-16 h-16" />
          <p className="text-lg font-serif font-bold">Select a report to read</p>
        </div>
      )}
    </div>
  );
}
