"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type Key } from "@/lib/i18n";

const LINKS: { href: string; key: Key }[] = [
  { href: "/", key: "nav.home" },
  { href: "/members", key: "nav.members" },
  { href: "/trust", key: "nav.trust" },
  { href: "/how", key: "nav.how" },
];

export default function Masthead() {
  const path = usePathname();
  const { t, lang, setLang } = useI18n();
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href="/" className="brand" aria-label="Radar">
          <span className="sweep" aria-hidden />
          <span className="brand-word">Radar</span>
          <span className="brand-sub">{t("brand.sub")}</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href) || (l.href === "/members" && path.startsWith("/c/"));
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
                {t(l.key)}
              </Link>
            );
          })}
        </nav>
        <div className="langswitch" role="group" aria-label="Språk / Language">
          <button aria-pressed={lang === "sv"} onClick={() => setLang("sv")} lang="sv">SV</button>
          <button aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">EN</button>
        </div>
      </div>
    </header>
  );
}
