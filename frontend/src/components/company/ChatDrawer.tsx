"use client";

import { useEffect, useRef, useState } from "react";
import { api, host, type ChatResp } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

type Msg = { role: "user" | "assistant"; text: string; resp?: ChatResp };

/** A random id per browser tab: an anonymous visitor's conversation is theirs
 *  alone and is never shown to anyone else. */
function chatSession(): string {
  try {
    let id = sessionStorage.getItem("radar-chat");
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("radar-chat", id); }
    return id;
  } catch {
    return (globalThis as { __radarChat?: string }).__radarChat ??= crypto.randomUUID();
  }
}

/** Minimal, safe formatting: **bold** and [O1]-style citation markers. No HTML injection. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[OPM]\d+\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <b key={i} style={{ fontWeight: 600 }}>{p.slice(2, -2)}</b>
        : /^\[[OPM]\d+\]$/.test(p) ? <sup key={i} style={{ color: "var(--link)", fontSize: 11, fontWeight: 700 }}>{p}</sup>
        : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export default function ChatDrawer({ slug, name, open, onClose }: { slug: string; name: string; open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<ChatResp>(`/api/companies/${slug}/chat`, { method: "POST", body: JSON.stringify({ message, lang, session: chatSession() }) });
      setMsgs((m) => [...m, { role: "assistant", text: r.answer, resp: r }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: t("chat.error", { e: (e as Error).message }) }]);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api(`/api/companies/${slug}/chat?session=${chatSession()}`, { method: "DELETE" });
    setMsgs([]);
  }

  return (
    <aside className={`drawer ${open ? "open" : ""}`} inert={!open} aria-label={t("co.ask")}>
      <div className="drawer-head">
        <div>
          <div style={{ fontWeight: 600 }}>{t("chat.title", { name })}</div>
          <div style={{ fontSize: 12.5, opacity: 0.8 }}>{t("chat.sub")}</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <button className="btn small" onClick={() => { if (!msgs.length || confirm(t("chat.confirmClear"))) clear(); }}>{t("chat.clear")}</button>
          <button className="btn small" onClick={onClose} >{t("chat.close")}</button>
        </div>
      </div>
      <div className="chat-log" ref={logRef}>
        {!msgs.length && (
          <div className="chat-suggest">
            <p className="note" style={{ margin: 0 }}>{t("chat.try")}</p>
            {(["chat.s1", "chat.s2", "chat.s3"] as Key[]).map((k) => (
              <button key={k} className="btn small" style={{ textAlign: "left", justifyContent: "flex-start", width: "100%", textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: 15, background: "var(--white)", color: "var(--ink)", marginBottom: 2 }} onClick={() => send(t(k))}>{t(k)}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.resp && m.resp.guard.category !== "relevant" && (
              <div style={{ marginBottom: 6 }}>
                <span className={`tag ${m.resp.guard.category === "unclear" ? "funding" : "danger"}`}>{t(`guard.${m.resp.guard.category}` as Key)}</span>
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap" }}>{m.role === "assistant" ? <Rich text={m.text} /> : m.text}</div>
            {m.resp?.next_step && <div style={{ marginTop: 8, fontSize: 13 }}><b>{t("feed.next")}:</b> {m.resp.next_step}</div>}
            {m.resp?.refer_to_staff && (
              <div style={{ marginTop: 10 }}>
                <a className="btn small" href="https://www.bluesciencepark.se/kontakt/kontaktpersoner/" target="_blank" rel="noreferrer">{t("chat.staff")} ↗</a>
              </div>
            )}
            {!!m.resp?.citations.length && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                {m.resp.citations.map((c) => (
                  <div key={c.ref} className="stamp" style={{ display: "flex" }}>
                    <b style={{ color: "var(--link)" }}>[{c.ref}]</b>
                    {c.kind === "member" && c.slug && c.profiled
                      ? <a href={`/c/${c.slug}`}>{c.title} · {t("mem.radarProfile")}</a>
                      : <a href={c.url} target="_blank" rel="noreferrer">{c.title.slice(0, 64)}{c.title.length > 64 ? "…" : ""} · {host(c.url)} ↗</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant note">{t("chat.busy")}</div>}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="input" name="message" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} />
        <button className="btn" disabled={busy || !text.trim()}>{t("chat.send")}</button>
      </form>
    </aside>
  );
}
