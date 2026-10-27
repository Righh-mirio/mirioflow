export type DictationDay = {
  words: number;
  seconds: number;
  dictations: number;
};

export type DictationStats = {
  totalWords: number;
  totalSeconds: number;
  /** Per local calendar date, keyed "YYYY-MM-DD". */
  days: Record<string, DictationDay>;
  /** Words and seconds from dictations long enough to count towards speed. */
  speedWords: number;
  speedSeconds: number;
  /** Speed of the most recent dictation that counted towards speed. */
  lastWordsPerMinute: number | null;
};

export type DictationWeekDay = {
  dateKey: string;
  initial: string;
  words: number;
  isToday: boolean;
};

export type DictationSummary = {
  currentStreak: number;
  longestStreak: number;
  wordsPerMinute: number | null;
  lastWordsPerMinute: number | null;
  week: DictationWeekDay[];
};

export const DEFAULT_DICTATION_STATS: DictationStats = {
  totalWords: 0,
  totalSeconds: 0,
  days: {},
  speedWords: 0,
  speedSeconds: 0,
  lastWordsPerMinute: null,
};

export const DICTATION_STATS_STORAGE_KEY = "gladiaflow.dictation.stats.v2";
export const LEGACY_DICTATION_STATS_STORAGE_KEY =
  "gladiaflow.dictation.stats.v1";

/** Dictations shorter than this are left out of words-per-minute. */
export const MIN_SPEED_DICTATION_SECONDS = 2;

const nonNegative = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar date of `date` as "YYYY-MM-DD". */
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const fromDateKey = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** The calendar day before `key`. Uses local dates, so DST changes are safe. */
export const previousDateKey = (key: string): string => {
  const date = fromDateKey(key);
  return toDateKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1),
  );
};

/** Milliseconds from `now` until the next local midnight. */
export const msUntilNextLocalDay = (now: Date): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
  now.getTime();

const hasDictation = (days: Record<string, DictationDay>, key: string) =>
  (days[key]?.dictations ?? 0) > 0;

export const getWordsPerMinute = (
  words: number,
  seconds: number,
): number | null => (seconds > 0 ? (words / seconds) * 60 : null);

export const recordDictation = (
  stats: DictationStats,
  dictation: { words: number; seconds: number; at: Date },
): DictationStats => {
  const words = nonNegative(dictation.words);
  const seconds = nonNegative(dictation.seconds);
  const key = toDateKey(dictation.at);
  const day = stats.days[key] ?? { words: 0, seconds: 0, dictations: 0 };
  const countsForSpeed = seconds >= MIN_SPEED_DICTATION_SECONDS;

  return {
    totalWords: stats.totalWords + words,
    totalSeconds: stats.totalSeconds + seconds,
    days: {
      ...stats.days,
      [key]: {
        words: day.words + words,
        seconds: day.seconds + seconds,
        dictations: day.dictations + 1,
      },
    },
    speedWords: stats.speedWords + (countsForSpeed ? words : 0),
    speedSeconds: stats.speedSeconds + (countsForSpeed ? seconds : 0),
    lastWordsPerMinute: countsForSpeed
      ? getWordsPerMinute(words, seconds)
      : stats.lastWordsPerMinute,
  };
};

/**
 * Consecutive days with at least one dictation, counting back from today. With
 * no dictation yet today the count starts from yesterday, so an active streak
 * does not read 0 until the first dictation of the day.
 */
export const getCurrentStreak = (
  days: Record<string, DictationDay>,
  today: Date,
): number => {
  let key = toDateKey(today);
  if (!hasDictation(days, key)) {
    key = previousDateKey(key);
  }
  let streak = 0;
  while (hasDictation(days, key)) {
    streak += 1;
    key = previousDateKey(key);
  }
  return streak;
};

export const getLongestStreak = (
  days: Record<string, DictationDay>,
): number => {
  let longest = 0;
  for (const key of Object.keys(days)) {
    // Only count runs from their first day.
    if (!hasDictation(days, key) || hasDictation(days, previousDateKey(key))) {
      continue;
    }
    let length = 0;
    let cursor = fromDateKey(key);
    while (hasDictation(days, toDateKey(cursor))) {
      length += 1;
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
      );
    }
    longest = Math.max(longest, length);
  }
  return longest;
};

/** The last `count` days ending today, oldest first. */
export const getRecentDays = (
  days: Record<string, DictationDay>,
  today: Date,
  count = 7,
  locale?: string,
): DictationWeekDay[] => {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const todayKey = toDateKey(today);
  const result: DictationWeekDay[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - offset,
    );
    const dateKey = toDateKey(date);
    result.push({
      dateKey,
      initial: formatter.format(date),
      words: days[dateKey]?.words ?? 0,
      isToday: dateKey === todayKey,
    });
  }
  return result;
};

export const summarizeDictationStats = (
  stats: DictationStats,
  today: Date,
  locale?: string,
): DictationSummary => ({
  currentStreak: getCurrentStreak(stats.days, today),
  longestStreak: getLongestStreak(stats.days),
  wordsPerMinute: getWordsPerMinute(stats.speedWords, stats.speedSeconds),
  lastWordsPerMinute: stats.lastWordsPerMinute,
  week: getRecentDays(stats.days, today, 7, locale),
});

const parseDays = (value: unknown): Record<string, DictationDay> => {
  if (!value || typeof value !== "object") return {};
  const days: Record<string, DictationDay> = {};
  for (const [key, day] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== "object") {
      continue;
    }
    const record = day as Partial<DictationDay>;
    days[key] = {
      words: nonNegative(record.words),
      seconds: nonNegative(record.seconds),
      dictations: nonNegative(record.dictations),
    };
  }
  return days;
};

/**
 * Reads v2 stats, or migrates v1 totals when no v2 data exists yet. v1 had no
 * per-day or speed data, so its totals also seed the overall speed.
 */
export const parseStoredDictationStats = (
  v2Raw: string | null,
  v1Raw: string | null,
): DictationStats => {
  try {
    if (v2Raw) {
      const parsed = JSON.parse(v2Raw) as Partial<DictationStats>;
      const last = Number(parsed.lastWordsPerMinute);
      return {
        totalWords: nonNegative(parsed.totalWords),
        totalSeconds: nonNegative(parsed.totalSeconds),
        days: parseDays(parsed.days),
        speedWords: nonNegative(parsed.speedWords),
        speedSeconds: nonNegative(parsed.speedSeconds),
        lastWordsPerMinute:
          parsed.lastWordsPerMinute != null && Number.isFinite(last)
            ? Math.max(0, last)
            : null,
      };
    }
    if (v1Raw) {
      const parsed = JSON.parse(v1Raw) as {
        totalWords?: unknown;
        totalSeconds?: unknown;
      };
      const totalWords = nonNegative(parsed.totalWords);
      const totalSeconds = nonNegative(parsed.totalSeconds);
      return {
        ...DEFAULT_DICTATION_STATS,
        totalWords,
        totalSeconds,
        speedWords: totalWords,
        speedSeconds: totalSeconds,
      };
    }
  } catch (error) {
    console.warn("Failed to load dictation stats:", error);
  }
  return DEFAULT_DICTATION_STATS;
};

export const loadDictationStats = (
  storage: Pick<Storage, "getItem">,
): DictationStats => {
  try {
    return parseStoredDictationStats(
      storage.getItem(DICTATION_STATS_STORAGE_KEY),
      storage.getItem(LEGACY_DICTATION_STATS_STORAGE_KEY),
    );
  } catch (error) {
    console.warn("Failed to read dictation stats:", error);
    return DEFAULT_DICTATION_STATS;
  }
};

export const getDictationComment = (totalSeconds: number): string => {
  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 5) return "Warming up the vocal cords. Keep going.";
  if (totalMinutes < 30) return "Nice pace. Your keyboard is getting jealous.";
  if (totalMinutes < 120) return "You definitely really like to talk.";
  if (totalMinutes < 300)
    return "At this point your voice has a gym membership.";
  return "Legendary mic endurance unlocked.";
};
