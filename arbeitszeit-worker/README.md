# Arbeitszeit Rapport – Deployment-Anleitung

Diese App läuft komplett auf Cloudflare (kostenloser Plan reicht): ein Worker
liefert die Seiten aus und beantwortet die API, eine D1-Datenbank speichert
die Daten. Login per E-Mail + Passwort ist selbst eingebaut, kein Claude-
Account nötig.

Erlaubt sind genau drei Personen (fest im Code hinterlegt, `src/api.js`):

| Name              | E-Mail                              | Rolle  |
|-------------------|--------------------------------------|--------|
| Erik Dietrich     | eric.dietrich@kern-studer.de         | user   |
| Daniel Satzinger  | daniel.satzinger@kern-studer.de      | admin  |
| Simon Demant      | simon.demant@kern-studer.de          | admin  |

Nur `admin`-Rollen dürfen Überstunden freigeben oder die Vertretung
umschalten – das wird im Worker geprüft (`src/worker.js`), nicht nur im
Design versteckt.

## 1. Node.js installieren

Cloudflares Kommandozeilen-Tool `wrangler` braucht Node.js.

1. Lade den **LTS-Installer** von https://nodejs.org herunter (Windows: die
   `.msi`-Datei) und installiere ihn mit den Standardeinstellungen.
2. Neues Terminal (PowerShell) öffnen und prüfen:
   ```powershell
   node --version
   npm --version
   ```
   Beide Befehle sollten eine Versionsnummer ausgeben.

## 2. Projekt vorbereiten

Im Ordner `arbeitszeit-worker` (diesen kompletten Ordner brauchst du):

```powershell
npm install
```

Das installiert `wrangler` lokal in `node_modules`.

## 3. Bei Cloudflare anmelden

```powershell
npx wrangler login
```

Öffnet den Browser, dort mit deinem (kostenlosen) Cloudflare-Konto anmelden
und die Berechtigung bestätigen.

## 4. D1-Datenbank anlegen

```powershell
npx wrangler d1 create arbeitszeit_erik
```

Die Ausgabe enthält einen Block wie:

```toml
[[d1_databases]]
binding = "DB"
database_name = "arbeitszeit_erik"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Kopiere die `database_id` und trage sie in `wrangler.toml` anstelle von
`REPLACE_WITH_DATABASE_ID_FROM_WRANGLER_D1_CREATE` ein.

Dann das Datenbank-Schema anlegen:

```powershell
npm run db:migrate:remote
```

## 5. Sitzungs-Schlüssel setzen

Dieser Schlüssel signiert die Login-Sitzungen. Ein zufälliger Vorschlag
(du kannst auch einen eigenen langen, zufälligen Wert nehmen):

```
d22774254e066e8d8107b003189ce3250f0808fe5b7e88c02649cf0a9cb22caf
```

Setzen mit:

```powershell
npx wrangler secret put SESSION_SECRET
```

Wenn danach gefragt wird, den Wert oben einfügen und Enter drücken. Dieser
Wert wird nirgendwo im Code gespeichert, nur verschlüsselt bei Cloudflare.

## 6. Deployen

```powershell
npm run deploy
```

Am Ende zeigt `wrangler` die Live-URL an, z. B.:

```
https://arbeitszeit-erik.<dein-cloudflare-name>.workers.dev
```

Das ist die Adresse, die Erik, Daniel und Simon benutzen.

## 7. Ersteinrichtung (einmalig)

Öffne `https://<deine-url>/setup.html` und vergib für alle drei Personen ein
Passwort (mind. 8 Zeichen). Sobald alle drei gesetzt sind, sperrt sich die
Seite automatisch – niemand kann danach dort neue Zugänge anlegen.

Anschließend können sich alle unter `https://<deine-url>/login.html`
anmelden. Erik landet auf der normalen Zeiterfassung, Daniel und Simon sehen
oben zusätzlich den Link **„Freigabe-Tool“**.

## Lokal testen (optional)

`npm run dev` startet die App lokal unter `http://localhost:8787`. Das
Anmelde-Cookie ist als `Secure` markiert (nur über HTTPS gültig) – auf
`http://localhost` lassen die meisten Browser das zwar ausnahmsweise zu,
zuverlässig funktioniert der Login aber erst auf der echten, per HTTPS
ausgelieferten `workers.dev`-Adresse nach `npm run deploy`. Am einfachsten:
direkt live testen statt lokal.

## Spätere Änderungen

Jede Codeänderung braucht erneut:

```powershell
npm run deploy
```

Passwörter ändern kann aktuell nur über die Datenbank direkt (kein UI dafür
vorgesehen) – sag Bescheid, falls eine „Passwort ändern“-Seite gewünscht ist.

## Was bewusst nicht enthalten ist

- **Kein Rate-Limiting** auf dem Login – bei nur drei bekannten Konten ein
  vertretbares Risiko für ein internes Tool, aber kein Enterprise-Schutz vor
  Brute-Force. Bei Bedarf kann Cloudflare Turnstile oder ein Zugriffslimit
  ergänzt werden.
- **Keine E-Mail-Benachrichtigung**, wenn Erik eine Freigabe anfordert –
  Daniel/Simon müssen das Freigabe-Tool selbst öffnen, um offene Anfragen zu
  sehen (oder es später bei Bedarf ergänzen lassen, z. B. per Zapier/Make an
  eine echte Mailbox).
