import type { Point, Stroke } from "./stroke-capture";
import type { GuideStroke } from "./letters";

export interface StrokeComparisonResult {
  shapeScore: number; // 0-1, 1 = traced the outline closely
  directionScore: number; // 0-1, 1 = traveled the same direction as the guide throughout
  hesitationScore: number; // 0-1, 1 = smooth pacing, no pauses
  hesitationPointIndices: number[]; // indices into the pupil stroke where a pause was detected
}

export interface LetterComparisonResult {
  strokeCountMatch: boolean;
  strokes: StrokeComparisonResult[];
  overallShapeScore: number;
  overallDirectionScore: number;
  overallHesitationScore: number;
}

interface Vec2 {
  x: number;
  y: number;
}

const RESAMPLE_COUNT = 32;

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

/** Resamples a polyline to `count` evenly arc-length-spaced points, so strokes with different numbers of raw points (or different drawing speeds) become comparable. */
function resample(points: Vec2[], count: number): Vec2[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array(count).fill(points[0]);

  const total = pathLength(points);
  if (total === 0) return Array(count).fill(points[0]);

  const step = total / (count - 1);
  const result: Vec2[] = [points[0]];
  let prev = points[0];
  let segmentIndex = 1;
  let accumulated = 0;
  let target = step;

  while (result.length < count && segmentIndex < points.length) {
    const curr = points[segmentIndex];
    const segLen = distance(prev, curr);

    if (accumulated + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - accumulated) / segLen;
      result.push({ x: prev.x + (curr.x - prev.x) * t, y: prev.y + (curr.y - prev.y) * t });
      target += step;
    } else {
      accumulated += segLen;
      prev = curr;
      segmentIndex++;
    }
  }

  while (result.length < count) result.push(points[points.length - 1]);
  return result;
}

function boundingBoxDiagonal(points: Vec2[]): number {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return Math.hypot(width, height) || 1;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Average resampled point-to-point distance, normalized by the guide's own size so the score doesn't depend on how big the letter was drawn. */
function compareShape(pupil: Vec2[], guide: Vec2[]): number {
  const rp = resample(pupil, RESAMPLE_COUNT);
  const rg = resample(guide, RESAMPLE_COUNT);
  const normalizer = boundingBoxDiagonal(rg);

  let total = 0;
  for (let i = 0; i < RESAMPLE_COUNT; i++) total += distance(rp[i], rg[i]);
  const avgDistance = total / RESAMPLE_COUNT;

  return clamp01(1 - avgDistance / normalizer);
}

function heading(a: Vec2, b: Vec2): number | null {
  if (a.x === b.x && a.y === b.y) return null;
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function angleDifference(a: number, b: number): number {
  let diff = Math.abs(a - b) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}

/** Compares the sequence of movement headings along each resampled path — this is what catches a bowl traced the wrong way round, not just the wrong shape. */
function compareDirection(pupil: Vec2[], guide: Vec2[]): number {
  const steps = 16;
  const rp = resample(pupil, steps);
  const rg = resample(guide, steps);

  const diffs: number[] = [];
  for (let i = 1; i < steps; i++) {
    const hp = heading(rp[i - 1], rp[i]);
    const hg = heading(rg[i - 1], rg[i]);
    if (hp === null || hg === null) continue;
    diffs.push(angleDifference(hp, hg));
  }
  if (diffs.length === 0) return 1;

  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return clamp01(1 - avgDiff / Math.PI);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Flags points where the pupil paused mid-stroke well beyond their own typical pace for this stroke, rather than against a fixed global timing threshold. */
function detectHesitation(pupil: Point[]): { score: number; hesitationPointIndices: number[] } {
  if (pupil.length < 3) return { score: 1, hesitationPointIndices: [] };

  const deltas: number[] = [];
  for (let i = 1; i < pupil.length; i++) deltas.push(pupil[i].timestamp - pupil[i - 1].timestamp);

  const typicalGap = Math.max(median(deltas), 1);
  const threshold = Math.max(typicalGap * 3, 120);

  const hesitationPointIndices: number[] = [];
  deltas.forEach((d, i) => {
    if (d > threshold) hesitationPointIndices.push(i + 1);
  });

  const hesitationRatio = hesitationPointIndices.length / deltas.length;
  return { score: clamp01(1 - hesitationRatio * 2), hesitationPointIndices };
}

function compareStroke(pupil: Stroke, guide: GuideStroke): StrokeComparisonResult {
  const { score: hesitationScore, hesitationPointIndices } = detectHesitation(pupil);
  return {
    shapeScore: compareShape(pupil, guide),
    directionScore: compareDirection(pupil, guide),
    hesitationScore,
    hesitationPointIndices,
  };
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compares a pupil's captured strokes for one letter attempt against that
 * letter's reference guide. Strokes are matched by order (the pupil is
 * expected to draw stem then bowl, matching the reference) — if the pupil
 * drew a different number of strokes than the reference, only the
 * overlapping strokes are scored and strokeCountMatch is false.
 */
export function compareLetterAttempt(pupilStrokes: Stroke[], guideStrokes: GuideStroke[]): LetterComparisonResult {
  const strokeCountMatch = pupilStrokes.length === guideStrokes.length;
  const count = Math.min(pupilStrokes.length, guideStrokes.length);

  const strokes: StrokeComparisonResult[] = [];
  for (let i = 0; i < count; i++) {
    strokes.push(compareStroke(pupilStrokes[i], guideStrokes[i]));
  }

  return {
    strokeCountMatch,
    strokes,
    overallShapeScore: average(strokes.map((s) => s.shapeScore)),
    overallDirectionScore: average(strokes.map((s) => s.directionScore)),
    overallHesitationScore: average(strokes.map((s) => s.hesitationScore)),
  };
}
