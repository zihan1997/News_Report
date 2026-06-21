import { LlmRuntime, MarketScheduleState, NewsHistory } from "../../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export function getMarketSchedule() {
  return request<MarketScheduleState>("/api/market-schedule");
}

export function updateMarketSchedule(enabled: boolean, slots: string[], runtime: LlmRuntime) {
  return request<MarketScheduleState>("/api/market-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, slots, runtime }),
  });
}

export function runScheduledMarketNow(runtime: LlmRuntime) {
  return request<{ schedule: MarketScheduleState; report: NewsHistory[number] }>("/api/market-schedule/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runtime }),
  });
}
