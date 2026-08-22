import { StrokeCapture } from "./stroke-capture";
import { LETTER_PATHS, GLYPH_WIDTH, GLYPH_HEIGHT, type LetterId } from "./letters";
import { compareLetterAttempt } from "./stroke-comparison";
import { ConfidenceTracker } from "./confidence";
import { SessionFlowController } from "./session-flow";
import "./style.css";

const canvas = document.getElementById("trace-canvas") as HTMLCanvasElement;
const stageEl = document.getElementById("stage-label") as HTMLSpanElement;
const letterEl = document.getElementById("letter-label") as HTMLSpanElement;
const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
const strokeCountEl = document.getElementById("stroke-count") as HTMLSpanElement;
const pointCountEl = document.getElementById("point-count") as HTMLSpanElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;

const tracker = new ConfidenceTracker();
// TODO(Phase 6): isFirstSession / confidenceDroppedSinceLastSession will
// come from persisted pupil data instead of being hardcoded here.
const flow = new SessionFlowController(tracker, {
  isFirstSession: true,
  confidenceDroppedSinceLastSession: false,
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

function showCurrentPrompt(): void {
  if (flow.isComplete()) {
    stageEl.textContent = "Stage: summary";
    letterEl.textContent = "Session complete";
    nextBtn.disabled = true;
    capture.clear();
    capture.setGuide([], { width: 1, height: 1 });
    resetCounters();
    console.log(
      "Session finished. Confidence:",
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
