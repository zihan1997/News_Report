import { ArrowDownRight, ArrowUpRight, BookOpen, Brain, Info, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import ReactMarkdown from "react-markdown";
import { RunStatus } from "../../../shared/components/RunStatus";
import { cn } from "../../../shared/lib/classnames";
import { cleanMarketContent, getMarketTickers } from "../../../lib/report-format";
import { LlmRuntime, MarketIntelligence, NewsHistory, NewsReport } from "../../../types";

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
  onGenerateMarket: () => void;
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
  onGenerateMarket,
  onSelectReport,
  onViewMarketHistory,
}: MarketViewProps) {
  const marketReports = history
    .filter((report) => report.type === "market")
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="space-y-12">
      <MarketHeader isGenerating={isGenerating} onGenerateMarket={onGenerateMarket} />

      {isGenerating ? (
        <MarketGenerationStatus
          logs={generationLog}
          content={streamingContent}
          reasoning={reasoningContent}
          llmRuntime={llmRuntime}
          modelName={modelName}
        />
      ) : selectedReport && selectedReport.type === "market" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12">
          <MarketReport report={selectedReport as MarketIntelligence} />
          <MarketSidebar
            reports={marketReports}
            selectedReport={selectedReport}
            onSelectReport={onSelectReport}
            onViewMarketHistory={onViewMarketHistory}
          />
        </div>
      ) : (
        <EmptyMarketState onGenerateMarket={onGenerateMarket} />
      )}
    </div>
  );
}

function MarketHeader({
  isGenerating,
  onGenerateMarket,
}: {
  isGenerating: boolean;
  onGenerateMarket: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Market Intelligence</h1>
          <p className="text-black/40 font-medium">Decoding symbols into signals.</p>
        </div>
      </div>
      <button
        disabled={isGenerating}
        onClick={onGenerateMarket}
        className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl text-sm font-bold shadow-lg hover:bg-black/90 transition-all disabled:opacity-50"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Refresh Scan
      </button>
    </div>
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

function MarketReport({ report }: { report: MarketIntelligence }) {
  return (
    <div className="space-y-12">
      <div className="flex flex-wrap gap-4">
        {getMarketTickers(report).map((ticker, idx) => (
          <div key={idx} className="bg-white border border-black/5 px-6 py-4 rounded-3xl shadow-sm flex items-center gap-4 min-w-[200px]">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              ticker.trend === "up" ? "bg-emerald-50 text-emerald-600" :
                ticker.trend === "down" ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"
            )}>
              {ticker.trend === "up" ? <ArrowUpRight className="w-5 h-5" /> :
                ticker.trend === "down" ? <ArrowDownRight className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">{ticker.symbol}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-lg">{ticker.price}</span>
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

      <article className="markdown-body">
        <ReactMarkdown>{cleanMarketContent(report.content)}</ReactMarkdown>
      </article>
    </div>
  );
}

function MarketSidebar({
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
    <aside className="space-y-8">
      <div className="bg-indigo-600 p-8 rounded-[3rem] text-white space-y-6">
        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-serif font-bold leading-tight">AI Agent Insight</h2>
        <p className="text-indigo-100 text-sm leading-relaxed">
          &quot;Market fluctuations are often the leading indicator of long-term tech policy shifts. Pay close attention to Mag 7 relative strength against current interest rate discourse.&quot;
        </p>
      </div>

      <MarketBasics />
      <MarketSessions reports={reports} selectedReport={selectedReport} onSelectReport={onSelectReport} onViewMarketHistory={onViewMarketHistory} />
    </aside>
  );
}

function MarketBasics() {
  return (
    <div className="bg-amber-50 p-8 rounded-[3rem] border border-amber-100 space-y-4">
      <div className="flex items-center gap-3 text-amber-700">
        <BookOpen className="w-5 h-5" />
        <h3 className="text-sm font-bold uppercase tracking-widest">Market Basics</h3>
      </div>
      <div className="space-y-4">
        <div className="group">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-xs text-amber-900">S&amp;P 500</span>
            <div className="h-px flex-1 bg-amber-200" />
          </div>
          <p className="text-[11px] text-amber-700/80 leading-relaxed">
            由美国500家市值最大的上市公司组成，是衡量美国股市整体健康状况的“温度计”。
          </p>
        </div>
        <div className="group">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-xs text-amber-900">Nasdaq (纳指)</span>
            <div className="h-px flex-1 bg-amber-200" />
          </div>
          <p className="text-[11px] text-amber-700/80 leading-relaxed">
            侧重于科技股（如苹果、谷歌、英伟达），通常反映了科技行业和AI的发展势头。
          </p>
        </div>
        <div className="group">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-xs text-amber-900">Mag 7 (七巨头)</span>
            <div className="h-px flex-1 bg-amber-200" />
          </div>
          <p className="text-[11px] text-amber-700/80 leading-relaxed">
            美股市值最大的七家公司：苹果、亚马逊、谷歌、Meta、微软、英伟达、特斯拉。
          </p>
        </div>
        <div className="pt-2 border-t border-amber-200/50">
          <p className="text-[10px] font-medium text-amber-600 flex items-center gap-1">
            <Info className="w-3 h-3" /> 详情请查阅报告正文中的【小白科普】章节
          </p>
        </div>
      </div>
    </div>
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
