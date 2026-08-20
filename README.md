# World Revolution News – Website

Offizielle Website von **World Revolution News / Solinaridao**. Sie stellt mehrsprachige Nachrichten, Quellenprofile, Termine, Medien, Bibliothek, Lexikon, Solidaritätsangebote und statische Artikel-Landingpages als eigenständige, responsive Webanwendung bereit.

- Live: <https://solinaridao.com/>
- Produktionsstand: **r10n** vom 20. August 2026
- Website-CSS: **Release 37**
- Website-JavaScript: **Release 24**
- Service Worker: **r10n-r45**
- Hosting: statische Apache-/Hostinger-Website

> Dieser Ordner ist die editierbare Quelle des veröffentlichten r10n-Stands. App und Website sind getrennte Produkte. Website-spezifische Navigation, SEO, Landingpages und Responsive-CSS dürfen nicht ungeprüft in die Android-App übernommen werden.

## Architektur

Die Website benötigt keinen klassischen Build-Schritt. Sie wird als statisches Paket ausgeliefert und ergänzt lokale Daten durch ausdrücklich erlaubte Remote-Dienste.

| Bereich | Wichtige Dateien |
|---|---|
| Einstieg und Navigation | `index.html`, `news-app-2.js`, `news-app-2.css` |
| Website-Anpassungen | `news-app-2-website.js`, `news-app-2-website.css`, `website-*.js` |
| Konfiguration | `news-app-2-config.js`, `config.js` |
| Offlinebetrieb | `service-worker.js`, `offline-db.js`, `reading-state.js` |
| Nachrichten und Quellen | `news*.json`, `source-*.json`, `sources-registry.json`, `news-archive/` |
| SEO-Artikel | `articles/<stabile-id>/index.html`, `article-landing-manifest.json`, `sitemap.xml` |
| Termine und Medien | `events*.json`, `podcasts.json`, Audio-/Video-/Radio-Module |
| Datenschutz | `privacy.html`, Sicherheitsheader und CSP in `.htaccess` |
| Qualitätsprüfung | `qa-desktop/`, `qa-r10j/`, `qa-r10k/`, `qa-r10l/`, `qa-r10m/` |

Primäre Remote-Daten kommen von `blackfront161.github.io/Revolution-News-Data` mit einem Raw-GitHub-Mirror. Übersetzung, Proxyzugriffe und optionale Push-Funktionen verwenden die in `news-app-2-config.js` benannten Dienste. Die erlaubten Ursprünge sind zusätzlich in der Content Security Policy von `.htaccess` begrenzt.

## Lokal prüfen

Voraussetzungen:

- aktuelles Node.js für die Quelltests;
- Python oder ein anderer lokaler HTTP-Server;
- Chrome für den visuellen Browser-Reflow-Test.

Nicht direkt über `file://` öffnen, weil Service Worker, Fetch und Browser-Sicherheitsregeln sonst ein anderes Verhalten zeigen. Im Projektordner beispielsweise:

```powershell
python -m http.server 8080
```

Danach <http://127.0.0.1:8080/> öffnen. Der einfache Entwicklungsserver bildet die Apache-Regeln aus `.htaccess` nicht ab; insbesondere der Fallback für unbekannte `/articles/<id>/`-Routen muss zusätzlich in einer Apache-kompatiblen Umgebung geprüft werden.

Die QA-Ordner enthalten sowohl wiederverwendbare Funktionsprüfungen als auch versionsgebundene historische Releaseverträge. Beispiel:

```powershell
node --test qa-r10m/browser-reflow-r10m.test.mjs
```

Vor einer neuen Veröffentlichung müssen außerdem folgende Kontrollen gegen den tatsächlichen Kandidaten laufen:

1. JavaScript-Syntax und JSON-Parsebarkeit;
2. Desktop- und Smartphone-Reflow ab 320 px sowie Querformat;
3. Startseite, Feed, Suche, Sprachwahl, Themes und Artikeldialog;
4. direkter `?article=<id>`-Aufruf und statische `/articles/<id>/`-Landingpage;
5. Teilen-Link, unbekannter Artikel-Fallback und Related-Artikel;
6. Offline-Start, Service-Worker-Aktualisierung und zweiter Start nach Cachewechsel;
7. Browserkonsole, CSP, Datenschutzseite und externe Links.

Versionsgebundene Tests älterer Ordner dürfen nicht durch bloßes Ändern ihrer erwarteten Versionsnummer „repariert“ werden. Für den nächsten Release ist ein eigener, zum Kandidaten passender QA-Vertrag anzulegen.

## Artikel, Sitemap und stabile IDs

Öffentliche Artikel verwenden stabile IDs im Format `wrn-…-…`. Der veröffentlichte r10n-Stand enthält 935 statische Artikelverzeichnisse. Existiert eine statische Landingpage, wird sie als teilbare und suchmaschinenlesbare URL verwendet. Fehlt sie, leitet `.htaccess` sicher auf `/?article=<id>` weiter.

Feed, `article-landing-manifest.json`, `articles/` und `sitemap.xml` müssen aus derselben Datenrevision erzeugt und gemeinsam veröffentlicht werden. Der append-only Generator liegt unter `tools/generate-article-landings.mjs`. Sein sicherer Standardmodus prüft ausschließlich und schreibt nichts:

```text
node tools/generate-article-landings.mjs
node --test qa-generator/article-generator.test.mjs
```

Erst `node tools/generate-article-landings.mjs --write` autorisiert das Erzeugen neuer Landingpages sowie den transaktionalen Austausch von Manifest und Sitemap. Vorhandene Artikelseiten werden dabei validiert, aber nie gelöscht oder ungefragt neu geschrieben. Eine exklusive Sperre verhindert parallele Läufe. Vor der ersten Umbenennung im Arbeitskandidaten werden Stagingdateien, Backups und ein prüfsummenbewehrtes Journal geschrieben. Nach einem abgebrochenen Generatorprozess stellt der nächste Start idempotent entweder den vollständig alten Stand wieder her oder bestätigt den bereits vollständig neuen Stand; erst nach Hash- und Mengenprüfung werden Journal und Backups entfernt. Der normale `--check` verändert keine Website-Inhalte, darf aber eine abgebrochene Generatortransaktion wiederherstellen.

Das ist ein **prozessabbruchfestes transaktionales Recovery mit Best-Effort-Dateisystempersistenz**, keine Zusage von Stromausfall-, Kernel- oder Datenträger-Atomizität. Nach einem solchen Systemverlust kann die vollständige Wiederherstellung aus Git und dem unveränderlichen Release-/Rollbackpaket nötig sein. Der Generator besitzt keine Upload- oder Deploymentfunktion und darf mit `--write` nur in einem Worktree beziehungsweise Releasekandidaten laufen, niemals direkt im live ausgelieferten `public_html`.

Feedzeilen ohne Titel, Inhalt, gültiges Datum oder absolute HTTPS-Originaladresse erscheinen mit Begründung im deterministischen QA-Bericht.

Für die Veröffentlichung gilt weiterhin:

- niemals nur `news*.json` austauschen;
- neue Artikel-Landingpages, Manifest und Sitemap zusammen erzeugen und prüfen;
- nur IDs teilen, die in der Zielrevision auflösbar sind;
- das gesamte Ergebnis als unveränderliches Releasepaket behandeln.

Die vollständige Rekonstruktion historischer Seiten aus einem versionierten Artikelkatalog sowie der Reader-Fallback für nicht mehr im aktiven Feed enthaltene Artikel bleiben offene Folgearbeiten.

## Deployment und Rollback

Der freigegebene Website-Stand wird in einen separaten, unveränderlichen Paketordner kopiert. QA-Ordner, Repository-Metadaten, Logs und lokale Werkzeuge gehören nicht in das Hostingpaket. Das ZIP muss die Website-Dateien direkt auf Archivebene enthalten und darf keinen zusätzlichen übergeordneten Projektordner erzeugen.

Freigabereihenfolge:

1. Kandidat vollständig testen und Versionsreferenzen in `index.html` und `service-worker.js` abgleichen.
2. Unveränderlichen Paketordner und ZIP erzeugen.
3. SHA-256 dokumentieren.
4. Bestehendes `public_html` extern sichern.
5. Paket atomar hochladen beziehungsweise austauschen.
6. Live-Smoke für Startseite, Feed, Artikel, Deep-Link und unbekannten Artikel durchführen.
7. Browserkonsole sowie Service-Worker-Version kontrollieren.

Verifizierte r10n-Referenz:

```text
ZIP: wrn-web-portal-2026-08-20-r10n-package.zip
SHA-256: 91fb096dffcf47200961f5e3925ff1aff41553aeb2204cb8f270a7006f21bfe3
Hostinger-Rollback: public_html-pre-r10n-20260820-1136.zip
```

Für einen Rollback wird die gesicherte vorherige `public_html`-Fassung vollständig wiederhergestellt; anschließend werden Startseite, Artikelroute und Service Worker erneut geprüft. Rollback-ZIPs und Releasepakete werden als Release-Artefakte aufbewahrt, nicht in die normale Git-Historie eingecheckt.

## Datenschutz, Sicherheit und Lizenzen

- Die öffentliche Datenschutzerklärung befindet sich in `privacy.html`.
- Lokale Speicherung, Übersetzung, externe Quellen, Medien, Benachrichtigungen und Löschung sind dort beschrieben.
- Sicherheitsheader, CSP, HTTPS-Weiterleitung und Zugriffsschutz für interne Statusdateien werden in `.htaccess` gesetzt.
- Geheimnisse und private API-Schlüssel dürfen nie in dieses Repository aufgenommen werden. Öffentliche Endpunkte sind Konfiguration, keine Zugangsdaten.
- Nachrichten, Bilder, Audio, Video und andere übernommene Inhalte verbleiben unter den Rechten und Bedingungen ihrer jeweiligen Quellen.
- Im aktuellen Stand ist keine repositoryweite Open-Source-Lizenzdatei vorhanden. Daraus darf keine freie Wiederverwendung des Codes oder der Inhalte abgeleitet werden. Vor einer öffentlichen Lizenzfreigabe müssen Rechte, Drittanbieterkomponenten und Inhaltsquellen getrennt geprüft und eine ausdrückliche `LICENSE` ergänzt werden.
- Änderungen an Übersetzung, Proxy, Karten, OSM-Tiles oder Analysefunktionen erfordern eine erneute Datenschutz- und CSP-Prüfung.

## Offener Arbeitsplan

Priorisierte Website-Aufgaben:

1. historischen Artikelkatalog und Reader-Fallback für aus dem aktiven Feed gefallene Landingpages ergänzen;
2. fehlende optionale Datensätze (`library-feed.json`, `library-sources.json`, `video-feed.json`, `video-health.json`, `editorial-decisions.json`) bereitstellen oder unnötige Remote-Abfragen entfernen;
3. Originalartikel sofort anzeigen, Übersetzung asynchron laden und den Vergleich standardmäßig einklappen;
4. Desktop-Header und sehr große Artikelüberschriften weiter verdichten;
5. Share-Grafik im Format 1200 × 630 und Sprachalternativen für Suchmaschinen ergänzen;
6. Alt-Texte, Touchziele und Tastaturbedienung redaktionell und technisch weiter verbessern;
7. reale Core Web Vitals und langsame/offline Verbindungen regelmäßig messen;
8. pro Release einen aktuellen, versionsgebundenen QA-Vertrag und einen dokumentierten Restore-Test erstellen.

## Beitrags- und Release-Regeln

- Neue Arbeit immer von der zuletzt freigegebenen Quelle ableiten.
- Produktionspakete nie direkt bearbeiten.
- App- und Website-Änderungen getrennt prüfen.
- Keine alten Versionen, Daten oder Rückfallsicherungen löschen, bevor der aktuelle Stand reproduzierbar in Git und als externes Releaseartefakt gesichert ist.
- Veröffentlichung erst nach unabhängiger Prüfung des tatsächlichen Kandidaten.
