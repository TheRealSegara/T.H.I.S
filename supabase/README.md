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

Set these for all environments you deploy (Production, and Preview if you
want preview deployments to work too). Vite only inlines `VITE_*`
variables at **build time**, so changing them requires a redeploy, not
just a settings change.

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

Create a `.env.local` file (already gitignored) with the three variables
above to run `npm run dev` against your real Supabase project. There is
currently no local emulation of the `/api` function - `npm run dev` won't
serve `api/diagnostic-note.ts` (that's a Vercel-only runtime), so the
diagnostic note will always use the deterministic fallback locally unless
you deploy or run `vercel dev` instead of `vite dev`.
