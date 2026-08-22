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
import "./style.css";

const pupilGate = document.getElementById("pupil-gate") as HTMLDivElement;
const pupilInput = document.getElementById("pupil-input") as HTMLInputElement;
const pupilStartBtn = document.getElementById("pupil-start-btn") as HTMLButtonElement;
const sessionView = document.getElementById("session-view") as HTMLDivElement;
const practiceView = document.getElementById("practice-view") as HTMLDivElement;
const summaryView = document.getElementById("summary-view") as HTMLDivElement;
const summaryListEl = document.getElementById("summary-list") as HTMLUListElement;
const newSessionBtn = document.getElementById("new-session-btn") as HTMLButtonElement;

const canvas = document.getElementById("trace-canvas") as HTMLCanvasElement;
const stageEl = document.getElementById("stage-label") as HTMLSpanElement;
const letterEl = document.getElementById("letter-label") as HTMLSpanElement;
const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
const strokeCountEl = document.getElementById("stroke-count") as HTMLSpanElement;
const pointCountEl = document.getElementById("point-count") as HTMLSpanElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;

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

function renderSummary(summary: SessionSummaryData): void {
  summaryListEl.innerHTML = "";
  for (const entry of summary.letters) {
    const li = document.createElement("li");
    li.className = "summary-row";

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

  function resetCounters(): void {
    strokeCountEl.textContent = "Strokes: 0";
    pointCountEl.textContent = "Last stroke points: 0";
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
      renderSummary(summary);
      return;
    }

    const letter = flow.getCurrentLetter() as LetterId;
    stageEl.textContent = `Stage: ${flow.getStage()}`;
    letterEl.textContent = `Trace: ${letter}`;
    capture.clear();
    capture.setGuide(LETTER_PATHS[letter], { width: GLYPH_WIDTH, height: GLYPH_HEIGHT });
    nextBtn.disabled = true;
    resetCounters();
  }

  nextBtn.addEventListener("click", () => {
    if (flow.isComplete()) return;
    const comparison = compareLetterAttempt(capture.getStrokes(), capture.getGuideInCanvasSpace());
    flow.submitAttempt(comparison);
    showCurrentPrompt();
  });

  clearBtn.addEventListener("click", () => {
    capture.clear();
    resetCounters();
    nextBtn.disabled = true;
  });

  showCurrentPrompt();
}
