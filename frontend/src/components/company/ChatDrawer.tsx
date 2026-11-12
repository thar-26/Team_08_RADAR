"use client";

import { useEffect, useRef, useState } from "react";
import { api, GUARD_LABEL, host, type ChatResp } from "@/lib/api";

type Msg = { role: "user" | "assistant"; text: string; resp?: ChatResp };

const SUGGESTIONS = [
  "Which open call fits us best, and what should we do before the deadline?",
  "Is there a testbed in Karlskrona where we could run a pilot?",
  "Which members could we talk to about a joint project?",
];

/** Minimal, safe formatting: **bold** and [O1]-style citation markers. No HTML injection. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[OP]\d+\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <b key={i} style={{ fontWeight: 600 }}>{p.slice(2, -2)}</b>
        : /^\[[OP]\d+\]$/.test(p) ? <sup key={i} className="mono" style={{ color: "var(--sea)", fontSize: 10 }}>{p}</sup>
        : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export default function ChatDrawer({ slug, name, open, onClose }: { slug: string; name: string; open: boolean; onClose: () => void }) {
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
      const r = await api<ChatResp>(`/api/companies/${slug}/chat`, { method: "POST", body: JSON.stringify({ message }) });
      setMsgs((m) => [...m, { role: "assistant", text: r.answer, resp: r }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Something went wrong: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api(`/api/companies/${slug}/chat`, { method: "DELETE" });
    setMsgs([]);
  }

  return (
    <aside className={`drawer ${open ? "open" : ""}`} aria-hidden={!open} aria-label="Ask Radar">
      <div className="drawer-head">
        <div>
          <div className="eyebrow">Ask Radar · for {name}</div>
          <div style={{ fontSize: 12.5 }} className="muted">Science-park questions only. Answers cite their sources.</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost small" onClick={clear}>Clear</button>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
      <div className="chat-log" ref={logRef}>
        {!msgs.length && (
          <div className="stack">
            <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Try one of these — or test the limits on purpose.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn ghost small" style={{ textAlign: "left", justifyContent: "flex-start" }} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.resp && m.resp.guard.category !== "relevant" && (
              <div className="guard"><span className={`tag ${m.resp.guard.category === "unclear" ? "sea" : "bad"}`}>{GUARD_LABEL[m.resp.guard.category]}</span></div>
            )}
            <div style={{ whiteSpace: "pre-wrap" }}>{m.role === "assistant" ? <Rich text={m.text} /> : m.text}</div>
            {m.resp?.next_step && <div style={{ marginTop: 8, fontSize: 13 }}><span className="eyebrow">Next step </span>{m.resp.next_step}</div>}
            {m.resp?.refer_to_staff && (
              <div style={{ marginTop: 8 }}>
                <a className="btn small" href="https://www.bluesciencepark.se/kontakt/kontaktpersoner/" target="_blank" rel="noreferrer">Contact Blue Science Park staff ↗</a>
              </div>
            )}
            {!!m.resp?.citations.length && (
              <div style={{ marginTop: 10, borderTop: "1px dotted var(--rule-strong)", paddingTop: 6 }}>
                {m.resp.citations.map((c) => (
                  <div key={c.ref} className="stamp" style={{ display: "flex" }}>
                    <span>[{c.ref}]</span>
                    <a href={c.url} target="_blank" rel="noreferrer">{c.title.slice(0, 70)}{c.title.length > 70 ? "…" : ""} · {host(c.url)} ↗</a>
                    {c.date && <span>{c.date.slice(0, 10)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant muted mono">Guard checking · Concierge reading…</div>}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about funding, events, testbeds, partners…" aria-label="Message" />
        <button className="btn" disabled={busy || !text.trim()}>Send</button>
      </form>
    </aside>
  );
}
