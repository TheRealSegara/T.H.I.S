import type { VercelRequest, VercelResponse } from "@vercel/node";

// Kept in sync by hand with the shape produced by buildDiagnosticFacts()
// in src/diagnostic-note.ts. Not imported directly since this function is
// bundled separately by Vercel from the Vite app.
interface LetterFacts {
  letter: string;
  trend: "improving" | "declining" | "steady" | "insufficient-data";
  latestConfidencePct: number | null;
  confusionCount: number;
}

interface DiagnosticFacts {
  pupilId: string;
  sessionsAnalyzed: number;
  letters: LetterFacts[];
  confusedLetters: string[];
}

const GROQ_MODEL = "llama-3.3-70b-versatile";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY is not configured on the server" });
    return;
  }

  const facts = req.body as DiagnosticFacts | undefined;
  if (!facts || !Array.isArray(facts.letters) || typeof facts.pupilId !== "string") {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
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
      const errText = await groqResponse.text();
      res.status(502).json({ error: `Groq API error ${groqResponse.status}: ${errText.slice(0, 300)}` });
      return;
    }

    const groqData = await groqResponse.json();
    const content: unknown = groqData?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      res.status(502).json({ error: "Unexpected Groq response shape" });
      return;
    }

    const parsed = JSON.parse(content);
    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.recommendation !== "string" ||
      !Array.isArray(parsed.perLetterNotes) ||
      !parsed.perLetterNotes.every((n: unknown) => typeof n === "string")
    ) {
      res.status(502).json({ error: "Model returned an unexpected shape" });
      return;
    }

    res.status(200).json({
      summary: parsed.summary,
      perLetterNotes: parsed.perLetterNotes,
      recommendation: parsed.recommendation,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Unknown error calling Groq" });
  }
}
