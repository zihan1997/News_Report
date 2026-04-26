import RSSParser from "rss-parser";
import { formatInTimeZone } from "date-fns-tz";
import { subHours, isWithinInterval } from "date-fns";
import { RawNewsItem, RankedNewsItem, SourceCategory, RSSHealthStats, Confidence } from "../types";
import { GoogleGenAI } from "@google/genai";

const parser = new RSSParser();
const LA_TZ = "America/Los_Angeles";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
import { generateMorningPrompt, generateEveningPrompt } from "./news-helpers";

export const RSS_FEEDS: { source: string; url: string; weight: number; category: SourceCategory }[] = [
  // Hard News / Global
  {
    source: "BBC Top Stories",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
    weight: 10,
    category: "Hard News",
  },
  {
    source: "NYT Top Stories",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    weight: 10,
    category: "Hard News",
  },
  {
    source: "CNN International",
    url: "http://rss.cnn.com/rss/edition.rss",
    weight: 8,
    category: "Hard News",
  },

  // Business / Markets
  {
    source: "CNBC Top News",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    weight: 9,
    category: "Business",
  },
  {
    source: "WSJ World News",
    url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
    weight: 9,
    category: "Business",
  },

  // Policy / DC
  {
    source: "Politico Playbook",
    url: "https://rss.politico.com/playbook.xml",
    weight: 8,
    category: "Policy",
  },

  // Local / West Coast
  {
    source: "LA Times World & Nation",
    url: "https://www.latimes.com/world-nation/rss2.0.xml",
    weight: 7,
    category: "Hard News",
  },

  // Tech / AI
  {
    source: "BBC Technology",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    weight: 8,
    category: "Tech Media",
  },
  {
    source: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    weight: 7,
    category: "Tech Media",
  },
  {
    source: "WIRED",
    url: "https://www.wired.com/feed/rss",
    weight: 7,
    category: "Tech Media",
  },
  {
    source: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    weight: 8,
    category: "Tech Media",
  },
  {
    source: "ZDNET",
    url: "https://www.zdnet.com/news/rss.xml",
    weight: 6,
    category: "Tech Media",
  },

  // Security
  {
    source: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
    weight: 8,
    category: "Security / Specialist",
  },
  {
    source: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
    weight: 7,
    category: "Security / Specialist",
  },

  // Community Signal
  {
    source: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    weight: 6,
    category: "Community Signal",
  },
];

/**
 * Verify specific items or fallback to search if RSS is insufficient
 */
export async function verifyWithGoogleSearchIfNeeded(items: RankedNewsItem[], previousContext: string): Promise<RankedNewsItem[]> {
  // If we have plenty of high-quality items, we might skip extra search to save cost
  if (items.length >= 10 && items[0].score > 30) {
    return items;
  }
  return items;
}

export async function generateMorningReportWithGemini(rankedItems: RankedNewsItem[], previousContext: string): Promise<string> {
  const today = formatInTimeZone(new Date(), LA_TZ, "EEEE, MMMM dd, yyyy");
  const prompt = generateMorningPrompt(rankedItems, today, previousContext);
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: rankedItems.length < 10 ? [{ googleSearch: {} }] : undefined,
    }
  });

  return response.text || "";
}

export async function generateEveningReportWithGemini(rankedItems: RankedNewsItem[], previousContext: string): Promise<string> {
  const today = formatInTimeZone(new Date(), LA_TZ, "EEEE, MMMM dd, yyyy");
  const prompt = generateEveningPrompt(rankedItems, today, previousContext);
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: rankedItems.length < 6 ? [{ googleSearch: {} }] : undefined,
    }
  });

  return response.text || "";
}

const PRIORITY_KEYWORDS = {
  macro: ["fed", "interest rate", "inflation", "tariff", "treasury", "recession", "jobs report", "gdp", "economic"],
  ai: ["ai", "openai", "gemini", "anthropic", "nvidia", "llm", "model", "agent", "inference", "gpu", "cuda"],
  immigration: ["uscis", "visa", "h-1b", "f-1", "opt", "cpt", "immigration", "student visa", "green card"],
  security: ["breach", "vulnerability", "cyberattack", "malware", "ransomware", "zero-day", "exploit", "hack"],
  bigTech: ["google", "microsoft", "apple", "meta", "amazon", "tesla", "nvidia", "netflix"],
};

export async function collectNewsFromRSS(): Promise<{ items: RawNewsItem[]; stats: RSSHealthStats }> {
  const allItems: RawNewsItem[] = [];
  const failures: { source: string; error: string }[] = [];
  let successCount = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const response = await parser.parseURL(feed.url);
      successCount++;
      for (const item of response.items) {
        allItems.push({
          title: item.title || "Untitled",
          link: item.link || "",
          source: feed.source,
          category: feed.category,
          publishedAt: item.isoDate || item.pubDate,
          contentSnippet: (item.contentSnippet || item.content || "").replace(/<[^>]*>?/gm, ''), // Basic HTML stripping
          sourceWeight: feed.weight,
        });
      }
    } catch (error: any) {
      console.error(`Failed to fetch RSS from ${feed.source}:`, error);
      failures.push({ source: feed.source, error: error.message || "Unknown error" });
    }
  }

  const stats: RSSHealthStats = {
    lastRefresh: formatInTimeZone(new Date(), LA_TZ, "HH:mm"),
    totalSources: RSS_FEEDS.length,
    successCount,
    failedCount: failures.length,
    failures,
  };

  return { items: allItems, stats };
}

export function filterRecentNews(items: RawNewsItem[], hours = 24): RawNewsItem[] {
  const now = new Date();
  const cutoff = subHours(now, hours);

  return items.filter((item) => {
    if (!item.publishedAt) return false;
    try {
      const pubDate = new Date(item.publishedAt);
      return isWithinInterval(pubDate, { start: cutoff, end: now });
    } catch {
      return false;
    }
  });
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 2)
    .join(" ");
}

export function dedupeNews(items: RawNewsItem[]): RawNewsItem[] {
  const deduped: RawNewsItem[] = [];

  for (const item of items) {
    const normA = normalizeTitle(item.title);
    const wordsA = new Set(normA.split(" "));

    let isDuplicate = false;
    for (const seenItem of deduped) {
      const normB = normalizeTitle(seenItem.title);
      const wordsB = normB.split(" ");
      
      // 1. Normalized title inclusion
      if (normA.includes(normB) || normB.includes(normA)) {
        isDuplicate = true;
        break;
      }

      // 2. Keyword overlap (if 60% of words overlap)
      const overlap = wordsB.filter(w => wordsA.has(w)).length;
      const ratio = overlap / Math.max(wordsA.size, wordsB.length);
      if (ratio > 0.6) {
        // Only if publish time is within 6 hours
        const timeA = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
        const timeB = seenItem.publishedAt ? new Date(seenItem.publishedAt).getTime() : 0;
        if (Math.abs(timeA - timeB) < 6 * 60 * 60 * 1000) {
          isDuplicate = true;
          break;
        }
      }
    }

    if (!isDuplicate) {
      deduped.push(item);
    }
  }

  return deduped;
}

export function rankNews(items: RawNewsItem[]): RankedNewsItem[] {
  // Pre-process for multi-source confirmation
  const normalizedMap = new Map<string, { count: number; maxWeight: number }>();
  items.forEach(item => {
    const norm = normalizeTitle(item.title).slice(0, 60); 
    const current = normalizedMap.get(norm) || { count: 0, maxWeight: 0 };
    normalizedMap.set(norm, { 
      count: current.count + 1, 
      maxWeight: Math.max(current.maxWeight, item.sourceWeight) 
    });
  });

  const ranked: RankedNewsItem[] = items.map((item) => {
    const norm = normalizeTitle(item.title).slice(0, 60);
    const { count: confirmationCount, maxWeight } = normalizedMap.get(norm) || { count: 1, maxWeight: item.sourceWeight };
    
    let score = item.sourceWeight;
    const matchedKeywords: string[] = [];
    const lowerTitle = item.title.toLowerCase();
    const lowerSnippet = (item.contentSnippet || "").toLowerCase();
    const fullText = lowerTitle + " " + lowerSnippet;

    // Topic Relevance Boost
    for (const [category, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
      let categoryMatch = false;
      for (const kw of keywords) {
        if (fullText.includes(kw)) {
          matchedKeywords.push(kw);
          categoryMatch = true;
          score += lowerTitle.includes(kw) ? 4 : 2;
        }
      }
      if (categoryMatch) {
        if (category === 'immigration') score += 12;
        if (category === 'macro') score += 10;
        if (category === 'ai' || category === 'security') score += 8;
        if (category === 'bigTech') score += 6;
      }
    }

    // Multi-source confirmation bonus
    if (confirmationCount > 1) {
      score += Math.min(confirmationCount * 5, 15);
    }

    // Source Category Weighting
    if (item.category === "Hard News") score += 5;
    if (item.category === "Community Signal") {
      const isHighSignalHN = /ai|openai|nvidia|apple|google|meta|microsoft|proton|security|linux|kernel/i.test(item.title);
      score += isHighSignalHN ? 4 : -5;
    }

    // Recency boost
    if (item.publishedAt) {
      const hoursAgo = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
      if (hoursAgo < 3) score += 10;
      else if (hoursAgo < 8) score += 6;
      else if (hoursAgo < 16) score += 3;
    }

    // Deterministic Confidence Engine
    let confidence: Confidence = 'LOW';
    if (confirmationCount >= 2 && maxWeight >= 9) {
      confidence = 'HIGH';
    } else if (item.sourceWeight >= 8 || confirmationCount >= 2) {
      confidence = 'MEDIUM';
    } else if (item.category === "Community Signal") {
      confidence = 'LOW';
    }

    return {
      ...item,
      score,
      confirmationCount,
      confidence,
      matchedKeywords: Array.from(new Set(matchedKeywords)),
    };
  });

  return ranked.sort((a, b) => b.score - a.score).slice(0, 25);
}
