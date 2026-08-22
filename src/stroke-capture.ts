export interface Point {
  x: number;
  y: number;
  timestamp: number;
}

export type Stroke = Point[];

export interface StrokeCaptureOptions {
  onStrokeComplete?: (stroke: Stroke, allStrokes: Stroke[]) => void;
}

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

  private startStroke(point: Point): void {
    this.currentStroke = [point];
  }

  private extendStroke(point: Point): void {
    if (!this.currentStroke) return;
    this.currentStroke.push(point);
    this.redraw();
  }

  private endStroke(): void {
    if (!this.currentStroke || this.currentStroke.length === 0) {
      this.currentStroke = null;
      return;
    }
    const finished = this.currentStroke;
    this.strokes.push(finished);
    this.currentStroke = null;
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

  private drawGuide(): void {
    // Placeholder guide outline proving the capture pipeline works.
    // Replaced with real per-letter reference paths (b/d/p/q) in Phase 2.
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const r = Math.min(rect.width, rect.height) * 0.25;

    this.ctx.save();
    this.ctx.strokeStyle = "#c9c2b2";
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([6, 8]);
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.moveTo(cx + r, cy - r * 1.6);
    this.ctx.lineTo(cx + r, cy + r);
    this.ctx.stroke();
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
