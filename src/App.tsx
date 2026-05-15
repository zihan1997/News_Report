import { useState, useEffect, useRef } from 'react';
import { Newspaper } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatInTimeZone } from 'date-fns-tz';
import { NewsReaderView } from './features/news/components/NewsReaderView';
import { HistoryView } from './features/history/components/HistoryView';
import { MarketView } from './features/market/components/MarketView';
import { MemoryView } from './features/memory/components/MemoryView';
import { cn } from './shared/lib/classnames';
import { storage } from './lib/storage';
import { updateMemoryFromReport } from './lib/memory';
import { buildMorningHistoryContext } from './features/news/news-context';
import { generateNews } from './features/news/news-flow';
import { generateMarketIntelligence } from './features/market/market-flow';
import { cleanMarketContent } from './lib/report-format';
import { AppView, HistoryFilter, LlmRuntime, ReportDepth, NewsReport, NewsHistory, MarketIntelligence, RSSHealthStats } from './types';

const LA_TZ = 'America/Los_Angeles';

function getLocalReportDate(date: Date) {
  return formatInTimeZone(date, LA_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function formatMs(ms?: number) {
  return `${Math.max(0, Math.round(ms || 0)).toLocaleString()} ms`;
}

function formatTokenCount(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

const NAV_TABS: Array<{ id: AppView; label: string }> = [
  { id: 'reader', label: 'Intelligence' },
  { id: 'markets', label: 'Markets' },
  { id: 'memory', label: 'Memory' },
  { id: 'history', label: 'History' },
];

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
      appendGenerationLog("Start to parse to knowledge memory.");
      updateMemoryFromReport(newMarketReport, llmRuntime)
        .then((memoryUpdate) => {
          const metrics = memoryUpdate.metrics;
          const status = memoryUpdate.skipped ? "Memory update skipped" : "Memory updated";
          appendGenerationLog(
            `${status}. Updates: ${memoryUpdate.updates.length}, drafts: ${memoryUpdate.newCandidates.length}, response: ${formatMs(metrics?.responseMs)}, parse: ${formatMs(metrics?.parseMs)}, tokens: ${formatTokenCount(metrics?.totalTokens ?? metrics?.outputTokensEstimate)}.`
          );
        })
        .catch((memoryError) => {
          console.error('Memory update failed', memoryError);
          appendGenerationLog("Memory update skipped.");
        });
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
        context = buildMorningHistoryContext(history);
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
      appendGenerationLog("Start to parse to knowledge memory.");
      updateMemoryFromReport(newReport, llmRuntime)
        .then((memoryUpdate) => {
          const metrics = memoryUpdate.metrics;
          const status = memoryUpdate.skipped ? "Memory update skipped" : "Memory updated";
          appendGenerationLog(
            `${status}. Updates: ${memoryUpdate.updates.length}, drafts: ${memoryUpdate.newCandidates.length}, response: ${formatMs(metrics?.responseMs)}, parse: ${formatMs(metrics?.parseMs)}, tokens: ${formatTokenCount(metrics?.totalTokens ?? metrics?.outputTokensEstimate)}.`
          );
        })
        .catch((memoryError) => {
          console.error('Memory update failed', memoryError);
          appendGenerationLog("Memory update skipped.");
        });
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

  const handleDelete = async (id: string) => {
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
            >
              <NewsReaderView
                history={history}
                selectedReport={selectedReport}
                isGenerating={isGenerating}
                activeGeneration={activeGeneration}
                generationLog={generationLog}
                streamingContent={streamingContent}
                reasoningContent={reasoningContent}
                llmRuntime={llmRuntime}
                modelName={llmInfo.model}
                healthStatus={healthStatus}
                reportDepth={reportDepth}
                rssStats={rssStats}
                error={error}
                onRuntimeChange={setLlmRuntime}
                onReportDepthChange={setReportDepth}
                onGenerate={handleGenerate}
                onSelectReport={setSelectedReport}
                onViewChange={setView}
                onHistoryFilterChange={setHistoryFilter}
              />
            </motion.div>
          ) : view === 'markets' ? (
            <motion.div
              key="markets"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <MarketView
                history={history}
                selectedReport={selectedReport}
                isGenerating={isGenerating}
                generationLog={generationLog}
                streamingContent={streamingContent}
                reasoningContent={reasoningContent}
                llmRuntime={llmRuntime}
                modelName={llmInfo.model}
                onGenerateMarket={handleGenerateMarket}
                onSelectReport={setSelectedReport}
                onViewMarketHistory={() => {
                  setHistoryFilter('market');
                  setView('history');
                }}
              />
            </motion.div>
          ) : view === 'memory' ? (
            <motion.div
              key="memory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <MemoryView />
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <HistoryView
                history={history}
                selectedReport={selectedReport}
                historyFilter={historyFilter}
                onHistoryFilterChange={setHistoryFilter}
                onSelectReport={setSelectedReport}
                onDeleteReport={handleDelete}
                onImportReports={handleImportReports}
                onClearDrafts={handleClearDrafts}
                onClearHistory={handleClearHistory}
                onBackToReader={() => setView('reader')}
              />
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

