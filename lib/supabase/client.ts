import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Singleton browser Supabase client — the officially recommended pattern for
 * Next.js. Every caller gets the same GoTrueClient instance instead of a new
 * one per call, so there's exactly one session-detection pass over the URL
 * (auto-run on construction) no matter how many times or where in the
 * component tree this is called — including React Strict Mode's deliberate
 * double effect invocation in development, which previously raced two
 * separate instances against the same recovery link.
 */
export function createBrowserSupabaseClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }

  client = createBrowserClient(url, anonKey);
  return client;
}
