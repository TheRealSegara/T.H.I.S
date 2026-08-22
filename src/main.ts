import { StrokeCapture } from "./stroke-capture";
import { LETTER_PATHS, GLYPH_WIDTH, GLYPH_HEIGHT, type LetterId } from "./letters";
import { compareLetterAttempt } from "./stroke-comparison";
import { ConfidenceTracker } from "./confidence";
import { SessionFlowController } from "./session-flow";
import {
  ALL_LETTERS,
  confidenceDroppedLastSession,
  getLastPupilId,
  loadPupilData,
  savePupilData,
  type PersistedLetterState,
} from "./persistence";
import { buildSessionSummary, describeFlag, type SessionSummaryData } from "./session-summary";
import { buildPupilReport, listPupilIds } from "./report";
import { STAGE_LABELS, STAGE_VOICE_LINES, letterPrompt, pairOf } from "./copy";
import type { SessionStage } from "./session-flow";
import "./style.css";

const pupilGate = document.getElementById("pupil-gate") as HTMLDivElement;
const pupilInput = document.getElementById("pupil-input") as HTMLInputElement;
const pupilStartBtn = document.getElementById("pupil-start-btn") as HTMLButtonElement;
const sessionView = document.getElementById("session-view") as HTMLDivElement;
const practiceView = document.getElementById("practice-view") as HTMLDivElement;
const summaryView = document.getElementById("summary-view") as HTMLDivElement;
const summaryListEl = document.getElementById("summary-list") as HTMLUListElement;
const newSessionBtn = document.getElementById("new-session-btn") as HTMLButtonElement;
const summaryReportLink = document.getElementById("summary-report-link") as HTMLAnchorElement;

const appEl = document.getElementById("app") as HTMLDivElement;
const reportView = document.getElementById("report-view") as HTMLDivElement;
const reportBackLink = document.getElementById("report-back-link") as HTMLAnchorElement;
const reportPupilList = document.getElementById("report-pupil-list") as HTMLDivElement;
const reportPupilDetail = document.getElementById("report-pupil-detail") as HTMLDivElement;

const canvas = document.getElementById("trace-canvas") as HTMLCanvasElement;
const stageEl = document.getElementById("stage-label") as HTMLSpanElement;
const letterEl = document.getElementById("letter-label") as HTMLSpanElement;
const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
const strokeCountEl = document.getElementById("stroke-count") as HTMLSpanElement;
const pointCountEl = document.getElementById("point-count") as HTMLSpanElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const pieceProgressEl = document.getElementById("piece-progress") as HTMLDivElement;
const voiceTextEl = document.getElementById("voice-text") as HTMLSpanElement;

const lastPupil = getLastPupilId();
if (lastPupil) pupilInput.value = lastPupil;

const START_BTN_DEFAULT_TEXT = pupilStartBtn.innerHTML;

pupilStartBtn.addEventListener("click", async () => {
  const pupilId = pupilInput.value.trim();
  if (!pupilId) return;

  pupilStartBtn.disabled = true;
  pupilStartBtn.textContent = "Loading…";

  try {
    await startSession(pupilId);
    pupilGate.hidden = true;
    sessionView.hidden = false;
    practiceView.hidden = false;
    summaryView.hidden = true;
  } catch (err) {
    console.error("Could not start session:", err);
    alert("Couldn't reach the server to start this session. Check the connection and try again.");
  } finally {
    pupilStartBtn.disabled = false;
    pupilStartBtn.innerHTML = START_BTN_DEFAULT_TEXT;
  }
});

newSessionBtn.addEventListener("click", () => {
  location.reload();
});

function parseReportRoute(hash: string): { pupilId: string | null } | null {
  const match = hash.match(/^#\/report(?:\/(.+))?$/);
  if (!match) return null;
  return { pupilId: match[1] ? decodeURIComponent(match[1]) : null };
}

async function renderPupilList(): Promise<void> {
  reportPupilDetail.hidden = true;
  reportPupilList.hidden = false;
  reportPupilList.innerHTML = "<p>Loading…</p>";

  let pupils: string[];
  try {
    pupils = await listPupilIds();
  } catch (err) {
    console.error("Could not load pupil list:", err);
    reportPupilList.innerHTML = "<p>Couldn't reach the server to load pupils. Check the connection and try again.</p>";
    return;
  }

  reportPupilList.innerHTML = "";
  if (pupils.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No pupils recorded yet.";
    reportPupilList.append(p);
    return;
  }

  const ul = document.createElement("ul");
  for (const id of pupils) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#/report/${encodeURIComponent(id)}`;
    a.textContent = `🧒 ${id}`;
    li.append(a);
    ul.append(li);
  }
  reportPupilList.append(ul);
}

async function renderPupilDetail(pupilId: string): Promise<void> {
  reportPupilList.hidden = true;
  reportPupilDetail.hidden = false;
  reportPupilDetail.innerHTML = "<p>Loading report…</p>";

  let report: Awaited<ReturnType<typeof buildPupilReport>>;
  try {
    report = await buildPupilReport(pupilId);
  } catch (err) {
    console.error("Could not load report:", err);
    reportPupilDetail.innerHTML = "<p>Couldn't reach the server to load this report. Check the connection and try again.</p>";
    return;
  }

  const { pupilData, currentState, note } = report;
  reportPupilDetail.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = `${pupilId} — ${pupilData.sessionCount} session${pupilData.sessionCount === 1 ? "" : "s"}`;
  reportPupilDetail.append(heading);

  const noteSection = document.createElement("div");
  noteSection.className = "report-section report-section--pattern";
  const noteTitle = document.createElement("h2");
  noteTitle.textContent = "🎯 Diagnostic note";
  const noteSummary = document.createElement("p");
  noteSummary.textContent = note.summary;
  const noteRec = document.createElement("p");
  noteRec.textContent = note.recommendation;
  const noteList = document.createElement("ul");
  for (const line of note.perLetterNotes) {
    const li = document.createElement("li");
    li.textContent = line;
    noteList.append(li);
  }
  noteSection.append(noteTitle, noteSummary, noteRec, noteList);
  reportPupilDetail.append(noteSection);

  const lettersSection = document.createElement("div");
  lettersSection.className = "report-section report-section--stats";
  const lettersTitle = document.createElement("h2");
  lettersTitle.textContent = "📊 Current per-letter confidence";
  lettersSection.append(lettersTitle);
  for (const entry of currentState.letters) {
    const p = document.createElement("p");
    p.className = `report-trend pair-${pairOf(entry.letter)}`;
    p.textContent = `${entry.letter}: ${entry.confidence === null ? "no data" : Math.round(entry.confidence * 100) + "%"} — ${describeFlag(entry.flag)}`;
    lettersSection.append(p);
  }
  reportPupilDetail.append(lettersSection);
}

function renderRoute(): void {
  const route = parseReportRoute(location.hash);
  appEl.classList.toggle("context-teacher", route !== null);

  if (route) {
    pupilGate.hidden = true;
    sessionView.hidden = true;
    reportView.hidden = false;
    reportBackLink.href = route.pupilId ? "#/report" : "#";

    if (route.pupilId) void renderPupilDetail(route.pupilId);
    else void renderPupilList();
    return;
  }

  reportView.hidden = true;
  sessionView.hidden = true;
  pupilGate.hidden = false;
}

window.addEventListener("hashchange", renderRoute);
renderRoute();

function renderSummary(summary: SessionSummaryData): void {
  summaryListEl.innerHTML = "";
  for (const entry of summary.letters) {
    const li = document.createElement("li");
    li.className = `summary-row pair-${pairOf(entry.letter)}`;

    const letterSpan = document.createElement("span");
    letterSpan.className = "summary-letter";
    letterSpan.textContent = entry.letter;

    const details = document.createElement("div");
    details.className = "summary-details";

    const confidenceP = document.createElement("span");
    confidenceP.className = "summary-confidence";
    confidenceP.textContent =
      entry.confidence === null ? "No attempts recorded" : `${Math.round(entry.confidence * 100)}% confident`;

    const flagP = document.createElement("span");
    flagP.className = `summary-flag flag-${entry.flag}`;
    flagP.textContent = describeFlag(entry.flag);

    details.append(confidenceP, flagP);
    li.append(letterSpan, details);
    summaryListEl.append(li);
  }
}

async function startSession(pupilId: string): Promise<void> {
  const pupilData = await loadPupilData(pupilId);
  const isFirstSession = pupilData.sessionCount === 0;
  const confidenceDropped = confidenceDroppedLastSession(pupilData);

  const tracker = new ConfidenceTracker(pupilData.letters);
  const sessionStartConfidence = new Map<LetterId, number | null>(
    ALL_LETTERS.map((letter) => [letter, tracker.getConfidence(letter)]),
  );

  const flow = new SessionFlowController(tracker, {
    isFirstSession,
    confidenceDroppedSinceLastSession: confidenceDropped,
  });

  const capture = new StrokeCapture(canvas, {
    onStrokeComplete: (stroke, allStrokes) => {
      strokeCountEl.textContent = `Strokes: ${allStrokes.length}`;
      pointCountEl.textContent = `Last stroke points: ${stroke.length}`;
      nextBtn.disabled = allStrokes.length === 0;
    },
  });

  const completedLetters: LetterId[] = [];
  let lastVoiceStage: SessionStage | null = null;

  function updateVoiceLine(stage: SessionStage): void {
    if (stage === lastVoiceStage) return;
    lastVoiceStage = stage;
    voiceTextEl.textContent = STAGE_VOICE_LINES[stage];
  }

  function resetCounters(): void {
    strokeCountEl.textContent = "Strokes: 0";
    pointCountEl.textContent = "Last stroke points: 0";
  }

  function renderPieceProgress(): void {
    pieceProgressEl.innerHTML = "";
    for (const letter of completedLetters) {
      const chip = document.createElement("div");
      chip.className = `piece-chip pair-${pairOf(letter)}`;
      pieceProgressEl.append(chip);
    }
  }

  async function finalizeSession(): Promise<{ summary: SessionSummaryData; saveError: boolean }> {
    const summary = buildSessionSummary(pupilId, pupilData.sessionCount + 1, tracker);

    const letters: typeof pupilData.letters = {};
    for (const letter of ALL_LETTERS) {
      const state = tracker.exportState()[letter];
      if (!state) continue;
      const endedSessionBelowStart = tracker.hasConfidenceDropped(letter, sessionStartConfidence.get(letter) ?? null);
      letters[letter] = { ...state, endedSessionBelowStart } satisfies PersistedLetterState;
    }

    let saveError = false;
    try {
      await savePupilData({
        pupilId,
        sessionCount: pupilData.sessionCount + 1,
        lastSessionAt: Date.now(),
        letters,
        sessionLog: [
          ...pupilData.sessionLog,
          { completedAt: Date.now(), letters: Object.fromEntries(summary.letters.map((e) => [e.letter, { confidence: e.confidence, flag: e.flag }])) },
        ].slice(-20),
      });
    } catch (err) {
      // Still show the pupil their results even if the save failed - losing
      // the on-screen summary on top of a failed save would be worse, and
      // the confidence numbers computed above are correct either way.
      console.error(err);
      saveError = true;
    }

    return { summary, saveError };
  }

  async function showCurrentPrompt(): Promise<void> {
    if (flow.isComplete()) {
      nextBtn.disabled = true;
      const { summary, saveError } = await finalizeSession();
      practiceView.hidden = true;
      summaryView.hidden = false;
      summaryReportLink.href = `#/report/${encodeURIComponent(pupilId)}`;
      renderSummary(summary);
      if (saveError) {
        const warning = document.createElement("p");
        warning.className = "footnote-pill";
        warning.textContent = "⚠️ Couldn't save these results to the server - check the connection. Your progress on this device is shown above but may not appear in the teacher report.";
        summaryListEl.insertAdjacentElement("afterend", warning);
      }
      return;
    }

    const letter = flow.getCurrentLetter() as LetterId;
    const stage = flow.getStage();
    stageEl.textContent = STAGE_LABELS[stage];
    updateVoiceLine(stage);
    letterEl.textContent = letterPrompt(letter);
    practiceView.classList.toggle("pair-bd", pairOf(letter) === "bd");
    practiceView.classList.toggle("pair-pq", pairOf(letter) === "pq");
    capture.clear();
    capture.setGuide(LETTER_PATHS[letter], { width: GLYPH_WIDTH, height: GLYPH_HEIGHT });
    nextBtn.disabled = true;
    resetCounters();
  }

  nextBtn.addEventListener("click", () => {
    if (flow.isComplete()) return;
    const justTracedLetter = flow.getCurrentLetter() as LetterId;
    const comparison = compareLetterAttempt(capture.getStrokes(), capture.getGuideInCanvasSpace());
    flow.submitAttempt(comparison);
    completedLetters.push(justTracedLetter);
    renderPieceProgress();
    void showCurrentPrompt();
  });

  clearBtn.addEventListener("click", () => {
    capture.clear();
    resetCounters();
    nextBtn.disabled = true;
  });

  await showCurrentPrompt();
}
