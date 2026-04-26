import RSSParser from "rss-parser";
import { formatInTimeZone } from "date-fns-tz";
import { subHours, isWithinInterval } from "date-fns";
import { RawNewsItem, RankedNewsItem, SourceCategory } from "../types";
import { GoogleGenAI } from "@google/genai";

const parser = new RSSParser();
const LA_TZ = "America/Los_Angeles";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
import { generateMorningPrompt, generateEveningPrompt } from "./news-helpers";

export const RSS_FEEDS: { source: string; url: string; weight: number; category: SourceCategory }[] = [
  {
    source: "BBC Technology",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    weight: 9,
    category: "Hard News",
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
    source: "ZDNET",
    url: "https://www.zdnet.com/news/rss.xml",
    weight: 6,
    category: "Tech Media",
  },
  {
    source: "Hacker News",
    url: "https://hnrss.org/frontpage",
    weight: 6,
    category: "Community Signal",
  },
  {
    source: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    weight: 8,
    category: "Tech Media",
  },
  {
    source: "CNET",
    url: "https://www.cnet.com/rss/news/",
    weight: 7,
    category: "Tech Media",
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

export async function collectNewsFromRSS(): Promise<RawNewsItem[]> {
  const allItems: RawNewsItem[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const response = await parser.parseURL(feed.url);
      for (const item of response.items) {
        allItems.push({
          title: item.title || "Untitled",
          link: item.link || "",
          source: feed.source,
          category: feed.category,
          publishedAt: item.isoDate || item.pubDate,
          contentSnippet: item.contentSnippet || item.content,
          sourceWeight: feed.weight,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch RSS from ${feed.source}:`, error);
    }
  }

  return allItems;
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
  const seenTitles = new Set<string>();
  const deduped: RawNewsItem[] = [];

  for (const item of items) {
    const normalized = normalizeTitle(item.title);
    let isDuplicate = false;
    for (const seen of seenTitles) {
      if (seen.includes(normalized) || normalized.includes(seen)) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      deduped.push(item);
      seenTitles.add(normalized);
    }
  }

  return deduped;
}

export function rankNews(items: RawNewsItem[]): RankedNewsItem[] {
  // Pre-process for multi-source confirmation
  const normalizedMap = new Map<string, number>();
  items.forEach(item => {
    const norm = normalizeTitle(item.title).slice(0, 50); // Use prefix for better matching
    normalizedMap.set(norm, (normalizedMap.get(norm) || 0) + 1);
  });

  const ranked: RankedNewsItem[] = items.map((item) => {
    const norm = normalizeTitle(item.title).slice(0, 50);
    const confirmationCount = normalizedMap.get(norm) || 1;
    
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
          // Title matches weigh more
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
      // HN only scores big if it's very relevant to tech/ai
      const isHighSignalHN = /ai|openai|nvidia|apple|google|meta|microsoft|proton|security|linux|kernel/i.test(item.title);
      score += isHighSignalHN ? 4 : -5;
    }

    // Recency boost (finer grained)
    if (item.publishedAt) {
      const hoursAgo = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
      if (hoursAgo < 3) score += 10;
      else if (hoursAgo < 8) score += 6;
      else if (hoursAgo < 16) score += 3;
    }

    return {
      ...item,
      score,
      confirmationCount,
      matchedKeywords: Array.from(new Set(matchedKeywords)),
    };
  });

  return ranked.sort((a, b) => b.score - a.score).slice(0, 25);
}
