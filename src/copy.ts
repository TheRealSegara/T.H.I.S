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

export type PairId = "bd" | "pq";

export function pairOf(letter: LetterId): PairId {
  return letter === "b" || letter === "d" ? "bd" : "pq";
}
