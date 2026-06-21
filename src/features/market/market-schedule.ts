import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const MARKET_TIMEZONE = "America/Los_Angeles";
export const DEFAULT_MARKET_SLOTS = ["07:00", "10:30", "13:00", "15:30"];

export type MarketScheduleSlot = {
  slotId: string;
  scheduledFor: string;
  scheduledAt: number;
};

function validSlots(slots: string[]) {
  return [...new Set(slots)]
    .filter((slot) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot))
    .sort();
}

function isWeekday(date: Date) {
  const weekday = formatInTimeZone(date, MARKET_TIMEZONE, "EEE");
  return weekday !== "Sat" && weekday !== "Sun";
}

function slotForDate(date: Date, slot: string): MarketScheduleSlot {
  const datePart = formatInTimeZone(date, MARKET_TIMEZONE, "yyyy-MM-dd");
  const instant = fromZonedTime(`${datePart}T${slot}:00`, MARKET_TIMEZONE);
  return {
    slotId: `${datePart}@${slot}`,
    scheduledFor: formatInTimeZone(instant, MARKET_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    scheduledAt: instant.getTime(),
  };
}

export function nextMarketRun(now: Date, slots: string[]): MarketScheduleSlot | null {
  const normalized = validSlots(slots);
  if (normalized.length === 0) return null;

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const candidateDay = addDays(now, dayOffset);
    if (!isWeekday(candidateDay)) continue;
    for (const slot of normalized) {
      const candidate = slotForDate(candidateDay, slot);
      if (candidate.scheduledAt > now.getTime()) return candidate;
    }
  }
  return null;
}

export function dueMarketSlot(
  now: Date,
  slots: string[],
  lastClaimedSlotId: string | null,
  graceMinutes = 20,
): MarketScheduleSlot | null {
  if (!isWeekday(now)) return null;
  const graceMs = Math.max(1, graceMinutes) * 60 * 1000;
  const candidates = validSlots(slots)
    .map((slot) => slotForDate(now, slot))
    .filter((candidate) => candidate.scheduledAt <= now.getTime() && now.getTime() - candidate.scheduledAt <= graceMs)
    .sort((a, b) => b.scheduledAt - a.scheduledAt);
  const candidate = candidates[0] || null;
  return candidate?.slotId === lastClaimedSlotId ? null : candidate;
}
