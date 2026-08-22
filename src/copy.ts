import type { SessionStage } from "./session-flow";
import type { LetterId } from "./letters";

// Puzzle-piece motif, matching the physical letter blocks: b/d interlock
// as one pair, p/q interlock as the other, and each pair has its own
// colour on the physical pieces (b/d blue, p/q pink) - see CLAUDE.md and
// pairOf() below, which the UI colour-coding is driven from.
export const STAGE_LABELS: Record<SessionStage, string> = {
  warmup: "Warm-up Pieces",
  "pair-bd": "b/d Piece Match",
  "pair-pq": "p/q Piece Match",
  resurface: "Extra Pieces",
  "cross-mix": "Mixed Pieces",
  summary: "Pieces Complete",
};

export function letterPrompt(letter: string): string {
  return `Fit: ${letter}`;
}

// Shown once when the stage changes, never per-attempt: T.H.I.S. is an
// assessment, not a chat coach like G.I.S.T.'s Ori, so nothing here
// reacts to individual traces - that would nudge the very behaviour
// (stroke direction, hesitation) the app is trying to measure honestly.
// Warmth lives at the boundaries between stages, not inside them.
export const STAGE_VOICE_LINES: Record<SessionStage, string> = {
  warmup: "Let's warm up with each letter on its own.",
  "pair-bd": "Time to tell b and d apart!",
  "pair-pq": "Now let's tell p and q apart!",
  resurface: "Let's practice those a little more.",
  "cross-mix": "Great work - let's mix them all together!",
  summary: "All pieces fitted for this session.",
};

export type PairId = "bd" | "pq";

export function pairOf(letter: LetterId): PairId {
  return letter === "b" || letter === "d" ? "bd" : "pq";
}
