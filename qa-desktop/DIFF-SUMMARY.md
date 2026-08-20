# r10i → Desktop-Arbeitsstand: Diff-Zusammenfassung

Basis: `wrn-web-portal-2026-08-15-r10i-package`

## Geänderte Website-Dateien

| Datei | + | - | Inhalt |
|---|---:|---:|---|
| `index.html` | 6 | 5 | revisionssichere Einbindung des Editorial-Helfers und der überarbeiteten Assets |
| `news-app-2-website.css` | 189 | 0 | kompakter Masthead/Sticky-Zustand, Desktop-Raster, Typografie und kompakte Kartenaktionen |
| `news-app-2-website.js` | 1 | 1 | Scroll-Kompaktmodus auch im 200%-Reflow oberhalb 700 CSS-px |
| `news-app-2.js` | 30 | 9 | vollständiger erster Satz, optionale Teaser, Bildkartenklasse, Übersetzungs-DOM-Update |
| `service-worker.js` | 8 | 7 | lokaler Cache `desktop-r35`, neue/revisionierte Shell-URLs |
| `website-auto-translate.js` | 23 | 6 | genau eine kanonische Statuszeile, asynchroner Erfolgsvertrag |
| `website-language-origin.js` | 10 | 10 | natürliche Herkunftsformulierung ohne UND/Rohcode |

## Neue Dateien

- `website-editorial-text.js`: robuste Satzextraktion mit `Intl.Segmenter` und gleichwertigem Fallback.
- `qa-desktop/desktop-refinement.test.mjs`: deterministische Verträge.
- `qa-desktop/delayed-translation-fixture.html`: reale verzögerte Autoübersetzungsstrecke.
- `qa-desktop/serve-desktop.mjs`: lokaler, bind-lokaler QA-Server.
- `qa-desktop/screenshots/`: Browsernachweise.

## Unverändert belegt

- 935 Artikel-Landingpage-Verzeichnisse; `sitemap.xml` weiterhin 937 URLs.
- `article-landing.css`, `sitemap.xml`, `robots.txt`, `news-feed.json`, `website-portal-core.js` und `website-link-security.js` sind byteidentisch zur r10i-Basis.
- Diese Website-Arbeit hat keinen App-Pfad angefasst. Am Ende waren im separaten App-Repository parallel/unabhängig uncommittete Änderungen sichtbar (`index.html`, `news-app-2-sw.js`, `news-app-2.js`, `service-worker.js`, `news-card-copy.js`, `tests/test_news_card_copy.js`); sie liegen vollständig außerhalb dieses Diffs und wurden bewahrt. HEAD blieb `949293da0fc1a1359218f5424d60c60a0cbec366`.
- Keine Live-/Hostinger-Datei wurde verändert.
