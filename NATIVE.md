# Native packaging

## Already usable now
- Web app in browser
- PWA on Android
- PWA on desktop/laptop

## Desktop native app
Uses Electron.

### Dev run
```bash
npm install
npm run desktop:dev
```

### Remote mode
Use an already-running hosted app:
```bash
AGENT_STUDIO_URL=https://your-domain.example npm run desktop:dev
```

## Android app
Uses Capacitor.

### First setup
```bash
npm install
AGENT_STUDIO_URL=https://your-domain.example npx cap add android
npm run mobile:sync
npm run mobile:open
```

### Debug APK build
```bash
export ANDROID_HOME=/path/to/Android/Sdk
npm run mobile:build
```

### Signed release builds
Default release behavior now uses a **new `applicationId` per build**, so fresh APKs install as separate apps instead of overwriting the previous one.

If you want updates to replace an existing installed app, keep these stable:
- same `applicationId`
- same release keystore
- ever-increasing `versionCode`
- for PKCS12 keystores, `keyPassword` usually matches `storePassword`

Persisted version state lives in:
- `android/version.properties`

One-command release build:
```bash
npm run mobile:release -- --versionCode 2 --versionName 2.0.1 --appName "Scan me if you can"
```

Optional stable package id for updates instead of parallel installs:
```bash
npm run mobile:release -- --versionCode 3 --versionName 2.0.2 --appName "Scan me if you can" --appId com.example.scanmeifyoucan
```

That builds both:
- signed APK
- signed Play Store AAB

Artifacts:
- raw APK: `android/app/build/outputs/apk/release/`
- raw AAB: `android/app/build/outputs/bundle/release/`
- versioned copies: `dist-mobile/` (named from `appName`)
- release manifest with SHA256 hashes: `dist-mobile/*.json`

Play Store upload guide:
- `PLAYSTORE.md`

Manual builds still work:
```bash
APP_VERSION_CODE=2 APP_VERSION_NAME=2.0.1 npm run mobile:build:release
APP_VERSION_CODE=2 APP_VERSION_NAME=2.0.1 npm run mobile:build:aab
```

## Recommended production shape
- host Agent Studio on one stable HTTPS URL
- Electron desktop shell points to that URL
- Android Capacitor app points to that same URL

That gives one backend, one database, one auth flow.
