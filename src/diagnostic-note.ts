import type { LetterId } from "./letters";
import type { PupilData, SessionSummaryRecord } from "./persistence";
import type { ConfidenceFlag } from "./confidence";

export interface DiagnosticNote {
  pupilId: string;
  generatedAt: number;
  sessionsAnalyzed: number;
  summary: string;
  perLetterNotes: string[];
  recommendation: string;
}

const PAIRS: [LetterId, LetterId][] = [
  ["b", "d"],
  ["p", "q"],
];

const TREND_WINDOW = 5;
const TREND_DELTA_THRESHOLD = 0.1;
const PERSISTENT_CONFUSION_THRESHOLD = 2; // sessions, out of the trend window

type Trend = "improving" | "declining" | "steady" | "insufficient-data";

function confidenceHistory(sessions: SessionSummaryRecord[], letter: LetterId): number[] {
  return sessions.map((s) => s.letters[letter]?.confidence ?? null).filter((v): v is number => v !== null);
}

function describeTrend(values: number[]): Trend {
  if (values.length < 2) return "insufficient-data";
  const delta = values[values.length - 1] - values[0];
  if (delta > TREND_DELTA_THRESHOLD) return "improving";
  if (delta < -TREND_DELTA_THRESHOLD) return "declining";
  return "steady";
}

function flagCount(sessions: SessionSummaryRecord[], letter: LetterId, flag: ConfidenceFlag): number {
  return sessions.filter((s) => s.letters[letter]?.flag === flag).length;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Deterministic, template-based diagnostic note generator - NOT a live LLM
 * call. Wiring a real model call here needs a provider choice and an API
 * key, which can't live in this static frontend without a small backend to
 * hold the secret; that's a project-owner decision (provider, hosting,
 * cost), not something to bake in silently. This function produces the
 * same plain-language, teacher-facing shape a prompted model would be
 * asked for, from the same structured cross-session input, so it's a
 * drop-in placeholder: swapping the implementation later doesn't need to
 * change anything that calls generateDiagnosticNote().
 */
export function generateDiagnosticNote(pupilData: PupilData): DiagnosticNote {
  const recentSessions = pupilData.sessionLog.slice(-TREND_WINDOW);
  const perLetterNotes: string[] = [];
  const confusedLetters: LetterId[] = [];

  for (const pair of PAIRS) {
    for (const letter of pair) {
      const history = confidenceHistory(recentSessions, letter);
      const trend = describeTrend(history);
      const confusionCount = flagCount(recentSessions, letter, "directional-confusion");
      const latest = history.length > 0 ? history[history.length - 1] : null;

      if (confusionCount >= PERSISTENT_CONFUSION_THRESHOLD) {
        confusedLetters.push(letter);
        perLetterNotes.push(
          `${letter}: directional confusion showed up in ${confusionCount} of the last ${recentSessions.length} sessions` +
            (latest !== null ? ` (currently ${pct(latest)} confident)` : "") +
            ` - worth a closer look at the direction it's drawn, not just whether the shape ends up right.`,
        );
      } else if (trend === "declining") {
        perLetterNotes.push(`${letter}: confidence has dipped recently${latest !== null ? ` (now ${pct(latest)})` : ""} - may be worth a warm-up refresher.`);
      } else if (trend === "improving") {
        perLetterNotes.push(`${letter}: steady improvement across recent sessions${latest !== null ? ` (now ${pct(latest)} confident)` : ""}.`);
      } else if (trend === "steady" && latest !== null) {
        perLetterNotes.push(`${letter}: holding steady at ${pct(latest)} confidence.`);
      } else {
        perLetterNotes.push(`${letter}: not enough sessions yet to read a trend.`);
      }
    }
  }

  let summary: string;
  if (recentSessions.length === 0) {
    summary = `${pupilData.pupilId} hasn't completed a session yet.`;
  } else if (confusedLetters.length > 0) {
    summary = `${pupilData.pupilId} shows a recurring directional mix-up with ${confusedLetters.join(" and ")} across recent sessions - this reads as the classic mirror-confusion pattern the physical blocks phase targets, not isolated carelessness.`;
  } else {
    summary = `${pupilData.pupilId} is progressing without a persistent directional confusion pattern across the last ${recentSessions.length} session${recentSessions.length === 1 ? "" : "s"}.`;
  }

  const recommendation =
    confusedLetters.length > 0
      ? `Consider extra hands-on time with the physical letter blocks for ${confusedLetters.join("/")} before the next digital session, focusing on the direction of the stroke rather than just the final shape.`
      : `No specific intervention flagged - continue with the regular session flow.`;

  return {
    pupilId: pupilData.pupilId,
    generatedAt: Date.now(),
    sessionsAnalyzed: recentSessions.length,
    summary,
    perLetterNotes,
    recommendation,
  };
}
