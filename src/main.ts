import { StrokeCapture } from "./stroke-capture";
import "./style.css";

const canvas = document.getElementById("trace-canvas") as HTMLCanvasElement;
const strokeCountEl = document.getElementById("stroke-count") as HTMLSpanElement;
const pointCountEl = document.getElementById("point-count") as HTMLSpanElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;

const capture = new StrokeCapture(canvas, {
  onStrokeComplete: (stroke, allStrokes) => {
    strokeCountEl.textContent = `Strokes: ${allStrokes.length}`;
    pointCountEl.textContent = `Last stroke points: ${stroke.length}`;
    console.log("Stroke captured:", stroke);
  },
});

clearBtn.addEventListener("click", () => {
  capture.clear();
  strokeCountEl.textContent = "Strokes: 0";
  pointCountEl.textContent = "Last stroke points: 0";
});
