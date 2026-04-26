import React, { useState, useEffect } from 'react';
import { 
  Newspaper, 
  History, 
  Sun, 
  Moon, 
  RefreshCw, 
  ChevronRight, 
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
import { generateNews, generateMarketIntelligence } from './lib/gemini';
import { NewsReport, NewsHistory, MarketIntelligence, MarketTicker } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const LA_TZ = 'America/Los_Angeles';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [history, setHistory] = useState<NewsHistory>([]);
  const [selectedReport, setSelectedReport] = useState<NewsReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [view, setView] = useState<'reader' | 'history' | 'markets'>('reader');
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [provider, setProvider] = useState<'gemini' | 'ollama'>('gemini');

  useEffect(() => {
    const loadedHistory = storage.getHistory();
    setHistory(loadedHistory);
    if (loadedHistory.length > 0) {
      // Find the latest news report for reader view
      const newsReports = loadedHistory.filter(r => r.type !== 'market');
      if (newsReports.length > 0) {
        setSelectedReport(newsReports[0]);
      }
    }

    // Check LLM health on mount
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthStatus(data.status === 'ok' ? 'ok' : 'error');
    } catch (err) {
      setHealthStatus('error');
    }
  };

  const handleGenerateMarket = async () => {
    const now = new Date();
    const todayStr = formatInTimeZone(now, LA_TZ, 'yyyy-MM-dd');
    const currentTimeStr = formatInTimeZone(now, LA_TZ, 'HH:mm');
    const existingReports = storage.getReportsForDate(todayStr);
    
    // Switch view immediately to show progress inside the tab
    setView('markets');
    setIsGenerating(true);
    setError(null);

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

      const fullContext = `
CURRENT TIME: ${currentTimeStr} (LA Time)

=== RECENT NEWS HISTORY ===
${recentNews}

=== TODAY'S NEWEST UPDATES ===
${todayNews || 'No news briefings generated yet for today.'}

=== PREVIOUS MARKET ANALYSES (MEMORY) ===
${recentMarkets || 'This is the first market scan for this period.'}
`.trim();

      const rawContent = await generateMarketIntelligence(provider, fullContext);
      
      // Extract Tickers JSON
      let tickers: MarketTicker[] = [];
      const tickerMatch = rawContent.match(/\[JSON_TICKERS_BEGIN\]([\s\S]*?)\[JSON_TICKERS_END\]/);
      if (tickerMatch) {
        try {
          tickers = JSON.parse(tickerMatch[1].trim());
        } catch (e) {
          console.error("Failed to parse tickers JSON", e);
        }
      }

      const cleanContent = rawContent.replace(/\[JSON_TICKERS_BEGIN\][\s\S]*?\[JSON_TICKERS_END\]/, '').trim();

      const newMarketReport: MarketIntelligence = {
        id: crypto.randomUUID(),
        date: now.toISOString(),
        type: 'market',
        content: cleanContent,
        timestamp: now.getTime(),
        tickers
      };

      storage.saveReport(newMarketReport);
      setHistory(storage.getHistory());
      setSelectedReport(newMarketReport);
    } catch (err) {
      setError('Failed to generate market intelligence.');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async (type: 'morning' | 'evening') => {
    const now = new Date();
    const todayStr = formatInTimeZone(now, LA_TZ, 'yyyy-MM-dd');
    const existingReports = storage.getReportsForDate(todayStr);
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
    setError(null);
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
      
      const content = await generateNews(type, provider, context);
      
      const newReport: NewsReport = {
        id: crypto.randomUUID(),
        date: now.toISOString(),
        type,
        content,
        timestamp: now.getTime()
      };
      
      storage.saveReport(newReport);
      setHistory(storage.getHistory());
      setSelectedReport(newReport);
      setView('reader');
    } catch (err) {
      setError('Failed to generate news. Please check your API key and try again.');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    storage.deleteReport(id);
    const newHistory = storage.getHistory();
    setHistory(newHistory);
    if (selectedReport?.id === id) {
      setSelectedReport(newHistory[0] || null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-[1800px] mx-auto px-8 h-16 flex items-center justify-between">
          <nav className="flex items-center gap-1 bg-black/5 p-1 rounded-2xl">
            {[
              { id: 'reader', label: 'Intelligence' },
              { id: 'markets', label: 'Markets' },
              { id: 'history', label: 'History' }
            ].map((tab) => (
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
                  setView(tab.id as any);
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
                LLM: {healthStatus === 'loading' ? 'Checking' : healthStatus === 'ok' ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => {
              const latest = history.filter(r => r.type !== 'market')[0];
              if (latest) setSelectedReport(latest);
              setView('reader');
            }}>
              <span className="font-serif text-xl font-bold tracking-tight group-hover:opacity-70 transition-opacity">Sophia Intelligence</span>
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
                {selectedReport && selectedReport.type !== 'market' ? (
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
                <div className="bg-black text-white p-8 rounded-[2rem] space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif font-bold mb-2">Generate</h2>
                    <p className="text-white/60 text-sm">Get the latest high-signal news summarized by AI.</p>
                  </div>

                  {/* Provider Selection */}
                  <div className="flex p-1 bg-white/10 rounded-xl">
                    <button
                      onClick={() => setProvider('gemini')}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                        provider === 'gemini' ? "bg-white text-black" : "text-white/60 hover:text-white"
                      )}
                    >
                      Gemini
                    </button>
                    <button
                      onClick={() => setProvider('ollama')}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                        provider === 'ollama' ? "bg-white text-black" : "text-white/60 hover:text-white"
                      )}
                    >
                      Ollama
                    </button>
                  </div>

                  <div className="space-y-3">
                    <button 
                      disabled={isGenerating}
                      onClick={() => handleGenerate('morning')}
                      className="w-full bg-white text-black py-4 px-6 rounded-2xl font-bold flex items-center justify-between hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2"><Sun className="w-5 h-5" /> Morning</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <button 
                      disabled={isGenerating}
                      onClick={() => handleGenerate('evening')}
                      className="w-full bg-white/10 text-white py-4 px-6 rounded-2xl font-bold flex items-center justify-between hover:bg-white/20 transition-colors disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2"><Moon className="w-5 h-5" /> Evening</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <button 
                      disabled={isGenerating}
                      onClick={() => {
                        const now = new Date();
                        const todayStr = formatInTimeZone(now, LA_TZ, 'yyyy-MM-dd');
                        const existingTodayMarket = history.find(r => 
                          r.type === 'market' && 
                          formatInTimeZone(new Date(r.date), LA_TZ, 'yyyy-MM-dd') === todayStr
                        );

                        if (existingTodayMarket) {
                          setSelectedReport(existingTodayMarket);
                          setView('markets');
                        } else {
                          handleGenerateMarket();
                        }
                      }}
                      className="w-full bg-indigo-500 text-white py-4 px-6 rounded-2xl font-bold flex items-center justify-between hover:bg-indigo-600 transition-colors disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Market Intelligence</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {isGenerating && (
                    <div className="flex items-center gap-3 text-sm text-white/60 animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  )}

                  {error && (
                    <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-xs text-red-200">
                      {error}
                    </div>
                  )}
                </div>

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
                        {/* Market Link for this date */}
                        {reports.some(r => r.type === 'market') && (
                           <button
                            onClick={() => {
                                const report = reports.find(r => r.type === 'market');
                                if (report) {
                                  setSelectedReport(report);
                                  setView('markets');
                                }
                            }}
                            className={cn(
                              "w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border",
                              reports.find(r => r.type === 'market')?.id === selectedReport?.id
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-black/[0.02] border-transparent text-black/30 hover:bg-black/5 hover:text-black"
                            )}
                          >
                            <TrendingUp className="w-3 h-3" /> Market Intell
                          </button>
                        )}
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
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                    <div className="relative">
                      <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
                        <TrendingUp className="w-10 h-10 text-indigo-500 animate-pulse" />
                      </div>
                      <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div className="max-w-md">
                      <h3 className="text-2xl font-serif font-bold mb-2">Analyzing Markets...</h3>
                      <p className="text-black/40 px-8">Synthesizing ticker data with today's intelligence. Please wait.</p>
                    </div>
                  </div>
               ) : selectedReport && selectedReport.type === 'market' ? (
                 <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12">
                   {/* Main Insights */}
                   <div className="space-y-12">
                      {/* Ticker Tape */}
                      <div className="flex flex-wrap gap-4">
                        {(selectedReport as MarketIntelligence).tickers?.map((ticker, idx) => (
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
                          <ReactMarkdown>{selectedReport.content}</ReactMarkdown>
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
                        <div className="space-y-3">
                          {history
                            .filter(r => r.type === 'market')
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .slice(0, 5)
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
                        </div>
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
                <button 
                  onClick={() => setView('reader')}
                  className="flex items-center gap-2 text-sm font-bold hover:gap-3 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Reader
                </button>
              </div>

              <div className="flex-1 flex gap-8 min-h-0 overflow-hidden">
                {/* Left List - 35% */}
                <div className="w-[35%] flex flex-col gap-4 overflow-y-auto pr-4 custom-scrollbar">
                  {history.map((report) => {
                    const title = report.content.split('\n')[0].replace('# ', '') || 'Daily Briefing';
                    const keywords = report.content
                      .split('\n')
                      .filter(line => line.match(/^\d+\.\s/))
                      .map(line => line.replace(/^\d+\.\s/, '').split('（')[0])
                      .slice(0, 3)
                      .join(' · ');

                    return (
                      <div 
                        key={report.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedReport(report);
                          if (report.type === 'market') setView('markets');
                          else setView('reader');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedReport(report);
                            if (report.type === 'market') setView('markets');
                            else setView('reader');
                          }
                        }}
                        className={cn(
                          "group text-left p-6 rounded-[2rem] border transition-all relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-black/10",
                          selectedReport?.id === report.id
                            ? "bg-white border-black/10 shadow-lg scale-[1.02]"
                            : "bg-transparent border-transparent hover:bg-black/5"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center",
                            report.type === 'morning' ? "bg-amber-50 text-amber-600" : 
                            report.type === 'evening' ? "bg-indigo-50 text-indigo-600" : "bg-purple-50 text-purple-600"
                          )}>
                            {report.type === 'morning' ? <Sun className="w-4 h-4" /> : 
                             report.type === 'evening' ? <Moon className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                          </div>
                          <div className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                            {formatInTimeZone(new Date(report.date), LA_TZ, 'MMM d, HH:mm')}
                          </div>
                        </div>

                        <h3 className="font-serif font-bold text-lg leading-tight mb-2 line-clamp-1">
                          {title}
                        </h3>
                        
                        {keywords && (
                          <p className="text-[10px] font-bold text-black/30 uppercase tracking-widest line-clamp-1">
                            {keywords}
                          </p>
                        )}

                        <button 
                          onClick={(e) => handleDelete(report.id, e)}
                          className="absolute top-4 right-4 p-2 rounded-full bg-red-50 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 z-10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}

                  {history.length === 0 && (
                    <div className="py-12 text-center space-y-4 opacity-20">
                      <History className="w-12 h-12 mx-auto" />
                      <p className="text-sm font-bold uppercase tracking-widest">Empty Archive</p>
                    </div>
                  )}
                </div>

                {/* Right Content - 65% */}
                <div className="flex-1 bg-white border border-black/5 rounded-[3rem] overflow-y-auto p-12 custom-scrollbar shadow-sm">
                  {selectedReport ? (
                    <article className="animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="flex items-center gap-3 mb-8">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          selectedReport.type === 'morning' ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                        )}>
                          {selectedReport.type === 'morning' ? 'Morning' : 'Evening'}
                        </span>
                        <span className="text-xs text-black/40 font-bold uppercase tracking-widest">
                          {formatInTimeZone(new Date(selectedReport.date), LA_TZ, 'MMMM do, yyyy · HH:mm')}
                        </span>
                      </div>
                      
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
            <span className="text-xs font-bold tracking-widest uppercase">Sophia Intelligence</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-20">
            &copy; {new Date().getFullYear()} High-Signal News Intelligence
          </div>
        </div>
      </footer>
    </div>
  );
}

