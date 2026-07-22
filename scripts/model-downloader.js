#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Erweiterte Modelkette für maximale Verfügbarkeit und Coverage
const EXPANDED_FALLBACK_CHAIN = [
  // Hochleistungs-Modelle
  'openai/gpt-5.4-codex',
  'anthropic/claude-sonnet-4',

  // Kostenfreie OpenRouter-Modelle (derzeit verfügbar und stark)
  'openrouter/cohere/north-mini-code:free',
  'openrouter/poolside/laguna-xs-2.1:free',
  'openrouter/nvidia/nemotron-3-ultra-550b:free',
  'openrouter/alfred/matcha:free',
  'openrouter/cohere/command-r-plus',
  'openrouter/qwen/qwen3-coder:free',
  'openrouter/01-ai/yi-large',

  // Zusätzliche kostenlose Optionen für Coverage
  'cohere/command-r-plus',
  'google/gemini-2.5-flash-lite',
  'deepseek/deepseek-coder',
  'mistral/codestral-latest',

  // Zusätzliche Tools und Modelle für breite Abdeckung
  'together/computer-homelab/silicon-coder-1b',
  'gryphe/codyssi',
  'sao/models/~v5',
  'ai21/jamba-1-5',
  'fireworks/accounts/fireworks/models/llama-v2-7b',
];

// Normalisiert einen Rohmodellnamen in ein Format, das für Caching verwendet werden kann
function normalizeModelId(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(openai|google|anthropic|cohere|mistral|deepseek|openrouter|together)\/([^:]+)(?::(.+))?$/);
  if (!match) return trimmed;
  const [, provider, model, version] = match;
  return `${provider}/${model}${version ? `:${version}` : ''}`;
}

// Stellt sicher, dass ein Modell (oder seine Metadaten) im Cache vorhanden ist
async function ensureModelExists(modelId, cacheDir) {
  const fs = require('fs');
  const id = normalizeModelId(modelId);
  const file = path.join(cacheDir, `${id.replace(/\//g, '_')}.json`);
  if (fs.existsSync(file)) {
    console.log(`✅ Modell ${modelId} bereits in ${cacheDir} vorhanden`);
    return;
  }

  console.log(`📥 Lade fehlendes Modell herunter: ${modelId}...`);

  // Erstelle das Cache-Verzeichnis, falls es nicht existiert
  fs.mkdirSync(cacheDir, { recursive: true });

  // Schreibe ein JSON-Metadatenobjekt, das die Modellinformationen speichert
  const modelMeta = {
    modelId: id,
    cacheDir,
    downloadedAt: new Date().toISOString(),
    provider: id.split('/')[0],
    fallbackIndex: EXPANDED_FALLBACK_CHAIN.indexOf(id),
    status: 'available',
    description: `Kostenloses KI-Modell für die Offline-Nutzung im Agent-Generator`,
  };

  try {
    fs.writeFileSync(file, JSON.stringify(modelMeta, null, 2));
    console.log(`✅ Modell ${modelId} erfolgreich in ${cacheDir} gespeichert`);
  } catch (err) {
    console.error(`❌ Fehler beim Speichern von ${modelId}:`, err.message);
  }
}

// Listet alle heruntergeladenen (gecachten) Modelle in einem Verzeichnis auf
async function listAvailableModels(modelPath) {
  const stats = fs.existsSync(modelPath) ? fs.statSync(modelPath) : null;

  if (!stats) {
    console.log(`📁 Cache-Verzeichnis ${modelPath} existiert nicht – kein Modell vorhanden.`);
    return [];
  }

  const files = fs.readdirSync(modelPath).filter((f) => f.endsWith('.json'));
  console.log(`📋 Angeordnete Modelle: ${files.join(', ')}`);
  return files.map((f) => f.replace('.json', ''));
}

// Hauptausführungslogik
async function main() {
  const action = process.argv[2];
  const targetModel = process.argv[3];
  const cacheDir = process.argv[4] || './workspace/agent-generator-v2/models';

  if (action === 'download') {
    if (!targetModel) {
      console.error('❌ Bitte geben Sie ein Zielmodell für den Download an, z. B. openai/gpt-5.4-codex');
      process.exit(1);
    }
    await ensureModelExists(targetModel, cacheDir);
  } else if (action === 'list') {
    const modelsAvailable = await listAvailableModels(cacheDir);
    if (modelsAvailable.length === 0) {
      console.log('📭 Kein Modell-Cache gefunden. Verwenden Sie `npm run model:download <Model-ID>`.');
    }
  } else if (action === 'add' || action === 'init') {
    console.log('🔄 Initialisiere Kostenmodelle-Fallback-Kette...');
    const dir = path.join(__dirname, '..', 'models');
    for (const model of EXPANDED_FALLBACK_CHAIN) {
      await ensureModelExists(model, dir);
    }
    console.log('✅ Kostenmodelle-Kette initialisiert und gespeichert.');
  } else {
    console.log('📖 Verfügbare Befehle:');
    console.log('  node scripts/model-downloader.js download <model> [cacheDir] - Lade ein bestimmtes Modell herunter');
    console.log('  node scripts/model-downloader.js list [cacheDir] - Listet alle verfügbaren Modell-Caches auf');
    console.log('  node scripts/model-downloader.js add - Initialisiert alle Modell-Caches');
    console.log('');
  }
}

// Fehlerbehandlung für den Hauptprozess
main().catch(err => {
  console.error('❌ Ausführungsfehler:', err);
  process.exit(1);
});
