"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Skeleton, useFetch } from "@/components/ui";
import { api, fmtDate, type Me, type Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Req = { email: string; slug: string; status: string; via: string; created_at: string; name: string };

export default function Account() {
  const { t, lang } = useI18n();
  const me = useFetch(() => api<Me>("/api/me"));
  const members = useFetch(() => api<Member[]>("/api/companies"));
  const [tick, setTick] = useState(0);
  const reqs = useFetch(() => (me.data?.user?.staff ? api<Req[]>("/api/admin/requests") : Promise.resolve([] as Req[])), [me.data?.user?.staff, tick]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const mine = useMemo(() => new Map((me.data?.memberships ?? []).map((m) => [m.slug, m.status])), [me.data]);
  const list = (members.data ?? []).filter((m) => q.length > 1 && m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  async function request(slug: string) {
    const r = await api<{ status: string }>("/api/me/request", { method: "POST", body: JSON.stringify({ slug }) });
    setMsg(r.status === "approved" ? t("acc.approvedNow") : t("acc.pendingNow"));
    me.setData(await api<Me>("/api/me"));
  }
  async function decide(r: Req, approve: boolean) {
    await api("/api/admin/requests/decide", { method: "POST", body: JSON.stringify({ email: r.email, slug: r.slug, approve }) });
    setTick((x) => x + 1);
  }

  if (me.loading) return <section className="shell section"><Skeleton h={240} /></section>;
  const u = me.data?.user;
  if (!u) {
    return (
      <section className="shell section">
        <h1>{t("acc.title")}</h1>
        <p className="lead" style={{ marginTop: 16 }}>{t("acc.signInFirst")}</p>
        <Link className="btn" href="/login?callbackUrl=/account" style={{ marginTop: 24 }}>{t("auth.signIn")}</Link>
      </section>
    );
  }

  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          <h1>{u.name}</h1>
          <div className="meta-line"><span>{u.email}</span>{u.staff && <span className="tag onnavy">{t("acc.staff")}</span>}</div>
        </div>
      </section>

      <section className="shell section side">
        <div>
          <h2>{t("acc.companies")}</h2>
          <div className="list" style={{ marginTop: 24 }}>
            {(me.data?.memberships ?? []).map((m) => (
              <div key={m.slug} className="list-row">
                <div>
                  <h3>{m.name}</h3>
                  <div className="note">{m.status === "approved" ? t("acc.statusApproved") : m.status === "pending" ? t("acc.statusPending") : t("acc.statusRejected")}</div>
                </div>
                {m.status === "approved" && <Link className="btn small" href={`/c/${m.slug}`}>{t("members.open")}</Link>}
              </div>
            ))}
            {!me.data?.memberships?.length && <p className="note" style={{ padding: "16px 0" }}>{u.staff ? t("acc.staffAll") : t("acc.none")}</p>}
          </div>

          {(me.data?.suggestions ?? []).filter((s) => !mine.has(s.slug)).length > 0 && (
            <div className="panel" style={{ marginTop: 32 }}>
              <h3>{t("acc.suggested")}</h3>
              <p className="note" style={{ margin: "6px 0 12px" }}>{t("acc.suggestedWhy")}</p>
              {(me.data?.suggestions ?? []).filter((s) => !mine.has(s.slug)).map((s) => (
                <button key={s.slug} className="btn small" style={{ marginRight: 8 }} onClick={() => request(s.slug)}>{t("acc.connect", { name: s.name })}</button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 40 }}>
            <h3>{t("acc.find")}</h3>
            <input className="input" style={{ marginTop: 12, maxWidth: 420 }} name="company" autoComplete="off" placeholder={t("acc.findPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("acc.find")} />
            <div className="list" style={{ marginTop: 12, borderTopWidth: list.length ? 2 : 0 }}>
              {list.map((m) => (
                <div key={m.slug} className="list-row" style={{ padding: "12px 0" }}>
                  <span>{m.name}</span>
                  {mine.has(m.slug)
                    ? <span className="note">{mine.get(m.slug) === "approved" ? t("acc.statusApproved") : t("acc.statusPending")}</span>
                    : <button className="btn quiet small" onClick={() => request(m.slug)}>{t("acc.request")}</button>}
                </div>
              ))}
            </div>
            {msg && <div className="banner info" role="status" style={{ marginTop: 14 }}>{msg}</div>}
          </div>
        </div>

        {u.staff && (
          <aside className="panel">
            <h3>{t("acc.requests")}</h3>
            {(reqs.data ?? []).filter((r) => r.status === "pending").length === 0 && <p className="note">{t("acc.noRequests")}</p>}
            {(reqs.data ?? []).filter((r) => r.status === "pending").map((r) => (
              <div key={r.email + r.slug} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <b>{r.email}</b>
                <div className="note">{r.name} · {fmtDate(r.created_at, lang)}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn small" onClick={() => decide(r, true)}>{t("acc.approve")}</button>
                  <button className="btn quiet small" onClick={() => decide(r, false)}>{t("acc.reject")}</button>
                </div>
              </div>
            ))}
          </aside>
        )}
      </section>
    </>
  );
}
