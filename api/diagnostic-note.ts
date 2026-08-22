import type { VercelRequest, VercelResponse } from "@vercel/node";

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------

const GROQ_MODEL = "llama-3.3-70b-versatile";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10; // per IP per window
const MAX_TRACKED_IPS = 1000; // bounds the in-memory map itself

const MAX_PUPIL_ID_LENGTH = 100;
const VALID_TRENDS = new Set(["improving", "declining", "steady", "insufficient-data"]);
const VALID_LETTERS = new Set(["b", "d", "p", "q"]);

// ---------------------------------------------------------------------
// Rate limiting - bounded, pruned in-memory map. Best-effort on Vercel
// (resets on cold start, not shared across concurrently-scaled instances)
// rather than a hard guarantee, since adding a dedicated rate-limiting
// service (Upstash/Vercel KV) for a classroom-scale app would be a new
// external dependency out of proportion to the actual traffic this
// endpoint sees. Still meaningfully raises the bar against casual quota
// abuse, and stays bounded so it can't itself become a memory-exhaustion
// vector (see MAX_TRACKED_IPS pruning below).
// ---------------------------------------------------------------------

const requestLog = new Map<string, number[]>();

function getClientIp(req: VercelRequest): string {
  // Vercel's edge network sets/overwrites x-forwarded-for with the real
  // client IP before the request reaches the function - unlike a plain
  // reverse proxy, this header is not attacker-controllable on Vercel.
  // Take the first (client-nearest) entry in the forwarded chain.
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, timestamps);
    return true;
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);

  if (requestLog.size > MAX_TRACKED_IPS) {
    for (const [key, times] of requestLog) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
        requestLog.delete(key);
        if (requestLog.size <= MAX_TRACKED_IPS) break;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------
// Origin allow-list. Exact-or-followed-by-"/" matching only - a naive
// .startsWith(allowed) would let "https://yourapp.com.evil.com" pass
// whenever "https://yourapp.com" is allowed, since the shorter string is
// genuinely a text prefix of the longer one.
// ---------------------------------------------------------------------

function getAllowedOrigins(): string[] {
  const configured = process.env.ALLOWED_ORIGIN?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return configured;
  // Zero-config default on Vercel: this deployment's own URL. NOTE: if
  // you're using a custom domain, VERCEL_URL still points at the
  // internal *.vercel.app URL, not your domain - set ALLOWED_ORIGIN
  // explicitly in that case (see supabase/README.md).
  if (process.env.VERCEL_URL) return [`https://${process.env.VERCEL_URL}`];
  return [];
}

function matchesOrigin(value: string, allowed: string): boolean {
  return value === allowed || value.startsWith(`${allowed}/`);
}

function isRequestFromAllowedOrigin(req: VercelRequest, allowList: string[]): boolean {
  if (allowList.length === 0) return true; // Nothing configured to check against (local dev) - see README.
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const candidate = typeof origin === "string" ? origin : typeof referer === "string" ? referer : null;
  if (!candidate) return false;
  return allowList.some((allowed) => matchesOrigin(candidate, allowed));
}

// ---------------------------------------------------------------------
// Request validation (anti mass-assignment): explicit key allow-list per
// object, explicit type/range/enum check per field. Kept in sync by hand
// with buildDiagnosticFacts()'s output shape in src/diagnostic-note.ts.
// ---------------------------------------------------------------------

interface LetterFacts {
  letter: string;
  trend: string;
  latestConfidencePct: number | null;
  confusionCount: number;
}

interface DiagnosticFacts {
  pupilId: string;
  sessionsAnalyzed: number;
  letters: LetterFacts[];
  confusedLetters: string[];
}

const FACTS_ALLOWED_KEYS = new Set(["pupilId", "sessionsAnalyzed", "letters", "confusedLetters"]);
const LETTER_FACTS_ALLOWED_KEYS = new Set(["letter", "trend", "latestConfidencePct", "confusionCount"]);

function hasOnlyAllowedKeys(value: object, allowed: Set<string>): boolean {
  return Object.keys(value).every((k) => allowed.has(k));
}

function isValidLetterFacts(value: unknown): value is LetterFacts {
  if (!value || typeof value !== "object" || !hasOnlyAllowedKeys(value, LETTER_FACTS_ALLOWED_KEYS)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.letter !== "string" || !VALID_LETTERS.has(v.letter)) return false;
  if (typeof v.trend !== "string" || !VALID_TRENDS.has(v.trend)) return false;
  if (v.latestConfidencePct !== null && (typeof v.latestConfidencePct !== "number" || v.latestConfidencePct < 0 || v.latestConfidencePct > 100)) {
    return false;
  }
  if (typeof v.confusionCount !== "number" || !Number.isInteger(v.confusionCount) || v.confusionCount < 0 || v.confusionCount > 20) return false;
  return true;
}

function isValidFacts(value: unknown): value is DiagnosticFacts {
  if (!value || typeof value !== "object" || !hasOnlyAllowedKeys(value, FACTS_ALLOWED_KEYS)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.pupilId !== "string" || v.pupilId.length === 0 || v.pupilId.length > MAX_PUPIL_ID_LENGTH) return false;
  if (typeof v.sessionsAnalyzed !== "number" || !Number.isInteger(v.sessionsAnalyzed) || v.sessionsAnalyzed < 0 || v.sessionsAnalyzed > 20) {
    return false;
  }
  if (!Array.isArray(v.letters) || v.letters.length !== 4 || !v.letters.every(isValidLetterFacts)) return false;
  if (!Array.isArray(v.confusedLetters) || !v.confusedLetters.every((l) => typeof l === "string" && VALID_LETTERS.has(l))) return false;
  return true;
}

// ---------------------------------------------------------------------
// System prompt is a fixed server-side constant - the client only ever
// sends `facts` (validated above), never a prompt or system message, so
// this endpoint can't be turned into an open relay for arbitrary
// prompts against your API key/quota. Model, temperature, and max_tokens
// below are likewise fixed here, never taken from the request.
// ---------------------------------------------------------------------

const SYSTEM_PROMPT = `You are writing a short, plain-language diagnostic note for a teacher about one pupil's progress in a b/d and p/q letter-reversal assessment app called T.H.I.S. Assessment.

You are given structured, pre-computed facts about the pupil's recent sessions. Trust these facts completely - do not invent, estimate, or alter any number, trend, or confusion pattern that isn't explicitly given to you. Your only job is to phrase these facts warmly and clearly for a busy teacher, not to do any new analysis.

Respond with strict JSON only, no other text, exactly these keys:
{
  "summary": "1-2 sentence overview of the pupil's overall pattern",
  "perLetterNotes": ["one sentence per letter, in the same order as the input letters array"],
  "recommendation": "1 sentence, concrete next step for the teacher"
}

Rules:
- confusionCount of 2 or more means a persistent directional-confusion pattern for that letter - name it clearly; it usually means the letter is being drawn the wrong way round repeatedly, not just occasionally wrong. Do not call this "isolated" or "a slip."
- confusionCount of 0 or 1 is not a persistent pattern - do not describe it as confusion.
- If sessionsAnalyzed is 0, say the pupil hasn't completed a session yet and keep perLetterNotes minimal/generic.
- Never mention a percentage, trend, or count you were not given for that letter.
- Keep the tone warm and encouraging even when flagging a concern - this note is for the teacher, not the pupil.
- perLetterNotes must have exactly one entry per letter in "letters", in the same order.`;

interface AiNoteResponse {
  summary: string;
  perLetterNotes: string[];
  recommendation: string;
}

function isAiNoteResponse(value: unknown): value is AiNoteResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === "string" && typeof v.recommendation === "string" && Array.isArray(v.perLetterNotes) && v.perLetterNotes.every((n) => typeof n === "string");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Top-level exception boundary: anything unexpected below still
  // returns a controlled, generic response rather than crashing the
  // function or leaking a raw stack trace to the client.
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    if (!isRequestFromAllowedOrigin(req, getAllowedOrigins())) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (isRateLimited(getClientIp(req))) {
      res.status(429).json({ error: "Too many requests - please wait a moment and try again." });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      // Fail closed: a missing secret is a server misconfiguration, not
      // a reason to silently skip the AI call or run in some reduced
      // mode - the caller (generateDiagnosticNoteAI) already has its
      // own deterministic fallback for exactly this case.
      console.error("GROQ_API_KEY is not configured");
      res.status(500).json({ error: "Server is not configured correctly" });
      return;
    }

    const facts = req.body;
    if (!isValidFacts(facts)) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(facts) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.6,
        max_tokens: 600,
      }),
    });

    if (!groqResponse.ok) {
      console.error(`Groq API error ${groqResponse.status}: ${(await groqResponse.text()).slice(0, 300)}`);
      res.status(502).json({ error: "Upstream AI service error" });
      return;
    }

    const groqData = await groqResponse.json();
    const content: unknown = groqData?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.error("Unexpected Groq response shape:", groqData);
      res.status(502).json({ error: "Upstream AI service error" });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("Model returned invalid JSON:", err);
      res.status(502).json({ error: "Upstream AI service error" });
      return;
    }

    if (!isAiNoteResponse(parsed)) {
      console.error("Model returned an unexpected shape:", parsed);
      res.status(502).json({ error: "Upstream AI service error" });
      return;
    }

    res.status(200).json({
      summary: parsed.summary,
      perLetterNotes: parsed.perLetterNotes,
      recommendation: parsed.recommendation,
    });
  } catch (err) {
    console.error("Unhandled error in /api/diagnostic-note:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
