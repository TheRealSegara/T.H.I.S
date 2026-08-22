# T.H.I.S. Digital — Project Context for Claude Code

## What T.H.I.S. Is

**T.H.I.S.** originally stood for **Tactile Holistic Intervention for Shape-recognition** — a physical remedial literacy kit using letter blocks to help pupils with letter-shape confusion (e.g. mirror-confusion pairs like b/d, p/q). It was built from real observation of remedial ESL learners, including practicum experience at a rural Malaysian primary school (SK Singat, Sibu, Sarawak).

**T.H.I.S. Digital** is a hybrid evolution, not a full digitization:
- The **physical letter blocks stay unchanged** for the initial tactile teaching phase. This is where real motor-memory learning happens (texture, weight, 3D form) and is not being replaced.
- What **is** being replaced is the **paper worksheet assessment** that followed the blocks phase. The worksheet only captured right/wrong answers. The digital app captures stroke direction, hesitation, and confusion patterns a worksheet structurally cannot.

If asked to build anything that removes or replaces the physical blocks phase, stop and flag it — that is out of scope and contradicts the core hybrid design decision.

## Current Scope (Phase 1)

- **Two confusion pairs only, lowercase:** b/d and p/q
- **Finger-touch input only** — no stylus support. This is a deliberate scope decision (matches standard classroom tablets, matches how pupils already interact with the physical blocks using their hands, avoids pressure-sensitivity/palm-rejection engineering that doesn't serve the judging criteria). Do not add stylus-specific handling unless explicitly asked.
- **No fixed pass/fail rules.** All difficulty progression uses weighted confidence scoring (accuracy + stroke direction + hesitation + consistency across attempts), not hard thresholds like "2 correct in a row."

## Session Flow (locked, do not restructure without confirming first)

```
SESSION START
  → Check: confidence dropped since last session, or is this Session 1?
      YES → WARM-UP (single-letter tracing: b, d, p, q individually)
      NO  → skip straight to PAIR DISCRIMINATION
  → PAIR DISCRIMINATION (b/d randomized, then p/q randomized)
  → Update per-letter confidence scores
  → Both pairs reasonably confident?
      YES → CROSS-PAIR MIXING (b/d/p/q all mixed)
      NO  → RESURFACE weak letters within same session
  → SESSION END SUMMARY
      - per-letter confidence (b, d, p, q shown individually, not just pair-level)
      - flag: directional confusion vs. isolated slip-ups
      - feeds into AI cross-session diagnostic note
```

Warm-up only runs on Session 1, or later if confidence drops notably since the pupil's last session. It should never run every session by default.

## Build Order

Follow this sequence — each phase depends on the previous one working:

1. Canvas/stroke capture (touch events, guide outline, records {x, y, timestamp} points)
2. Reference letter path data for b, d, p, q
3. Stroke comparison logic (shape match, direction match, hesitation timing)
4. Per-letter confidence scoring system
5. Session flow controller (warm-up/skip logic, pair discrimination, cross-pair mixing, resurfacing)
6. Session persistence (so Session 2+ can check for confidence drop)
7. End-of-session summary screen
8. AI cross-session diagnostic note (plain-language, teacher-facing)
9. Teacher-facing report/dashboard (single link, no login — matches G.I.S.T.'s practicality approach)

Build and confirm each phase works before moving to the next. Don't skip ahead to later phases even if they seem quick.

## Design Philosophy (carried over from G.I.S.T. build process)

- **Think before coding.** State what you understand the current behavior to do before changing it.
- **Simplicity first.** Don't add features, animations, or polish that wasn't asked for — this is a competition submission with limited build time.
- **Surgical changes.** Every changed line should trace back to what was actually requested.
- **Ask before restructuring.** Flag before changing component structure, state management, or the session flow logic — don't just do it because it seems cleaner.
- **Goal-driven execution.** Before starting a phase, confirm what "working" means for that phase, then verify against it.

## Judging Context

This is being built for a competition using five judging criteria: **AI Application, Classroom Impact & Reflection, Practicality & Usability, Creativity & Innovation, Replicability**. Keep these in mind when a design decision has multiple valid options — practicality and honest grounding in real classroom constraints (e.g. rural/low-connectivity schools) should generally win over technically flashier but fragile choices.

## Reference Project

T.H.I.S. Digital reuses design language and some technical approach from **G.I.S.T. (Guided Inference Skill Trainer)**, a related AI-powered ESL tool built for the same competition context — particularly its adaptive/weighted confidence-style progression and its no-login, single-link teacher report approach.
