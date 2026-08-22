import { StrokeCapture } from "./stroke-capture";
import { LETTER_PATHS, GLYPH_WIDTH, GLYPH_HEIGHT, type LetterId } from "./letters";
import { compareLetterAttempt } from "./stroke-comparison";
import { ConfidenceTracker } from "./confidence";
import { SessionFlowController } from "./session-flow";
import {
  ALL_LETTERS,
  confidenceDroppedLastSession,
  getLastPupilId,
  loadPupilData,
  savePupilData,
  type PersistedLetterState,
} from "./persistence";
import { buildSessionSummary, describeFlag, type SessionSummaryData } from "./session-summary";
import { buildPupilReport, listPupilIds } from "./report";
import { STAGE_LABELS, letterPrompt, pairOf } from "./copy";
import "./style.css";

const pupilGate = document.getElementById("pupil-gate") as HTMLDivElement;
const pupilInput = document.getElementById("pupil-input") as HTMLInputElement;
const pupilStartBtn = document.getElementById("pupil-start-btn") as HTMLButtonElement;
const sessionView = document.getElementById("session-view") as HTMLDivElement;
const practiceView = document.getElementById("practice-view") as HTMLDivElement;
const summaryView = document.getElementById("summary-view") as HTMLDivElement;
const summaryListEl = document.getElementById("summary-list") as HTMLUListElement;
const newSessionBtn = document.getElementById("new-session-btn") as HTMLButtonElement;
const summaryReportLink = document.getElementById("summary-report-link") as HTMLAnchorElement;

const appEl = document.getElementById("app") as HTMLDivElement;
const reportView = document.getElementById("report-view") as HTMLDivElement;
const reportBackLink = document.getElementById("report-back-link") as HTMLAnchorElement;
const reportPupilList = document.getElementById("report-pupil-list") as HTMLDivElement;
const reportPupilDetail = document.getElementById("report-pupil-detail") as HTMLDivElement;

const canvas = document.getElementById("trace-canvas") as HTMLCanvasElement;
const stageEl = document.getElementById("stage-label") as HTMLSpanElement;
const letterEl = document.getElementById("letter-label") as HTMLSpanElement;
const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
const strokeCountEl = document.getElementById("stroke-count") as HTMLSpanElement;
const pointCountEl = document.getElementById("point-count") as HTMLSpanElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const pieceProgressEl = document.getElementById("piece-progress") as HTMLDivElement;

const lastPupil = getLastPupilId();
if (lastPupil) pupilInput.value = lastPupil;

pupilStartBtn.addEventListener("click", () => {
  const pupilId = pupilInput.value.trim();
  if (!pupilId) return;
  pupilGate.hidden = true;
  sessionView.hidden = false;
  practiceView.hidden = false;
  summaryView.hidden = true;
  startSession(pupilId);
});

newSessionBtn.addEventListener("click", () => {
  location.reload();
});

function parseReportRoute(hash: string): { pupilId: string | null } | null {
  const match = hash.match(/^#\/report(?:\/(.+))?$/);
  if (!match) return null;
  return { pupilId: match[1] ? decodeURIComponent(match[1]) : null };
}

function renderPupilList(): void {
  reportPupilDetail.hidden = true;
  reportPupilList.hidden = false;
  reportPupilList.innerHTML = "";

  const pupils = listPupilIds();
  if (pupils.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No pupils recorded on this device yet.";
    reportPupilList.append(p);
    return;
  }

  const ul = document.createElement("ul");
  for (const id of pupils) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#/report/${encodeURIComponent(id)}`;
    a.textContent = `🧒 ${id}`;
    li.append(a);
    ul.append(li);
  }
  reportPupilList.append(ul);
}

function renderPupilDetail(pupilId: string): void {
  reportPupilList.hidden = true;
  reportPupilDetail.hidden = false;
  reportPupilDetail.innerHTML = "";

  const { pupilData, currentState, note } = buildPupilReport(pupilId);

  const heading = document.createElement("h2");
  heading.textContent = `${pupilId} — ${pupilData.sessionCount} session${pupilData.sessionCount === 1 ? "" : "s"}`;
  reportPupilDetail.append(heading);

  const noteSection = document.createElement("div");
  noteSection.className = "report-section report-section--pattern";
  const noteTitle = document.createElement("h2");
  noteTitle.textContent = "🎯 Diagnostic note";
  const noteSummary = document.createElement("p");
  noteSummary.textContent = note.summary;
  const noteRec = document.createElement("p");
  noteRec.textContent = note.recommendation;
  const noteList = document.createElement("ul");
  for (const line of note.perLetterNotes) {
    const li = document.createElement("li");
    li.textContent = line;
    noteList.append(li);
  }
  noteSection.append(noteTitle, noteSummary, noteRec, noteList);
  reportPupilDetail.append(noteSection);

  const lettersSection = document.createElement("div");
  lettersSection.className = "report-section report-section--stats";
  const lettersTitle = document.createElement("h2");
  lettersTitle.textContent = "📊 Current per-letter confidence";
  lettersSection.append(lettersTitle);
  for (const entry of currentState.letters) {
    const p = document.createElement("p");
    p.className = `report-trend pair-${pairOf(entry.letter)}`;
    p.textContent = `${entry.letter}: ${entry.confidence === null ? "no data" : Math.round(entry.confidence * 100) + "%"} — ${describeFlag(entry.flag)}`;
    lettersSection.append(p);
  }
  reportPupilDetail.append(lettersSection);
}

function renderRoute(): void {
  const route = parseReportRoute(location.hash);
  appEl.classList.toggle("context-teacher", route !== null);

  if (route) {
    pupilGate.hidden = true;
    sessionView.hidden = true;
    reportView.hidden = false;
    reportBackLink.href = route.pupilId ? "#/report" : "#";

    if (route.pupilId) renderPupilDetail(route.pupilId);
    else renderPupilList();
    return;
  }

  reportView.hidden = true;
  sessionView.hidden = true;
  pupilGate.hidden = false;
}

window.addEventListener("hashchange", renderRoute);
renderRoute();

function renderSummary(summary: SessionSummaryData): void {
  summaryListEl.innerHTML = "";
  for (const entry of summary.letters) {
    const li = document.createElement("li");
    li.className = `summary-row pair-${pairOf(entry.letter)}`;

    const letterSpan = document.createElement("span");
    letterSpan.className = "summary-letter";
    letterSpan.textContent = entry.letter;

    const details = document.createElement("div");
    details.className = "summary-details";

    const confidenceP = document.createElement("span");
    confidenceP.className = "summary-confidence";
    confidenceP.textContent =
      entry.confidence === null ? "No attempts recorded" : `${Math.round(entry.confidence * 100)}% confident`;

    const flagP = document.createElement("span");
    flagP.className = `summary-flag flag-${entry.flag}`;
    flagP.textContent = describeFlag(entry.flag);

    details.append(confidenceP, flagP);
    li.append(letterSpan, details);
    summaryListEl.append(li);
  }
}

function startSession(pupilId: string): void {
  const pupilData = loadPupilData(pupilId);
  const isFirstSession = pupilData.sessionCount === 0;
  const confidenceDropped = confidenceDroppedLastSession(pupilData);

  const tracker = new ConfidenceTracker(pupilData.letters);
  const sessionStartConfidence = new Map<LetterId, number | null>(
    ALL_LETTERS.map((letter) => [letter, tracker.getConfidence(letter)]),
  );

  const flow = new SessionFlowController(tracker, {
    isFirstSession,
    confidenceDroppedSinceLastSession: confidenceDropped,
  });

  const capture = new StrokeCapture(canvas, {
    onStrokeComplete: (stroke, allStrokes) => {
      strokeCountEl.textContent = `Strokes: ${allStrokes.length}`;
      pointCountEl.textContent = `Last stroke points: ${stroke.length}`;
      nextBtn.disabled = allStrokes.length === 0;
    },
  });

  const completedLetters: LetterId[] = [];

  function resetCounters(): void {
    strokeCountEl.textContent = "Strokes: 0";
    pointCountEl.textContent = "Last stroke points: 0";
  }

  function renderPieceProgress(): void {
    pieceProgressEl.innerHTML = "";
    for (const letter of completedLetters) {
      const chip = document.createElement("div");
      chip.className = `piece-chip pair-${pairOf(letter)}`;
      pieceProgressEl.append(chip);
    }
  }

  function finalizeSession(): SessionSummaryData {
    const summary = buildSessionSummary(pupilId, pupilData.sessionCount + 1, tracker);

    const letters: typeof pupilData.letters = {};
    for (const letter of ALL_LETTERS) {
      const state = tracker.exportState()[letter];
      if (!state) continue;
      const endedSessionBelowStart = tracker.hasConfidenceDropped(letter, sessionStartConfidence.get(letter) ?? null);
      letters[letter] = { ...state, endedSessionBelowStart } satisfies PersistedLetterState;
    }

    savePupilData({
      pupilId,
      sessionCount: pupilData.sessionCount + 1,
      lastSessionAt: Date.now(),
      letters,
      sessionLog: [
        ...pupilData.sessionLog,
        { completedAt: Date.now(), letters: Object.fromEntries(summary.letters.map((e) => [e.letter, { confidence: e.confidence, flag: e.flag }])) },
      ].slice(-20),
    });

    return summary;
  }

  function showCurrentPrompt(): void {
    if (flow.isComplete()) {
      const summary = finalizeSession();
      practiceView.hidden = true;
      summaryView.hidden = false;
      summaryReportLink.href = `#/report/${encodeURIComponent(pupilId)}`;
      renderSummary(summary);
      return;
    }

    const letter = flow.getCurrentLetter() as LetterId;
    stageEl.textContent = STAGE_LABELS[flow.getStage()];
    letterEl.textContent = letterPrompt(letter);
    practiceView.classList.toggle("pair-bd", pairOf(letter) === "bd");
    practiceView.classList.toggle("pair-pq", pairOf(letter) === "pq");
    capture.clear();
    capture.setGuide(LETTER_PATHS[letter], { width: GLYPH_WIDTH, height: GLYPH_HEIGHT });
    nextBtn.disabled = true;
    resetCounters();
  }

  nextBtn.addEventListener("click", () => {
    if (flow.isComplete()) return;
    const justTracedLetter = flow.getCurrentLetter() as LetterId;
    const comparison = compareLetterAttempt(capture.getStrokes(), capture.getGuideInCanvasSpace());
    flow.submitAttempt(comparison);
    completedLetters.push(justTracedLetter);
    renderPieceProgress();
    showCurrentPrompt();
  });

  clearBtn.addEventListener("click", () => {
    capture.clear();
    resetCounters();
    nextBtn.disabled = true;
  });

  showCurrentPrompt();
}
