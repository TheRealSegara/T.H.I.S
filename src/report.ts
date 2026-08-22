import { loadPupilData, listPupils, type PupilData } from "./persistence";
import { buildSessionSummary, type SessionSummaryData } from "./session-summary";
import { generateDiagnosticNoteAI, type DiagnosticNote } from "./diagnostic-note";
import { ConfidenceTracker } from "./confidence";

export interface PupilReport {
  pupilData: PupilData;
  currentState: SessionSummaryData;
  note: DiagnosticNote;
}

export async function listPupilIds(): Promise<string[]> {
  return listPupils();
}

/** Assembles everything the teacher report needs for one pupil, straight from persisted data - no separate report-only storage. The diagnostic note is AI-personalized (Groq) with an automatic deterministic fallback - see generateDiagnosticNoteAI. */
export async function buildPupilReport(pupilId: string): Promise<PupilReport> {
  const pupilData = await loadPupilData(pupilId);
  const tracker = new ConfidenceTracker(pupilData.letters);
  const currentState = buildSessionSummary(pupilId, pupilData.sessionCount, tracker);
  const note = await generateDiagnosticNoteAI(pupilData);
  return { pupilData, currentState, note };
}
