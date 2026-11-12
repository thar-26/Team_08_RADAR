"use client";

import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div className="shell spread" style={{ alignItems: "flex-start" }}>
        <span style={{ maxWidth: 640 }}>{t("footer.left")}</span>
        <span>{t("footer.right")}</span>
      </div>
    </footer>
  );
}
