// Hand-authored line icons (24x24, stroke=currentColor) replacing emoji
// throughout the app - emoji render inconsistently across platforms and
// read as unstyled next to a designed color/type system. Used for content
// main.ts generates dynamically; the same markup is hand-copied into
// index.html for static spots.

const STROKE_ATTRS = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const ICON_CLIPBOARD = `<svg viewBox="0 0 24 24" width="1em" height="1em" ${STROKE_ATTRS}><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/></svg>`;

export const ICON_REFRESH = `<svg viewBox="0 0 24 24" width="1em" height="1em" ${STROKE_ATTRS}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>`;

export const ICON_TARGET = `<svg viewBox="0 0 24 24" width="1em" height="1em" ${STROKE_ATTRS}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`;

export const ICON_CHART = `<svg viewBox="0 0 24 24" width="1em" height="1em" ${STROKE_ATTRS}><line x1="5" y1="20" x2="5" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="19" y1="20" x2="19" y2="14"/></svg>`;

export const ICON_PERSON = `<svg viewBox="0 0 24 24" width="1em" height="1em" ${STROKE_ATTRS}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`;

export const ICON_ARROW_LEFT = `<svg viewBox="0 0 24 24" width="1em" height="1em" ${STROKE_ATTRS}><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>`;

// The brand mark: two interlocking puzzle pieces in the fixed pair colors
// (must stay in sync with --color-pair-bd / --color-pair-pq in
// style.css - this is a deliberate brand mark, not a themeable icon, so
// it always shows both colors regardless of context).
export function puzzleIconColor(size = 32): string {
  const h = Math.round(size / 2);
  return `<svg width="${size}" height="${h}" viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="24" height="24" rx="7" fill="#3e7cb8"/><rect x="32" y="4" width="24" height="24" rx="7" fill="#d9639e"/><circle cx="30" cy="16" r="6" fill="#3e7cb8"/></svg>`;
}

// Monochrome variant (fill: currentColor) for low-opacity scattered
// background decoration, where the tint comes from the wrapping
// element's `color` so the same markup can appear in several accent
// colors across a screen.
export function puzzleIconMono(size = 32): string {
  const h = Math.round(size / 2);
  return `<svg width="${size}" height="${h}" viewBox="0 0 64 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="24" height="24" rx="7"/><rect x="32" y="4" width="24" height="24" rx="7"/><circle cx="30" cy="16" r="6"/></svg>`;
}
