"use client";

import { getProviders, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const LABEL: Record<string, string> = { google: "Google", "microsoft-entra-id": "Microsoft" };

export default function Login() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const next = params.get("callbackUrl") || "/account";
  const error = params.get("error");
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    getProviders().then((p) => setProviders(Object.keys(p ?? {})));
  }, []);

  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          <h1>{t("auth.title")}</h1>
          <p className="lead">{t("auth.lede")}</p>
        </div>
      </section>
      <section className="shell section" style={{ maxWidth: 640 }}>
        {error && <div className="banner" style={{ marginBottom: 20 }}>{t("auth.error")}</div>}
        <div style={{ display: "grid", gap: 2 }}>
          {providers.map((id) => (
            <button key={id} className="btn navy" style={{ justifyContent: "flex-start", padding: "18px 22px", fontSize: 14 }}
              onClick={() => signIn(id, { callbackUrl: next })}>
              {t("auth.with", { provider: LABEL[id] ?? id })}
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 24 }}>{t("auth.how")}</p>
      </section>
    </>
  );
}
