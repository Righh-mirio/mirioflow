import { describe, expect, it } from "vitest";
import {
  DEFAULT_DICTATION_STATS,
  type DictationStats,
  getCurrentStreak,
  getLongestStreak,
  getRecentDays,
  msUntilNextLocalDay,
  parseStoredDictationStats,
  previousDateKey,
  recordDictation,
  summarizeDictationStats,
} from "./dictationStats";

// Local dates, month is 0-based.
const at = (month: number, day: number, hour = 10) =>
  new Date(2026, month, day, hour);

const record = (stats: DictationStats, date: Date, words = 30, seconds = 12) =>
  recordDictation(stats, { words, seconds, at: date });

describe("recordDictation", () => {
  it("adds two dictations on the same day to one day record", () => {
    let stats = record(DEFAULT_DICTATION_STATS, at(8, 24, 9), 40, 20);
    stats = record(stats, at(8, 24, 21), 60, 30);

    expect(stats.days).toEqual({
      "2026-09-24": { words: 100, seconds: 50, dictations: 2 },
    });
    expect(stats.totalWords).toBe(100);
    expect(stats.totalSeconds).toBe(50);
    expect(getCurrentStreak(stats.days, at(8, 24, 22))).toBe(1);
  });

  it("leaves dictations under 2 seconds out of the speed numbers", () => {
    let stats = record(DEFAULT_DICTATION_STATS, at(8, 24), 60, 30);
    stats = record(stats, at(8, 24), 5, 1.5);

    const summary = summarizeDictationStats(stats, at(8, 24));
    expect(summary.wordsPerMinute).toBe(120);
    expect(summary.lastWordsPerMinute).toBe(120);
    expect(stats.totalWords).toBe(65);
    expect(stats.days["2026-09-24"].dictations).toBe(2);
  });
});

describe("streaks", () => {
  it("breaks the current streak on a missed day", () => {
    let stats = DEFAULT_DICTATION_STATS;
    for (const day of [18, 19, 20, 22, 23, 24]) {
      stats = record(stats, at(8, day));
    }

    expect(getCurrentStreak(stats.days, at(8, 24))).toBe(3);
    expect(getLongestStreak(stats.days)).toBe(3);

    stats = record(stats, at(8, 17));
    expect(getLongestStreak(stats.days)).toBe(4);
  });

  it("counts from yesterday when there is no dictation yet today", () => {
    let stats = DEFAULT_DICTATION_STATS;
    for (const day of [21, 22, 23]) {
      stats = record(stats, at(8, day));
    }

    expect(getCurrentStreak(stats.days, at(8, 24, 8))).toBe(3);
    expect(getCurrentStreak(stats.days, at(8, 25, 8))).toBe(0);
  });

  it("follows calendar days across month boundaries", () => {
    expect(previousDateKey("2026-10-01")).toBe("2026-09-30");
    expect(previousDateKey("2026-01-01")).toBe("2025-12-31");
    let stats = record(DEFAULT_DICTATION_STATS, at(8, 30));
    stats = record(stats, at(9, 1));
    expect(getCurrentStreak(stats.days, at(9, 1))).toBe(2);
  });
});

describe("getRecentDays", () => {
  it("returns the last 7 days ending today, oldest first", () => {
    const stats = record(DEFAULT_DICTATION_STATS, at(8, 22), 80, 30);
    const week = getRecentDays(stats.days, at(8, 24), 7, "en-US");

    expect(week.map((day) => day.dateKey)).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
    expect(week.map((day) => day.initial).join("")).toBe("FSSMTWT");
    expect(week[4].words).toBe(80);
    expect(week[6].isToday).toBe(true);
  });
});

describe("parseStoredDictationStats", () => {
  it("migrates v1 totals when there is no v2 data", () => {
    const stats = parseStoredDictationStats(
      null,
      JSON.stringify({ totalWords: 1247, totalSeconds: 600 }),
    );

    expect(stats.totalWords).toBe(1247);
    expect(stats.totalSeconds).toBe(600);
    expect(stats.days).toEqual({});
    expect(
      summarizeDictationStats(stats, at(8, 24)).wordsPerMinute,
    ).toBeCloseTo(124.7);
  });

  it("prefers v2 data over v1 once it exists", () => {
    const v2 = record(DEFAULT_DICTATION_STATS, at(8, 24), 30, 15);
    const stats = parseStoredDictationStats(
      JSON.stringify(v2),
      JSON.stringify({ totalWords: 9999, totalSeconds: 9999 }),
    );

    expect(stats).toEqual(v2);
  });

  it("falls back to empty stats for corrupt data", () => {
    expect(parseStoredDictationStats("{not json", null)).toEqual(
      DEFAULT_DICTATION_STATS,
    );
    expect(parseStoredDictationStats(null, null)).toEqual(
      DEFAULT_DICTATION_STATS,
    );
  });
});

describe("msUntilNextLocalDay", () => {
  it("counts down to the next local midnight", () => {
    expect(msUntilNextLocalDay(new Date(2026, 9, 27, 23, 59, 30))).toBe(30_000);
    expect(msUntilNextLocalDay(new Date(2026, 9, 27, 0, 0, 0))).toBeGreaterThan(
      23 * 60 * 60 * 1000,
    );
  });

  it("lands on a day whose streak no longer counts a missed yesterday", () => {
    let stats = record(DEFAULT_DICTATION_STATS, at(9, 26));
    const evening = new Date(2026, 9, 27, 21, 0, 0);
    expect(getCurrentStreak(stats.days, evening)).toBe(1);
    const nextDay = new Date(evening.getTime() + msUntilNextLocalDay(evening));
    expect(getCurrentStreak(stats.days, nextDay)).toBe(0);
    stats = record(stats, nextDay);
    expect(getCurrentStreak(stats.days, nextDay)).toBe(1);
  });
});
