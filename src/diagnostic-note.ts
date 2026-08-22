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

export type Trend = "improving" | "declining" | "steady" | "insufficient-data";

export interface LetterFacts {
  letter: LetterId;
  trend: Trend;
  latestConfidencePct: number | null;
  confusionCount: number;
}

/** Everything computed deterministically from session history - trusted numbers a note generator (template or LLM) is only ever allowed to phrase, never invent or recompute. */
export interface DiagnosticFacts {
  pupilId: string;
  sessionsAnalyzed: number;
  letters: LetterFacts[];
  confusedLetters: LetterId[];
}

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

export function buildDiagnosticFacts(pupilData: PupilData): DiagnosticFacts {
  const recentSessions = pupilData.sessionLog.slice(-TREND_WINDOW);
  const letters: LetterFacts[] = [];
  const confusedLetters: LetterId[] = [];

  for (const pair of PAIRS) {
    for (const letter of pair) {
      const history = confidenceHistory(recentSessions, letter);
      const trend = describeTrend(history);
      const confusionCount = flagCount(recentSessions, letter, "directional-confusion");
      const latest = history.length > 0 ? history[history.length - 1] : null;

      if (confusionCount >= PERSISTENT_CONFUSION_THRESHOLD) confusedLetters.push(letter);
      letters.push({
        letter,
        trend,
        latestConfidencePct: latest !== null ? Math.round(latest * 100) : null,
        confusionCount,
      });
    }
  }

  return { pupilId: pupilData.pupilId, sessionsAnalyzed: recentSessions.length, letters, confusedLetters };
}

/** Deterministic, template-based phrasing of the facts - the fallback used when the AI call (generateDiagnosticNoteAI) is unavailable, times out, or returns something malformed. */
function renderDiagnosticNote(facts: DiagnosticFacts): DiagnosticNote {
  const perLetterNotes = facts.letters.map(({ letter, trend, latestConfidencePct, confusionCount }) => {
    const latest = latestConfidencePct !== null ? `${latestConfidencePct}%` : null;
    if (confusionCount >= PERSISTENT_CONFUSION_THRESHOLD) {
      return (
        `${letter}: directional confusion showed up in ${confusionCount} of the last ${facts.sessionsAnalyzed} sessions` +
        (latest !== null ? ` (currently ${latest} confident)` : "") +
        ` - worth a closer look at the direction it's drawn, not just whether the shape ends up right.`
      );
    }
    if (trend === "declining") return `${letter}: confidence has dipped recently${latest !== null ? ` (now ${latest})` : ""} - may be worth a warm-up refresher.`;
    if (trend === "improving") return `${letter}: steady improvement across recent sessions${latest !== null ? ` (now ${latest} confident)` : ""}.`;
    if (trend === "steady" && latest !== null) return `${letter}: holding steady at ${latest} confidence.`;
    return `${letter}: not enough sessions yet to read a trend.`;
  });

  let summary: string;
  if (facts.sessionsAnalyzed === 0) {
    summary = `${facts.pupilId} hasn't completed a session yet.`;
  } else if (facts.confusedLetters.length > 0) {
    summary = `${facts.pupilId} shows a recurring directional mix-up with ${facts.confusedLetters.join(" and ")} across recent sessions - this reads as the classic mirror-confusion pattern the physical blocks phase targets, not isolated carelessness.`;
  } else {
    summary = `${facts.pupilId} is progressing without a persistent directional confusion pattern across the last ${facts.sessionsAnalyzed} session${facts.sessionsAnalyzed === 1 ? "" : "s"}.`;
  }

  const recommendation =
    facts.confusedLetters.length > 0
      ? `Consider extra hands-on time with the physical letter blocks for ${facts.confusedLetters.join("/")} before the next digital session, focusing on the direction of the stroke rather than just the final shape.`
      : `No specific intervention flagged - continue with the regular session flow.`;

  return { pupilId: facts.pupilId, generatedAt: Date.now(), sessionsAnalyzed: facts.sessionsAnalyzed, summary, perLetterNotes, recommendation };
}

/** Deterministic diagnostic note, NOT a live LLM call. Kept as the fallback generateDiagnosticNoteAI() uses on any failure - never removed, since a working offline path matters more here than AI polish. */
export function generateDiagnosticNote(pupilData: PupilData): DiagnosticNote {
  return renderDiagnosticNote(buildDiagnosticFacts(pupilData));
}

interface AiNoteResponse {
  summary: string;
  perLetterNotes: string[];
  recommendation: string;
}

function isAiNoteResponse(value: unknown): value is AiNoteResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === "string" && typeof v.recommendation === "string" && Array.isArray(v.perLetterNotes) && v.perLetterNotes.every((n) => typeof n === "string");
}

/**
 * AI-personalized diagnostic note via the /api/diagnostic-note Vercel
 * function (Groq). The LLM only ever phrases buildDiagnosticFacts()'s
 * output - it never sees raw session logs and is never asked to compute a
 * trend or confidence number itself, so it can't hallucinate a diagnostic
 * fact that isn't true. Falls back to the deterministic template on any
 * failure: network error, timeout, non-200, or a malformed response -
 * this matters more here than most AI features because CLAUDE.md's
 * low-connectivity-classroom framing means the API may simply be
 * unreachable, and the report should never be blocked on that.
 */
export async function generateDiagnosticNoteAI(pupilData: PupilData): Promise<DiagnosticNote> {
  const facts = buildDiagnosticFacts(pupilData);

  try {
    const response = await fetch("/api/diagnostic-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(facts),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`/api/diagnostic-note returned ${response.status}`);

    const parsed: unknown = await response.json();
    if (!isAiNoteResponse(parsed)) throw new Error("Malformed AI note response shape");

    return {
      pupilId: facts.pupilId,
      generatedAt: Date.now(),
      sessionsAnalyzed: facts.sessionsAnalyzed,
      summary: parsed.summary,
      perLetterNotes: parsed.perLetterNotes,
      recommendation: parsed.recommendation,
    };
  } catch (err) {
    console.warn("AI diagnostic note unavailable, using deterministic fallback:", err);
    return renderDiagnosticNote(facts);
  }
}
