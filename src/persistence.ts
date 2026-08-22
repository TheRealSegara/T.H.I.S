import type { LetterId } from "./letters";
import type { LetterConfidenceState, ConfidenceFlag } from "./confidence";
import { requireSupabase } from "./supabase-client";

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

// Pupil data lives in Supabase (table: pupils) so the teacher report can be
// reached from any device, not just the one the pupil practiced on. Only
// the last-typed pupil name (a pure prefill convenience, not data of
// record) still lives in localStorage - it's meaningless without a device
// anyway, and keeping it there avoids a network round trip just to
// pre-fill a text box.
const LAST_PUPIL_KEY = "this-digital:last-pupil";
const SESSION_LOG_LIMIT = 20;

interface PupilRow {
  pupil_id: string;
  session_count: number;
  last_session_at: string | null;
  letters: PupilData["letters"];
  session_log: SessionSummaryRecord[];
}

function rowToPupilData(row: PupilRow): PupilData {
  return {
    pupilId: row.pupil_id,
    sessionCount: row.session_count,
    lastSessionAt: row.last_session_at ? new Date(row.last_session_at).getTime() : null,
    letters: row.letters ?? {},
    sessionLog: row.session_log ?? [],
  };
}

function emptyPupilData(pupilId: string): PupilData {
  return { pupilId, sessionCount: 0, lastSessionAt: null, letters: {}, sessionLog: [] };
}

export async function listPupils(): Promise<string[]> {
  const { data, error } = await requireSupabase().from("pupils").select("pupil_id").order("updated_at", { ascending: false });
  if (error) {
    console.error("listPupils failed:", error.message);
    return [];
  }
  return data.map((row) => row.pupil_id);
}

export function getLastPupilId(): string | null {
  try {
    return localStorage.getItem(LAST_PUPIL_KEY);
  } catch {
    return null;
  }
}

function setLastPupilId(pupilId: string): void {
  try {
    localStorage.setItem(LAST_PUPIL_KEY, pupilId);
  } catch {
    // Best-effort convenience only - a blocked/full localStorage
    // shouldn't stop a session from starting.
  }
}

export async function loadPupilData(pupilId: string): Promise<PupilData> {
  const { data, error } = await requireSupabase().from("pupils").select("*").eq("pupil_id", pupilId).maybeSingle();
  if (error) {
    console.error("loadPupilData failed, starting fresh:", error.message);
    return emptyPupilData(pupilId);
  }
  return data ? rowToPupilData(data as PupilRow) : emptyPupilData(pupilId);
}

export async function savePupilData(data: PupilData): Promise<void> {
  setLastPupilId(data.pupilId);

  const row = {
    pupil_id: data.pupilId,
    session_count: data.sessionCount,
    last_session_at: data.lastSessionAt ? new Date(data.lastSessionAt).toISOString() : null,
    letters: data.letters,
    session_log: data.sessionLog,
    updated_at: new Date().toISOString(),
  };

  const { error } = await requireSupabase().from("pupils").upsert(row, { onConflict: "pupil_id" });
  if (error) {
    // Surfaced to the caller rather than swallowed: losing a session's
    // results silently would be worse than a visible error, since there's
    // no local fallback copy once persistence itself is the network call.
    throw new Error(`Could not save session results: ${error.message}`);
  }
}

/** Whether any letter ended last session with confidence lower than that session started with. Feeds the warm-up/skip decision (Phase 5). */
export function confidenceDroppedLastSession(data: PupilData): boolean {
  return ALL_LETTERS.some((letter) => data.letters[letter]?.endedSessionBelowStart ?? false);
}

export function appendSessionSummary(data: PupilData, summary: SessionSummaryRecord): SessionSummaryRecord[] {
  return [...data.sessionLog, summary].slice(-SESSION_LOG_LIMIT);
}
