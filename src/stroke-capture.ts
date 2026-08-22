import type { GuideStroke } from "./letters";

export interface Point {
  x: number;
  y: number;
  timestamp: number;
}

export type Stroke = Point[];

export interface StrokeCaptureOptions {
  onStrokeComplete?: (stroke: Stroke, allStrokes: Stroke[]) => void;
}

export interface GuideBounds {
  width: number;
  height: number;
}

// Fading-guidance levels for the warm-up "Development Sheet" sequence:
// each letter is traced 5 times, from fully dotted arrows down to a
// near-independent outline, before the pupil moves to the next letter.
// Levels are purely a rendering concern (dash density + opacity on the
// same reference geometry) - no new letter-path data is needed.
export const GUIDANCE_LEVEL_COUNT = 5;

// How much the guide grows while the pupil is actively touching it.
const GUIDE_TOUCH_SCALE = 1.05;

interface GuidanceStyle {
  dash: [number, number];
  opacity: number;
  showArrow: boolean;
}

const GUIDANCE_STYLES: GuidanceStyle[] = [
  { dash: [3, 3], opacity: 1.0, showArrow: true }, // fully dotted arrows
  { dash: [4, 5], opacity: 0.8, showArrow: true },
  { dash: [5, 7], opacity: 0.6, showArrow: false },
  { dash: [7, 10], opacity: 0.4, showArrow: false },
  { dash: [9, 15], opacity: 0.22, showArrow: false }, // near-independent outline
];

/**
 * Captures finger-touch strokes on a canvas as ordered {x, y, timestamp} points.
 * Mouse events are also handled so the canvas can be exercised during desktop
 * development, but no stylus/pressure-specific handling is implemented (out of scope).
 */
export class StrokeCapture {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private currentStroke: Point[] | null = null;
  private options: StrokeCaptureOptions;
  private guideStrokes: GuideStroke[] = [];
  private guideBounds: GuideBounds = { width: 1, height: 1 };
  private guideLevel = 0;
  private isTracingActive = false;

  constructor(canvas: HTMLCanvasElement, options: StrokeCaptureOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
    this.options = options;

    this.resize();
    window.addEventListener("resize", () => this.resize());

    canvas.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.handleTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", this.handleTouchEnd, { passive: false });

    canvas.addEventListener("mousedown", this.handleMouseDown);
    canvas.addEventListener("mousemove", this.handleMouseMove);
    canvas.addEventListener("mouseup", this.handleMouseUp);
    canvas.addEventListener("mouseleave", this.handleMouseUp);
  }

  getStrokes(): Stroke[] {
    return this.strokes;
  }

  /** `level` (0..GUIDANCE_LEVEL_COUNT-1) fades the guide from fully dotted (0) to a near-independent outline (last) - defaults to full guidance for the normal single-trace stages. */
  setGuide(strokes: GuideStroke[], bounds: GuideBounds, level = 0): void {
    this.guideStrokes = strokes;
    this.guideBounds = bounds;
    this.guideLevel = Math.min(Math.max(level, 0), GUIDANCE_STYLES.length - 1);
    this.redraw();
  }

  clear(): void {
    this.strokes = [];
    this.currentStroke = null;
    this.redraw();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  private pointFromClient(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      timestamp: performance.now(),
    };
  }

  private vibrate(durationMs: number): void {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(durationMs);
    }
  }

  private startStroke(point: Point): void {
    this.currentStroke = [point];
    this.isTracingActive = true;
    this.vibrate(10);
    this.redraw();
  }

  private extendStroke(point: Point): void {
    if (!this.currentStroke) return;
    this.currentStroke.push(point);
    this.redraw();
  }

  private endStroke(): void {
    this.isTracingActive = false;
    if (!this.currentStroke || this.currentStroke.length === 0) {
      this.currentStroke = null;
      this.redraw();
      return;
    }
    const finished = this.currentStroke;
    this.strokes.push(finished);
    this.currentStroke = null;
    this.vibrate(20);
    this.options.onStrokeComplete?.(finished, this.strokes);
    this.redraw();
  }

  private handleTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    this.startStroke(this.pointFromClient(touch.clientX, touch.clientY));
  };

  private handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    this.extendStroke(this.pointFromClient(touch.clientX, touch.clientY));
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    this.endStroke();
  };

  private handleMouseDown = (e: MouseEvent): void => {
    this.startStroke(this.pointFromClient(e.clientX, e.clientY));
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.currentStroke) return;
    this.extendStroke(this.pointFromClient(e.clientX, e.clientY));
  };

  private handleMouseUp = (): void => {
    this.endStroke();
  };

  private mapGuidePoint(p: { x: number; y: number }, scale: number, offsetX: number, offsetY: number) {
    return { x: offsetX + p.x * scale, y: offsetY + p.y * scale };
  }

  private computeGuideTransform(): { scale: number; offsetX: number; offsetY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const paddingRatio = 0.15;
    const availW = rect.width * (1 - paddingRatio * 2);
    const availH = rect.height * (1 - paddingRatio * 2);
    const baseScale = Math.min(availW / this.guideBounds.width, availH / this.guideBounds.height);
    // Subtle grow while actively touching, like the letter is being
    // pressed into a mold. Scale only - dash pattern/opacity (the actual
    // guidance level) are untouched, so this never restores visibility a
    // fading level has deliberately taken away, and by the time a trace
    // is submitted the touch has already ended and this has settled back
    // to 1, so it never affects the geometry used for scoring.
    const scale = baseScale * (this.isTracingActive ? GUIDE_TOUCH_SCALE : 1);
    const glyphW = this.guideBounds.width * scale;
    const glyphH = this.guideBounds.height * scale;
    return { scale, offsetX: (rect.width - glyphW) / 2, offsetY: (rect.height - glyphH) / 2 };
  }

  /** Guide strokes mapped into the same canvas pixel space the pupil draws in. */
  getGuideInCanvasSpace(): GuideStroke[] {
    const { scale, offsetX, offsetY } = this.computeGuideTransform();
    return this.guideStrokes.map((stroke) => stroke.map((p) => this.mapGuidePoint(p, scale, offsetX, offsetY)));
  }

  private drawArrowAt(stroke: GuideStroke, index: number, scale: number, offsetX: number, offsetY: number): void {
    const prevIdx = Math.max(0, index - 1);
    const nextIdx = Math.min(stroke.length - 1, index + 1);
    const a = this.mapGuidePoint(stroke[prevIdx], scale, offsetX, offsetY);
    const b = this.mapGuidePoint(stroke[nextIdx], scale, offsetX, offsetY);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const at = this.mapGuidePoint(stroke[index], scale, offsetX, offsetY);
    const size = 7;

    this.ctx.save();
    this.ctx.translate(at.x, at.y);
    this.ctx.rotate(angle);
    this.ctx.beginPath();
    this.ctx.moveTo(size, 0);
    this.ctx.lineTo(-size * 0.6, size * 0.6);
    this.ctx.lineTo(-size * 0.6, -size * 0.6);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Straight strokes (the stem) get one arrowhead right at the end,
   * pointing the direction of travel - matching the physical Development
   * Sheet's downward arrow at the bottom of the stem. Curved strokes (the
   * bowl) get a couple of arrows distributed along the path instead, since
   * a single point can't show a curve's rotational direction the way it
   * can a straight line. Straightness is measured rather than hardcoded
   * per letter, so this keeps working if the reference geometry changes.
   */
  private drawGuideArrows(stroke: GuideStroke, scale: number, offsetX: number, offsetY: number): void {
    if (stroke.length < 3) return;

    const first = stroke[0];
    const last = stroke[stroke.length - 1];
    const straightLineDist = Math.hypot(last.x - first.x, last.y - first.y);
    let pathLength = 0;
    for (let i = 1; i < stroke.length; i++) {
      pathLength += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    }
    const isStraight = pathLength > 0 && straightLineDist / pathLength > 0.9;

    if (isStraight) {
      this.drawArrowAt(stroke, stroke.length - 1, scale, offsetX, offsetY);
      return;
    }

    for (const t of [0.3, 0.7]) {
      const index = Math.round(t * (stroke.length - 1));
      this.drawArrowAt(stroke, index, scale, offsetX, offsetY);
    }
  }

  private drawGuide(): void {
    if (this.guideStrokes.length === 0) return;

    const { scale, offsetX, offsetY } = this.computeGuideTransform();
    const style = GUIDANCE_STYLES[this.guideLevel];

    this.ctx.save();
    this.ctx.globalAlpha = style.opacity;
    this.ctx.strokeStyle = "#c9c2b2";
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash(style.dash);
    for (const stroke of this.guideStrokes) {
      this.ctx.beginPath();
      stroke.forEach((p, i) => {
        const mapped = this.mapGuidePoint(p, scale, offsetX, offsetY);
        if (i === 0) this.ctx.moveTo(mapped.x, mapped.y);
        else this.ctx.lineTo(mapped.x, mapped.y);
      });
      this.ctx.stroke();
    }
    this.ctx.setLineDash([]);

    // Mark each stroke's start point so the intended drawing direction is
    // visible, not just the outline shape.
    this.ctx.fillStyle = "#7a9c6e";
    for (const stroke of this.guideStrokes) {
      if (stroke.length === 0) continue;
      const start = this.mapGuidePoint(stroke[0], scale, offsetX, offsetY);
      this.ctx.beginPath();
      this.ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // The most-guided levels also get directional arrows - the "textured
    // arrows" cue from the physical Development Sheet.
    if (style.showArrow) {
      for (const stroke of this.guideStrokes) this.drawGuideArrows(stroke, scale, offsetX, offsetY);
    }

    this.ctx.restore();
  }

  private drawStroke(stroke: Stroke): void {
    if (stroke.length < 2) return;
    this.ctx.save();
    this.ctx.strokeStyle = "#2b2b2b";
    this.ctx.lineWidth = 6;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      this.ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  private redraw(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.drawGuide();
    for (const stroke of this.strokes) {
      this.drawStroke(stroke);
    }
    if (this.currentStroke) {
      this.drawStroke(this.currentStroke);
    }
  }
}
