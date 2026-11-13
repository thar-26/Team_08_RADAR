"use client";

import { useI18n, type Key } from "@/lib/i18n";

const STEPS: [Key, Key][] = [
  ["step.1", "step.1d"],
  ["step.2", "step.2d"],
  ["step.3", "step.3d"],
  ["step.4", "step.4d"],
];

/** How Radar is used, in four steps. The agents behind it are described in the README. */
export default function Steps() {
  const { t } = useI18n();
  return (
    <ol className="steps">
      {STEPS.map(([h, d], i) => (
        <li key={h}>
          <span className="step-n">{i + 1}</span>
          <h3>{t(h)}</h3>
          <p>{t(d)}</p>
        </li>
      ))}
    </ol>
  );
}
