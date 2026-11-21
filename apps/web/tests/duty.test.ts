import { expect, it } from "vitest";
import { isOnDuty, manilaDate, slotAt, weekStart } from "../src/lib/duty";

it("keeps the Sunday night shift active early Monday and hands over at 06:00 Manila", () => {
  const before = Date.parse("2026-11-23T05:59:59+08:00");
  const after = Date.parse("2026-11-23T06:00:00+08:00");
  const oldShift = { date: "2026-11-22", shift: "night" } as const;
  const newShift = { date: "2026-11-23", shift: "day" } as const;
  expect(weekStart(manilaDate(before))).toBe("2026-11-23");
  expect(slotAt(before)).toEqual(oldShift);
  expect(isOnDuty(oldShift, before)).toBe(true);
  expect(isOnDuty(oldShift, after)).toBe(false);
  expect(slotAt(after)).toEqual(newShift);
  expect(isOnDuty(newShift, after)).toBe(true);
});
