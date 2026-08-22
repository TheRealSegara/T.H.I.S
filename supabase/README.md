# Supabase + Vercel + Groq setup

T.H.I.S. Assessment stores pupil data in Supabase and generates the
teacher-facing diagnostic note with Groq, via a Vercel serverless
function. This is a from-scratch setup checklist - nothing here happens
automatically.

## 1. Supabase

1. Create a project at supabase.com (or use an existing one).
2. Open the SQL editor and run `supabase/schema.sql` (in this repo) once.
   It creates the `pupils` table and its Row Level Security policies.
   **Read the trade-off comment in that file before running it** - the
   no-login design means any policy here that lets the app work at all
   also means any visitor with the app's URL can read/write any pupil's
   data. That mirrors the app's existing no-login design, just now
   shared across devices instead of confined to one tablet's storage.
3. From Project Settings → API, copy:
   - **Project URL** → this is `VITE_SUPABASE_URL`
   - **anon / public key** → this is `VITE_SUPABASE_ANON_KEY`
   (Not the `service_role` key - that one must never be used client-side.)

## 2. Groq

1. Get an API key from console.groq.com.
2. This is `GROQ_API_KEY`. It must **only** ever be set as a server-side
   Vercel environment variable (no `VITE_` prefix) - it's used exclusively
   inside `api/diagnostic-note.ts`, which runs on Vercel's server, never
   in the browser bundle. Never rename it to start with `VITE_`, since
   Vite inlines anything with that prefix straight into the public
   client bundle.

## 3. Vercel environment variables

In your Vercel project settings, add:

| Name | Value | Exposed to browser? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes (by design - see supabase-client.ts) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | Yes (by design) |
| `GROQ_API_KEY` | Groq API key | No - server-side only |
| `ALLOWED_ORIGIN` | Your deployed app's URL, e.g. `https://this-assessment.vercel.app` | No - server-side only |

Set these for all environments you deploy (Production, and Preview if you
want preview deployments to work too). Vite only inlines `VITE_*`
variables at **build time**, so changing them requires a redeploy, not
just a settings change.

**`ALLOWED_ORIGIN` and custom domains:** `api/diagnostic-note.ts` only
accepts requests whose `Origin`/`Referer` matches this value, to stop
other sites from calling the endpoint using your Groq quota. If you
don't set it, the function falls back to Vercel's own `VERCEL_URL` -
but that's always the internal `*.vercel.app` URL, **never your custom
domain**. If you point a custom domain at this project, you must set
`ALLOWED_ORIGIN` to that domain explicitly, or every real request from
your own app will get rejected with 403. Multiple origins (e.g. a
custom domain plus a preview URL) can be comma-separated.

## 4. Deploying

Vercel auto-detects this as a Vite project and `api/*.ts` files as
serverless functions - no `vercel.json` needed. Push to the branch
connected to your Vercel project, or run `vercel deploy` from this
directory.

## 5. What happens if something's misconfigured

By design, nothing here is a hard crash:

- Missing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` → the app loads
  normally, but starting a session or opening the teacher report shows a
  friendly "couldn't reach the server" message instead of a blank page
  (see `requireSupabase()` in `src/supabase-client.ts`).
- Missing/invalid `GROQ_API_KEY`, Groq being down, or a slow/offline
  connection → the diagnostic note silently falls back to the
  deterministic template (`generateDiagnosticNote` in
  `src/diagnostic-note.ts`) instead of failing the report. This matters
  more here than in most AI features: CLAUDE.md's low-connectivity-
  classroom framing means the API may simply be unreachable, and the
  report should never be blocked on that.

## Local development

Create a `.env.local` file (already gitignored) with the variables above
to run `npm run dev` against your real Supabase project. There is
currently no local emulation of the `/api` function - `npm run dev` won't
serve `api/diagnostic-note.ts` (that's a Vercel-only runtime), so the
diagnostic note will always use the deterministic fallback locally unless
you deploy or run `vercel dev` instead of `vite dev`.

## Security hardening on `/api/diagnostic-note.ts`

Ported from a security checklist used on a related project, minus the
two items that assume an accounts system this app deliberately doesn't
have (see below). Implemented, and each one verified against the actual
handler with mocked requests (not just written and assumed correct):

- **Secrets never reach the client.** `GROQ_API_KEY` only exists as a
  server-side Vercel env var; missing it fails the endpoint closed (500)
  rather than silently degrading. `VITE_SUPABASE_URL`/`_ANON_KEY` are
  the one exception, and that's by design - Supabase's anon key is meant
  to be public, with access control coming from RLS, not key secrecy.
- **Rate limiting.** 10 requests/IP/minute, bounded in-memory map (see
  the code comment on why in-memory instead of a dedicated rate-limiting
  service). Client IP comes from `x-forwarded-for` as set by Vercel's
  edge, not trusted blindly from an arbitrary proxy.
- **Origin/Referer allow-list**, exact-or-followed-by-`/` matching (not
  a naive `.startsWith()`, which a domain like
  `yourapp.com.evil.com` would pass against `yourapp.com`).
- **Strict request validation**: explicit key allow-list on both the top
  level and each letter object (rejects unknown fields), explicit
  type/range/enum check on every field, malformed JSON handled by the
  same top-level exception boundary as everything else.
- **AI-specific guardrails**: the system prompt is a fixed server
  constant the client can't influence at all (it only ever sends
  `facts`, never a prompt); model/temperature/token-limit are likewise
  hardcoded server-side, never taken from the request.
- **Defense in depth**: method check, then origin check, then rate
  limit, then secret check, then body validation, each an independent
  gate - and the whole handler is wrapped in a top-level try/catch that
  always returns a generic error, never a raw stack trace or upstream
  error string, to the client (the real detail goes to `console.error`
  for you to see in Vercel's logs, not to the caller).
- **Resource exhaustion protection**: the rate-limit map itself is
  pruned once it exceeds 1000 tracked IPs, so it can't become its own
  memory-exhaustion vector. Groq is only ever called after validation
  passes, so a flood of malformed requests can't burn your quota.

**Deliberately not implemented** (see the "Auth model" discussion in
this project's history): a two-tier access-code + per-account token
system, and the hashed-secret and per-tenant data scoping that go with
it. Those all assume an accounts model, which contradicts this app's
explicit no-login design (chosen for practicality in low-connectivity
classrooms). The trade-off this leaves in place - anyone with the app's
URL can read/write any pupil's data via Supabase's anon key - is the
same one already documented in `schema.sql` above, not a new gap.

**Secret rotation**, so a compromised key doesn't require guesswork:

- `GROQ_API_KEY`: generate a new key in the Groq console, update the
  Vercel env var, redeploy, then revoke the old key in Groq. Nothing
  else references this key, so this alone fully rotates it.
- Supabase `anon` key: Project Settings → API → "Reset" regenerates it.
  Update `VITE_SUPABASE_ANON_KEY` in Vercel and redeploy immediately
  after resetting - the old key stops working the moment you reset it,
  so there's a brief window where a stale deployed build would fail
  every Supabase call until the redeploy completes.
- `ALLOWED_ORIGIN` isn't a secret and doesn't need rotation, only
  updating if your domain changes.
