import { loadPupilData, listPupils, type PupilData } from "./persistence";
import { buildSessionSummary, type SessionSummaryData } from "./session-summary";
import { generateDiagnosticNote, type DiagnosticNote } from "./diagnostic-note";
import { ConfidenceTracker } from "./confidence";

export interface PupilReport {
  pupilData: PupilData;
  currentState: SessionSummaryData;
  note: DiagnosticNote;
}

export function listPupilIds(): string[] {
  return listPupils();
}

/** Assembles everything the teacher report needs for one pupil, straight from persisted data - no separate report-only storage. */
export function buildPupilReport(pupilId: string): PupilReport {
  const pupilData = loadPupilData(pupilId);
  const tracker = new ConfidenceTracker(pupilData.letters);
  const currentState = buildSessionSummary(pupilId, pupilData.sessionCount, tracker);
  const note = generateDiagnosticNote(pupilData);
  return { pupilData, currentState, note };
}
