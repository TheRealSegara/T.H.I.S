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
import "./style.css";

const pupilGate = document.getElementById("pupil-gate") as HTMLDivElement;
const pupilInput = document.getElementById("pupil-input") as HTMLInputElement;
const pupilStartBtn = document.getElementById("pupil-start-btn") as HTMLButtonElement;
const sessionView = document.getElementById("session-view") as HTMLDivElement;

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
  startSession(pupilId);
});

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

  function finalizeSession(): void {
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
        {
          completedAt: Date.now(),
          letters: Object.fromEntries(
            ALL_LETTERS.map((letter) => [letter, { confidence: tracker.getConfidence(letter), flag: tracker.getFlag(letter) }]),
          ),
        },
      ].slice(-20),
    });
  }

  function showCurrentPrompt(): void {
    if (flow.isComplete()) {
      stageEl.textContent = "Stage: summary";
      letterEl.textContent = "Session complete";
      nextBtn.disabled = true;
      capture.clear();
      capture.setGuide([], { width: 1, height: 1 });
      resetCounters();
      finalizeSession();
      console.log(
        "Session finished for",
        pupilId,
        (["b", "d", "p", "q"] as LetterId[]).map((letter) => ({
          letter,
          confidence: tracker.getConfidence(letter),
          flag: tracker.getFlag(letter),
        })),
      );
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
