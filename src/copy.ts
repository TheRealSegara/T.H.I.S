import type { SessionStage } from "./session-flow";

// Building-blocks motif: session stages and prompts are framed as
// constructing something, matching the physical letter blocks that are
// the product's actual first phase (see CLAUDE.md) rather than a generic
// UI vocabulary.
export const STAGE_LABELS: Record<SessionStage, string> = {
  warmup: "Warm-up Blocks",
  "pair-bd": "b/d Block Match",
  "pair-pq": "p/q Block Match",
  resurface: "Extra Blocks",
  "cross-mix": "Mixed Blocks",
  summary: "Tower Complete",
};

export function letterPrompt(letter: string): string {
  return `Build: ${letter}`;
}
