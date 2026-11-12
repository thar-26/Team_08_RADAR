"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui";
import { api, API, fmtDate, type Alerts } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

const KINDS = ["funding", "event", "testbed"] as const;

export default function AlertsTab({ slug, toast }: { slug: string; toast: (m: string) => void }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<Alerts | null>(null);
  const [email, setEmail] = useState("");
  const [kinds, setKinds] = useState<string[]>([...KINDS]);
  const [level, setLevel] = useState("possible");
  const [mailLang, setMailLang] = useState<string>(lang);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  useEffect(() => {
    if (!preview) return;
    fetch(`${API}/api/outbox/${preview}`).then((r) => r.text()).then(setPreviewHtml).catch(() => setPreviewHtml(""));
  }, [preview]);

  useEffect(() => {
    api<Alerts>(`/api/companies/${slug}/alerts`).then((d) => {
      setData(d);
      if (d.subscription) {
        setEmail(d.subscription.email);
        setKinds(d.subscription.kinds);
        setLevel(d.subscription.min_relevance);
        setMailLang(d.subscription.lang);
      }
      if (d.outbox[0]) setPreview(d.outbox[0].id);
    });
  }, [slug]);

  async function call(path: string, init: RequestInit, done?: (d: Alerts) => void) {
    setBusy(true);
    setErr(null);
    try {
      const d = await api<Alerts>(path, init);
      setData(d);
      if (d.outbox[0]) setPreview(d.outbox[0].id);
      done?.(d);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sub = data?.subscription;
  const active = !!sub?.active;
  if (!data) return <div style={{ marginTop: 22 }}><Skeleton h={260} /></div>;

  return (
    <div className="split" style={{ paddingTop: 48, gap: 48 }}>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("al.title")}</h3>
          <span className={`tag ${active ? "ok" : ""}`}>{active ? t("al.active", { email: sub!.email }) : t("al.inactive")}</span>
        </div>
        <p style={{ fontSize: 16, margin: "10px 0 20px" }}>{t("al.lede")}</p>

        <label className="field" htmlFor="al-email">{t("al.email")}</label>
        <input id="al-email" name="email" className="input" type="email" autoComplete="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@foretag.se" />

        <div style={{ marginTop: 14 }}>
          <span className="field">{t("al.kinds")}</span>
          <div className="seg" role="group">
            {KINDS.map((k) => (
              <button key={k} aria-pressed={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}>
                {t(`kind.${k}` as Key)}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 18, alignItems: "flex-start" }}>
          <div>
            <span className="field">{t("al.level")}</span>
            <div className="seg" role="group">
              <button aria-pressed={level === "possible"} onClick={() => setLevel("possible")}>{t("al.levelPossible")}</button>
              <button aria-pressed={level === "strong"} onClick={() => setLevel("strong")}>{t("al.levelStrong")}</button>
            </div>
          </div>
          <div>
            <span className="field">{t("al.lang")}</span>
            <div className="seg" role="group">
              <button aria-pressed={mailLang === "sv"} onClick={() => setMailLang("sv")}>Svenska</button>
              <button aria-pressed={mailLang === "en"} onClick={() => setMailLang("en")}>English</button>
            </div>
          </div>
        </div>
        <label className="check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t("al.consent")}</span>
        </label>
        {err && <div className="banner" style={{ marginTop: 12 }}>{err}</div>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy || !consent || !email.includes("@") || !kinds.length}
            onClick={() => call(`/api/companies/${slug}/alerts`, { method: "POST", body: JSON.stringify({ email, kinds, min_relevance: level, lang: mailLang, consent }) },
              (d) => toast(d.new ? t("al.newFound", { n: d.new }) : t("al.none")))}>
            {busy ? "…" : active ? t("al.update") : t("al.subscribe")}
          </button>
          {!active && (!consent || !email.includes("@")) && <span className="note">{t("al.needs")}</span>}
          {active && (
            <>
              <button className="btn navy" disabled={busy}
                onClick={() => call(`/api/companies/${slug}/alerts/check`, { method: "POST" }, (d) => toast(d.new ? t("al.newFound", { n: d.new }) : t("al.none")))}>
                {t("al.check")}
              </button>
              <button className="btn danger" disabled={busy}
                onClick={() => confirm(t("al.confirmStop")) && call(`/api/companies/${slug}/alerts`, { method: "DELETE" }, () => toast(t("al.unsubscribed")))}>
                {t("al.stop")}
              </button>
            </>
          )}
        </div>
        {active && <p className="note" style={{ marginTop: 14 }}>{t("al.tip")}</p>}
        <div className={`banner ${data.smtp_configured ? "info" : ""}`} style={{ marginTop: 16 }}>
          {data.smtp_configured ? t("al.smtpOn") : t("al.smtpOff")}
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 14 }}>{t("al.outbox")}</h3>
        {!data.outbox.length && <div className="panel note">{t("al.outboxEmpty")}</div>}
        <div className="stack">
          {data.outbox.map((m) => (
            <button key={m.id} onClick={() => setPreview(m.id)}
              style={{ width: "100%", textAlign: "left", padding: "14px 16px", cursor: "pointer", border: 0, background: preview === m.id ? "var(--sky-soft)" : "var(--step)", marginBottom: 2 }}>
              <div className="spread">
                <b style={{ fontSize: 15 }}>{m.subject}</b>
                <span className={`tag ${m.status === "sent" ? "ok" : m.status === "failed" ? "danger" : "warn"}`}>
                  {m.status === "sent" ? t("al.statusSent") : m.status === "failed" ? t("al.statusFailed") : t("al.statusPreview")}
                </span>
              </div>
              <div className="note">{m.email} · {fmtDate(m.created_at, lang)}</div>
            </button>
          ))}
        </div>
        {preview && (
          <div style={{ marginTop: 14, background: "var(--step)" }}>
            <div className="note" style={{ padding: "10px 14px" }}>{t("al.preview")}</div>
            {/* Sandboxed: the email HTML can't run scripts or navigate the page. */}
            <iframe title={t("al.preview")} srcDoc={previewHtml} style={{ width: "100%", height: 600, border: 0, background: "#F4F7FD", display: "block" }} sandbox="allow-popups allow-popups-to-escape-sandbox" />
          </div>
        )}
      </div>
    </div>
  );
}
