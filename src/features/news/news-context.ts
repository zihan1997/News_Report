import { formatInTimeZone } from "date-fns-tz";
import { NewsHistory } from "../../types";

const LA_TZ = "America/Los_Angeles";
const MAX_HISTORY_REPORTS = 6;
const MAX_REPORT_CHARS = 1400;

export function buildMorningHistoryContext(history: NewsHistory) {
  const recentNewsReports = history
    .filter((report) => report.type !== "market")
    .slice(0, MAX_HISTORY_REPORTS);

  if (recentNewsReports.length === 0) {
    return "";
  }

  return recentNewsReports
    .map((report) => {
      const stamp = formatInTimeZone(new Date(report.date), LA_TZ, "yyyy-MM-dd HH:mm");
      const content = report.content.length > MAX_REPORT_CHARS
        ? `${report.content.slice(0, MAX_REPORT_CHARS)}...`
        : report.content;

      return `[PREVIOUS ${report.type.toUpperCase()} REPORT | ${stamp} LA]\n${content}`;
    })
    .join("\n\n---\n\n");
}
