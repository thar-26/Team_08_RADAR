"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthMenu from "@/components/AuthMenu";
import { RoleChip, useRole } from "@/components/RoleGate";
import { useI18n, type Key } from "@/lib/i18n";

const LINKS: { href: string; key: Key }[] = [
  { href: "/", key: "nav.home" },
  { href: "/members", key: "nav.members" },
];

/** Radar's own mark: a scope with one sweep line. Not Blue Science Park's logo. */
export function Mark({ className = "mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="#00a3e2" strokeWidth="3" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="#ffffff" strokeWidth="2" opacity=".55" />
      <path d="M16 16 L27 8" stroke="#ffffff" strokeWidth="3" strokeLinecap="square" />
      <circle cx="22" cy="21" r="2.5" fill="#a2eaf5" />
    </svg>
  );
}

export default function Masthead() {
  const path = usePathname();
  const { t, lang, setLang } = useI18n();
  const { role } = useRole();
  // The simulated view adds one link: the park's overview, or the company's own radar.
  const links = [...LINKS];
  if (role?.kind === "bsp") links.splice(2, 0, { href: "/park", key: "nav.park" });
  if (role?.kind === "company") links.splice(2, 0, { href: `/c/${role.slug}`, key: "nav.myRadar" });
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href="/" className="brand" aria-label="Radar">
          <Mark />
          <span className="brand-word" translate="no">Radar</span>
          <span className="brand-sub">{t("brand.sub")}</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {links.map((l) => {
            const own = role?.kind === "company" && path === `/c/${role.slug}`;
            const active = l.href === "/" ? path === "/" : l.key === "nav.myRadar" ? own : path.startsWith(l.href) || (l.href === "/members" && path.startsWith("/c/") && !own);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
                {t(l.key)}
              </Link>
            );
          })}
        </nav>
        <RoleChip />
        <AuthMenu />
        <div className="langswitch" role="group" aria-label="Språk / Language">
          <button aria-pressed={lang === "sv"} onClick={() => setLang("sv")} lang="sv">SV</button>
          <button aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">EN</button>
        </div>
      </div>
    </header>
  );
}
