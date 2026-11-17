import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * How long the session check may take before middleware gives up on it.
 *
 * Vercel kills a Routing Middleware invocation at 25 seconds and serves
 * `504 MIDDLEWARE_INVOCATION_TIMEOUT`. `supabase.auth.getUser()` had no
 * timeout, so an unreachable auth host consumed that entire budget and every
 * `/admin/*` request — including `/admin/login` — died at exactly 25s. A
 * healthy Supabase auth call returns in well under 300ms, so 3s is generous
 * while still leaving the invocation 22s of headroom.
 */
const AUTH_TIMEOUT_MS = 3_000;

/**
 * Resolve `promise`, or reject once `ms` has elapsed.
 *
 * The abort signal below already bounds the HTTP request, but `@supabase/
 * auth-js` retries network failures internally with backoff, so bounding one
 * request is not the same as bounding the call. This bounds the call.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    // Without this the pending timer can hold the invocation open after the
    // winning promise has already settled.
    clearTimeout(timer);
  }
}

/**
 * Refreshes the Supabase session cookie on every request and reports whether
 * a logged-in user exists. Middleware is the only place a Supabase session
 * gets refreshed — Server Components can't write cookies reliably, so this
 * step can't be skipped or moved without admin sessions silently expiring.
 *
 * It fails **closed**: if the session cannot be established for any reason —
 * timeout, DNS failure, auth outage — the caller is told there is no user.
 * Authorization is therefore never granted on the strength of a failed check.
 * The cost of that choice is that a real admin is sent to the login page
 * during a Supabase outage, which is the right way round: a slow login page
 * is recoverable, and a 504 on every admin route is not.
 */
export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { response, user: null };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
    global: {
      // Bounds each individual request the client makes, and cancels it when
      // the deadline passes rather than leaving it pending against the
      // invocation. An existing signal is preserved: only this call site
      // omits one, and silently dropping a caller's signal would be a bug
      // waiting to happen.
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(AUTH_TIMEOUT_MS),
        }),
    },
  });

  try {
    const { data } = await withTimeout(
      supabase.auth.getUser(),
      AUTH_TIMEOUT_MS,
      "supabase.auth.getUser"
    );
    return { response, user: data.user };
  } catch (err) {
    // Logged, never swallowed: a silent fallback to "no user" during an
    // outage looks exactly like a visitor who is simply logged out, and that
    // is the one reading that would send someone debugging in the wrong
    // direction.
    console.error("[middleware] supabase session check failed, treating as signed out:", err);
    return { response, user: null };
  }
}
