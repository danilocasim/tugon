import { describe, expect, it } from "vitest";
import { hotspots, kmeans, metrics, silhouette } from "../src/lib/cases";
import { suggest } from "../src/lib/classifier";
import type { ServiceRequest } from "../src/lib/domain";
import { DAY, HOUR } from "../src/lib/format";
import { priority, rankQueue } from "../src/lib/priority";

const now = Date.parse("2026-11-22T00:30:00+08:00");
const location = (lat: number): ServiceRequest["location"] => ({ lat, lon: 121.04, purok: "P2", method: "pin", landmarkId: null });
const report = (lat: number, overrides = {}) => ({ location: location(lat), prediction: { category: "infra", urgency: "normal" } as const,
  triage: null, createdAt: now - HOUR, status: "queued" as const, restricted: false, ...overrides });

describe("operations analytics", () => {
  it("returns two distinct hotspots and leaves isolated or ineligible records out", () => {
    const rows = [14.375, 14.3751, 14.3752, 14.38, 14.3801, 14.3802, 14.39].map((lat) => report(lat));
    rows.push(report(14.3753, { restricted: true }), report(14.3753, { createdAt: now - 31 * DAY }), report(14.3753, { status: "withdrawn" }));
    const { clusters, noise } = hotspots(rows, { epsM: 50, minPts: 3, days: 30, categories: ["infra"] }, now);
    expect(clusters.map((c) => c.members.length)).toEqual([3, 3]);
    expect(noise.map((r) => r.location?.lat)).toEqual([14.39]);
    const points = rows.slice(0, 6).map((r) => ({ lat: r.location!.lat!, lon: r.location!.lon! }));
    const labels = kmeans(points, 2);
    expect(new Set(labels.slice(0, 3)).size).toBe(1);
    expect(new Set(labels.slice(3)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[3]);
    expect(silhouette(points, labels)).toBeGreaterThan(0.94);
  });

  it("buckets intake days in Manila instead of the server time zone", () => {
    const input = [now - 15 * 60_000, now - HOUR].map((createdAt) => ({ ...report(14.38), createdAt, firstActionAt: null, startedAt: null, closedAt: null }));
    expect(metrics(input, 7, { high: 2, medium: 12, normal: 24 }, now).perDay.slice(-2)).toEqual([
      { day: Date.parse("2026-11-21T00:00:00+08:00"), count: 1 }, { day: Date.parse("2026-11-22T00:00:00+08:00"), count: 1 },
    ]);
  });

  it("ranks urgent cases first and caps the aging contribution at five hours", () => {
    const ticket = (urgency: "high" | "medium" | "normal", hours: number) => ({ createdAt: now - hours * HOUR,
      triage: { category: "infra" as const, urgency, by: "fixture", at: now, correctedCategory: false, correctedUrgency: false } });
    const fresh = ticket("high", 0), old = ticket("normal", 10), older = ticket("normal", 11), middle = ticket("medium", 1);
    expect(rankQueue([old, fresh, older, middle], now).map(({ req }) => req)).toEqual([fresh, middle, older, old]);
    expect(priority(old, now)?.a).toBe(0.2);
  });

  it("keeps high-confidence Taglish suggestions grounded in the report", () => {
    const expectations = [
      ["May kumikislap na live wire na nakalaylay sa poste malapit sa gate.", "infra"],
      ["Paano kumuha ng barangay clearance at certificate of indigency?", "documents"],
      ["Barado ang kanal at tambak ang basura sa tabi ng talipapa.", "sanitation"],
    ] as const;
    for (const [sample, category] of expectations) {
      const found = suggest(sample);
      expect(found.category).toBe(category);
      expect(found.evidence.some((term) => sample.toLowerCase().includes(term))).toBe(true);
    }
  });
});
