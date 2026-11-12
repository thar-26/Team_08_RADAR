"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Bridge" },
  { href: "/members", label: "Members" },
  { href: "/trust", label: "Trust & limits" },
  { href: "/how", label: "How it works" },
];

export default function Masthead() {
  const path = usePathname();
  return (
    <header className="masthead">
      <div className="shell masthead-inner">
        <Link href="/" className="brand" aria-label="Radar home">
          <span className="sweep" aria-hidden />
          <span className="brand-word">Radar</span>
          <span className="brand-sub">Blue Science Park · Karlskrona</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href) || (l.href === "/members" && path.startsWith("/c/"));
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
