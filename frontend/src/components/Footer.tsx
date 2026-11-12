"use client";

import { useI18n } from "@/lib/i18n";

/** Every picture on the site is from an open collection and credited here. */
export const PHOTOS = {
  aerial: { src: "/assets/karlskrona-from-plane.jpg", title: "Karlskrona from plane", by: "Peppigue", licence: "CC0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en", page: "https://commons.wikimedia.org/wiki/File:Karlskrona_from_plane.JPG" },
  ship: { src: "/assets/hms-trosso.jpg", title: "HMS Trossö", by: "Xiziz", licence: "CC BY-SA 3.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/w/index.php?curid=8945533" },
  campus: { src: "/assets/view-from-blekinge-institute-of-technology-at.jpg", title: "View from BTH at Campus Gräsvik", by: "Daderot", licence: "CC0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en", page: "https://commons.wikimedia.org/w/index.php?curid=41440619" },
  island: { src: "/assets/stumholmen-karlskrona-by-pudelek.jpg", title: "Stumholmen, Karlskrona", by: "Pudelek", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/w/index.php?curid=43301387" },
};

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div className="shell">
        <p className="footer-word">Radar</p>
        <div className="spread" style={{ alignItems: "flex-start", gap: 28 }}>
          <p style={{ maxWidth: 560, margin: 0 }}>{t("footer.left")}</p>
          <div style={{ maxWidth: 560 }}>
            <p style={{ margin: 0 }}>{t("footer.right")}</p>
            <p style={{ margin: "10px 0 0" }}>
              {t("footer.photo")}{" "}
              {Object.values(PHOTOS).map((p, i) => (
                <span key={p.src}>
                  {i > 0 && "; "}
                  <a href={p.page}>“{p.title}”</a> by {p.by}, <a href={p.licenceUrl}>{p.licence}</a>
                </span>
              ))}
              , via Wikimedia Commons.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
