"use client";

import { useEffect } from "react";

/**
 * Supabase redirects to the Site URL root when a requested redirect_to
 * doesn't match the project's allowed Redirect URLs — landing an auth
 * fragment (#access_token=...) on the bare marketing homepage, where no
 * Supabase client exists to process it, so it just sits there inert. This
 * catches that case and forwards the visitor, fragment intact, to whichever
 * page actually knows how to handle it — independent of whether the
 * Supabase Dashboard's redirect allowlist has been corrected yet.
 */
export default function AuthFragmentRescue() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=")) return;

    const params = new URLSearchParams(hash.slice(1));
    const type = params.get("type");
    const destination = type === "recovery" ? "/admin/reset-password" : "/auth/verified";

    window.location.replace(`${destination}${hash}`);
  }, []);

  return null;
}
