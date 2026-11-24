# foorgun.ai Social Agent

Veröffentlicht die **englischen** Posts der Serie „Your place in the AI revolution“
automatisch auf der foorgun.ai-**Instagram**- und **LinkedIn**-Seite. Mo, Mi und Fr
geht je Plattform ein Post raus, und **zwei Posts hintereinander haben nie dasselbe Thema**.

Deutsche Posts sind bewusst nicht enthalten.

## Was drin ist

| Ordner | Inhalt |
|---|---|
| `source/` | Export der englischen Seiten aus dem Design-Canvas (Slides + Captions) |
| `content/posts.json` | 32 Posts, 7 Themen, mit Captions je Plattform und Hashtags |
| `media/` | Fertige Bilder (1080×1350 JPEG) und LinkedIn-Carousels als PDF |
| `src/` | Der Agent: Themen-Rotation, Instagram- und LinkedIn-Anbindung |
| `state/history.json` | Was schon veröffentlicht ist (wird nach jedem Lauf committet) |
| `.github/workflows/publish.yml` | Zeitplan in GitHub Actions |

**Aufteilung:** Posts mit „both“ gehen auf beide Plattformen, „Instagram“-Posts nur
auf Instagram, die PDF-Carousels B4, C5, D4, F4 nur auf LinkedIn.
Instagram: 28 Posts, LinkedIn: 20 Posts. Bei 3×/Woche reicht das ca. 9 bzw. 7 Wochen.

**Themen-Rotation:** Jede Plattform hat ihre eigene Reihenfolge. Es wird immer das Thema
mit den meisten offenen Posts gewählt, das nicht das zuletzt gepostete ist.
Die komplette geplante Reihenfolge zeigt `npm run plan`.

## Einrichtung (einmalig)

### 1. GitHub-Repository

Das Repo muss **öffentlich** sein, weil Instagram die Bilder selbst von einer
öffentlichen URL abholt (`raw.githubusercontent.com/…/media`). Es enthält keine
Zugangsdaten, nur die Posts, die ohnehin veröffentlicht werden.
Willst du es privat halten, lade `media/` woanders hoch und setze die Repo-Variable
`MEDIA_BASE_URL` auf diese Adresse.

### 2. Instagram (Meta)

Voraussetzung: Instagram-**Business**-Konto, verbunden mit einer Facebook-Seite.

1. Auf [developers.facebook.com](https://developers.facebook.com/apps) eine App vom Typ
   *Business* anlegen und das Produkt **Instagram Graph API** hinzufügen.
2. Im [Meta Business Manager](https://business.facebook.com/settings) unter
   *Benutzer › Systemnutzer* einen Systemnutzer anlegen, ihm die App und das
   Instagram-Konto zuweisen und einen Token **ohne Ablaufdatum** erzeugen mit den Rechten
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
3. Die Instagram-User-ID findest du mit dem Token über
   `GET https://graph.facebook.com/v23.0/me/accounts?fields=instagram_business_account`.
4. In GitHub als Secrets speichern: `IG_USER_ID`, `IG_ACCESS_TOKEN`.

### 3. LinkedIn

1. Auf [linkedin.com/developers](https://www.linkedin.com/developers/apps) eine App
   anlegen und mit der foorgun.ai-Unternehmensseite verknüpfen (Seiten-Admin bestätigt).
2. Unter *Products* die **Community Management API** beantragen. Die Freigabe durch
   LinkedIn kann einige Tage bis Wochen dauern.
3. Nach Freigabe per OAuth einen Token mit den Rechten `w_organization_social`
   (und `r_organization_social`) erzeugen, z. B. mit dem
   [Token Generator](https://www.linkedin.com/developers/tools/oauth/token-generator).
4. Die Organisations-ID steht in der URL deiner Unternehmensseiten-Verwaltung
   (`linkedin.com/company/<ID>/admin`).
5. In GitHub als Secrets speichern: `LINKEDIN_ORG_ID`, `LINKEDIN_ACCESS_TOKEN`.
   Access-Tokens laufen nach 60 Tagen ab. Wenn deine App Refresh-Tokens bekommt,
   zusätzlich `LINKEDIN_REFRESH_TOKEN`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
   speichern; dann erneuert der Agent den Token selbst (ein Jahr lang).

### 4. Testen

In GitHub unter *Actions › Social posts veröffentlichen › Run workflow*:
- `dry-run` zeigt nur an, was gepostet würde.
- `publish` veröffentlicht sofort (je Plattform den nächsten Post).

Danach läuft alles automatisch nach Zeitplan. Schlägt ein Lauf fehl, schickt GitHub
eine E-Mail; der Post wird beim nächsten Lauf erneut versucht.

## Bedienung

```bash
npm run plan                               # geplante Reihenfolge anzeigen
npm run dry-run                            # nächsten Post je Plattform anzeigen
node src/agent.mjs --only=linkedin         # nur LinkedIn veröffentlichen
```

- **Plattform pausieren:** Repo-Variable `INSTAGRAM_ENABLED` oder `LINKEDIN_ENABLED` auf `false`.
- **Rhythmus ändern:** die `cron`-Zeile in `.github/workflows/publish.yml`.
- **Post auslassen:** in `state/history.json` bei der Plattform `{ "id": "C2", "topic": "C" }` eintragen.
- **Von vorn beginnen:** die Listen in `state/history.json` leeren.

## Inhalte aktualisieren

Wenn sich Slides oder Captions im Canvas ändern: die geänderten `en/*.dc.html` nach
`source/slides/` und die Notizen nach `source/canvas-en.json` übernehmen, dann

```bash
npm install
npm run build      # Captions neu einlesen, Bilder und PDFs neu rendern
```

und das Ergebnis committen.
