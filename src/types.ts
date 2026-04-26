export interface NewsReport {
  id: string;
  date: string; // ISO date string
  type: 'morning' | 'evening' | 'market';
  content: string; // Markdown content
  timestamp: number;
}

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

export type NewsHistory = NewsReport[];

export type SourceCategory = 'Hard News' | 'Tech Media' | 'Community Signal' | 'Security / Specialist' | 'Business' | 'Policy' | 'General';

export type RawNewsItem = {
  title: string;
  link: string;
  source: string;
  category?: SourceCategory;
  publishedAt?: string;
  contentSnippet?: string;
  sourceWeight: number;
};

export type RankedNewsItem = RawNewsItem & {
  score: number;
  matchedKeywords: string[];
  recencyHours?: number;
  confirmationCount: number;
};
