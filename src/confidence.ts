import type { LetterId } from "./letters";
import type { LetterComparisonResult } from "./stroke-comparison";

export interface AttemptRecord {
  timestamp: number;
  shapeScore: number;
  directionScore: number;
  hesitationScore: number;
  attemptScore: number;
}

export interface LetterConfidenceState {
  confidence: number | null; // null = no attempts recorded yet
  history: AttemptRecord[];
}

export type ConfidenceFlag = "insufficient-data" | "none" | "isolated-slip" | "directional-confusion";

// Direction weighted equally to shape (not lower) because these are
// mirror-confusion pairs: a shape can look right while being drawn the
// wrong way round, which is exactly the confusion this app is meant to
// catch. Hesitation is a secondary signal.
const SHAPE_WEIGHT = 0.4;
const DIRECTION_WEIGHT = 0.4;
const HESITATION_WEIGHT = 0.2;

// Recency-weighted average: a single lucky or unlucky attempt shouldn't
// swing confidence much, but a sustained change shows up quickly.
const EMA_ALPHA = 0.35;

const HISTORY_LIMIT = 8;
const RECENT_WINDOW = 5;

// Internal routing thresholds only - these drive session-flow decisions
// (warm-up vs. skip, resurface vs. move on), never a pupil-facing grade.
const CONFIDENT_THRESHOLD = 0.7;
const LOW_SCORE_THRESHOLD = 0.55;
const CONFIDENCE_DROP_THRESHOLD = 0.15;

export function scoreAttempt(comparison: LetterComparisonResult): number {
  return (
    comparison.overallShapeScore * SHAPE_WEIGHT +
    comparison.overallDirectionScore * DIRECTION_WEIGHT +
    comparison.overallHesitationScore * HESITATION_WEIGHT
  );
}

/**
 * Tracks weighted, consistency-aware confidence per letter (b/d/p/q).
 * Confidence is an exponential moving average of attempt scores rather
 * than a running accuracy percentage or a streak counter, so it reflects
 * sustained performance without hard "N correct in a row" thresholds.
 */
export class ConfidenceTracker {
  private state: Partial<Record<LetterId, LetterConfidenceState>>;

  constructor(initial?: Partial<Record<LetterId, LetterConfidenceState>>) {
    this.state = initial ? structuredClone(initial) : {};
  }

  recordAttempt(letter: LetterId, comparison: LetterComparisonResult, timestamp = Date.now()): AttemptRecord {
    const attemptScore = scoreAttempt(comparison);
    const record: AttemptRecord = {
      timestamp,
      shapeScore: comparison.overallShapeScore,
      directionScore: comparison.overallDirectionScore,
      hesitationScore: comparison.overallHesitationScore,
      attemptScore,
    };

    const existing = this.state[letter];
    const prevConfidence = existing?.confidence ?? null;
    const nextConfidence =
      prevConfidence === null ? attemptScore : prevConfidence + EMA_ALPHA * (attemptScore - prevConfidence);

    const history = [...(existing?.history ?? []), record].slice(-HISTORY_LIMIT);
    this.state[letter] = { confidence: nextConfidence, history };
    return record;
  }

  getConfidence(letter: LetterId): number | null {
    return this.state[letter]?.confidence ?? null;
  }

  getHistory(letter: LetterId): AttemptRecord[] {
    return this.state[letter]?.history ?? [];
  }

  isReasonablyConfident(letter: LetterId): boolean {
    const confidence = this.getConfidence(letter);
    return confidence !== null && confidence >= CONFIDENT_THRESHOLD;
  }

  /** Compares current confidence against a confidence value carried over from a previous session (see persistence, Phase 6). */
  hasConfidenceDropped(letter: LetterId, previousSessionConfidence: number | null): boolean {
    const current = this.getConfidence(letter);
    if (current === null || previousSessionConfidence === null) return false;
    return previousSessionConfidence - current > CONFIDENCE_DROP_THRESHOLD;
  }

  /**
   * Distinguishes a one-off mistake from a real directional confusion
   * pattern, so the session summary (Phase 7) can tell a teacher which one
   * it's looking at instead of just "got it wrong sometimes".
   */
  getFlag(letter: LetterId): ConfidenceFlag {
    const history = this.getHistory(letter);
    if (history.length < 2) return "insufficient-data";

    const recent = history.slice(-RECENT_WINDOW);

    const lowDirectionCount = recent.filter((r) => r.directionScore < LOW_SCORE_THRESHOLD).length;
    if (lowDirectionCount >= Math.ceil(recent.length / 2)) return "directional-confusion";

    const lowOverallCount = recent.filter((r) => r.attemptScore < LOW_SCORE_THRESHOLD).length;
    if (lowOverallCount === 1) return "isolated-slip";

    return "none";
  }

  exportState(): Partial<Record<LetterId, LetterConfidenceState>> {
    return structuredClone(this.state);
  }
}
