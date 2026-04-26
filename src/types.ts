export interface NewsReport {
  id: string;
  date: string; // ISO date string
  type: 'morning' | 'evening' | 'market';
  content: string; // Markdown content
  timestamp: number;
}

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
