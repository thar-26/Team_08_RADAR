"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/** Simulated sign-in for the demo: choosing "Blue Science Park" or a member
 *  company only decides which view Radar opens. It grants no rights: editing a
 *  profile and seeing private data still need a real sign-in (the API checks). */
export type Role = { kind: "visitor" } | { kind: "bsp" } | { kind: "company"; slug: string; name: string };
const KEY = "radar-role";

const RoleCtx = createContext<{ role: Role | null; open: () => void }>({ role: null, open: () => {} });
export const useRole = () => useContext(RoleCtx);

function load(): Role | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Role) : null;
  } catch {
    return null;
  }
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [show, setShow] = useState(false);
  const { status } = useSession();

  useEffect(() => {
    const r = load();
    setRole(r);
    // First visit: ask who is using Radar (not when someone is already really signed in).
    if (!r && status === "unauthenticated") setShow(true);
  }, [status]);

  const choose = useCallback((r: Role) => {
    setRole(r);
    setShow(false);
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage blocked: choice lasts this visit */ }
  }, []);

  return (
    <RoleCtx.Provider value={{ role, open: () => setShow(true) }}>
      {children}
      {show && <RoleDialog onChoose={choose} onClose={() => (role ? setShow(false) : choose({ kind: "visitor" }))} />}
    </RoleCtx.Provider>
  );
}

function RoleDialog({ onChoose, onClose }: { onChoose: (r: Role) => void; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [companies, setCompanies] = useState<Member[]>([]);
  const [slug, setSlug] = useState("");

  useEffect(() => {
    api<Member[]>("/api/companies")
      .then((m) => {
        const profiled = m.filter((x) => x.profiled);
        setCompanies(profiled);
        setSlug((s) => s || profiled[0]?.slug || "");
      })
      .catch(() => setCompanies([]));
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const company = companies.find((c) => c.slug === slug);
  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-panel">
        <h2 id="gate-title">{t("gate2.title")}</h2>
        <p className="gate-lede">{t("gate2.lede")}</p>

        <div className="gate-options">
          <div className="gate-option">
            <h3>{t("gate2.bsp")}</h3>
            <p>{t("gate2.bspText")}</p>
            <button className="btn sky" onClick={() => { onChoose({ kind: "bsp" }); router.push("/members"); }}>{t("gate2.continue")}</button>
          </div>
          <div className="gate-option">
            <h3>{t("gate2.company")}</h3>
            <p>{t("gate2.companyText")}</p>
            <select className="select" value={slug} onChange={(e) => setSlug(e.target.value)} aria-label={t("gate2.company")}>
              {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <button className="btn sky" disabled={!company} style={{ marginTop: 10 }}
              onClick={() => { if (!company) return; onChoose({ kind: "company", slug: company.slug, name: company.name }); router.push(`/c/${company.slug}`); }}>
              {t("gate2.continue")}
            </button>
          </div>
        </div>

        <p className="gate-note">{t("gate2.simulated")}{" "}
          <Link href="/login" onClick={() => onChoose({ kind: "visitor" })}>{t("gate2.realLogin")}</Link>
        </p>
        <button className="textbtn gate-skip" onClick={() => { onChoose({ kind: "visitor" }); }}>{t("gate2.visitor")}</button>
      </div>
    </div>
  );
}

/** Header chip: who Radar is simulating, and a way to switch. */
export function RoleChip() {
  const { role, open } = useRole();
  const { t } = useI18n();
  const { data } = useSession();
  if (data?.user) return null; // really signed in: the account menu shows who it is
  const label = role?.kind === "bsp" ? t("gate2.bsp") : role?.kind === "company" ? role.name : t("gate2.chooseShort");
  return (
    <button className="auth-link role-chip" onClick={open} title={t("gate2.switch")}>
      {role && role.kind !== "visitor" ? t("gate2.chip", { who: label }) : t("gate2.chooseShort")}
    </button>
  );
}
