"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { resetToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/** Sign-in link, or the signed-in user's account link and sign-out. */
export default function AuthMenu() {
  const { data, status } = useSession();
  const { t } = useI18n();
  if (status === "loading") return null;
  // Sign-in is only needed to correct a profile, so it lives on the Profile tab;
  // the header just shows who is signed in and lets them sign out.
  if (!data?.user) return null;
  const first = (data.user.name || data.user.email || "").split(" ")[0];
  return (
    <span className="auth-menu">
      <Link className="auth-link" href="/account" title={data.user.email ?? ""}>{first}</Link>
      <button className="auth-link" onClick={() => { resetToken(); signOut({ callbackUrl: "/" }); }}>{t("auth.signOut")}</button>
    </span>
  );
}
