import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are safe to expose client-side
// (Supabase's anon key is designed for this; access control comes from Row
// Level Security policies on the tables, not from keeping this key
// secret) - see supabase/README.md.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Deliberately does NOT throw at module-load time: that would break the
// whole app into a blank page before any of persistence.ts's own error
// handling gets a chance to run. Instead, missing config surfaces as a
// normal rejected promise the first time something tries to use
// Supabase, which the existing try/catch blocks in main.ts already turn
// into a visible on-screen message.
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured - missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
