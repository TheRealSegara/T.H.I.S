import type { LetterId } from "./letters";
import type { ConfidenceTracker, ConfidenceFlag } from "./confidence";
import { ALL_LETTERS } from "./persistence";

export interface LetterSummaryEntry {
  letter: LetterId;
  confidence: number | null;
  flag: ConfidenceFlag;
}

export interface SessionSummaryData {
  pupilId: string;
  sessionCount: number;
  letters: LetterSummaryEntry[];
}

/** Builds the per-letter breakdown shown at session end, and consumed by the cross-session diagnostic note (Phase 8) and teacher report (Phase 9). */
export function buildSessionSummary(pupilId: string, sessionCount: number, tracker: ConfidenceTracker): SessionSummaryData {
  return {
    pupilId,
    sessionCount,
    letters: ALL_LETTERS.map((letter) => ({
      letter,
      confidence: tracker.getConfidence(letter),
      flag: tracker.getFlag(letter),
    })),
  };
}

export function describeFlag(flag: ConfidenceFlag): string {
  switch (flag) {
    case "directional-confusion":
      return "Drawn the wrong way round, repeatedly";
    case "isolated-slip":
      return "One-off slip, not a pattern";
    case "insufficient-data":
      return "Not enough attempts yet";
    case "none":
      return "Steady";
  }
}
