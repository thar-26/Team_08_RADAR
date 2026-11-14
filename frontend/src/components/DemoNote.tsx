"use client";

import { HOSTED } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/** A one-line note shown only in the online demo. */
export default function DemoNote() {
  const { t } = useI18n();
  if (!HOSTED) return null;
  return <div className="demo-note" role="note">{t("demo.note")}</div>;
}
