import { useEffect, useMemo, useState } from "react";
import {
  type DictationStats,
  msUntilNextLocalDay,
  summarizeDictationStats,
} from "../lib/dictationStats";
import { ApiKeyField } from "./ApiKeyField";
import { VoiceWaveIndicator } from "./VoiceWaveIndicator";
import { FinalizingSpinner } from "./FinalizingSpinner";

export function HomeView({
  isRecording,
  audioLevel,
  isProcessing,
  homeTitle,
  homeSubtitle,
  dictationStats,
  formattedTotalTime,
  funnyDictationComment,
  apiKeyDisplayValue,
  isApiKeyLocked,
  hasSavedApiKey,
  isTestingApiKey,
  onChangeApiKey,
  onSaveApiKey,
  permissions,
  isMac,
  onRecheck,
  onStopDictation,
  errorMessage,
  onOpenLogs,
  onDismissError,
  now,
}: {
  isRecording: boolean;
  audioLevel: number;
  isProcessing: boolean;
  homeTitle: string;
  homeSubtitle: string | null;
  dictationStats: DictationStats;
  formattedTotalTime: string;
  funnyDictationComment: string;
  apiKeyDisplayValue: string;
  isApiKeyLocked: boolean;
  hasSavedApiKey: boolean;
  isTestingApiKey: boolean;
  onChangeApiKey: (v: string) => void;
  onSaveApiKey: () => void;
  permissions: { hotkeyError: string | null };
  isMac: boolean;
  onRecheck: () => void;
  onStopDictation: () => void;
  errorMessage: string | null;
  onOpenLogs: () => void;
  onDismissError: () => void;
  now?: Date;
}) {
  const nowTime = now?.getTime();
  // The app lives in the tray for days, so "today" must move on by itself:
  // refresh at local midnight and whenever the window becomes visible again.
  const [clockTime, setClockTime] = useState(() => Date.now());
  useEffect(() => {
    if (nowTime !== undefined) return;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      timer = setTimeout(
        () => {
          setClockTime(Date.now());
          scheduleMidnight();
        },
        msUntilNextLocalDay(new Date()) + 1000,
      );
    };
    scheduleMidnight();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setClockTime(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [nowTime]);
  const summaryTime = nowTime ?? clockTime;
  const summary = useMemo(
    () => summarizeDictationStats(dictationStats, new Date(summaryTime)),
    [dictationStats, summaryTime],
  );
  const maxWeekWords = Math.max(0, ...summary.week.map((day) => day.words));
  const weekTotalWords = summary.week.reduce((sum, day) => sum + day.words, 0);
  const dayLabelFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const formatDays = (count: number) =>
    `${count.toLocaleString()} ${count === 1 ? "day" : "days"}`;

  return (
    <div className="setup-step setup-step-center setup-step-home">
      {(isRecording || isProcessing) && (
        <div
          className={`ready-icon ${isRecording ? "recording" : ""} ${isProcessing ? "processing" : ""}`}
        >
          {isRecording ? (
            <VoiceWaveIndicator isListening={isRecording} level={audioLevel} />
          ) : (
            <FinalizingSpinner />
          )}
        </div>
      )}

      <h2
        className={`setup-title ${isRecording ? "setup-title-listening" : ""}`}
      >
        {homeTitle}
      </h2>

      {homeSubtitle && <p className="setup-desc">{homeSubtitle}</p>}

      {hasSavedApiKey && (
        <div className="dictation-stats-card">
          <h3 className="dictation-stats-title">Dictation stats</h3>
          <div className="dictation-stats-grid">
            <div className="dictation-stat">
              <span className="dictation-stat-label">Streak</span>
              <strong className="dictation-stat-value">
                {formatDays(summary.currentStreak)}
              </strong>
              <span className="dictation-stat-detail">
                Best {formatDays(summary.longestStreak)}
              </span>
            </div>
            <div className="dictation-stat">
              <span className="dictation-stat-label">Words / min</span>
              <strong className="dictation-stat-value">
                {summary.wordsPerMinute === null
                  ? "\u2013"
                  : Math.round(summary.wordsPerMinute).toLocaleString()}
              </strong>
              {summary.lastWordsPerMinute !== null && (
                <span className="dictation-stat-detail">
                  Last {Math.round(summary.lastWordsPerMinute).toLocaleString()}
                </span>
              )}
            </div>
            <div className="dictation-stat">
              <span className="dictation-stat-label">Words</span>
              <strong className="dictation-stat-value">
                {Math.round(dictationStats.totalWords).toLocaleString()}
              </strong>
            </div>
            <div className="dictation-stat">
              <span className="dictation-stat-label">Total time</span>
              <strong className="dictation-stat-value">
                {formattedTotalTime}
              </strong>
            </div>
          </div>
          {/* Hidden while dictating so the Stop button stays in view. */}
          {!isRecording && !isProcessing && (
            <div
              className="dictation-stats-week"
              role="img"
              aria-label={`Words per day, last 7 days: ${summary.week
                .map(
                  (day) =>
                    `${dayLabelFormatter.format(parseDateKey(day.dateKey))} ${day.words.toLocaleString()}`,
                )
                .join(
                  ", ",
                )}. ${weekTotalWords.toLocaleString()} words this week.`}
            >
              {summary.week.map((day) => {
                const words = Math.round(day.words);
                const height =
                  words > 0 && maxWeekWords > 0
                    ? Math.max(4, (day.words / maxWeekWords) * 100)
                    : 0;
                return (
                  <div
                    key={day.dateKey}
                    className={`dictation-stats-day${day.isToday ? " dictation-stats-day--today" : ""}`}
                    title={`${dayLabelFormatter.format(parseDateKey(day.dateKey))}: ${words.toLocaleString()} ${words === 1 ? "word" : "words"}`}
                  >
                    <div className="dictation-stats-day-track">
                      <div
                        className="dictation-stats-day-bar"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="dictation-stats-day-label">
                      {day.initial}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="dictation-stats-comment">{funnyDictationComment}</p>
        </div>
      )}

      <div className="home-api-slot">
        <details className="home-api-spoiler" open={!isApiKeyLocked}>
          <summary>Edit API key</summary>
          <div className="home-api-section">
            <p className="home-api-section-label">API key</p>
            <ApiKeyField
              displayValue={apiKeyDisplayValue}
              isLocked={isApiKeyLocked}
              isTesting={isTestingApiKey}
              onChangeKey={onChangeApiKey}
              onSave={onSaveApiKey}
            />
          </div>
        </details>
      </div>

      {errorMessage && !isRecording && !isProcessing && (
        <div className="permission-banner permission-banner--constrained">
          <p className="text-danger">Last dictation failed</p>
          <p className="text-secondary text-secondary--spaced">
            {errorMessage}
          </p>
          <div className="permission-actions permission-actions--spaced">
            <button className="btn btn-ghost btn-sm" onClick={onOpenLogs}>
              Open logs folder
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onDismissError}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {permissions.hotkeyError && !isRecording && (
        <div className="permission-banner permission-banner--constrained">
          <p className="text-danger">Hotkey monitor failed to start.</p>
          <p className="text-secondary text-secondary--spaced">
            {isMac
              ? "Make sure Accessibility is enabled. Use Re-check after granting in Settings."
              : "Try restarting the app. The hotkey shortcut may be in use by another application."}
          </p>
          <div className="permission-actions permission-actions--spaced">
            <button className="btn btn-ghost btn-sm" onClick={onRecheck}>
              Re-check
            </button>
          </div>
        </div>
      )}

      {(isRecording || isProcessing) && (
        <div className="setup-nav">
          {isRecording ? (
            <button className="btn btn-primary" onClick={onStopDictation}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled>
              Finalizing...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
