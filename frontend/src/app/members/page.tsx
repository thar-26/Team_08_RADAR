"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ErrorNote, Skeleton, useFetch } from "@/components/ui";
import { api, type Member } from "@/lib/api";

export default function Members() {
  const router = useRouter();
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
    <section className="shell section">
      <div className="spread">
        <div>
          <div className="eyebrow">Official member list · bluesciencepark.se</div>
          <h1 style={{ marginTop: 12, fontSize: "clamp(32px,4vw,48px)" }}>Members & partners</h1>
        </div>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Filter by name or industry…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter members" />
      </div>
      <p className="lede" style={{ marginTop: 14 }}>
        Profiled members open their personal radar. Any other member can be profiled on demand — the agents read its public pages,
        verify every quote and rank today&apos;s opportunities in about a minute.
      </p>
      {error && <ErrorNote error={error} />}
      {err && <div className="banner" style={{ marginTop: 16 }}>{err}</div>}
      <hr className="rule" style={{ margin: "28px 0 0", borderTopColor: "var(--ink)" }} />
      {loading && <div style={{ padding: 20 }}><Skeleton h={200} /></div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 0 }}>
        {list.map((m) => (
          <div key={m.slug} id={m.slug} style={{ padding: "18px 18px 18px 0", borderBottom: "1px solid var(--rule)" }}>
            <div className="eyebrow">{m.industry || "—"}</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 20, marginTop: 4 }}>{m.name}</div>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              {m.profiled ? (
                <Link className="btn small" href={`/c/${m.slug}`}>Open radar</Link>
              ) : (
                <button className="btn ghost small" disabled={!!busy || !m.website} onClick={() => build(m.slug)}>
                  {busy === m.slug ? "Agents at work…" : "Profile this member"}
                </button>
              )}
              {m.website && <a className="mono muted" href={m.website} target="_blank" rel="noreferrer">website ↗</a>}
              <a className="mono muted" href={m.bsp_page} target="_blank" rel="noreferrer">BSP ↗</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
