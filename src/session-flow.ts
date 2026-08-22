import type { LetterId } from "./letters";
import { ConfidenceTracker } from "./confidence";
import type { LetterComparisonResult } from "./stroke-comparison";

export type SessionStage = "warmup" | "pair-bd" | "pair-pq" | "resurface" | "cross-mix" | "summary";

export interface SessionFlowOptions {
  isFirstSession: boolean;
  confidenceDroppedSinceLastSession: boolean;
}

const WARMUP_LETTERS: LetterId[] = ["b", "d", "p", "q"];
const PAIR_BD: LetterId[] = ["b", "d"];
const PAIR_PQ: LetterId[] = ["p", "q"];

// Safety valve, not a pedagogical rule: resurfacing could otherwise loop
// indefinitely if a letter never clears the confidence bar in one sitting.
// After this many resurface rounds the session moves on regardless, and
// the still-weak letters simply carry into next session's warm-up check.
const MAX_RESURFACE_ROUNDS = 2;

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Drives the locked session flow (see CLAUDE.md): warm-up only on Session 1
 * or after a confidence drop, then b/d pair discrimination, then p/q pair
 * discrimination, then either cross-pair mixing (both pairs confident) or
 * resurfacing the weak letters within the same session.
 */
export class SessionFlowController {
  private tracker: ConfidenceTracker;
  private stage: SessionStage;
  private queue: LetterId[];
  private resurfaceRounds = 0;

  constructor(tracker: ConfidenceTracker, options: SessionFlowOptions) {
    this.tracker = tracker;
    if (options.isFirstSession || options.confidenceDroppedSinceLastSession) {
      this.stage = "warmup";
      this.queue = [...WARMUP_LETTERS];
    } else {
      this.stage = "pair-bd";
      this.queue = shuffle(PAIR_BD);
    }
  }

  getStage(): SessionStage {
    return this.stage;
  }

  getCurrentLetter(): LetterId | null {
    return this.queue[0] ?? null;
  }

  isComplete(): boolean {
    return this.stage === "summary";
  }

  private getWeakLetters(pair: LetterId[]): LetterId[] {
    return pair.filter((letter) => !this.tracker.isReasonablyConfident(letter));
  }

  private advanceStage(): void {
    switch (this.stage) {
      case "warmup":
        this.stage = "pair-bd";
        this.queue = shuffle(PAIR_BD);
        return;

      case "pair-bd":
        this.stage = "pair-pq";
        this.queue = shuffle(PAIR_PQ);
        return;

      case "pair-pq":
      case "resurface": {
        const weakBd = this.getWeakLetters(PAIR_BD);
        const weakPq = this.getWeakLetters(PAIR_PQ);
        const bothPairsConfident = weakBd.length === 0 && weakPq.length === 0;

        if (bothPairsConfident || this.resurfaceRounds >= MAX_RESURFACE_ROUNDS) {
          this.stage = "cross-mix";
          this.queue = shuffle([...PAIR_BD, ...PAIR_PQ]);
        } else {
          this.resurfaceRounds++;
          this.stage = "resurface";
          this.queue = shuffle([...weakBd, ...weakPq]);
        }
        return;
      }

      case "cross-mix":
        this.stage = "summary";
        this.queue = [];
        return;

      case "summary":
        return;
    }
  }

  /** Records the comparison result for the current letter and advances to the next prompt (or the next stage, or the session summary). */
  submitAttempt(comparison: LetterComparisonResult): void {
    const letter = this.queue[0];
    if (!letter) return;

    this.tracker.recordAttempt(letter, comparison);
    this.queue.shift();

    if (this.queue.length === 0) {
      this.advanceStage();
    }
  }
}
