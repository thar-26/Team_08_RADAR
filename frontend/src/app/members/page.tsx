"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ErrorNote, Skeleton, useFetch } from "@/components/ui";
import { api, type Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function Members() {
  const router = useRouter();
  const { t } = useI18n();
  const { data, error, loading } = useFetch(() => api<Member[]>("/api/companies"));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(
    () => (data ?? []).filter((m) => (m.name + " " + m.industry).toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  async function build(slug: string) {
    setBusy(slug);
    setErr(null);
    try {
      await api(`/api/companies/${slug}/build`, { method: "POST" });
      router.push(`/c/${slug}`);
    } catch (e) {
      setErr(String((e as Error).message));
      setBusy(null);
    }
  }

  return (
    <>
      <section className="pagehead">
        <div className="shell">
          <div className="eyebrow">{t("members.eyebrow")}</div>
          <div className="spread" style={{ marginTop: 8 }}>
            <h1>{t("members.title")}</h1>
            <input className="input" style={{ maxWidth: 320 }} placeholder={t("members.filter")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("members.filter")} />
          </div>
          <p className="lede">{t("members.lede")}</p>
        </div>
      </section>
      <section className="shell section" style={{ paddingTop: 28 }}>
        {error && <ErrorNote error={error} />}
        {err && <div className="banner" style={{ marginBottom: 16 }}>{err}</div>}
        {loading && <Skeleton h={240} />}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
          {list.map((m) => (
            <div key={m.slug} id={m.slug} className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="spread">
                <span className="pill">{m.industry || "—"}</span>
                {m.profiled && <span className="dot confirmed" title="Profiled" />}
              </div>
              <h3>{m.name}</h3>
              <div className="row" style={{ marginTop: "auto", gap: 8 }}>
                {m.profiled ? (
                  <Link className="btn small" href={`/c/${m.slug}`}>{t("members.open")}</Link>
                ) : (
                  <button className="btn soft small" disabled={!!busy || !m.website} onClick={() => build(m.slug)}>
                    {busy === m.slug ? t("members.building") : t("members.build")}
                  </button>
                )}
                {m.website && <a className="small" href={m.website} target="_blank" rel="noreferrer">{t("members.website")} ↗</a>}
                <a className="small" href={m.bsp_page} target="_blank" rel="noreferrer">BSP ↗</a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
