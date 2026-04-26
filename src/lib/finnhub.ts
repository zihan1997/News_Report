import { MarketQuote } from "../types";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";

export const DEFAULT_MARKET_SYMBOLS = [
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "NVDA",
  "AMD",
  "AAPL",
  "MSFT",
  "GOOGL",
  "META",
  "AMZN",
  "TSLA",
  "BTC-USD"
];

export const SYMBOL_DISPLAY_NAMES: Record<string, string> = {
  SPY: "S&P 500 ETF (SPY)",
  QQQ: "Nasdaq 100 ETF (QQQ)",
  DIA: "Dow Jones ETF (DIA)",
  IWM: "Russell 2000 ETF (IWM)",
  NVDA: "NVIDIA (NVDA)",
  AMD: "AMD (AMD)",
  AAPL: "Apple (AAPL)",
  MSFT: "Microsoft (MSFT)",
  GOOGL: "Alphabet (GOOGL)",
  META: "Meta (META)",
  AMZN: "Amazon (AMZN)",
  TSLA: "Tesla (TSLA)",
  "BTC-USD": "Bitcoin (BTC/USD)"
};

/**
 * Fetch market data for a list of symbols from Finnhub
 */
export async function fetchMarketSnapshot(symbols: string[] = DEFAULT_MARKET_SYMBOLS): Promise<MarketQuote[]> {
  if (!FINNHUB_API_KEY) {
    console.warn("FINNHUB_API_KEY is missing. Returning empty quotes.");
    return symbols.map(symbol => ({
      symbol,
      name: SYMBOL_DISPLAY_NAMES[symbol] || symbol,
      price: null,
      change: null,
      changePercent: null,
      marketStatus: "unknown"
    }));
  }

  const results = await Promise.all(
    symbols.map(async (symbol): Promise<MarketQuote> => {
      try {
        // For BTC-USD, we might need a different mapping for Finnhub
        // Finnhub uses BINANCE:BTCUSDT or similar for crypto
        const finnhubSymbol = symbol === "BTC-USD" ? "BINANCE:BTCUSDT" : symbol;
        
        const response = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${FINNHUB_API_KEY}`
        );

        if (!response.ok) {
          throw new Error(`Finnhub error: ${response.status}`);
        }

        const data = await response.json();

        // Determine market status - very basic heuristic
        // US Equities are open 9:30-16:00 EST
        const now = new Date();
        const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const hours = estTime.getHours();
        const minutes = estTime.getMinutes();
        const day = estTime.getDay(); // 0 is Sunday, 6 is Saturday
        
        const isWeekend = day === 0 || day === 6;
        const isMarketHours = (hours > 9 || (hours === 9 && minutes >= 30)) && hours < 16;
        const marketStatus: "open" | "closed" = (!isWeekend && isMarketHours) ? "open" : "closed";

        return {
          symbol,
          name: SYMBOL_DISPLAY_NAMES[symbol] || symbol,
          price: data.c || null,
          change: data.d || null,
          changePercent: data.dp || null,
          previousClose: data.pc || null,
          timestamp: data.t || null,
          marketStatus: symbol === "BTC-USD" ? ("open" as const) : marketStatus
        };
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
        return {
          symbol,
          name: SYMBOL_DISPLAY_NAMES[symbol] || symbol,
          price: null,
          change: null,
          changePercent: null,
          previousClose: null,
          timestamp: null,
          marketStatus: "unknown" as const
        };
      }
    })
  );

  return results;
}
