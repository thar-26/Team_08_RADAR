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
      <section className="pagehead pagehead-pad">
        <div className="shell">
          
          <div className="spread">
            <h1>{t("members.title")}</h1>
            <input className="input" style={{ maxWidth: 320 }} placeholder={t("members.filter")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("members.filter")} />
          </div>
          <p className="lead">{t("members.lede")}</p>
        </div>
      </section>
      <section className="shell section" style={{ paddingTop: 48 }}>
        {error && <ErrorNote error={error} />}
        {err && <div className="banner" style={{ marginBottom: 16 }}>{err}</div>}
        {loading && <Skeleton h={300} />}
        <div className="list">
          {list.map((m) => (
            <div key={m.slug} id={m.slug} className="list-row" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr) auto", padding: "18px 0" }}>
              <h3 style={{ fontSize: 22 }}>
                {m.profiled ? <Link href={`/c/${m.slug}`} style={{ color: "inherit" }}>{m.name}</Link> : m.name}
              </h3>
              <span className="note" style={{ fontSize: 15 }}>
                {m.industry || "—"}
                {m.website && <> · <a href={m.website} target="_blank" rel="noreferrer">{t("members.website")}</a></>}
                {" · "}<a href={m.bsp_page} target="_blank" rel="noreferrer">Blue Science Park</a>
              </span>
              {m.profiled ? (
                <Link className="btn small" href={`/c/${m.slug}`}>{t("members.open")}</Link>
              ) : (
                <button className="btn quiet small" disabled={!!busy || !m.website} onClick={() => build(m.slug)}>
                  {busy === m.slug ? t("members.building") : t("members.build")}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
