import React, { useState, useEffect, useRef } from 'react';
import {
  Newspaper, 
  History, 
  Sun, 
  Moon, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown,
  Calendar,
  ArrowLeft,
  Loader2,
  Trash2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  BookOpen,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { storage } from './lib/storage';
import { generateNews, generateMarketIntelligence } from './lib/local-llm';
import { cleanMarketContent, getMarketTickers, getReportKeywords, getReportTitle } from './lib/report-format';
import { AppView, HistoryFilter, LlmRuntime, ReportDepth, NewsReport, NewsHistory, MarketIntelligence, RSSHealthStats } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const LA_TZ = 'America/Los_Angeles';

function getLocalReportDate(date: Date) {
  return formatInTimeZone(date, LA_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

const REPORT_DEPTHS: Array<{
  value: ReportDepth;
  label: string;
  caption: string;
  detail: string;
}> = [
  { value: 'fast', label: 'Fast', caption: '5-7 items', detail: 'Lean scan' },
  { value: 'balanced', label: 'Balanced', caption: '7-9 items', detail: 'Daily default' },
  { value: 'wide', label: 'Wide', caption: '8-10 items', detail: 'Broader read' },
];

const NAV_TABS: Array<{ id: AppView; label: string }> = [
  { id: 'reader', label: 'Intelligence' },
  { id: 'markets', label: 'Markets' },
  { id: 'history', label: 'History' },
];

const HISTORY_FILTERS: HistoryFilter[] = ['all', 'news', 'market'];

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function RunStatus({
  isGenerating,
  logs,
  content,
  reasoning,
  tone = 'dark',
}: {
  isGenerating: boolean;
  logs: string[];
  content: string;
  reasoning: string;
  tone?: 'dark' | 'light';
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const reasoningRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight });
  }, [content]);

  useEffect(() => {
    if (showReasoning) {
      reasoningRef.current?.scrollTo({ top: reasoningRef.current.scrollHeight });
    }
  }, [reasoning, showReasoning]);

  if (!isGenerating) return null;

  const latest = logs[0]?.replace(/^\d{2}:\d{2}:\d{2}\s*/, '') || 'Preparing local run...';
  const isDark = tone === 'dark';

  return (
    <div className={cn(
      "overflow-hidden rounded-xl border",
      isDark ? "border-white/10 bg-white/[0.06]" : "border-black/5 bg-white shadow-sm"
    )}>
      <div className={cn(
        "flex items-center justify-between gap-4 border-b px-4 py-3",
        isDark ? "border-white/10" : "border-black/5"
      )}>
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            isDark ? "bg-white/10 text-white" : "bg-black text-white"
          )}>
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
          </div>
          <div className="min-w-0">
              <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-black")}>
              Model Run Active
            </div>
            <div className={cn("mt-0.5 truncate text-xs", isDark ? "text-white/50" : "text-black/45")}>
              {latest}
            </div>
          </div>
        </div>
        <span className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
          isDark ? "bg-emerald-400/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"
        )}>
          Streaming
        </span>
      </div>

      <div className="grid grid-cols-1">
        <div
          ref={logRef}
          className={cn(
          "max-h-28 overflow-y-auto px-4 py-3 font-mono text-[10px] leading-relaxed custom-scrollbar",
          isDark ? "text-white/45" : "text-black/45"
        )}>
          {logs.length > 0 ? logs.map((line) => (
            <div key={line} className="truncate">{line}</div>
          )) : <div>Waiting for first event...</div>}
        </div>

        {content && (
          <div
            ref={contentRef}
            className={cn(
            "max-h-72 overflow-y-auto border-t px-4 py-4 text-sm leading-relaxed custom-scrollbar",
            isDark ? "border-white/10 bg-black/20 text-white/80" : "border-black/5 bg-[#FDFCFB] text-black/75"
          )}>
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {reasoning && (
          <div className={cn(
            "border-t",
            isDark ? "border-white/10 text-white/45" : "border-black/5 text-black/45"
          )}>
            <button
              type="button"
              onClick={() => setShowReasoning((value) => !value)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest",
                isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
              )}
            >
              <span>Reasoning stream</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showReasoning && "rotate-180")} />
            </button>
            {showReasoning && (
              <div ref={reasoningRef} className="max-h-40 overflow-y-auto whitespace-pre-wrap px-4 pb-4 font-mono text-[10px] leading-relaxed custom-scrollbar">
                {reasoning}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [history, setHistory] = useState<NewsHistory>([]);
  const [selectedReport, setSelectedReport] = useState<NewsReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [view, setView] = useState<AppView>('reader');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [llmInfo, setLlmInfo] = useState<{ model?: string; baseUrl?: string; runtime?: LlmRuntime }>({});
  const [rssStats, setRssStats] = useState<RSSHealthStats | null>(null);
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [reasoningContent, setReasoningContent] = useState("");
  const [llmRuntime, setLlmRuntime] = useState<LlmRuntime>('cloud');
  const [reportDepth, setReportDepth] = useState<ReportDepth>('balanced');
  const [activeGeneration, setActiveGeneration] = useState<'morning' | 'evening' | 'market' | null>(null);
  const activeRuntimeRef = useRef<LlmRuntime>('cloud');

  const appendGenerationLog = (message: string) => {
    const stamp = formatInTimeZone(new Date(), LA_TZ, 'HH:mm:ss');
    setGenerationLog((current) => [`${stamp} ${message}`, ...current].slice(0, 24));
  };

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { reports: loadedHistory, importedCount } = await storage.migrateLocalStorage();
        setHistory(loadedHistory);
        if (importedCount > 0) {
          setError(`Migrated ${importedCount} report${importedCount === 1 ? '' : 's'} from localStorage to local files.`);
        }
        if (loadedHistory.length > 0) {
          // Find the latest news report for reader view
          const newsReports = loadedHistory.filter(r => r.type !== 'market');
          if (newsReports.length > 0) {
            setSelectedReport(newsReports[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load report history', err);
        setError('Failed to load saved reports.');
      }
    };

    loadHistory();
  }, []);

  useEffect(() => {
    activeRuntimeRef.current = llmRuntime;
    checkHealth(llmRuntime);
  }, [llmRuntime]);

  const checkHealth = async (runtime: LlmRuntime = llmRuntime) => {
    setHealthStatus('loading');
    setLlmInfo({ runtime });
    try {
      const res = await fetch(`/api/health?runtime=${runtime}`);
      const data = await res.json();
      if (runtime !== activeRuntimeRef.current) return;
      setHealthStatus(data.status === 'ok' ? 'ok' : 'error');
      setLlmInfo({ model: data.model, baseUrl: data.baseUrl, runtime: data.runtime || runtime });

      // Also fetch RSS stats
      const rssRes = await fetch('/api/collect-news');
      const rssData = await rssRes.json();
      if (rssData.stats) {
        setRssStats(rssData.stats);
      }
    } catch (err) {
      if (runtime !== activeRuntimeRef.current) return;
      setHealthStatus('error');
      setLlmInfo({ runtime });
    }
  };

  const handleGenerateMarket = async () => {
    const now = new Date();
    const todayStr = formatInTimeZone(now, LA_TZ, 'yyyy-MM-dd');
    const currentTimeStr = formatInTimeZone(now, LA_TZ, 'HH:mm');
    const existingReports = await storage.getReportsForDate(todayStr);
    
    // Switch view immediately to show progress inside the tab
    setView('markets');
    setIsGenerating(true);
    setActiveGeneration('market');
    setError(null);
    setStreamingContent("");
    setReasoningContent("");
    setGenerationLog([]);
    appendGenerationLog("Market generation started.");

    try {
      // 1. Get today's news context
      const todayNews = existingReports
        .filter(r => r.type !== 'market')
        .map(r => `[TODAY ${r.type}]\n${r.content}`)
        .join('\n\n');

      // 2. Get recent news history context (last 5 reports)
      const recentNews = history
        .filter(r => r.type !== 'market')
        .slice(0, 5)
        .map(r => `[NEWS ${formatInTimeZone(new Date(r.date), LA_TZ, 'MM-dd HH:mm')}]\n${r.content}`)
        .join('\n\n---\n\n');

      // 3. Get recent MARKET history context (last 3 reports)
      // This allows the AI to maintain continuity in its financial analysis
      const recentMarkets = history
        .filter(r => r.type === 'market')
        .slice(0, 3)
        .map(r => `[PREVIOUS MARKET SCAN ${formatInTimeZone(new Date(r.date), LA_TZ, 'HH:mm')}]\n${r.content.substring(0, 1000)}...`) // Substring to save tokens
        .join('\n\n---\n\n');

      const newsContext = `
CURRENT TIME: ${currentTimeStr} (LA Time)

=== RECENT NEWS HISTORY ===
${recentNews}

=== TODAY'S NEWEST UPDATES ===
${todayNews || 'No news briefings generated yet for today.'}
`.trim();

      const draftMarketReport: MarketIntelligence = {
        id: crypto.randomUUID(),
        date: getLocalReportDate(now),
        type: 'market',
        content: '',
        timestamp: now.getTime(),
        tickers: []
      };

      const marketResult = await generateMarketIntelligence(draftMarketReport, llmRuntime, newsContext, recentMarkets, {
        onLog: appendGenerationLog,
        onToken: (_delta, content) => setStreamingContent(content),
        onReasoning: (_delta, content) => setReasoningContent(content),
      });
      const rawContent = marketResult.content;
      const tickers = marketResult.tickers;

      const cleanContent = cleanMarketContent(rawContent);

      const newMarketReport: MarketIntelligence = {
        id: draftMarketReport.id,
        date: draftMarketReport.date,
        type: 'market',
        content: cleanContent,
        timestamp: draftMarketReport.timestamp,
        tickers
      };

      const newHistory = await storage.saveReport(newMarketReport);
      setHistory(newHistory);
      setSelectedReport(newMarketReport);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate market intelligence.';
      setError(`Failed to generate market intelligence: ${message}`);
      appendGenerationLog(`Error: ${message}`);
      console.error(err);
    } finally {
      setIsGenerating(false);
      setActiveGeneration(null);
    }
  };

  const handleGenerate = async (type: 'morning' | 'evening') => {
    const now = new Date();
    const todayStr = formatInTimeZone(now, LA_TZ, 'yyyy-MM-dd');
    const existingReports = await storage.getReportsForDate(todayStr);
    const existingOfType = existingReports.find(r => r.type === type);

    // 1. Prevent duplicate generation for the same type on the same day
    if (existingOfType) {
      setSelectedReport(existingOfType);
      setError(`Today's ${type} briefing already exists.`);
      return;
    }

    // 2. Enforce evening report requirements
    if (type === 'evening') {
      const morningReport = existingReports.find(r => r.type === 'morning');
      
      // Must have a morning report first
      if (!morningReport) {
        setError("Please generate the Morning Briefing first before the Evening Update.");
        return;
      }

      // Must have a reasonable time gap (e.g., 4 hours)
      const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
      const timeSinceMorning = Date.now() - morningReport.timestamp;
      
      if (timeSinceMorning < FOUR_HOURS_MS) {
        const remainingMinutes = Math.ceil((FOUR_HOURS_MS - timeSinceMorning) / (60 * 1000));
        const hours = Math.floor(remainingMinutes / 60);
        const mins = remainingMinutes % 60;
        setError(`It's too early for the Evening Update. Please wait another ${hours > 0 ? `${hours}h ` : ''}${mins}m.`);
        return;
      }
    }

    setIsGenerating(true);
    setActiveGeneration(type);
    setError(null);
    setStreamingContent("");
    setReasoningContent("");
    setGenerationLog([]);
    appendGenerationLog(`${type === 'morning' ? 'Morning' : 'Evening'} generation started.`);
    try {
      let context = '';
      if (type === 'evening') {
        const morningReport = existingReports.find(r => r.type === 'morning');
        context = morningReport ? morningReport.content : '';
      } else {
        // For morning report, gather context from the last 7 reports (about 3-4 days of history)
        const recentHistory = history.slice(0, 7);
        context = recentHistory
          .map(r => `[${formatInTimeZone(new Date(r.date), LA_TZ, 'yyyy-MM-dd')} ${r.type}]\n${r.content}`)
          .join('\n\n---\n\n');
      }
      
      const draftReport: NewsReport = {
        id: crypto.randomUUID(),
        date: getLocalReportDate(now),
        type,
        content: '',
        timestamp: now.getTime()
      };

      const content = await generateNews(type, draftReport, llmRuntime, reportDepth, context, {
        onLog: appendGenerationLog,
        onToken: (_delta, content) => setStreamingContent(content),
        onReasoning: (_delta, content) => setReasoningContent(content),
      });
      
      const newReport: NewsReport = {
        id: draftReport.id,
        date: draftReport.date,
        type,
        content,
        timestamp: draftReport.timestamp
      };
      
      const newHistory = await storage.saveReport(newReport);
      setHistory(newHistory);
      setSelectedReport(newReport);
      setView('reader');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate news.';
      setError(`Failed to generate news: ${message}`);
      appendGenerationLog(`Error: ${message}`);
      console.error(err);
    } finally {
      setIsGenerating(false);
      setActiveGeneration(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Skip confirm for now to avoid issues in iframe environment
    const newHistory = await storage.deleteReport(id);
    setHistory(newHistory);
    
    if (selectedReport?.id === id) {
      setSelectedReport(newHistory[0] || null);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear all history? This action cannot be undone.')) {
      const newHistory = await storage.clearHistory();
      setHistory(newHistory);
      setSelectedReport(null);
    }
  };

  const handleClearDrafts = async () => {
    try {
      const { reports: newHistory, deletedCount } = await storage.clearDrafts();
      setHistory(newHistory);
      setError(`Cleared ${deletedCount} draft file${deletedCount === 1 ? '' : 's'} from local reports.`);
    } catch (err) {
      console.error('Draft clear failed', err);
      setError('Failed to clear draft files.');
    }
  };

  const handleImportReports = async () => {
    const raw = window.prompt('Paste exported localStorage JSON from AI Studio:');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const reports = Array.isArray(parsed) ? parsed : parsed?.reports;
      if (!Array.isArray(reports)) {
        throw new Error('Expected a report array.');
      }

      const { reports: newHistory, importedCount } = await storage.importReports(reports);
      setHistory(newHistory);
      setSelectedReport(newHistory.find(r => r.type !== 'market') || newHistory[0] || null);
      setError(`Imported ${importedCount} report${importedCount === 1 ? '' : 's'} from pasted JSON.`);
    } catch (err) {
      console.error('Report import failed', err);
      setError('Import failed. Make sure you pasted the full localStorage JSON value.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-[1800px] mx-auto px-8 h-16 flex items-center justify-between">
          <nav className="flex items-center gap-1 bg-black/5 p-1 rounded-2xl">
            {NAV_TABS.map((tab) => (
              <button 
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'reader') {
                    const latest = history.filter(r => r.type !== 'market')[0];
                    if (latest) setSelectedReport(latest);
                  } else if (tab.id === 'markets') {
                    const latestMarket = history.find(r => r.type === 'market');
                    if (latestMarket) setSelectedReport(latestMarket);
                  }
                  setView(tab.id);
                }}
                className={cn(
                  "px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
                  view === tab.id 
                    ? "bg-white text-black shadow-sm" 
                    : "text-black/30 hover:text-black/60"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 border border-black/5 hover:bg-black/10 transition-colors cursor-help group relative">
              <div className={cn(
                "w-2 h-2 rounded-full",
                healthStatus === 'loading' ? "bg-amber-400 animate-pulse" :
                healthStatus === 'ok' ? "bg-emerald-500" : "bg-red-500"
              )} />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                LLM: {healthStatus === 'loading'
                  ? `Checking · ${llmRuntime}`
                  : healthStatus === 'ok'
                    ? `Online · ${llmInfo.model || 'Unknown'} · ${llmInfo.runtime || llmRuntime}`
                    : `Offline · ${llmInfo.model || 'Not configured'} · ${llmInfo.runtime || llmRuntime}`}
              </span>
              {llmInfo.baseUrl && (
                <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-50 w-max max-w-[360px] rounded-xl border border-black/10 bg-white px-3 py-2 text-[11px] font-medium normal-case tracking-normal text-black/70 shadow-lg">
                  <div>Model: {llmInfo.model || 'Unknown'}</div>
                  <div>Base URL: {llmInfo.baseUrl}</div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => {
              const latest = history.filter(r => r.type !== 'market')[0];
              if (latest) setSelectedReport(latest);
              setView('reader');
            }}>
              <span className="font-serif text-xl font-bold tracking-tight group-hover:opacity-70 transition-opacity">Signal Desk</span>
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform">
                <Newspaper className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1800px] mx-auto w-full px-8 py-8">
        <AnimatePresence mode="wait">
          {view === 'reader' ? (
            <motion.div 
              key="reader"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12"
            >
              {/* Main Content */}
              <div className="space-y-8">
                {isGenerating && activeGeneration !== 'market' ? (
                  <div className="min-h-[62vh] grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-10">
                    <div className="flex flex-col justify-center space-y-6">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "flex h-14 w-14 items-center justify-center rounded-2xl",
                          activeGeneration === 'evening' ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
                        )}>
                          {activeGeneration === 'evening' ? <Moon className="h-7 w-7" /> : <Sun className="h-7 w-7" />}
                        </div>
                        <div>
                          <h3 className="text-3xl font-serif font-bold tracking-tight">
                            {activeGeneration === 'evening' ? 'Generating Evening Update' : 'Generating Morning Briefing'}
                          </h3>
                          <p className="text-black/40">
                            Collecting feeds, ranking signals, and streaming the report into your local archive.
                          </p>
                        </div>
                      </div>
                      <RunStatus
                        isGenerating={isGenerating}
                        logs={generationLog}
                        content={streamingContent}
                        reasoning={reasoningContent}
                        tone="light"
                      />
                    </div>
                    <aside className="hidden xl:block border-l border-black/5 pl-10">
                      <div className="sticky top-24 space-y-5 text-sm text-black/45">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-black/25">Model</div>
                          <div className="mt-1 font-mono text-xs text-black/60">{llmInfo.model || llmRuntime}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-black/25">Coverage</div>
                          <div className="mt-1 text-xs text-black/60">
                            {REPORT_DEPTHS.find((option) => option.value === reportDepth)?.label || 'Balanced'}
                          </div>
                        </div>
                        <p className="text-xs leading-relaxed">
                          Draft files are written while tokens stream, then replaced by the final report when generation completes.
                        </p>
                      </div>
                    </aside>
                  </div>
                ) : selectedReport && selectedReport.type !== 'market' ? (
                  <article className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-3 mb-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                        selectedReport.type === 'morning' ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                      )}>
                        {selectedReport.type === 'morning' ? (
                          <span className="flex items-center gap-1"><Sun className="w-3 h-3" /> Morning Briefing</span>
                        ) : (
                          <span className="flex items-center gap-1"><Moon className="w-3 h-3" /> Evening Update</span>
                        )}
                      </span>
                      <span className="text-sm text-black/40 font-medium">
                        {formatInTimeZone(new Date(selectedReport.date), LA_TZ, 'MMMM do, yyyy')}
                      </span>
                    </div>
                    
                    <div className="markdown-body">
                      <ReactMarkdown>{selectedReport.content}</ReactMarkdown>
                    </div>
                  </article>
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-black/5 rounded-3xl">
                    <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center">
                      <Newspaper className="w-8 h-8 text-black/20" />
                    </div>
                    <div>
                      <h3 className="text-xl font-serif font-bold">No reports yet</h3>
                      <p className="text-black/40 max-w-xs mx-auto">Generate your first daily briefing to get started.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar Controls */}
              <aside className="space-y-8">
                <div className="bg-white border border-black/5 text-black p-7 rounded-2xl space-y-7 shadow-sm">
                  <div>
                    <h2 className="text-2xl font-serif font-bold mb-2 tracking-tight">Generate</h2>
                    <p className="text-black/50 text-[15px] leading-relaxed">Get the latest high-signal news summarized by AI.</p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex rounded-xl bg-black/[0.04] p-1">
                      {(['cloud', 'local'] as LlmRuntime[]).map((runtime) => (
                        <button
                          key={runtime}
                          type="button"
                          disabled={isGenerating}
                          onClick={() => setLlmRuntime(runtime)}
                          className={cn(
                            "flex-1 rounded-lg py-2.5 text-sm font-semibold capitalize transition-all disabled:opacity-50",
                            llmRuntime === runtime ? "bg-black text-white shadow-sm" : "text-black/40 hover:text-black"
                          )}
                        >
                          {runtime}
                        </button>
                      ))}
                    </div>
                    <div className="truncate px-1 text-xs font-medium text-black/35">
                      {healthStatus === 'loading' ? `Checking ${llmRuntime}...` : llmInfo.model || `${llmRuntime} model not configured`}
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-black/65">Coverage</span>
                      <span className="text-xs font-medium text-black/35">
                        {REPORT_DEPTHS.find((option) => option.value === reportDepth)?.caption}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {REPORT_DEPTHS.map((option) => {
                        const active = option.value === reportDepth;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={isGenerating}
                            onClick={() => setReportDepth(option.value)}
                            className={cn(
                              "group flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-50",
                              active
                                ? "border-black bg-black text-white shadow-sm"
                                : "border-black/10 bg-black/[0.02] text-black/55 hover:border-black/20 hover:bg-black/[0.04] hover:text-black"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold leading-none">{option.label}</div>
                              <div className={cn(
                                "mt-1.5 truncate text-xs",
                                active ? "text-white/60" : "text-black/35"
                              )}>
                                {option.detail} · {option.caption}
                              </div>
                            </div>
                            <div className={cn(
                              "ml-3 h-2.5 w-2.5 shrink-0 rounded-full border",
                              active ? "border-white bg-white" : "border-black/20 bg-transparent"
                            )} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button 
                      disabled={isGenerating}
                      onClick={() => handleGenerate('morning')}
                      className="w-full bg-black text-white py-4.5 px-5 rounded-2xl font-semibold text-[15px] flex items-center justify-between hover:bg-black/90 transition-colors disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2"><Sun className="w-5 h-5" /> Morning</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <button 
                      disabled={isGenerating}
                      onClick={() => handleGenerate('evening')}
                      className="w-full bg-white text-black border border-black/10 py-4.5 px-5 rounded-2xl font-semibold text-[15px] flex items-center justify-between hover:bg-black/[0.03] transition-colors disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2"><Moon className="w-5 h-5" /> Evening</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm leading-relaxed text-red-600">
                      {error}
                    </div>
                  )}
                </div>

                {/* RSS Health Dashboard */}
                {rssStats && (
                  <div className="bg-white border border-black/5 p-6 rounded-[2rem] space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Feed Status</h3>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        rssStats.failedCount === 0 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      )}>
                        {rssStats.successCount} / {rssStats.totalSources} Healthy
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-black/[0.02] rounded-2xl">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-black/20 mb-1">Refresh</div>
                        <div className="text-sm font-serif font-bold">{rssStats.lastRefresh}</div>
                      </div>
                      <div className="p-3 bg-black/[0.02] rounded-2xl">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-black/20 mb-1">Failures</div>
                        <div className="text-sm font-serif font-bold text-red-500">{rssStats.failedCount}</div>
                      </div>
                    </div>

                    {rssStats.failures.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {rssStats.failures.slice(0, 3).map((f, i) => (
                          <div key={i} className="text-[10px] text-red-400 font-medium truncate">
                             ⚠️ {f.source}: {f.error}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Archive by Date</h3>
                  <div className="space-y-4">
                    {Object.entries(
                      history.reduce((acc, report) => {
                        const dateKey = formatInTimeZone(new Date(report.date), LA_TZ, 'yyyy-MM-dd');
                        if (!acc[dateKey]) acc[dateKey] = [];
                        acc[dateKey].push(report);
                        return acc;
                      }, {} as Record<string, NewsReport[]>)
                    )
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .slice(0, 7)
                    .map(([date, reports]) => (
                      <div key={date} className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-30 px-2">
                          <Calendar className="w-3 h-3" />
                          {formatInTimeZone(new Date(reports[0].date), LA_TZ, 'MMMM d, yyyy')}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {['morning', 'evening'].map(type => {
                            const report = reports.find(r => r.type === type);
                            return (
                              <button
                                key={type}
                                disabled={!report}
                                onClick={() => {
                                  if (report) {
                                    setSelectedReport(report);
                                    setView('reader');
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
                                {type === 'morning' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </motion.div>
          ) : view === 'markets' ? (
            <motion.div 
              key="markets"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
               {/* Market Intelligence Header */}
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
                <div className="flex items-center gap-3">
                   <button 
                    disabled={isGenerating}
                    onClick={handleGenerateMarket}
                    className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl text-sm font-bold shadow-lg hover:bg-black/90 transition-all disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Refresh Scan
                  </button>
                </div>
              </div>

               {/* Market Overview Grid */}
               {isGenerating ? (
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
                        isGenerating={isGenerating}
                        logs={generationLog}
                        content={streamingContent}
                        reasoning={reasoningContent}
                        tone="light"
                      />
                    </div>
                    <aside className="hidden lg:block border-l border-black/5 pl-10">
                      <div className="sticky top-24 space-y-4 text-sm text-black/45">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-black/25">{llmRuntime} Model</div>
                        <div className="font-mono text-xs text-black/60">{llmInfo.model || 'Qwen3-8B-Q6_K.gguf'}</div>
                        <div className="text-xs leading-relaxed">Draft output is written to the reports folder while tokens stream.</div>
                      </div>
                    </aside>
                  </div>
               ) : selectedReport && selectedReport.type === 'market' ? (
                 <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12">
                   {/* Main Insights */}
                   <div className="space-y-12">
                      {/* Ticker Tape */}
                      <div className="flex flex-wrap gap-4">
                        {getMarketTickers(selectedReport as MarketIntelligence).map((ticker, idx) => (
                          <div key={idx} className="bg-white border border-black/5 px-6 py-4 rounded-3xl shadow-sm flex items-center gap-4 min-w-[200px]">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              ticker.trend === 'up' ? "bg-emerald-50 text-emerald-600" : 
                              ticker.trend === 'down' ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"
                            )}>
                              {ticker.trend === 'up' ? <ArrowUpRight className="w-5 h-5" /> : 
                               ticker.trend === 'down' ? <ArrowDownRight className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                            </div>
                            <div>
                               <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">{ticker.symbol}</div>
                               <div className="flex items-baseline gap-2">
                                 <span className="font-bold text-lg">{ticker.price}</span>
                                 <span className={cn(
                                   "text-[10px] font-bold",
                                   ticker.trend === 'up' ? "text-emerald-600" : 
                                   ticker.trend === 'down' ? "text-rose-600" : "text-slate-600"
                                 )}>{ticker.changePercent}</span>
                               </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <article className="markdown-body">
                          <ReactMarkdown>{cleanMarketContent(selectedReport.content)}</ReactMarkdown>
                      </article>
                   </div>

                   {/* Intelligence Sidebar */}
                   <aside className="space-y-8">
                      <div className="bg-indigo-600 p-8 rounded-[3rem] text-white space-y-6">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                          <Brain className="w-6 h-6 text-white" />
                        </div>
                        <h2 className="text-2xl font-serif font-bold leading-tight">AI Agent Insight</h2>
                        <p className="text-indigo-100 text-sm leading-relaxed">
                          "Market fluctuations are often the leading indicator of long-term tech policy shifts. Pay close attention to Mag 7 relative strength against current interest rate discourse."
                        </p>
                      </div>

                      <div className="bg-amber-50 p-8 rounded-[3rem] border border-amber-100 space-y-4">
                        <div className="flex items-center gap-3 text-amber-700">
                          <BookOpen className="w-5 h-5" />
                          <h3 className="text-sm font-bold uppercase tracking-widest">Market Basics</h3>
                        </div>
                        <div className="space-y-4">
                          <div className="group">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-xs text-amber-900">S&P 500</span>
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

                      <div className="bg-white border border-black/5 p-8 rounded-[3rem] space-y-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Market Sessions</h3>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                          {history
                            .filter(r => r.type === 'market')
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .map((report) => (
                            <button 
                              key={report.id}
                              onClick={() => setSelectedReport(report)}
                              className={cn(
                                "w-full text-left p-4 rounded-2xl border transition-all",
                                selectedReport?.id === report.id 
                                  ? "bg-indigo-50 border-indigo-100" 
                                  : "border-transparent hover:bg-black/5"
                              )}
                            >
                              <div className="text-[10px] font-bold text-black/30 uppercase tracking-widest mb-1">
                                {formatInTimeZone(new Date(report.date), LA_TZ, 'MMM d, yyyy')}
                              </div>
                              <div className="font-bold text-sm">
                                {formatInTimeZone(new Date(report.date), LA_TZ, 'HH:mm')} Market Intelligence
                              </div>
                            </button>
                          ))}
                          
                          {history.filter(r => r.type === 'market').length === 0 && (
                            <div className="text-center py-8 opacity-20">
                              <p className="text-[10px] font-bold uppercase tracking-widest">No previous scans</p>
                            </div>
                          )}
                        </div>

                        <button 
                          onClick={() => {
                            setHistoryFilter('market');
                            setView('history');
                          }}
                          className="w-full py-3 text-[10px] font-bold uppercase tracking-widest text-black/40 hover:text-black hover:bg-black/5 rounded-2xl transition-all"
                        >
                          View Full History
                        </button>
                      </div>
                   </aside>
                 </div>
               ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 border-2 border-dashed border-black/5 rounded-[4rem]">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-10 h-10 text-indigo-400" />
                  </div>
                  <div className="max-w-md">
                    <h3 className="text-2xl font-serif font-bold mb-2">No Market Intelligence Data</h3>
                    <p className="text-black/40 mb-8 px-8">Run an AI market scan to synthesize today's financial movers with high-signal news.</p>
                    <button 
                      onClick={handleGenerateMarket}
                      className="px-8 py-4 bg-indigo-500 text-white rounded-2xl font-bold hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-100"
                    >
                      Initialize First Market Scan
                    </button>
                  </div>
                </div>
               )}
            </motion.div>
          ) : (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-[calc(100vh-12rem)] flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-serif font-bold tracking-tight mb-1">Archive</h1>
                  <p className="text-black/40 text-sm">Browse your collection of past briefings.</p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleImportReports}
                    className="flex items-center gap-2 px-4 py-2 border border-black/10 text-black/50 rounded-xl text-xs font-bold hover:bg-black/5 hover:text-black transition-all"
                  >
                    Import JSON
                  </button>
                  <button
                    onClick={handleClearDrafts}
                    className="flex items-center gap-2 px-4 py-2 border border-black/10 text-black/50 rounded-xl text-xs font-bold hover:bg-black/5 hover:text-black transition-all"
                  >
                    Clear Drafts
                  </button>
                  <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl mr-4">
                    {HISTORY_FILTERS.map((f) => (
                      <button
                        key={f}
                        onClick={() => setHistoryFilter(f)}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                          historyFilter === f 
                            ? "bg-white text-black shadow-sm" 
                            : "text-black/30 hover:text-black/60"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={handleClearHistory}
                    disabled={history.length === 0}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Clear All
                  </button>
                  <button 
                    onClick={() => setView('reader')}
                    className="flex items-center gap-2 text-sm font-bold hover:gap-3 transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Reader
                  </button>
                </div>
              </div>

              <div className="flex-1 flex gap-8 min-h-0 overflow-hidden">
                {/* Calendar Cards */}
                <div className="w-[44%] overflow-y-auto pr-4 custom-scrollbar">
                  <div className="grid grid-cols-1 gap-4">
                    {Object.entries(
                      history.reduce((acc, report) => {
                        const dateKey = formatInTimeZone(new Date(report.date), LA_TZ, 'yyyy-MM-dd');
                        if (!acc[dateKey]) acc[dateKey] = [];
                        acc[dateKey].push(report);
                        return acc;
                      }, {} as Record<string, NewsReport[]>)
                    )
                      .sort((a, b) => b[0].localeCompare(a[0]))
                      .map(([dateKey, reports]) => {
                        const sortedReports = [...reports].sort((a, b) => b.timestamp - a.timestamp);
                        const visibleReports = sortedReports.filter((report) => {
                          if (historyFilter === 'all') return true;
                          if (historyFilter === 'news') return report.type !== 'market';
                          return report.type === 'market';
                        });
                        if (visibleReports.length === 0) return null;

                        const morning = sortedReports.find((report) => report.type === 'morning');
                        const evening = sortedReports.find((report) => report.type === 'evening');
                        const markets = sortedReports.filter((report) => report.type === 'market');
                        const dayDate = new Date(sortedReports[0].date);

                        const renderNewsSlot = (label: 'Morning' | 'Evening', report?: NewsReport) => {
                          const isMorning = label === 'Morning';
                          const isVisible = historyFilter !== 'market';
                          if (!isVisible) return null;

                          return report ? (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setSelectedReport(report)}
                              className={cn(
                                "group relative flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all",
                                selectedReport?.id === report.id
                                  ? "border-black/15 bg-white shadow-sm"
                                  : "border-black/5 bg-black/[0.025] hover:border-black/10 hover:bg-white"
                              )}
                            >
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
                                    {formatInTimeZone(new Date(report.date), LA_TZ, 'HH:mm')}
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-xs text-black/45">{getReportKeywords(report) || getReportTitle(report)}</div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => handleDelete(report.id, e)}
                                title={`Delete ${label.toLowerCase()} report`}
                                className="shrink-0 rounded-lg p-2 text-black/20 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                              >
                                <Trash2 className="h-3.5 w-3.5 pointer-events-none" />
                              </button>
                            </button>
                          ) : (
                            <div
                              key={label}
                              className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-dashed border-black/10 bg-black/[0.015] px-4 py-3 text-black/25"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/[0.03]">
                                {isMorning ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                              </div>
                              <div>
                                <div className="text-sm font-semibold">{label}</div>
                                <div className="mt-1 text-xs">No report</div>
                              </div>
                            </div>
                          );
                        };

                        return (
                          <section key={dateKey} className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex items-start justify-between gap-4">
                              <div>
                                <div className="text-[13px] font-semibold text-black/35">
                                  {formatInTimeZone(dayDate, LA_TZ, 'EEEE')}
                                </div>
                                <h2 className="font-serif text-2xl font-bold tracking-tight">
                                  {formatInTimeZone(dayDate, LA_TZ, 'MMMM d')}
                                </h2>
                              </div>
                              <div className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-semibold text-black/40">
                                {reports.length} item{reports.length === 1 ? '' : 's'}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                              {renderNewsSlot('Morning', morning)}
                              {renderNewsSlot('Evening', evening)}
                            </div>

                            {historyFilter !== 'news' && (
                              <div className="mt-3 space-y-2">
                                <div className="flex items-center gap-2 px-1 text-xs font-semibold text-black/35">
                                  <TrendingUp className="h-3.5 w-3.5" />
                                  Market scans
                                </div>
                                {markets.length > 0 ? markets.map((report, index) => (
                                  <button
                                    key={report.id}
                                    type="button"
                                    onClick={() => setSelectedReport(report)}
                                    className={cn(
                                      "group relative flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                                      selectedReport?.id === report.id
                                        ? "border-purple-100 bg-purple-50"
                                        : "border-black/5 bg-black/[0.02] hover:border-black/10 hover:bg-white"
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-black">
                                        Scan {markets.length - index}
                                      </div>
                                      <div className="mt-0.5 truncate text-xs text-black/40">
                                        {formatInTimeZone(new Date(report.date), LA_TZ, 'HH:mm')} · {getMarketTickers(report as MarketIntelligence).length || 'Market'} signals
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDelete(report.id, e)}
                                      title="Delete market scan"
                                      className="shrink-0 rounded-lg p-2 text-black/20 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 pointer-events-none" />
                                    </button>
                                  </button>
                                )) : (
                                  <div className="rounded-xl border border-dashed border-black/10 px-4 py-3 text-xs text-black/25">
                                    No market scans
                                  </div>
                                )}
                              </div>
                            )}
                          </section>
                        );
                      })}

                    {history.length === 0 && (
                      <div className="py-12 text-center space-y-4 opacity-20">
                        <History className="w-12 h-12 mx-auto" />
                        <p className="text-sm font-bold uppercase tracking-widest">Empty Archive</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Content */}
                <div className="flex-1 bg-white border border-black/5 rounded-[3rem] overflow-y-auto p-12 custom-scrollbar shadow-sm">
                  {selectedReport ? (
                    <article className="animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="flex items-center gap-3 mb-8">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          selectedReport.type === 'morning' ? "bg-amber-100 text-amber-700" : 
                          selectedReport.type === 'evening' ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"
                        )}>
                          {selectedReport.type === 'morning' ? 'Morning' : 
                           selectedReport.type === 'evening' ? 'Evening' : 'Market'}
                        </span>
                        <span className="text-xs text-black/40 font-bold uppercase tracking-widest">
                          {formatInTimeZone(new Date(selectedReport.date), LA_TZ, 'MMMM do, yyyy · HH:mm')}
                        </span>
                      </div>
                      
                      {selectedReport.type === 'market' && getMarketTickers(selectedReport as MarketIntelligence).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-8">
                          {getMarketTickers(selectedReport as MarketIntelligence).map((ticker, idx) => (
                            <div key={idx} className="bg-black/5 px-3 py-2 rounded-xl flex items-center gap-2">
                              <span className="text-[10px] font-bold opacity-30">{ticker.symbol}</span>
                              <span className="text-xs font-bold">{ticker.price}</span>
                              <span className={cn(
                                "text-[10px] font-bold",
                                ticker.trend === 'up' ? "text-emerald-600" : 
                                ticker.trend === 'down' ? "text-rose-600" : "text-slate-600"
                              )}>{ticker.changePercent}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="markdown-body">
                        <ReactMarkdown>{selectedReport.content}</ReactMarkdown>
                      </div>
                    </article>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-10">
                      <Newspaper className="w-16 h-16" />
                      <p className="text-lg font-serif font-bold">Select a report to read</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-12 border-t border-black/5">
        <div className="max-w-[1800px] mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-40">
            <Newspaper className="w-4 h-4" />
            <span className="text-xs font-bold tracking-widest uppercase">Signal Desk</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-20">
            &copy; {new Date().getFullYear()} High-Signal News Intelligence
          </div>
        </div>
      </footer>
    </div>
  );
}

