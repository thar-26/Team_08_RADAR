"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Registry = {
  orgnr: string;
  status: "verified" | "name_mismatch" | "not_found" | "error";
  name_match: number;
  fetched_at: string;
  data: {
    name: string; legal_form: string; registered: string; active: boolean; description: string;
    sni: { code: string; text: string }[]; city: string;
  } | null;
};

/** Official facts from Bolagsverket. The company enters its organisation number;
 *  Radar checks that the registered name matches before using the data. */
export default function RegistryPanel({ slug, onVerified }: { slug: string; onVerified: () => void }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<{ configured: boolean; registry: Registry | null } | null>(null);
  const [orgnr, setOrgnr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ configured: boolean; registry: Registry | null }>(`/api/companies/${slug}/registry`).then(setState).catch(() => setState(null));
  }, [slug]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ status: string; registry: Registry }>(`/api/companies/${slug}/registry`, { method: "POST", body: JSON.stringify({ orgnr }) });
      setState({ configured: true, registry: r.registry });
      if (r.status === "verified") onVerified();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const r = state.registry;
  return (
    <div className="panel">
      <h3>{t("reg.title")}</h3>
      {!state.configured && <p className="note" style={{ margin: "8px 0 0" }}>{t("reg.notConfigured")}</p>}

      {r?.status === "verified" && r.data && (
        <div style={{ marginTop: 10, fontSize: 15 }}>
          <span className="tag ok">{t("reg.verified")}</span>
          <dl style={{ margin: "12px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px" }}>
            <dt className="note">{t("reg.name")}</dt><dd style={{ margin: 0 }}>{r.data.name}</dd>
            <dt className="note">{t("reg.orgnr")}</dt><dd style={{ margin: 0 }} className="num">{r.orgnr.replace(/(\d{6})(\d{4})/, "$1-$2")}</dd>
            {r.data.legal_form && <><dt className="note">{t("reg.form")}</dt><dd style={{ margin: 0 }}>{r.data.legal_form}</dd></>}
            {r.data.registered && <><dt className="note">{t("reg.registered")}</dt><dd style={{ margin: 0 }}>{fmtDate(r.data.registered, lang)}</dd></>}
            <dt className="note">{t("reg.status")}</dt><dd style={{ margin: 0 }}>{r.data.active ? t("reg.active") : t("reg.inactive")}</dd>
            {r.data.city && <><dt className="note">{t("reg.city")}</dt><dd style={{ margin: 0 }}>{r.data.city}</dd></>}
            {r.data.sni.length > 0 && <><dt className="note">SNI</dt><dd style={{ margin: 0 }}>{r.data.sni.map((s) => `${s.code} ${s.text}`).join("; ")}</dd></>}
          </dl>
          {r.data.description && <p style={{ margin: "12px 0 0" }}>{r.data.description}</p>}
          <p className="note" style={{ margin: "10px 0 0" }}>{t("reg.source", { date: fmtDate(r.fetched_at, lang) })}</p>
        </div>
      )}
      {r?.status === "name_mismatch" && r.data && (
        <div className="banner" style={{ marginTop: 10 }}>{t("reg.mismatch", { name: r.data.name })}</div>
      )}

      {state.configured && r?.status !== "verified" && (
        <form style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="field" htmlFor="reg-orgnr">{t("reg.orgnr")}</label>
          <div className="row" style={{ gap: 0, flexWrap: "nowrap" }}>
            <input id="reg-orgnr" name="orgnr" className="input" inputMode="numeric" autoComplete="off" spellCheck={false}
              placeholder="556123-4567…" value={orgnr} onChange={(e) => setOrgnr(e.target.value)} />
            <button className="btn" disabled={busy || orgnr.replace(/\D/g, "").length < 10}>{busy ? t("reg.checking") : t("reg.check")}</button>
          </div>
          <p className="note" style={{ margin: "8px 0 0" }}>{t("reg.why")}</p>
          {err && <div className="banner" style={{ marginTop: 10 }}>{err}</div>}
        </form>
      )}
    </div>
  );
}

