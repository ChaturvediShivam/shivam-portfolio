import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/auth/adminEmail";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignupPayload {
  email: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SignupPayload>;

    const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters and include a letter and a number." },
        { status: 400 }
      );
    }

    // The allowlist check happens before Supabase is ever contacted — this,
    // not Supabase's own public signup toggle, is the real security boundary
    // for this admin-only system (see supabase/schema.sql: every RLS policy
    // grants full access to any authenticated user, with no further role
    // check anywhere in the stack).
    if (!isAdminEmail(email)) {
      return NextResponse.json(
        { error: "Signup is not available for this account." },
        { status: 403 }
      );
    }

    const admin = createServiceClient();
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });

    if (createError) {
      if (createError.code === "email_exists") {
        return NextResponse.json(
          {
            error: "An account with this email already exists. Try signing in or resetting your password.",
          },
          { status: 409 }
        );
      }
      if (createError.code === "weak_password") {
        return NextResponse.json({ error: "Please choose a stronger password." }, { status: 400 });
      }
      console.error("Signup createUser error:", createError);
      return NextResponse.json(
        { error: "Something went wrong creating your account. Please try again." },
        { status: 500 }
      );
    }

    // admin.createUser() never sends mail by design. The confirmation email
    // itself is dispatched by the browser afterward (see app/admin/signup/
    // page.tsx), not here: the app's browser client (@supabase/ssr) is
    // hardcoded to PKCE flowType, and only a PKCE-registering call — one
    // made by that same browser client — produces a confirmation link its
    // own callback route can actually exchange. A server-side client here
    // defaults to implicit flowType and would generate a link the browser
    // client can't process (confirmed via GoTrueClient's
    // _getSessionFromURL, which throws on exactly this mismatch).
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Signup API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
