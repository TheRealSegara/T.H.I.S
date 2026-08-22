import type { LetterId } from "./letters";
import type { LetterConfidenceState, ConfidenceFlag } from "./confidence";

export const ALL_LETTERS: LetterId[] = ["b", "d", "p", "q"];

export interface PersistedLetterState extends LetterConfidenceState {
  // Whether this letter's confidence ended the session lower than it
  // started. There's no new data between sessions to compare against at
  // the moment a new session begins, so "confidence dropped since last
  // session" is read as "did last session end on a downward note for this
  // letter" - computed once, at the end of that session, and stored here
  // for the next session to read directly.
  endedSessionBelowStart: boolean;
}

export interface SessionSummaryRecord {
  completedAt: number;
  letters: Partial<Record<LetterId, { confidence: number | null; flag: ConfidenceFlag }>>;
}

export interface PupilData {
  pupilId: string;
  sessionCount: number;
  lastSessionAt: number | null;
  letters: Partial<Record<LetterId, PersistedLetterState>>;
  sessionLog: SessionSummaryRecord[];
}

const STORAGE_PREFIX = "this-digital:pupil:";
const PUPIL_INDEX_KEY = "this-digital:pupils";
const LAST_PUPIL_KEY = "this-digital:last-pupil";
const SESSION_LOG_LIMIT = 20;

function storageKey(pupilId: string): string {
  return `${STORAGE_PREFIX}${pupilId}`;
}

function emptyPupilData(pupilId: string): PupilData {
  return { pupilId, sessionCount: 0, lastSessionAt: null, letters: {}, sessionLog: [] };
}

export function listPupils(): string[] {
  try {
    const raw = localStorage.getItem(PUPIL_INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveIndex(pupilId: string): void {
  const pupils = new Set(listPupils());
  pupils.add(pupilId);
  localStorage.setItem(PUPIL_INDEX_KEY, JSON.stringify([...pupils]));
}

export function getLastPupilId(): string | null {
  try {
    return localStorage.getItem(LAST_PUPIL_KEY);
  } catch {
    return null;
  }
}

export function loadPupilData(pupilId: string): PupilData {
  try {
    const raw = localStorage.getItem(storageKey(pupilId));
    if (raw) return JSON.parse(raw) as PupilData;
  } catch {
    // Corrupt or inaccessible storage - fall through to a fresh profile
    // rather than blocking the pupil from a session.
  }
  return emptyPupilData(pupilId);
}

export function savePupilData(data: PupilData): void {
  saveIndex(data.pupilId);
  localStorage.setItem(LAST_PUPIL_KEY, data.pupilId);
  localStorage.setItem(storageKey(data.pupilId), JSON.stringify(data));
}

/** Whether any letter ended last session with confidence lower than that session started with. Feeds the warm-up/skip decision (Phase 5). */
export function confidenceDroppedLastSession(data: PupilData): boolean {
  return ALL_LETTERS.some((letter) => data.letters[letter]?.endedSessionBelowStart ?? false);
}

export function appendSessionSummary(data: PupilData, summary: SessionSummaryRecord): SessionSummaryRecord[] {
  return [...data.sessionLog, summary].slice(-SESSION_LOG_LIMIT);
}
