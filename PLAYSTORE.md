# Play Store release flow

## App identity
- App name: defaults to `OpenClaw Agent Studio`, override with `--appName`
- Application ID: defaults to a **new unique id per release build**, override with `--appId` if you want updates to replace an existing installed app
- Release keystore: `keystore/agent-studio-release.keystore`
- Version state: `android/version.properties`

## Build a Play Store release
```bash
npm run mobile:release -- --versionCode 4 --versionName 2.0.3 --appName "Scan me if you can"
```

This produces:
- signed APK for direct installs/testing
- signed AAB for Google Play upload
- JSON manifest with version + SHA256 hashes

Artifacts go to:
- `dist-mobile/<app-name-slug>-<versionName>-<versionCode>.apk`
- `dist-mobile/<app-name-slug>-<versionName>-<versionCode>.aab`
- `dist-mobile/<app-name-slug>-<versionName>-<versionCode>.json`

## Upload to Google Play Console
1. Open Play Console
2. Choose app `OpenClaw Agent Studio`
3. Go to a track:
   - **Internal testing** for first checks
   - **Closed testing** for a small tester group
   - **Production** only when ready
4. Create new release
5. Upload the generated `.aab`
6. Add release notes
7. Review warnings
8. Save and roll out

## What to upload
Use the **AAB** file, not the APK.

- AAB = Play Store upload artifact
- APK = side-load / manual install / quick device test

## Pre-flight checklist
Before upload, verify:
- `versionCode` is higher than the last Play Store build
- package name / `--appId` matches your intent (stable for updates, unique for parallel installs)
- same keystore is still used
- app opens after build
- backend URL / hosted environment is correct

## First-time store requirements
If the app is brand new in Play Console, you may still need:
- app description
- icon / feature graphic
- screenshots
- privacy policy URL
- content rating
- data safety form
- test track setup

## Rollback note
Never decrease `versionCode`.
If a release is bad, ship a newer fixed build instead.
