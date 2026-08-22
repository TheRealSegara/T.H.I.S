export interface GuidePoint {
  x: number;
  y: number;
}

export type GuideStroke = GuidePoint[];

export type LetterId = "b" | "d" | "p" | "q";

// Shared glyph grid (letter-local units), identical for all four letters so
// they scale to the same size on screen regardless of which is shown.
export const GLYPH_WIDTH = 60;
export const ASCENDER_TOP = 0;
export const XHEIGHT_TOP = 45;
export const BASELINE = 100;
export const DESCENDER_BOTTOM = 145;
export const GLYPH_HEIGHT = DESCENDER_BOTTOM;

const BOWL_RADIUS = (BASELINE - XHEIGHT_TOP) / 2;
const BOWL_CENTER_Y = (BASELINE + XHEIGHT_TOP) / 2;

const STEM_SAMPLES = 10;
const BOWL_SAMPLES = 40;

function sampleLine(from: GuidePoint, to: GuidePoint, steps: number): GuideStroke {
  const points: GuideStroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return points;
}

function sampleArc(center: GuidePoint, radius: number, startDeg: number, endDeg: number, steps: number): GuideStroke {
  const points: GuideStroke = [];
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startRad + (endRad - startRad) * t;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return points;
}

interface LetterConfig {
  stemSide: "left" | "right";
  stemExtent: "ascender" | "descender";
}

/**
 * Generates the two-stroke reference path (stem, then bowl) for one of
 * b/d/p/q from stem side + extent, so the mirror relationships between the
 * four letters come from the geometry instead of being hand-tuned per
 * letter:
 *  - b/d mirror horizontally: stem side, bowl side, and winding direction
 *    all flip.
 *  - b/p (and d/q) share stem side and winding; only the stem's vertical
 *    extent changes (ascender above x-height vs. descender below baseline).
 * Angles use canvas convention (0deg = right, increasing = clockwise on
 * screen since y grows downward).
 */
function generateLetterPath(config: LetterConfig): GuideStroke[] {
  const { stemSide, stemExtent } = config;

  const stemX = stemSide === "left" ? 0 : GLYPH_WIDTH;
  const bowlCenterX = stemSide === "left" ? stemX + BOWL_RADIUS : stemX - BOWL_RADIUS;
  const bowlCenter: GuidePoint = { x: bowlCenterX, y: BOWL_CENTER_Y };

  const stemTopY = stemExtent === "ascender" ? ASCENDER_TOP : XHEIGHT_TOP;
  const stemBottomY = stemExtent === "ascender" ? BASELINE : DESCENDER_BOTTOM;

  const stemStroke = sampleLine({ x: stemX, y: stemTopY }, { x: stemX, y: stemBottomY }, STEM_SAMPLES);

  // Attachment point is where the bowl touches the stem (the side of the
  // circle nearest the stem): leftmost point (180deg) when the stem is on
  // the left, rightmost point (0deg) when the stem is on the right.
  // Left-stem bowls trace clockwise from there (left -> top -> right ->
  // bottom -> left), matching the real "down the stem, back up, over the
  // top, around" motion for b/p. Right-stem bowls trace the horizontal
  // mirror of that: counter-clockwise from the right (right -> top -> left
  // -> bottom -> right), for d/q.
  const bowlStroke =
    stemSide === "left"
      ? sampleArc(bowlCenter, BOWL_RADIUS, 180, 540, BOWL_SAMPLES)
      : sampleArc(bowlCenter, BOWL_RADIUS, 0, -360, BOWL_SAMPLES);

  return [stemStroke, bowlStroke];
}

export const LETTER_PATHS: Record<LetterId, GuideStroke[]> = {
  b: generateLetterPath({ stemSide: "left", stemExtent: "ascender" }),
  d: generateLetterPath({ stemSide: "right", stemExtent: "ascender" }),
  p: generateLetterPath({ stemSide: "left", stemExtent: "descender" }),
  q: generateLetterPath({ stemSide: "right", stemExtent: "descender" }),
};
