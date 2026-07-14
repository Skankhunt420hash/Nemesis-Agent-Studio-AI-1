# OpenClaw Agent Studio

Agenten bauen, füttern, trainieren und per Telegram/OpenClaw automatisieren.

## Features
- Login / Register
- Workspaces
- Agent Builder
- Wissen / Feed / Training
- Telegram- und OpenClaw-Automation
- Public Chat
- Hosted Export unter `/generated/<slug>/`
- Demo-/APK-Fallback über `public/local-api.js`
- Desktop-Shell (Electron)
- Android-App (Capacitor)

## Voraussetzungen
- Node.js 18+
- npm 9+

## Schnellstart
```bash
npm ci
cp .env.example .env
npm start
```

App läuft danach standardmäßig auf `http://127.0.0.1:3000`.

## Nützliche Scripts
```bash
npm test          # Test-Suite
npm run check     # Syntax-/Shell-Checks
npm run dev       # Backend im Dev-Modus
npm run desktop:dev
npm run mobile:sync
npm run mobile:build
```

## Demo / APK-Modus
Wenn das echte Backend in einer APK oder statischen Vorschau nicht verfügbar ist, übernimmt `public/local-api.js` einen lokalen Demo-Fallback für große Teile der UI.

## Verifiziert
Lokal erfolgreich geprüft mit:
```bash
npm test
npm run check
PORT=4310 node backend.js
curl http://127.0.0.1:4310/
```

## Nicht im Repo
Bewusst ausgeschlossen:
- `.env`
- `keystore/`
- `node_modules/`
- lokale Datenbank `data/db.json`
- Build-Artefakte aus `dist-*` und Android-Build-Ordnern
