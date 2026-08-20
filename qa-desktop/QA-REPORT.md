# WRN Desktop-Arbeitsstand – QA-Bericht

Stand: 2026-08-16 12:00 CEST  
Ergebnis: **PASS – lokal, nicht veröffentlicht**

## Ergebnis

- Der dauerhaft 281px hohe Live-Header wurde lokal auf 165px im Ausgangszustand und 107px im gescrollten Desktopzustand reduziert.
- Das Logo misst 104px und fällt beim Scrollen auf 54px zusammen.
- Das redaktionelle Desktop-Raster verwendet zwei Spalten; eine typische 1440px-Karte fiel von ca. 441×654px auf ca. 675×334px.
- Karten zeigen Titel plus genau einen vollständigen ersten Satz. Unvollständige, ellipsierte oder überlange Sätze werden ausgelassen.
- Datumsordinal und Abkürzungen sind sowohl mit `Intl.Segmenter` als auch ohne ihn abgesichert. Der Satz `Kommt am 10. Oktober … U5-Brandenburger Tor.` bleibt vollständig.
- Desktop-Aktionen sind kompakt: Öffnen primär, Übersetzen sekundär, Speichern als Icon; alle Ziele 44px hoch. Mobile Regeln bis 700px wurden nicht überschrieben.
- Pro Karte existiert genau eine kanonische Übersetzungsstatuszeile.

## Exakte Browsermessungen

| Viewport | Header initial | Header gescrollt | Inner initial/kompakt | Logo initial/kompakt | Navigation initial/kompakt | typische erste Karte | horizontaler Overflow |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1024×800 | 165px | 107px | 116/62px | 104/54px | 48/44px | 475×378px | nein |
| 1280×800 | 165px | 107px | 116/62px | 104/54px | 48/44px | 598×333px | nein |
| 1440×900 | 165px | 107px | 116/62px | 104/54px | 48/44px | 675×334px | nein |
| 1920×1080 | 165px | 107px | 116/62px | 104/54px | 48/44px | 711×334px | nein |

App-, Spenden- und Menübutton messen im kompakten Zustand an allen vier Desktopbreiten mindestens 44×44px. Kartenaktionen messen 116×44px, 116×44px und 44×44px.

### 200%-Reflow

Der kontrollierte Browser ließ seinen UI-Zoom nicht per Tastenkürzel umstellen. Deshalb wurde die layoutäquivalente CSS-Fläche von 720×450px geprüft (1440×900 bei 200%): Header 109px initial/63px kompakt, Logo 92/54px, alle Headeraktionen 44px, kein horizontaler Overflow. Dies belegt den Reflow; es behauptet keinen erfolgreich gesetzten Browser-UI-Zoom.

## Übersetzungs-DOM und Race-Test

Reale Fixture mit 650ms verzögerter Übersetzungs-Promise:

- Währenddessen: `queued`, `aria-busy=true`, exakt 1 Statusnode, kein `data-machine-translation`.
- Danach: `done`, `aria-busy` entfernt, exakt 1 Statusnode, `data-machine-translation=true`, Text `Maschinell übersetzt aus Englisch`.
- Eine transiente Statusnode ist kein Erfolgsnachweis. Ein Erfolg erfordert echte Machine-Markierung und passenden Fingerprintzustand.
- Bei lokal erwarteter Worker-Ablehnung bleibt exakt eine ehrliche Fehlerstatuszeile stehen.
- Ungültige Herkunft (`UND`, `unknown`, `mul`, `zxx`, `garbage`) rendert nur `Maschinell übersetzt`.

## Automatisierte Tests

`node --test qa-desktop/desktop-refinement.test.mjs`: **10/10 PASS**

Abgedeckt:

- vollständiger erster Satz, Ellipse, Überlänge, Zitat;
- `Jr.`/`Pl.` und deutscher Datumsordinal;
- identischer Fallback ohne `Intl.Segmenter`;
- Sprachherkunft ohne UND/Rohcode;
- kanonische Übersetzungsstatusnode und Erfolgspriorisierung;
- keine Desktop-Line-Clamps;
- kompakte Desktopaktionen und 44px-Ziele;
- Index/Service-Worker-Revisionsgleichheit (`desktop-r35`);
- unveränderte SEO-/Landingpage-/Feed-/Share-Kerndateien.

Alle geänderten JavaScript-Dateien bestehen `node --check`.

## Screenshots

- `screenshots/final-desktop-1024x800.png`
- `screenshots/final-desktop-1280x800.png`
- `screenshots/final-desktop-1440x900.png`
- `screenshots/final-desktop-1920x1080.png`
- `screenshots/chrome-desktop-1440x900-corrected.png` – vollständiger Datums-Teaser.
- `screenshots/chrome-desktop-1440x900-news-grid-refined.png` – kompaktes Zweispaltenraster und Action-Zeile.
- `screenshots/zoom-equivalent-200-percent-1440x900.png` – 200%-Reflowäquivalent.

## Grenzen

- Keine Veröffentlichung und kein Hostinger-Zugriff.
- Diese Arbeit hat App, GitHub, Cloudflare und Google Play nicht verändert. Im separaten App-Repository erschienen während der Abschlussprüfung parallel/unabhängig uncommittete Änderungen; sie wurden weder geöffnet noch angefasst und sind nicht Bestandteil dieses Website-Arbeitsstands.
- Lokale optionale Zusatzfeeds liefern weiterhin die bereits bekannte 404-/Fallback-Warnung; der Snapshot-Start und die Kernansicht funktionieren davon unabhängig.
