export interface NewsReport {
  id: string;
  date: string; // ISO date string with the report's local timezone offset
  type: 'morning' | 'evening' | 'market';
  content: string; // Markdown content
  timestamp: number;
}

export type LlmRuntime = 'local' | 'cloud';
export type ReportDepth = 'fast' | 'balanced' | 'wide';
export type AppView = 'reader' | 'history' | 'markets' | 'memory';
export type HistoryFilter = 'all' | 'news' | 'market';

export type MarketQuote = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose?: number | null;
  timestamp?: number | null;
  marketStatus?: "open" | "closed" | "unknown";
};

export interface MarketTicker {
  symbol: string;
  price: string;
  change: string;
  changePercent: string;
  trend: 'up' | 'down' | 'neutral';
}

export interface MarketIntelligence extends NewsReport {
  type: 'market';
  tickers: MarketTicker[];
}

export type MarketScheduleState = {
  enabled: boolean;
  slots: string[];
  runtime: LlmRuntime;
  lastClaimedSlotId: string | null;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  lastRunMessage: string | null;
  running: boolean;
  nextRun: {
    slotId: string;
    scheduledFor: string;
    scheduledAt: number;
  } | null;
};

export type NewsHistory = NewsReport[];

export type SourceCategory = 'Hard News' | 'Tech Media' | 'Community Signal' | 'Security / Specialist' | 'Business' | 'Policy' | 'General';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type RawNewsItem = {
  title: string;
  link: string;
  source: string;
  category?: SourceCategory;
  publishedAt?: string;
  contentSnippet?: string;
  sourceWeight: number;
};

export type NewsEnrichment = {
  confirmations: number;
  sources: string[];
  latestHeadline: string;
  confidenceAdjustment: "low" | "medium" | "high";
  openQuestion: string;
};

export type RankedNewsItem = RawNewsItem & {
  score: number;
  matchedKeywords: string[];
  recencyHours?: number;
  confirmationCount: number;
  confidence: Confidence;
  enrichment?: NewsEnrichment;
};

export type RSSHealthStats = {
  lastRefresh: string;
  totalSources: number;
  successCount: number;
  failedCount: number;
  failures: { source: string; error: string }[];
};
