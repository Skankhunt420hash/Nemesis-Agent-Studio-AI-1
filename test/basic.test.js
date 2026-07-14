const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verifyPassword, createToken } = require('../lib/auth');
const { emptyDb, saveDb, loadDb } = require('../lib/store');
const { generateFallbackPrompt, buildRoutingPlan } = require('../lib/llm');
const { buildOpenClawAgentBundle } = require('../lib/openclaw');
const { app, server } = require('../backend');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const dbBackup = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : null;

test.after(() => {
  if (dbBackup !== null) fs.writeFileSync(dbPath, dbBackup);
  if (server && typeof server.close === 'function') server.close();
});

test('password hashing works', () => {
  const hash = hashPassword('supersecret!');
  assert.equal(verifyPassword('supersecret!', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);
});

test('token creation returns random hex', () => {
  const a = createToken();
  const b = createToken();
  assert.equal(a.length, 64);
  assert.notEqual(a, b);
});

test('store saves and loads', () => {
  const db = emptyDb();
  db.users.push({ id: 'u1', email: 'a@b.com' });
  saveDb(db);
  const reloaded = loadDb();
  assert.equal(reloaded.users.length, 1);
  assert.equal(reloaded.users[0].email, 'a@b.com');
});

test('fallback prompt includes key fields', () => {
  const prompt = generateFallbackPrompt({ name: 'Bot', description: 'help', businessType: 'restaurant', tone: 'friendly', personality: 'kind', language: 'de' });
  assert.match(prompt, /Bot/);
  assert.match(prompt, /help/);
  assert.match(prompt, /restaurant/);
});

test('openclaw bundle includes deploy files', () => {
  const bundle = buildOpenClawAgentBundle({ name: 'Bot', slug: 'bot', description: 'help', automation: { telegramAccountId: 'bot', telegramBotName: 'Bot' } });
  assert.ok(bundle['deploy.sh']);
  assert.ok(bundle['openclaw-agent.json']);
  assert.ok(bundle['IDENTITY.md']);
});

test('router prefers coding model for code-heavy prompts', () => {
  const routed = buildRoutingPlan({ message: 'Bitte debugge diesen TypeError im Node-Backend:\n```js\nconst x = ;\n```' });
  assert.equal(routed.route, 'coding');
  assert.equal(routed.primaryModel, process.env.CODING_MODEL || process.env.CHAT_MODEL_CODING || 'anthropic/claude-sonnet-4');
});

test('router prefers general model for plain requests', () => {
  const routed = buildRoutingPlan({ message: 'Schreib mir bitte eine kurze, freundliche Antwort auf diese Nachricht.' });
  assert.equal(routed.route, 'general');
  assert.equal(routed.primaryModel, process.env.MAIN_MODEL || process.env.CHAT_MODEL || 'openai/gpt-4.5');
});

test('router uses free fallback route when asked', () => {
  const routed = buildRoutingPlan({ message: 'Wenn das Budget leer ist, nimm bitte das Free-Fallback.' });
  assert.equal(routed.route, 'fallback');
  assert.ok(routed.candidates.length >= 1);
});

test('backend exports express app', () => {
  assert.equal(typeof app, 'function');
});
