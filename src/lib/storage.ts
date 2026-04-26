import { formatInTimeZone } from 'date-fns-tz';
import { NewsHistory, NewsReport } from '../types';

const STORAGE_KEY = 'sophia_news_history';
const LA_TZ = 'America/Los_Angeles';

export const storage = {
  getHistory: (): NewsHistory => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse news history', e);
      return [];
    }
  },

  saveReport: (report: NewsReport) => {
    const history = storage.getHistory();
    const newHistory = [report, ...history];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  },

  deleteReport: (id: string) => {
    const history = storage.getHistory();
    const newHistory = history.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  },

  clearHistory: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  getLatestReport: (type?: 'morning' | 'evening'): NewsReport | undefined => {
    const history = storage.getHistory();
    if (type) {
      return history.find((r) => r.type === type);
    }
    return history[0];
  },

  getReportsForDate: (dateStr: string): NewsHistory => {
    const history = storage.getHistory();
    return history.filter((r) => {
      const reportDate = new Date(r.date);
      return formatInTimeZone(reportDate, LA_TZ, 'yyyy-MM-dd') === dateStr;
    });
  }
};

