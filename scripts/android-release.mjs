#!/usr/bin/env node
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const androidDir = join(root, 'android');
const versionFile = join(androidDir, 'version.properties');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function safeSlug(value, fallback = 'app') {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function sanitizeAppId(value, fallback) {
  const raw = String(value || fallback || '').trim().toLowerCase();
  const parts = raw
    .split('.')
    .map((part) => part.replace(/[^a-z0-9_]/g, ''))
    .filter(Boolean)
    .map((part) => (/^[a-z_]/.test(part) ? part : `a${part}`));
  if (parts.length < 2) return fallback;
  return parts.join('.');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = 'true';
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function parseProps(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

function writeProps(path, obj) {
  const lines = Object.entries(obj).map(([k, v]) => `${k}=${v}`);
  writeFileSync(path, `${lines.join('\n')}\n`);
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function replaceInFile(path, replacer) {
  const currentText = readFileSync(path, 'utf8');
  const nextText = replacer(currentText);
  if (nextText !== currentText) writeFileSync(path, nextText);
}

function applyBranding(appName) {
  replaceInFile(join(androidDir, 'app/src/main/res/values/strings.xml'), (text) => text
    .replace(/<string name="app_name">[\s\S]*?<\/string>/, `<string name="app_name">${appName}</string>`)
    .replace(/<string name="title_activity_main">[\s\S]*?<\/string>/, `<string name="title_activity_main">${appName}</string>`));

  replaceInFile(join(androidDir, 'app/src/main/assets/public/manifest.webmanifest'), (text) => text
    .replace(/"name":\s*"[^"]*"/, `"name": ${JSON.stringify(appName)}`)
    .replace(/"short_name":\s*"[^"]*"/, `"short_name": ${JSON.stringify(appName.slice(0, 12))}`));

  replaceInFile(join(androidDir, 'app/src/main/assets/public/index.html'), (text) => text
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${appName}</title>`)
    .replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${appName}</h1>`));

  replaceInFile(join(androidDir, 'app/src/main/assets/public/local-api.js'), (text) => text
    .replace(/appName: '.*?'/, `appName: ${JSON.stringify(appName)}`));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const current = existsSync(versionFile)
  ? parseProps(readFileSync(versionFile, 'utf8'))
  : { versionCode: '1', versionName: packageJson.version || '1.0.0' };

const args = parseArgs(process.argv.slice(2));
const versionName = args.versionName || args.version || current.versionName || packageJson.version || '1.0.0';
const versionCode = args.versionCode || args.code;
const defaultAppId = sanitizeAppId(packageJson.appId || 'ai.openclaw.agentstudio', 'ai.openclaw.agentstudio');
const appName = String(args.appName || process.env.APP_NAME || packageJson.build?.productName || 'OpenClaw Agent Studio').trim();

if (!versionCode) {
  console.error('Missing --versionCode <number>.');
  console.error('Example: npm run mobile:release -- --versionCode 2 --versionName 2.0.1');
  process.exit(1);
}

if (!/^\d+$/.test(String(versionCode)) || Number(versionCode) < 1) {
  console.error('versionCode must be a positive integer.');
  process.exit(1);
}

if (Number(versionCode) <= Number(current.versionCode || 0)) {
  console.error(`versionCode must be greater than current ${current.versionCode || 0}.`);
  process.exit(1);
}

writeProps(versionFile, { versionCode: String(versionCode), versionName: String(versionName) });

const requestedAppId = args.appId || process.env.APP_ID;
const appId = sanitizeAppId(requestedAppId, `${defaultAppId}.b${versionCode}`);
const artifactSlug = safeSlug(appName, 'app');

const buildEnv = {
  APP_ID: appId,
  APP_NAME: appName,
  APP_VERSION_CODE: String(versionCode),
  APP_VERSION_NAME: String(versionName),
};

run('npm', ['run', 'mobile:sync'], buildEnv);
applyBranding(appName);
run('npm', ['run', 'mobile:build:release'], buildEnv);
run('npm', ['run', 'mobile:build:aab'], buildEnv);

const outDir = join(root, 'dist-mobile');
mkdirSync(outDir, { recursive: true });

const apkSrc = join(androidDir, 'app/build/outputs/apk/release/app-release.apk');
const aabSrc = join(androidDir, 'app/build/outputs/bundle/release/app-release.aab');
const apkDst = join(outDir, `${artifactSlug}-${versionName}-${versionCode}.apk`);
const aabDst = join(outDir, `${artifactSlug}-${versionName}-${versionCode}.aab`);

copyFileSync(apkSrc, apkDst);
copyFileSync(aabSrc, aabDst);

const manifest = {
  generatedAt: new Date().toISOString(),
  appId,
  appName,
  versionCode: Number(versionCode),
  versionName: String(versionName),
  packageVersion: packageJson.version,
  artifacts: {
    apk: {
      path: apkDst,
      sha256: sha256(apkDst),
    },
    aab: {
      path: aabDst,
      sha256: sha256(aabDst),
    },
  },
  playStore: {
    uploadArtifact: aabDst,
    track: 'internal|closed|production',
    notes: 'Upload the AAB to Google Play Console. APK is for direct installs/testing.'
  }
};

const manifestPath = join(outDir, `${artifactSlug}-${versionName}-${versionCode}.json`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built:\n- ${apkDst}\n- ${aabDst}\n- ${manifestPath}`);
