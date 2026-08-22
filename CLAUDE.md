# T.H.I.S. — Project Context for Claude Code

## What T.H.I.S. Is

**T.H.I.S.** stands for **Tactile Holistic Intervention for Shape-recognition** — a physical remedial literacy kit using letter blocks to help pupils with letter-shape confusion (e.g. mirror-confusion pairs like b/d, p/q). It was built from real observation of remedial ESL learners, including practicum experience at a rural Malaysian primary school (SK Singat, Sibu, Sarawak).

## Current Direction: Pure Physical

**T.H.I.S. stays physical.** After building and hands-on testing a digital assessment layer (see "Shelved digital prototype" below), the decision was made to keep the whole intervention physical end to end — the letter blocks *and* the Development Sheet worksheet that follows them. No touchscreen, no app, no server.

The reasoning: the tactile, physical nature of the blocks is the core of what makes T.H.I.S. work, and a touchscreen recreation of that tracing experience kept coming up short against the real thing, however much polish (haptics, reactive guides, arrow styling) was added. Pure physical is also simpler, more robust for low-connectivity classrooms, and needs nothing beyond blocks and paper to replicate elsewhere.

If a future task revisits digitizing any part of T.H.I.S., stop and confirm scope first rather than assuming the old plan below still applies — this is a deliberate reversal of it, not an oversight.

### Shelved digital prototype

A full digital hybrid ("T.H.I.S. Digital" / "T.H.I.S. Assessment") was built in this repo before the pure-physical decision: canvas-based stroke capture, confidence scoring, a session flow controller, Supabase persistence, a Groq-powered AI diagnostic note, a no-login teacher report, and a fading-guidance warm-up sequence modeled on the physical Development Sheet. It's intentionally left in place on `main` and in git history as a reference/fallback rather than deleted — but it is **not being continued**. Don't resume building on it without explicit confirmation that the direction has changed again.

## Design Philosophy

These principles apply regardless of what gets built here next:

- **Think before coding.** State what you understand the current behavior to do before changing it.
- **Simplicity first.** Don't add features, animations, or polish that wasn't asked for — this is a competition submission with limited build time.
- **Surgical changes.** Every changed line should trace back to what was actually requested.
- **Ask before restructuring.** Flag before changing component structure, state management, or core flow logic — don't just do it because it seems cleaner.
- **Goal-driven execution.** Before starting a task, confirm what "working" means for it, then verify against it.

## Judging Context

This is being built for a competition. The five criteria referenced earlier in this project (**AI Application, Classroom Impact & Reflection, Practicality & Usability, Creativity & Innovation, Replicability**) were specifically framed around a digitized submission — they don't automatically carry over as-is to a pure-physical one. Don't assume they still apply the same way; ask if judging criteria become relevant to a decision again.

Practicality and honest grounding in real classroom constraints (e.g. rural/low-connectivity schools) remain the right instinct to default to regardless of criteria specifics.
