const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');
const tmpPath = path.join(dataDir, 'db.json.tmp');

const emptyDb = () => ({
  users: [],
  sessions: [],
  workspaces: [],
  agents: [],
  schools: [],
  conversations: [],
  automations: [],
  runLogs: [],
  approvals: [],
  fineTuneJobs: [],
  hiveRuns: [],
  shadowReviews: [],
  audit: [],
  settings: {
    appName: 'App Factory',
    publicSignup: true,
    routerEnabled: true,
    mainModel: 'openai/gpt-4.5',
    codingModel: 'anthropic/claude-sonnet-4',
    fallbackModels: ['openrouter/auto', 'openrouter/google/gemini-3.1-flash-lite', 'deepseek/deepseek-v4-flash'],
  },
});

function ensureDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(emptyDb(), null, 2));
  }
}

function loadDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(raw);
    return { ...emptyDb(), ...db };
  } catch {
    const db = emptyDb();
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    return db;
  }
}

function saveDb(db) {
  ensureDb();
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2));
  fs.renameSync(tmpPath, dbPath);
}

let queue = Promise.resolve();
function mutate(mutator) {
  queue = queue.then(async () => {
    const db = loadDb();
    const result = await mutator(db);
    saveDb(db);
    return result;
  });
  return queue;
}

module.exports = { loadDb, saveDb, mutate, emptyDb, dbPath };
