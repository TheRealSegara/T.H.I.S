import type { LetterId } from "./letters";

export interface WordCue {
  emoji: string;
  word: string;
}

// Shown during warm-up only, connecting each letter to common words so
// tracing isn't purely mechanical - mirrors the physical Development
// Sheet's picture cues. b's set (ball/boy/bottle/bear) was given
// directly; d/p/q are my own picks for equally common, concrete,
// clearly-illustrated words and worth checking against whatever
// curriculum wordlist the physical sheets actually use.
export const LETTER_WORD_CUES: Record<LetterId, WordCue[]> = {
  b: [
    { emoji: "🏀", word: "ball" },
    { emoji: "👦", word: "boy" },
    { emoji: "🍼", word: "bottle" },
    { emoji: "🐻", word: "bear" },
  ],
  d: [
    { emoji: "🐶", word: "dog" },
    { emoji: "🦆", word: "duck" },
    { emoji: "🥁", word: "drum" },
    { emoji: "🚪", word: "door" },
  ],
  p: [
    { emoji: "🐷", word: "pig" },
    { emoji: "🍕", word: "pizza" },
    { emoji: "🖊️", word: "pen" },
    { emoji: "🎃", word: "pumpkin" },
  ],
  q: [
    { emoji: "👑", word: "queen" },
    { emoji: "🦆", word: "quack" },
    { emoji: "🧶", word: "quilt" },
    { emoji: "❓", word: "quiz" },
  ],
};
