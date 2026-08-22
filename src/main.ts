import { StrokeCapture } from "./stroke-capture";
import { LETTER_PATHS, GLYPH_WIDTH, GLYPH_HEIGHT, type LetterId } from "./letters";
import "./style.css";

const canvas = document.getElementById("trace-canvas") as HTMLCanvasElement;
const strokeCountEl = document.getElementById("stroke-count") as HTMLSpanElement;
const pointCountEl = document.getElementById("point-count") as HTMLSpanElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const letterButtons = document.querySelectorAll<HTMLButtonElement>("#letter-picker button");

const capture = new StrokeCapture(canvas, {
  onStrokeComplete: (stroke, allStrokes) => {
    strokeCountEl.textContent = `Strokes: ${allStrokes.length}`;
    pointCountEl.textContent = `Last stroke points: ${stroke.length}`;
    console.log("Stroke captured:", stroke);
  },
});

function resetCounters(): void {
  strokeCountEl.textContent = "Strokes: 0";
  pointCountEl.textContent = "Last stroke points: 0";
}

function selectLetter(letter: LetterId): void {
  capture.clear();
  capture.setGuide(LETTER_PATHS[letter], { width: GLYPH_WIDTH, height: GLYPH_HEIGHT });
  resetCounters();
  letterButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.letter === letter));
}

letterButtons.forEach((btn) => {
  btn.addEventListener("click", () => selectLetter(btn.dataset.letter as LetterId));
});

selectLetter("b");

clearBtn.addEventListener("click", () => {
  capture.clear();
  resetCounters();
});
