import { formatInTimeZone } from 'date-fns-tz';
import { NewsHistory, NewsReport } from '../types';

const LEGACY_STORAGE_KEY = 'sophia_news_history';
const LA_TZ = 'America/Los_Angeles';

async function requestReports<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export const storage = {
  getHistory: async (): Promise<NewsHistory> => {
    const data = await requestReports<{ reports: NewsHistory }>('/api/reports');
    return data.reports;
  },

  migrateLocalStorage: async (): Promise<{ reports: NewsHistory; importedCount: number }> => {
    const current = await storage.getHistory();
    const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyData) {
      return { reports: current, importedCount: 0 };
    }

    let legacyReports: NewsHistory;
    try {
      legacyReports = JSON.parse(legacyData);
    } catch (e) {
      console.error('Failed to parse legacy localStorage reports', e);
      return { reports: current, importedCount: 0 };
    }

    if (!Array.isArray(legacyReports)) {
      return { reports: current, importedCount: 0 };
    }

    const existingIds = new Set(current.map((report) => report.id));
    const reportsToImport = legacyReports.filter((report) => report?.id && !existingIds.has(report.id));
    let latestHistory = current;

    for (const report of reportsToImport) {
      latestHistory = await storage.saveReport(report);
    }

    return { reports: latestHistory, importedCount: reportsToImport.length };
  },

  importReports: async (reports: NewsHistory): Promise<{ reports: NewsHistory; importedCount: number }> => {
    const current = await storage.getHistory();
    const existingIds = new Set(current.map((report) => report.id));
    const reportsToImport = reports.filter((report) => report?.id && !existingIds.has(report.id));
    let latestHistory = current;

    for (const report of reportsToImport) {
      latestHistory = await storage.saveReport(report);
    }

    return { reports: latestHistory, importedCount: reportsToImport.length };
  },

  saveReport: async (report: NewsReport): Promise<NewsHistory> => {
    const data = await requestReports<{ reports: NewsHistory }>('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    return data.reports;
  },

  deleteReport: async (id: string): Promise<NewsHistory> => {
    const data = await requestReports<{ reports: NewsHistory }>(`/api/reports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return data.reports;
  },

  clearHistory: async (): Promise<NewsHistory> => {
    const data = await requestReports<{ reports: NewsHistory }>('/api/reports', {
      method: 'DELETE',
    });
    return data.reports;
  },

  clearDrafts: async (): Promise<{ reports: NewsHistory; deletedCount: number }> => {
    return requestReports<{ reports: NewsHistory; deletedCount: number }>('/api/reports/drafts', {
      method: 'DELETE',
    });
  },

  getLatestReport: async (type?: 'morning' | 'evening'): Promise<NewsReport | undefined> => {
    const history = await storage.getHistory();
    if (type) {
      return history.find((r) => r.type === type);
    }
    return history[0];
  },

  getReportsForDate: async (dateStr: string): Promise<NewsHistory> => {
    const history = await storage.getHistory();
    return history.filter((r) => {
      const reportDate = new Date(r.date);
      return formatInTimeZone(reportDate, LA_TZ, 'yyyy-MM-dd') === dateStr;
    });
  }
};
