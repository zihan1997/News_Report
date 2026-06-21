import assert from "node:assert/strict";
import test from "node:test";
import { dueMarketSlot, nextMarketRun } from "./market-schedule.ts";

const slots = ["07:00", "10:30", "13:00", "15:30"];

test("nextMarketRun selects the next LA weekday slot", () => {
  const next = nextMarketRun(new Date("2026-06-11T17:45:00.000Z"), slots);
  assert.equal(next?.slotId, "2026-06-11@13:00");
  assert.equal(next?.scheduledFor, "2026-06-11T13:00:00-07:00");
});

test("nextMarketRun skips weekends", () => {
  const next = nextMarketRun(new Date("2026-06-13T18:00:00.000Z"), slots);
  assert.equal(next?.slotId, "2026-06-15@07:00");
});

test("dueMarketSlot returns one unclaimed slot within the grace window", () => {
  const due = dueMarketSlot(new Date("2026-06-11T17:35:00.000Z"), slots, null, 20);
  assert.equal(due?.slotId, "2026-06-11@10:30");
  assert.equal(dueMarketSlot(new Date("2026-06-11T17:35:00.000Z"), slots, due?.slotId || null, 20), null);
});
