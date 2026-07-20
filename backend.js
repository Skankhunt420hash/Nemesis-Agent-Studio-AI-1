require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { loadDb, mutate } = require('./lib/store');
const { hashPassword, verifyPassword, createToken, tokenHash, parseCookies, buildCookie, clearCookie } = require('./lib/auth');
const { generateSystemPrompt, generateReply, generateTrainingDigest } = require('./lib/llm');
const { buildHostedAppScaffold } = require('./lib/scaffold');
const { buildOpenClawAgentBundle, buildDeploymentDirectory } = require('./lib/openclaw');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const GENERATED_DIR = path.join(__dirname, 'generated');
const BRAND = process.env.APP_NAME || 'App Factory';

const rateBuckets = new Map();
const publicChatBuckets = new Map();
let readyNotified = false;

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.use('/generated', express.static(GENERATED_DIR, { extensions: ['html'] }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'agent';
}

function uid(prefix = '') {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildAppBlueprint(input) {
  const prompt = String(input.prompt || input.description || '').trim();
  const template = String(input.template || 'saas').trim();
  const title = String(input.name || prompt.split(/[.!?]/)[0] || 'App').trim().slice(0, 60) || 'App';
  const lower = prompt.toLowerCase();
  const features = new Set([
    'Login/Register',
    'Dashboard',
    'CRUD workspace',
    'Backend CRUD API',
    'Release checklist',
  ]);
  if (/shop|store|ecom|shopify|produkt/.test(lower)) features.add('Product catalog');
  if (/booking|termin|appointment/.test(lower)) features.add('Booking flow');
  if (/chat|support|customer/.test(lower)) features.add('Chat / support inbox');
  if (/content|blog|seo/.test(lower)) features.add('CMS / content editor');
  if (/dashboard|analytics|report/.test(lower)) features.add('Analytics');
  if (/marketplace|market place/.test(lower)) features.add('Marketplace');
  if (/notif|alert|reminder/.test(lower)) features.add('Notifications');
  if (/search|find|filter/.test(lower)) features.add('Search');
  if (/admin|approval|role|permission/.test(lower)) features.add('Admin approvals');
  if (/billing|invoice|subscription|price|stripe/.test(lower)) features.add('Billing');
  return {
    title,
    template,
    tagline: prompt || `${title} — functional app slice, not just a landing page.`,
    stack: ['Node', 'Runnable JSON API', 'Auth flow', 'Docker / Compose', 'OpenClaw agents'],
    pages: ['Overview', 'Auth', 'Workspace', 'Records', 'Release'],
    features: [...features],
    monetization: ['Free trial', 'Monthly subscription'],
    deploy: 'Docker / Compose / Replit',
    notes: 'Export this blueprint, then generate a functional app scaffold with backend contract, auth flow, and deploy defaults.',
  };
}

function defaultAutomation() {
  return {
    enabled: false,
    telegramAccountId: '',
    telegramBotName: '',
    openclawAgentId: '',
    readyWebhookUrl: '',
  };
}

function defaultSchools() {
  return [
    {
      id: 'school_foundation',
      name: 'Foundation School',
      focus: 'Rolle, Ton, Verhalten',
      lessons: ['Rolle schärfen', 'Antwortstil festlegen', 'Fehler erkennen'],
    },
    {
      id: 'school_knowledge',
      name: 'Knowledge School',
      focus: 'Futter, Quellen, Kontext',
      lessons: ['Wissen hinzufügen', 'Quellen bewerten', 'Kontext zusammenfassen'],
    },
    {
      id: 'school_automation',
      name: 'Automation School',
      focus: 'Telegram, OpenClaw, Actions',
      lessons: ['Token speichern', 'Webhook koppeln', 'Deploy ausführen'],
    },
    {
      id: 'school_repair',
      name: 'Repair School',
      focus: 'Fehler, Debugging, Verbesserungen',
      lessons: ['Fehler sammeln', 'Ursache finden', 'Prompt verbessern'],
    },
  ];
}

function normalizeKnowledgeItem(item) {
  return {
    id: String(item?.id || uid('know_')),
    title: String(item?.title || '').trim() || 'Notiz',
    content: String(item?.content || '').trim(),
    source: String(item?.source || '').trim(),
    createdAt: String(item?.createdAt || nowIso()),
  };
}

function normalizeAutomation(automation) {
  const base = defaultAutomation();
  if (!automation || typeof automation !== 'object') return base;
  return {
    enabled: Boolean(automation.enabled),
    telegramAccountId: String(automation.telegramAccountId || '').trim(),
    telegramBotName: String(automation.telegramBotName || '').trim(),
    openclawAgentId: String(automation.openclawAgentId || '').trim(),
    readyWebhookUrl: String(automation.readyWebhookUrl || '').trim(),
  };
}

function defaultFineTuneProfile() {
  return {
    enabled: false,
    domain: '',
    goal: '',
    datasetNotes: '',
    styleDirectives: [],
    targetModel: '',
    status: 'draft',
    lastRunAt: '',
    lastJobId: '',
  };
}

function normalizeFineTuneProfile(profile) {
  const base = defaultFineTuneProfile();
  if (!profile || typeof profile !== 'object') return base;
  const list = (value) => Array.isArray(value) ? value : String(value || '').split('\n').map((v) => v.trim()).filter(Boolean);
  return {
    ...base,
    ...profile,
    enabled: profile.enabled === true,
    domain: String(profile.domain || '').trim(),
    goal: String(profile.goal || '').trim(),
    datasetNotes: String(profile.datasetNotes || '').trim(),
    styleDirectives: [...new Set(list(profile.styleDirectives))].slice(0, 20),
    targetModel: String(profile.targetModel || '').trim(),
    status: String(profile.status || 'draft').trim() || 'draft',
    lastRunAt: String(profile.lastRunAt || '').trim(),
    lastJobId: String(profile.lastJobId || '').trim(),
  };
}

function defaultHiveMindConfig() {
  return {
    enabled: false,
    mode: 'solo',
    objective: '',
    autoSpawn: true,
    specialistRoles: ['research', 'coding', 'critic', 'qa', 'planner', 'memory'],
    orchestrationNotes: '',
    decisionStyle: 'captain',
    criticEnabled: true,
    shadowEnabled: false,
  };
}

function normalizeHiveMindConfig(config) {
  const base = defaultHiveMindConfig();
  if (!config || typeof config !== 'object') return base;
  const list = (value) => Array.isArray(value) ? value : String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
  return {
    ...base,
    ...config,
    enabled: config.enabled === true,
    mode: String(config.mode || base.mode).trim() || base.mode,
    objective: String(config.objective || '').trim(),
    autoSpawn: config.autoSpawn !== false,
    specialistRoles: [...new Set(list(config.specialistRoles))].slice(0, 12),
    orchestrationNotes: String(config.orchestrationNotes || '').trim(),
    decisionStyle: String(config.decisionStyle || base.decisionStyle).trim() || base.decisionStyle,
    criticEnabled: config.criticEnabled !== false,
    shadowEnabled: config.shadowEnabled === true,
  };
}

function fineTuneBaseModel(targetModel) {
  const value = String(targetModel || '').trim();
  if (!value) return '';
  return value.startsWith('openai/') ? value.slice('openai/'.length) : value;
}

async function uploadOpenAiFineTuneFiles({ apiKey, trainPath, evalPath }) {
  const upload = async (filePath) => {
    const form = new FormData();
    const buffer = fs.readFileSync(filePath);
    form.append('purpose', 'fine-tune');
    form.append('file', new Blob([buffer], { type: 'application/jsonl' }), path.basename(filePath));
    const resp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!resp.ok) throw new Error(`file_upload_failed:${resp.status}:${await resp.text().catch(() => '')}`);
    return resp.json();
  };
  const trainFile = await upload(trainPath);
  const evalFile = evalPath && fs.existsSync(evalPath) ? await upload(evalPath) : null;
  return { trainFile, evalFile };
}

async function createOpenAiFineTuneJob({ apiKey, model, trainingFileId, validationFileId }) {
  const resp = await fetch('https://api.openai.com/v1/fine_tuning/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      training_file: trainingFileId,
      validation_file: validationFileId || undefined,
    }),
  });
  if (!resp.ok) throw new Error(`fine_tune_job_failed:${resp.status}:${await resp.text().catch(() => '')}`);
  return resp.json();
}

async function fetchOpenAiFineTuneJob({ apiKey, jobId }) {
  const resp = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`fine_tune_sync_failed:${resp.status}:${await resp.text().catch(() => '')}`);
  return resp.json();
}

async function runProviderUpload(job, provider = 'openai') {
  const chosen = String(provider || 'openai').trim().toLowerCase();
  const exportInfo = job?.export;
  if (!exportInfo?.outputDir) throw new Error('missing_export');
  const trainPath = path.join(exportInfo.outputDir, 'train.jsonl');
  const evalPath = path.join(exportInfo.outputDir, 'eval.jsonl');

  if (chosen !== 'openai') {
    return {
      provider: chosen,
      status: 'unsupported_provider',
      message: 'Derzeit ist nur OpenAI direkt integriert.',
    };
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const baseModel = fineTuneBaseModel(job.targetModel);
  if (!apiKey) return { provider: 'openai', status: 'missing_api_key', message: 'OPENAI_API_KEY fehlt.' };
  if (!baseModel) return { provider: 'openai', status: 'missing_target_model', message: 'Kein OpenAI-Zielmodell gesetzt.' };

  const files = await uploadOpenAiFineTuneFiles({ apiKey, trainPath, evalPath });
  const fineTuneJob = await createOpenAiFineTuneJob({
    apiKey,
    model: baseModel,
    trainingFileId: files.trainFile.id,
    validationFileId: files.evalFile?.id,
  });

  return {
    provider: 'openai',
    status: 'submitted',
    submittedAt: nowIso(),
    trainingFileId: files.trainFile.id,
    validationFileId: files.evalFile?.id || null,
    fineTuneJobId: fineTuneJob.id,
    fineTuneStatus: fineTuneJob.status,
    baseModel,
  };
}

async function syncProviderUpload(job) {
  const provider = String(job?.providerUpload?.provider || '').trim().toLowerCase();
  if (provider !== 'openai') {
    return {
      provider: provider || 'unknown',
      status: 'unsupported_provider',
      message: 'Sync ist aktuell nur für OpenAI direkt integriert.',
    };
  }
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const fineTuneJobId = String(job?.providerUpload?.fineTuneJobId || '').trim();
  if (!apiKey) return { provider: 'openai', status: 'missing_api_key', message: 'OPENAI_API_KEY fehlt.' };
  if (!fineTuneJobId) return { provider: 'openai', status: 'missing_job_id', message: 'Keine Fine-Tune Job ID gespeichert.' };
  const remote = await fetchOpenAiFineTuneJob({ apiKey, jobId: fineTuneJobId });
  return {
    provider: 'openai',
    status: 'synced',
    syncedAt: nowIso(),
    fineTuneJobId: remote.id,
    fineTuneStatus: remote.status,
    fineTunedModel: remote.fine_tuned_model || null,
    trainedTokens: remote.trained_tokens || null,
    finishedAt: remote.finished_at || null,
    error: remote.error || null,
    raw: remote,
  };
}

function shouldRunShadowReview(agent) {
  const config = normalizeHiveMindConfig(agent?.hiveMindConfig);
  return config.shadowEnabled === true || config.mode === 'shadow-board';
}

async function generateShadowReview(agent, db, payload) {
  const systemPrompt = [
    `Du bist der Shadow Operator für ${agent.name}.`,
    'Bewerte die letzte Assistenz-Antwort gnadenlos knapp und nützlich.',
    'Antworte im Format: Urteil | Risiko | Besser so.',
  ].join('\n');
  const message = [
    `User: ${String(payload.message || '').slice(0, 1600)}`,
    `Assistant: ${String(payload.reply || '').slice(0, 1600)}`,
    payload.context ? `Kontext: ${String(payload.context).slice(0, 2000)}` : null,
  ].filter(Boolean).join('\n\n');
  const reviewText = await generateReply({
    systemPrompt,
    history: [],
    message,
    routing: normalizeModelStack(agent.modelStack, db.settings),
  });
  const rating = /risiko|schlecht|falsch|problem|halluz/i.test(reviewText) ? 'warn' : 'ok';
  return {
    id: uid('shadow_'),
    agentId: agent.id,
    conversationId: payload.conversationId || null,
    mode: normalizeHiveMindConfig(agent.hiveMindConfig).mode,
    rating,
    review: reviewText,
    source: payload.source || 'chat',
    createdAt: nowIso(),
  };
}

async function enqueueShadowReview(agentId, payload) {
  try {
    const db = loadDb();
    const agent = db.agents.find((item) => item.id === agentId);
    if (!agent || !shouldRunShadowReview(agent)) return;
    const review = await generateShadowReview(agent, db, payload);
    await mutate((db2) => {
      db2.shadowReviews.unshift(review);
      db2.shadowReviews = db2.shadowReviews.slice(0, 500);
      return true;
    });
  } catch {
    // shadow review is best-effort; never break chat flow
  }
}

function summarizeConversationSnippets(conversations = []) {
  return (conversations || [])
    .flatMap((convo) => convo.messages || [])
    .slice(-12)
    .map((msg) => `${msg.role === 'assistant' ? 'Agent' : 'User'}: ${String(msg.content || '').replace(/\s+/g, ' ').slice(0, 180)}`)
    .filter(Boolean);
}

function buildFineTuneDataset(agent, db) {
  const conversations = db.conversations.filter((c) => c.agentId === agent.id);
  const knowledgeItems = (agent.knowledgeItems || []).slice(0, 12).map((item) => ({
    title: item.title,
    source: item.source,
    content: String(item.content || '').slice(0, 400),
  }));
  const learning = normalizeLearningProfile(agent.learningProfile);
  const workspaceLearning = normalizeLearningProfile(workspaceForAgent(db, agent)?.learningProfile);
  return {
    examples: Math.min(knowledgeItems.length + conversations.length, 200),
    knowledgeItems,
    conversationSnippets: summarizeConversationSnippets(conversations),
    preferences: [...new Set([...(learning.preferences || []), ...(workspaceLearning.preferences || [])])].slice(0, 10),
    dos: [...new Set([...(learning.dos || []), ...(workspaceLearning.dos || [])])].slice(0, 10),
    donts: [...new Set([...(learning.donts || []), ...(workspaceLearning.donts || [])])].slice(0, 10),
  };
}

function buildFineTuneReadiness(agent, dataset) {
  const profile = normalizeFineTuneProfile(agent.fineTuneProfile);
  const checks = [
    { key: 'domain', label: 'Fachgebiet gesetzt', ok: !!profile.domain },
    { key: 'goal', label: 'Ziel gesetzt', ok: !!profile.goal },
    { key: 'targetModel', label: 'Zielmodell gesetzt', ok: !!profile.targetModel },
    { key: 'examples', label: 'Genug Material vorhanden', ok: dataset.examples >= 3 },
    { key: 'styleDirectives', label: 'Stilregeln vorhanden', ok: profile.styleDirectives.length >= 1 },
  ];
  return {
    ready: checks.every((item) => item.ok),
    score: checks.filter((item) => item.ok).length,
    maxScore: checks.length,
    checks,
  };
}

function buildFineTuneJob(agent, db, overrides = {}) {
  const profile = normalizeFineTuneProfile(agent.fineTuneProfile);
  const dataset = buildFineTuneDataset(agent, db);
  const readiness = buildFineTuneReadiness(agent, dataset);
  const warnings = [];
  if (dataset.examples < 3) warnings.push('Zu wenig Beispiele für ein echtes Fine-Tune. Mehr Wissen oder Chats sammeln.');
  if (!profile.targetModel) warnings.push('Noch kein Zielmodell gesetzt.');
  if (!profile.domain) warnings.push('Fachgebiet fehlt.');
  return {
    id: uid('ftjob_'),
    agentId: agent.id,
    status: readiness.ready ? 'ready_for_provider' : 'needs_input',
    providerStatus: 'local_prepared',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    domain: profile.domain,
    goal: profile.goal,
    targetModel: profile.targetModel,
    dataset,
    readiness,
    warnings,
    nextActions: readiness.ready
      ? [
          'Provider-Job anlegen',
          'Datensatz exportieren',
          'Evaluationsset gegen Basismodell fahren',
        ]
      : [
          'Profilfelder vervollständigen',
          'Mehr Wissen/Beispiele sammeln',
          'Stilregeln schärfen',
        ],
    notes: String(overrides.notes || '').trim(),
  };
}

function roleMission(role, objective) {
  const missions = {
    research: 'Sammelt Fakten, Kontext und Referenzen.',
    coding: 'Plant technische Umsetzung und Schnittstellen.',
    design: 'Schärft UX, Klarheit und Bedienfluss.',
    security: 'Sucht Missbrauch, Datenrisiken und Eskalationspunkte.',
    business: 'Prüft Umsatz, Nutzen und Offer-Logik.',
    marketing: 'Optimiert Positionierung, CTA und Messaging.',
    critic: 'Greift Schwächen brutal ehrlich an.',
    qa: 'Prüft Vollständigkeit, Widersprüche und Abnahmekriterien.',
    planner: 'Zerlegt das Ziel in konkrete nächste Schritte.',
    memory: 'Extrahiert was dauerhaft gelernt werden sollte.',
  };
  return missions[role] || `Bearbeitet Teilziel für: ${objective || 'Mission'}.`;
}

function buildHiveRun(agent, db, prompt) {
  const config = normalizeHiveMindConfig(agent.hiveMindConfig);
  const profile = normalizeFineTuneProfile(agent.fineTuneProfile);
  const roles = [...new Set((config.specialistRoles || []).filter(Boolean))];
  const trimmedPrompt = String(prompt || '').trim();
  const objective = config.objective || trimmedPrompt || 'Agent verbessern';
  const specialists = roles.map((role, index) => ({
    id: `spec_${index + 1}`,
    role,
    mission: roleMission(role, objective),
    output: [
      role === 'critic' ? 'Finde die teuerste Schwäche im aktuellen Plan.' : `Liefer konkreten Beitrag für ${objective}.`,
      profile.domain ? `Achte auf ${profile.domain}.` : null,
      config.decisionStyle ? `Arbeite im Stil: ${config.decisionStyle}.` : null,
    ].filter(Boolean).join(' '),
  }));
  const debate = specialists.slice(0, 4).map((spec, index) => ({
    role: spec.role,
    stance: index === 0
      ? 'treibt Geschwindigkeit und Nutzen'
      : index === 1
        ? 'prüft Risiken und Qualität'
        : index === 2
          ? 'prüft Umsetzbarkeit und Scope'
          : 'sucht blinde Flecken',
  }));
  const verdict = {
    decision: config.decisionStyle === 'vote' ? 'Mehrheitsentscheid mit QA-Gate' : config.decisionStyle === 'critic-gate' ? 'Critic muss freigeben' : 'Captain entscheidet nach Input der Spezialisten',
    nextSteps: [
      `1. ${specialists[0] ? specialists[0].role : 'captain'} liefert ersten Entwurf`,
      `2. ${specialists.find((s) => s.role === 'critic')?.role || 'critic'} stresst den Entwurf`,
      `3. ${specialists.find((s) => s.role === 'qa')?.role || 'qa'} prüft Release-Reife`,
    ],
  };
  return {
    id: uid('hive_'),
    agentId: agent.id,
    prompt: trimmedPrompt,
    objective,
    mode: config.mode,
    decisionStyle: config.decisionStyle,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    specialists,
    debate,
    verdict,
    notes: config.orchestrationNotes || '',
  };
}

function safeFilePart(value, fallback = 'item') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || fallback;
}

function buildFineTuneExamples(agent, db) {
  const conversations = db.conversations.filter((c) => c.agentId === agent.id);
  const systemPrompt = composeAgentSystemPrompt(agent, db, []);
  const examples = [];

  for (const convo of conversations) {
    const msgs = Array.isArray(convo.messages) ? convo.messages : [];
    for (let i = 0; i < msgs.length - 1; i++) {
      const current = msgs[i];
      const next = msgs[i + 1];
      if (current?.role !== 'user' || next?.role !== 'assistant') continue;
      const history = msgs.slice(Math.max(0, i - 4), i).map((msg) => ({ role: msg.role, content: String(msg.content || '').slice(0, 500) }));
      examples.push({
        source: 'conversation',
        sourceId: convo.id,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: String(current.content || '').slice(0, 1200) },
          { role: 'assistant', content: String(next.content || '').slice(0, 1200) },
        ],
      });
    }
  }

  for (const item of agent.knowledgeItems || []) {
    const title = String(item.title || 'Wissenseintrag').trim();
    const content = String(item.content || '').trim();
    if (!content) continue;
    examples.push({
      source: 'knowledge',
      sourceId: item.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Nutze dieses Wissen für ${agent.name}: ${title}` },
        { role: 'assistant', content: content.slice(0, 1400) },
      ],
    });
  }

  return examples.slice(0, 200);
}

function splitFineTuneExamples(examples = []) {
  const evalEvery = 5;
  const train = [];
  const evals = [];
  examples.forEach((example, index) => {
    if ((index + 1) % evalEvery === 0) evals.push(example);
    else train.push(example);
  });
  return { train, eval: evals };
}

function exportFineTuneDataset(agent, db, job) {
  const examples = buildFineTuneExamples(agent, db);
  const split = splitFineTuneExamples(examples);
  const outDir = path.join(GENERATED_DIR, 'fine-tune', safeFilePart(agent.slug, 'agent'), job.id);
  fs.mkdirSync(outDir, { recursive: true });

  const writeJsonl = (file, rows) => {
    const content = rows.map((row) => JSON.stringify({ messages: row.messages })).join('\n') + (rows.length ? '\n' : '');
    fs.writeFileSync(path.join(outDir, file), content);
  };

  writeJsonl('train.jsonl', split.train);
  writeJsonl('eval.jsonl', split.eval);

  const manifest = {
    agentId: agent.id,
    agentName: agent.name,
    agentSlug: agent.slug,
    fineTuneJobId: job.id,
    targetModel: job.targetModel || normalizeFineTuneProfile(agent.fineTuneProfile).targetModel,
    exportedAt: nowIso(),
    counts: {
      total: examples.length,
      train: split.train.length,
      eval: split.eval.length,
    },
    warnings: job.warnings || [],
    nextActions: job.nextActions || [],
    providerHints: {
      openai: 'train.jsonl direkt als Chat-Fine-Tune-Dataset nutzbar',
      generic: 'Manifest + JSONL als Importbasis für Provider-Pipeline nutzen',
    },
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outDir, 'preview.json'), JSON.stringify(examples.slice(0, 8), null, 2));

  return {
    outputDir: outDir,
    files: ['train.jsonl', 'eval.jsonl', 'manifest.json', 'preview.json'],
    counts: manifest.counts,
  };
}

async function executeHiveRun(agent, db, run) {
  const specialists = run.specialists || [];
  const outputs = await Promise.all(specialists.map(async (specialist) => {
    const systemPrompt = [
      `Du bist der Specialist ${specialist.role} in einem Hive Mind für ${agent.name}.`,
      `Mission: ${specialist.mission}`,
      `Arbeitsauftrag: ${specialist.output}`,
      'Antworte knapp, konkret, ohne Fülltext.',
    ].join('\n');
    const message = [
      `Gesamtziel: ${run.objective}`,
      run.notes ? `Orchestrationsnotizen: ${run.notes}` : null,
      `Andere Specialists arbeiten parallel. Liefere deshalb eigenständig den besten Beitrag für ${specialist.role}.`,
    ].filter(Boolean).join('\n\n');
    const response = await generateReply({
      systemPrompt,
      history: [],
      message,
      routing: normalizeModelStack(agent.modelStack, db.settings),
    });
    return { role: specialist.role, response, createdAt: nowIso() };
  }));

  const captainPrompt = [
    `Du bist der Captain des Hive Mind für ${agent.name}.`,
    `Entscheidungsstil: ${run.decisionStyle}`,
    'Konsolidiere die Specialist Outputs in Entscheidung, Risiken und nächste Schritte.',
    'Format: Entscheidung / Risiken / Nächste Schritte.',
  ].join('\n');
  const captainMessage = [
    `Ziel: ${run.objective}`,
    `Specialist Outputs:\n${outputs.map((item) => `- ${item.role}: ${item.response}`).join('\n\n').slice(0, 6000)}`,
  ].join('\n\n');
  const captainResponse = await generateReply({
    systemPrompt: captainPrompt,
    history: [],
    message: captainMessage,
    routing: normalizeModelStack(agent.modelStack, db.settings),
  });

  return {
    status: 'completed',
    executionMode: 'parallel',
    outputs,
    captainResponse,
    completedAt: nowIso(),
  };
}

function defaultModelStack(settings) {
  const base = normalizeSettings(settings || defaultSettings());
  return {
    routerEnabled: base.routerEnabled !== false,
    mainModel: base.mainModel,
    codingModel: base.codingModel,
    fallbackModels: base.fallbackModels,
  };
}

function normalizeModelStack(stack, settings) {
  const base = defaultModelStack(settings);
  if (!stack || typeof stack !== 'object') return base;
  const fallbackModels = Array.isArray(stack.fallbackModels)
    ? stack.fallbackModels.map((m) => String(m).trim()).filter(Boolean)
    : String(stack.fallbackModels || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
  return {
    routerEnabled: stack.routerEnabled !== undefined ? stack.routerEnabled !== false : base.routerEnabled,
    mainModel: String(stack.mainModel || base.mainModel).trim() || base.mainModel,
    codingModel: String(stack.codingModel || base.codingModel).trim() || base.codingModel,
    fallbackModels: fallbackModels.length ? [...new Set(fallbackModels)] : base.fallbackModels,
  };
}

function defaultLearningProfile() {
  return {
    enabled: true,
    summary: '',
    preferences: [],
    dos: [],
    donts: [],
    topics: [],
    feedback: [],
    events: [],
    turns: 0,
    updatedAt: '',
  };
}

function normalizeLearningProfile(profile) {
  const base = defaultLearningProfile();
  if (!profile || typeof profile !== 'object') return base;
  const list = (value) => Array.isArray(value) ? value : String(value || '').split('\n').map((v) => v.trim()).filter(Boolean);
  return {
    ...base,
    ...profile,
    enabled: profile.enabled !== false,
    summary: String(profile.summary || '').trim(),
    preferences: [...new Set(list(profile.preferences))].slice(0, 20),
    dos: [...new Set(list(profile.dos))].slice(0, 20),
    donts: [...new Set(list(profile.donts))].slice(0, 20),
    topics: [...new Set(list(profile.topics))].slice(0, 20),
    feedback: Array.isArray(profile.feedback) ? profile.feedback.slice(-20) : [],
    events: Array.isArray(profile.events) ? profile.events.slice(-20) : [],
    turns: Number(profile.turns || 0),
    updatedAt: String(profile.updatedAt || ''),
  };
}

function mergeLearningProfiles(...profiles) {
  const merged = defaultLearningProfile();
  for (const profile of profiles.map(normalizeLearningProfile)) {
    merged.enabled = merged.enabled || profile.enabled;
    merged.summary = compactSummary([merged.summary, profile.summary].filter(Boolean), merged.summary || profile.summary || '');
    merged.preferences = [...new Set([...merged.preferences, ...profile.preferences])].slice(0, 20);
    merged.dos = [...new Set([...merged.dos, ...profile.dos])].slice(0, 20);
    merged.donts = [...new Set([...merged.donts, ...profile.donts])].slice(0, 20);
    merged.topics = [...new Set([...merged.topics, ...profile.topics])].slice(0, 20);
    merged.feedback = [...merged.feedback, ...profile.feedback].slice(-20);
    merged.events = [...merged.events, ...profile.events].slice(-20);
    merged.turns += Number(profile.turns || 0);
    merged.updatedAt = profile.updatedAt || merged.updatedAt;
  }
  return merged;
}

function learningWeights(profile) {
  const feedback = Array.isArray(profile?.feedback) ? profile.feedback : [];
  const good = feedback.filter((item) => item.rating === 'good').length;
  const bad = feedback.filter((item) => item.rating === 'bad').length;
  return { good, bad, score: (good * 2) - (bad * 3) };
}

function workspaceForAgent(db, agent) {
  return db.workspaces.find((w) => w.id === agent.workspaceId) || null;
}

function compactSummary(items, fallback = '') {
  const list = (items || []).filter(Boolean).slice(0, 5);
  return list.length ? list.join(' · ') : fallback;
}

function extractAutoLearnings(message, reply, history = []) {
  const text = `${message}\n${reply}\n${history.map((m) => m?.content || '').join('\n')}`.toLowerCase();
  const learned = [];
  if (/kurz halten|ultra[- ]?kurz|wenig tokens|knapp/.test(text)) learned.push('Antworte extrem kurz.');
  if (/deutsch|auf deutsch|sprache: de/.test(text)) learned.push('Antworte auf Deutsch.');
  if (/code|debug|fehler|bug|stack|trace|terminal|npm|typescript|javascript/.test(text)) learned.push('Bei Code zuerst Diagnose, dann Fix.');
  if (/freundlich|nett|warm/.test(text)) learned.push('Ton freundlich halten.');
  if (/direkt|blunt|kurz|ohne viel gelaber/.test(text)) learned.push('Direkt antworten, kein Ballast.');

  const keywordMatches = [...text.matchAll(/\b[a-zäöüß][a-zäöüß0-9\-]{5,}\b/gi)].map((m) => m[0].toLowerCase());
  const stop = new Set(['antworten', 'weiterentwickeln', 'individueller', 'autolearn', 'agenten', 'konversation', 'systemregel', 'hauptmodel']);
  const keywords = [...new Set(keywordMatches.filter((w) => !stop.has(w)))].slice(0, 5);
  return { learned: [...new Set(learned)], keywords };
}

function applyAutoLearn(agent, { message, reply, history = [] }) {
  const learning = normalizeLearningProfile(agent.learningProfile);
  if (!learning.enabled) return learning;
  const extracted = extractAutoLearnings(message, reply, history);
  learning.events = Array.isArray(learning.events) ? learning.events : [];
  learning.events.unshift({
    type: 'chat',
    at: nowIso(),
    prompt: String(message).slice(0, 200),
    reply: String(reply).slice(0, 200),
    learned: extracted.learned,
    topics: extracted.keywords,
  });
  for (const item of extracted.learned) {
    learning.preferences = [item, ...learning.preferences.filter((x) => x !== item)].slice(0, 20);
    if (/kurz|knapp|ballast/.test(item.toLowerCase())) learning.dos = [item, ...learning.dos.filter((x) => x !== item)].slice(0, 20);
    else if (/nicht|kein|ohne/.test(item.toLowerCase())) learning.donts = [item, ...learning.donts.filter((x) => x !== item)].slice(0, 20);
    else learning.dos = [item, ...learning.dos.filter((x) => x !== item)].slice(0, 20);
  }
  for (const topic of extracted.keywords) {
    learning.topics = [topic, ...learning.topics.filter((x) => x !== topic)].slice(0, 20);
  }
  learning.turns += 1;
  learning.summary = compactSummary([
    learning.preferences[0],
    learning.dos[0],
    learning.donts[0],
    learning.topics[0] ? `Thema: ${learning.topics[0]}` : '',
  ].filter(Boolean), learning.summary || 'Noch kein Lernprofil.');
  learning.updatedAt = nowIso();
  agent.learningProfile = learning;
  return learning;
}

function applyFeedbackLearn(agent, { rating, message, reply }) {
  const learning = normalizeLearningProfile(agent.learningProfile);
  if (!learning.enabled) return learning;
  learning.feedback = Array.isArray(learning.feedback) ? learning.feedback : [];
  learning.events = Array.isArray(learning.events) ? learning.events : [];
  const positive = rating === 'good';
  learning.feedback.unshift({
    type: 'feedback',
    rating,
    at: nowIso(),
    prompt: String(message || '').slice(0, 200),
    reply: String(reply || '').slice(0, 200),
  });
  if (positive) {
    learning.dos = ['Das war hilfreich.', ...learning.dos.filter((x) => x !== 'Das war hilfreich.')].slice(0, 20);
    learning.preferences = ['Mehr davon.', ...learning.preferences.filter((x) => x !== 'Mehr davon.')].slice(0, 20);
  } else {
    learning.donts = ['Solche Antworten vermeiden.', ...learning.donts.filter((x) => x !== 'Solche Antworten vermeiden.')].slice(0, 20);
    learning.preferences = learning.preferences.filter((x) => x !== 'Mehr davon.').slice(0, 20);
  }
  learning.events.unshift({ type: 'feedback', rating, at: nowIso() });
  learning.turns += 1;
  learning.summary = compactSummary([
    learning.preferences[0],
    learning.dos[0],
    learning.donts[0],
    learning.topics[0] ? `Thema: ${learning.topics[0]}` : '',
  ].filter(Boolean), learning.summary || 'Noch kein Lernprofil.');
  learning.updatedAt = nowIso();
  agent.learningProfile = learning;
  return learning;
}

function resetLearningProfile(agent) {
  agent.learningProfile = defaultLearningProfile();
  return agent.learningProfile;
}

function composeAgentSystemPrompt(agent, db, history = []) {
  const parts = [agent.systemPrompt];
  const workspace = workspaceForAgent(db, agent);
  const workspaceLearning = normalizeLearningProfile(workspace?.learningProfile);
  const learning = mergeLearningProfiles(workspaceLearning, agent.learningProfile);
  const weights = learningWeights(learning);
  if (workspaceLearning.enabled && (workspaceLearning.summary || workspaceLearning.preferences.length || workspaceLearning.topics.length)) {
    parts.push([
      'Workspace-Lernen:',
      workspaceLearning.summary ? `- ${workspaceLearning.summary}` : null,
      workspaceLearning.preferences.length ? `- Gemeinsame Vorlieben: ${workspaceLearning.preferences.slice(0, 3).join(' | ')}` : null,
      workspaceLearning.topics.length ? `- Gemeinsame Themen: ${workspaceLearning.topics.slice(0, 3).join(' | ')}` : null,
    ].filter(Boolean).join('\n'));
  }
  if (learning.enabled && (learning.summary || learning.preferences.length || learning.topics.length)) {
    parts.push([
      'Autolearn:',
      learning.summary ? `- ${learning.summary}` : null,
      learning.preferences.length ? `- Vorlieben: ${learning.preferences.slice(0, 3).join(' | ')}` : null,
      learning.topics.length ? `- Themen: ${learning.topics.slice(0, 3).join(' | ')}` : null,
      (weights.good || weights.bad) ? `- Feedback-Gewicht: +${weights.good} / -${weights.bad} (Score ${weights.score})` : null,
      history.length ? '- Nutze den Gesprächskontext sparsam und präzise.' : null,
    ].filter(Boolean).join('\n'));
  }
  const fineTune = normalizeFineTuneProfile(agent.fineTuneProfile);
  if (fineTune.enabled && (fineTune.domain || fineTune.goal || fineTune.styleDirectives.length || fineTune.datasetNotes)) {
    parts.push([
      'Fine-Tune-Zielprofil:',
      fineTune.domain ? `- Fachgebiet: ${fineTune.domain}` : null,
      fineTune.goal ? `- Ziel: ${fineTune.goal}` : null,
      fineTune.targetModel ? `- Zielmodell: ${fineTune.targetModel}` : null,
      fineTune.styleDirectives.length ? `- Stilregeln: ${fineTune.styleDirectives.slice(0, 5).join(' | ')}` : null,
      fineTune.datasetNotes ? `- Datensatz-Hinweise: ${fineTune.datasetNotes}` : null,
    ].filter(Boolean).join('\n'));
  }
  const hiveMind = normalizeHiveMindConfig(agent.hiveMindConfig);
  if (hiveMind.enabled && (hiveMind.objective || hiveMind.specialistRoles.length || hiveMind.orchestrationNotes)) {
    parts.push([
      'Hive-Mind-Orchestrierung:',
      `- Modus: ${hiveMind.mode}`,
      hiveMind.objective ? `- Missionsziel: ${hiveMind.objective}` : null,
      hiveMind.specialistRoles.length ? `- Spezialisten: ${hiveMind.specialistRoles.join(' | ')}` : null,
      `- Entscheidungsstil: ${hiveMind.decisionStyle}`,
      hiveMind.orchestrationNotes ? `- Orchestrationsnotizen: ${hiveMind.orchestrationNotes}` : null,
    ].filter(Boolean).join('\n'));
  }
  if (agent.trainingNotes) parts.push(`Trainingsnotizen:\n${agent.trainingNotes}`);
  return parts.filter(Boolean).join('\n\n');
}

function ownerConversationForAgent(db, agentId, userId) {
  return db.conversations.find((c) => c.agentId === agentId && (c.ownerUserId === userId || c.visitorId === `owner:${userId}`)) || { messages: [] };
}

function buildAgentAdvice(agent, db) {
  const tips = [];
  const knowledgeCount = (agent.knowledgeItems || []).length;
  const schools = (db.schools || []).filter((s) => (agent.schoolIds || []).includes(s.id));
  const modelStack = normalizeModelStack(agent.modelStack, db.settings);

  if (knowledgeCount < 3) {
    tips.push({
      title: 'Füttere ihn mit echten Verkaufs- und Supportfällen',
      why: 'Ohne 3-5 echte Beispiele klingt jeder Agent generisch.',
      suggestion: 'Lege jetzt FAQ, Einwände, Preislogik und 2 echte Kundenszenen als Wissen an.',
    });
  }
  if (!agent.automation?.enabled || (!agent.automation?.telegramAccountId && !agent.automation?.openclawAgentId)) {
    tips.push({
      title: 'Mach ihn sofort ausführbar',
      why: 'Ein verkaufbarer Agent muss einen echten Kanal besitzen.',
      suggestion: 'Aktiviere Automation und hinterlege Telegram/OpenClaw, damit der Agent direkt Nachrichten bedienen kann.',
    });
  }
  if (!schools.length) {
    tips.push({
      title: 'Gib ihm eine Schule',
      why: 'Schools machen das Verhalten reproduzierbar für Restaurant, Arzt, Shop oder Bar.',
      suggestion: 'Weise mindestens eine School zu: Ton, Regeln, Eskalation und No-Gos.',
    });
  }
  if (modelStack.mainModel === 'openai/gpt-4.5' && modelStack.codingModel === 'anthropic/claude-sonnet-4') {
    tips.push({
      title: 'Baue eine aggressive Fallback-Kette',
      why: 'Damit der Agent weiterläuft, auch wenn Quota oder Provider ausfallen.',
      suggestion: 'Setze pro Agent eine eigene Fallback-Reihenfolge passend zum Kundenbudget.',
    });
  }
  if (!(agent.rules || '').trim()) {
    tips.push({
      title: 'Schreib ihm harte Grenzen rein',
      why: 'Verkaufte Agenten brauchen klare Regeln, sonst halluzinieren sie teuer.',
      suggestion: 'Definiere Preisgrenzen, Eskalationspunkte, Datenschutz und wann ein Mensch übernehmen muss.',
    });
  }

  return tips.slice(0, 3);
}

function defaultSettings() {
  return {
    appName: 'App Factory',
    publicSignup: true,
    routerEnabled: true,
    mainModel: 'openai/gpt-4.5',
    codingModel: 'anthropic/claude-sonnet-4',
    fallbackModels: ['openrouter/auto', 'openrouter/google/gemini-3.1-flash-lite', 'deepseek/deepseek-v4-flash'],
  };
}

function normalizeSettings(settings) {
  const base = defaultSettings();
  if (!settings || typeof settings !== 'object') return base;
  const fallbackModels = Array.isArray(settings.fallbackModels)
    ? settings.fallbackModels.map((m) => String(m).trim()).filter(Boolean)
    : String(settings.fallbackModels || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
  return {
    ...base,
    ...settings,
    appName: String(settings.appName || base.appName).trim() || base.appName,
    publicSignup: settings.publicSignup !== false,
    routerEnabled: settings.routerEnabled !== false,
    mainModel: String(settings.mainModel || base.mainModel).trim() || base.mainModel,
    codingModel: String(settings.codingModel || base.codingModel).trim() || base.codingModel,
    fallbackModels: fallbackModels.length ? [...new Set(fallbackModels)] : base.fallbackModels,
  };
}

function buildHostedAppJs(blueprint, slug) {
  const pages = JSON.stringify(blueprint.pages || []);
  const features = JSON.stringify(blueprint.features || []);
  const tagline = JSON.stringify(blueprint.tagline || '');
  return [
    "const blueprint = JSON.parse(document.getElementById('app-blueprint').textContent);",
    `const storageKey = 'app-factory:${slug}';`,
    "const state = JSON.parse(localStorage.getItem(storageKey) || '{}');",
    "state.leads ||= [];",
    "state.tasks ||= blueprint.features.map((name, index) => ({ id: String(index + 1), name: name, done: index < 2 }));",
    "state.view ||= blueprint.pages[0] || 'Overview';",
    "const pages = " + pages + ";",
    "const features = " + features + ";",
    "const tagline = " + tagline + ";",
    "const el = (html) => { const div = document.createElement('div'); div.innerHTML = html.trim(); return div.firstElementChild; };",
    "const save = () => localStorage.setItem(storageKey, JSON.stringify(state));",
    "const pct = () => Math.round((state.tasks.filter((t) => t.done).length / Math.max(1, state.tasks.length)) * 100);",
    "const esc = (value) => String(value).replace(/[&<>\"']/g, (ch) => ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '\"' ? '&quot;' : '&#39;');",
    "function render() {",
    "  document.getElementById('blueprint').textContent = JSON.stringify(blueprint, null, 2);",
    "  const root = document.getElementById('app');",
    "  const nav = pages.map((p) => '<button class=\"' + (state.view === p ? 'active' : '') + '\" data-view=\"' + esc(p) + '\">' + esc(p) + '</button>').join('');",
    "  const cards = features.slice(0, 3).map((f) => '<div class=\"card\"><h3>' + esc(f) + '</h3><div class=\"muted\">' + esc(tagline) + '</div></div>').join('');",
    "  const tasks = state.tasks.map((t) => '<label class=\"task tiny\"><span><input type=\"checkbox\" data-task=\"' + esc(t.id) + '\" ' + (t.done ? 'checked' : '') + '> ' + esc(t.name) + '</span><span class=\"muted\">' + (t.done ? 'done' : 'open') + '</span></label>').join('');",
    "  const leads = state.leads.length ? state.leads.map((lead) => '<div class=\"item\"><strong>' + esc(lead.name) + '</strong><div class=\"muted\">' + esc(lead.email || 'no email') + ' • ' + esc(lead.note || '') + '</div></div>').join('') : '<div class=\"muted tiny\">No leads yet.</div>';",
    "  root.innerHTML = '<div>' +",
    "    '<div class=\"nav\">' + nav + '</div>' +",
    "    '<div class=\"cards\">' + cards + '</div>' +",
    "    '<div class=\"split\">' +",
    "      '<div class=\"item\"><div class=\"task\"><strong>Launch progress</strong><span>' + pct() + '%</span></div><div class=\"progress\"><i style=\"width:' + pct() + '%\"></i></div></div>' +",
    "      '<div class=\"item\"><h3>Quick actions</h3><div class=\"actions\"><button class=\"btn\" data-add-task>+ Task</button><button class=\"btn secondary\" data-add-lead>+ Lead</button></div></div>' +",
    "      '<div class=\"item\"><h3>Tasks</h3>' + tasks + '</div>' +",
    "      '<div class=\"item\"><h3>Leads</h3>' + leads + '</div>' +",
    "    '</div>' +",
    "    '<form id=\"form\" style=\"margin-top:14px\">' +",
    "      '<div class=\"row\"><div class=\"field\"><label>Name</label><input name=\"name\" placeholder=\"Client / user / team\" required></div><div class=\"field\"><label>Email</label><input name=\"email\" type=\"email\" placeholder=\"hello@example.com\"></div></div>' +",
    "      '<div class=\"field\"><label>Note</label><textarea name=\"note\" placeholder=\"What should this app remember?\"></textarea></div>' +",
    "      '<button class=\"btn\" type=\"submit\">Save record</button>' +",
    "    '</form>' +",
    "    '<div class=\"toast\">Free hosted preview · ' + new Date().toLocaleDateString('de-CH') + '</div>' +",
    "  '</div>';",
    "}",
    "document.addEventListener('click', (e) => {",
    "  const view = e.target?.dataset?.view;",
    "  if (view) { state.view = view; save(); render(); }",
    "  if (e.target?.dataset?.addTask !== undefined) {",
    "    const name = prompt('Task name?');",
    "    if (name) { state.tasks.push({ id: crypto.randomUUID?.() || String(Date.now()), name: name, done: false }); save(); render(); }",
    "  }",
    "  if (e.target?.dataset?.addLead !== undefined) { document.getElementById('form').scrollIntoView({ behavior: 'smooth' }); }",
    "  const taskId = e.target?.dataset?.task;",
    "  if (taskId) { const task = state.tasks.find((t) => t.id === taskId); if (task) { task.done = e.target.checked; save(); render(); } }",
    "});",
    "document.addEventListener('submit', (e) => {",
    "  if (e.target.id !== 'form') return;",
    "  e.preventDefault();",
    "  const fd = new FormData(e.target);",
    "  state.leads.unshift({ name: String(fd.get('name') || '').trim(), email: String(fd.get('email') || '').trim(), note: String(fd.get('note') || '').trim(), createdAt: new Date().toISOString() });",
    "  e.target.reset();",
    "  save();",
    "  render();",
    "});",
    "render();",
  ].join('\n');
}

function buildCodeScaffold(agent) {
  const blueprint = agent.blueprint || buildAppBlueprint({
    name: agent.name,
    prompt: agent.appIdea || agent.description,
    template: agent.template || 'saas',
  });
  const slug = agent.slug;
  const title = agent.name;
  const features = (blueprint.features || []).map((f) => `- ${f}`).join('\n');
  const pages = (blueprint.pages || []).map((p) => `- ${p}`).join('\n');
  const stack = (blueprint.stack || []).join(', ');
  const safeBlueprint = JSON.stringify(blueprint, null, 2).replace(/</g, '\\u003c');
  return {
    'README.md': `# ${title}\n\n${blueprint.tagline}\n\n## Run\n\nnpm install\nnpm start\n\n## Stack\n${stack}\n\n## Pages\n${pages}\n\n## Features\n${features}\n`,
    'app-blueprint.json': JSON.stringify(blueprint, null, 2),
    'package.json': JSON.stringify({
      name: slug,
      private: true,
      version: '1.0.0',
      type: 'commonjs',
      scripts: { start: 'node server.js', dev: 'node server.js' },
    }, null, 2),
    'server.js': `const http = require('node:http');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst root = __dirname;\nconst mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };\n\nfunction sendFile(res, filePath) {\n  const ext = path.extname(filePath);\n  res.statusCode = 200;\n  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');\n  fs.createReadStream(filePath).pipe(res);\n}\n\nhttp.createServer((req, res) => {\n  const url = new URL(req.url, 'http://localhost');\n  let filePath = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);\n  if (!filePath.startsWith(root)) { res.statusCode = 403; return res.end('Forbidden'); }\n  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');\n  if (!fs.existsSync(filePath)) filePath = path.join(root, 'index.html');\n  sendFile(res, filePath);\n}).listen(process.env.PORT || 4173, () => {\n  console.log('Hosted app running');\n});\n`,
    'index.html': `<!doctype html>\n<html lang="de">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${title}</title>\n  <link rel="stylesheet" href="./styles.css">\n</head>\n<body>\n  <div class="app-shell">\n    <header class="hero">\n      <div>\n        <p class="eyebrow">Generated with App Factory</p>\n        <h1>${title}</h1>\n        <p class="lead">${blueprint.tagline}</p>\n      </div>\n      <div class="hero-card">\n        <div class="pill">${blueprint.template}</div>\n        <div class="hero-stat"><strong>${blueprint.features?.length || 0}</strong><span>Features</span></div>\n        <div class="hero-stat"><strong>${blueprint.pages?.length || 0}</strong><span>Pages</span></div>\n        <div class="hero-stat"><strong>${blueprint.stack?.length || 0}</strong><span>Stack items</span></div>\n      </div>\n    </header>\n    <main class="grid">\n      <section class="panel">\n        <h2>Live App</h2>\n        <div id="app"></div>\n      </section>\n      <aside class="panel">\n        <h2>Blueprint</h2>\n        <pre id="blueprint" class="code"></pre>\n      </aside>\n    </main>\n  </div>\n  <script id="app-blueprint" type="application/json">${safeBlueprint}</script>\n  <script src="./app.js"></script>\n</body>\n</html>\n`,
    'styles.css': `:root{color-scheme:light;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#0f172a 0%,#312e81 52%,#6d28d9 100%);color:#e2e8f0;min-height:100vh}.app-shell{max-width:1180px;margin:0 auto;padding:28px}.hero{display:flex;justify-content:space-between;gap:20px;align-items:stretch;flex-wrap:wrap;padding:28px 0}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:#c4b5fd;margin:0 0 8px}.hero h1{margin:0;font-size:clamp(36px,6vw,60px);line-height:1.02}.lead{max-width:56ch;font-size:18px;color:#cbd5e1}.hero-card,.panel{background:rgba(15,23,42,.7);backdrop-filter:blur(18px);border:1px solid rgba(148,163,184,.18);border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}.hero-card{min-width:280px;padding:20px;display:grid;gap:12px;align-content:start}.pill{display:inline-flex;width:max-content;padding:8px 12px;border-radius:999px;background:rgba(129,140,248,.16);color:#c7d2fe;font-weight:700}.hero-stat{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-top:1px solid rgba(148,163,184,.14)}.hero-stat strong{font-size:28px}.grid{display:grid;grid-template-columns:1.4fr .8fr;gap:20px}.panel{padding:22px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:18px 0}.card{background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:16px}.card h3,.panel h2{margin:0 0 12px}.muted{color:#94a3b8}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px;margin-bottom:12px}.field input,.field textarea,.field select,button{font:inherit}.field input,.field textarea,.field select{background:#fff;border:0;border-radius:14px;padding:12px 14px;color:#0f172a}.field textarea{min-height:90px;resize:vertical}.btn{border:0;border-radius:14px;padding:12px 16px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#a78bfa,#6366f1);color:#fff}.btn.secondary{background:#e0e7ff;color:#3730a3}.btn:active{transform:translateY(1px)}.actions{display:flex;gap:10px;flex-wrap:wrap}.code{white-space:pre-wrap;background:#020617;color:#cbd5e1;padding:16px;border-radius:18px;overflow:auto;max-height:72vh}.list{display:grid;gap:12px}.item{background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:14px}.badge{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(34,197,94,.16);color:#86efac;font-weight:700;font-size:12px}.tiny{font-size:13px}.split{display:grid;gap:12px}.task{display:flex;justify-content:space-between;gap:12px;align-items:center}.progress{height:8px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}.progress > i{display:block;height:100%;background:linear-gradient(90deg,#34d399,#60a5fa);width:0%}.nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.nav button{background:rgba(255,255,255,.08);color:#e2e8f0;border:1px solid rgba(148,163,184,.16);padding:10px 14px;border-radius:999px}.nav button.active{background:#fff;color:#1e1b4b}.toast{margin-top:12px;color:#bfdbfe;font-size:14px}@media (max-width:900px){.grid,.cards,.row{grid-template-columns:1fr}.hero{flex-direction:column}}`,
    'app.js': buildHostedAppJs(blueprint, slug),
  };
}

async function writeScaffold(agent) {
  const dir = path.join(__dirname, 'generated', agent.slug);
  fs.mkdirSync(dir, { recursive: true });
  const scaffold = buildHostedAppScaffold(agent);
  for (const [rel, content] of Object.entries(scaffold)) {
    const filePath = path.join(dir, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return { dir, files: Object.keys(scaffold) };
}

async function writeOpenClawExport(agent) {
  const dir = buildDeploymentDirectory(agent);
  fs.mkdirSync(dir, { recursive: true });
  const bundle = buildOpenClawAgentBundle(agent);
  for (const [rel, content] of Object.entries(bundle)) {
    const filePath = path.join(dir, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  const deployScript = path.join(dir, 'deploy.sh');
  try { fs.chmodSync(deployScript, 0o755); } catch {}
  return { dir, files: Object.keys(bundle) };
}

function runOpenClawCli(args, cwd) {
  const result = spawnSync('openclaw', args, { cwd, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function openClawAgentExists(agentId) {
  const result = runOpenClawCli(['agents', 'list', '--json'], process.cwd());
  if (!result.ok) return false;
  try {
    const list = JSON.parse(result.stdout || '[]');
    return Array.isArray(list) && list.some((item) => item.id === agentId);
  } catch {
    return false;
  }
}

function listOpenClawAgents() {
  const result = runOpenClawCli(['agents', 'list', '--json'], process.cwd());
  if (!result.ok) {
    return { ok: false, error: result.stderr || result.stdout || result.error || 'openclaw_list_failed', agents: [] };
  }
  try {
    const list = JSON.parse(result.stdout || '[]');
    const agents = Array.isArray(list)
      ? list.map((item) => ({
          id: item.id,
          name: item.identityName || item.name || item.id,
          runtimeName: item.name || item.id,
          emoji: item.identityEmoji || '',
          model: item.model || '',
          workspace: item.workspace || '',
          agentDir: item.agentDir || '',
          bindings: Number(item.bindings || 0),
          isDefault: !!item.isDefault,
        }))
      : [];
    return { ok: true, agents };
  } catch (err) {
    return { ok: false, error: String(err.message || err), agents: [] };
  }
}

function parseJsonFileSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readTextFileSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function runtimeInfoForAgent(agent) {
  const runtimeAgentId = String(agent?.automation?.openclawAgentId || '').trim();
  if (!runtimeAgentId) return null;
  const runtime = listOpenClawAgents();
  if (!runtime.ok) return { ok: false, error: runtime.error };
  const found = runtime.agents.find((item) => item.id === runtimeAgentId);
  if (!found) return { ok: false, error: 'runtime_agent_not_found' };
  return { ok: true, runtime: found };
}

function readRuntimeAgentSnapshot(agent) {
  const runtimeInfo = runtimeInfoForAgent(agent);
  if (!runtimeInfo?.ok) return runtimeInfo || { ok: false, error: 'runtime_agent_missing' };
  const runtime = runtimeInfo.runtime;
  const modelsPath = path.join(runtime.agentDir, 'models.json');
  const identityPath = path.join(runtime.workspace, 'IDENTITY.md');
  const studioMetaPath = path.join(runtime.workspace, '.openclaw', 'agent-studio-sync.json');
  const models = parseJsonFileSafe(modelsPath, {});
  const studioMeta = parseJsonFileSafe(studioMetaPath, {});
  const identity = readTextFileSafe(identityPath, '');
  return {
    ok: true,
    runtime,
    files: { modelsPath, identityPath, studioMetaPath },
    models,
    identity,
    studioMeta,
  };
}

function defaultRuntimeModels(mainModel, codingModel) {
  return {
    providers: {
      default: { model: mainModel || 'openai/gpt-4.5' },
      coding: { model: codingModel || mainModel || 'anthropic/claude-sonnet-4' },
    },
  };
}

function buildIdentityMarkdown(agent) {
  const emoji = agent.importedFromRuntime?.emoji || '🧪';
  return `# IDENTITY.md

- **Name:** ${agent.name}
- **Creature:** OpenClaw specialist agent
- **Vibe:** ${agent.personality || 'helpful'}
- **Emoji:** ${emoji}
- **Avatar:** _(not set)_
`;
}

function buildRuntimeStudioMeta(agent) {
  return {
    syncedAt: nowIso(),
    agentId: agent.id,
    openclawAgentId: agent.automation?.openclawAgentId || '',
    businessType: agent.businessType,
    template: agent.template,
    appIdea: agent.appIdea,
    specialization: agent.businessType,
    automation: normalizeAutomation(agent.automation),
    modelStack: normalizeModelStack(agent.modelStack),
    fineTuneProfile: normalizeFineTuneProfile(agent.fineTuneProfile),
    hiveMindConfig: normalizeHiveMindConfig(agent.hiveMindConfig),
  };
}

function writeRuntimeAgentSnapshot(agent) {
  const snapshot = readRuntimeAgentSnapshot(agent);
  if (!snapshot?.ok) return snapshot || { ok: false, error: 'runtime_agent_missing' };
  const { runtime, files } = snapshot;
  fs.mkdirSync(path.dirname(files.studioMetaPath), { recursive: true });
  fs.writeFileSync(files.modelsPath, JSON.stringify(defaultRuntimeModels(agent.modelStack?.mainModel, agent.modelStack?.codingModel), null, 2));
  fs.writeFileSync(files.identityPath, buildIdentityMarkdown(agent));
  fs.writeFileSync(files.studioMetaPath, JSON.stringify(buildRuntimeStudioMeta(agent), null, 2));

  const identityCli = runOpenClawCli([
    'agents', 'set-identity', '--agent', runtime.id,
    '--name', agent.name,
    '--emoji', '🧪',
    '--json',
  ], process.cwd());

  const bindCli = agent.automation?.telegramAccountId
    ? runOpenClawCli(['agents', 'bind', '--agent', runtime.id, '--bind', `telegram:${agent.automation.telegramAccountId}`, '--json'], process.cwd())
    : { ok: true, skipped: true, reason: 'no_telegram_account' };

  return {
    ok: true,
    runtime,
    files,
    identityCli,
    bindCli,
    wroteAt: nowIso(),
  };
}

function hostedUrlFor(agent) {
  return `/generated/${agent.slug}/`;
}

function telegramTokenFileFor(agent) {
  const accountId = agent?.automation?.telegramAccountId || agent?.slug;
  return path.join('/root/.openclaw/secrets', `${accountId}.telegram.token`);
}

function telegramTokenExists(agent) {
  try {
    return fs.existsSync(telegramTokenFileFor(agent));
  } catch {
    return false;
  }
}

function getIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return String(xf ? xf.split(',')[0].trim() : req.socket.remoteAddress || 'unknown');
}

function rateLimit(bucketMap, key, limit, windowMs) {
  const now = Date.now();
  const bucket = bucketMap.get(key) || [];
  const active = bucket.filter((ts) => ts > now - windowMs);
  if (active.length >= limit) return false;
  active.push(now);
  bucketMap.set(key, active);
  return true;
}

function respondRateLimited(res) {
  return res.status(429).json({ error: 'rate_limited', message: 'Zu viele Anfragen. Kurz warten.' });
}

function cookies(req) {
  return parseCookies(req.headers.cookie || '');
}

function getSession(req) {
  const token = cookies(req).aggtok;
  if (!token) return null;
  const hash = tokenHash(token);
  const db = loadDb();
  const session = db.sessions.find((s) => s.tokenHash === hash && (!s.expiresAt || new Date(s.expiresAt).getTime() > Date.now()));
  if (!session) return null;
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { session, user };
}

function requireAuth(req, res, next) {
  const auth = getSession(req);
  if (!auth) return res.status(401).json({ error: 'unauthorized' });
  req.auth = auth;
  next();
}

function requireOwner(agent, userId) {
  return agent.userId === userId;
}

function userWorkspaces(db, userId) {
  return db.workspaces.filter((w) => w.ownerId === userId || (Array.isArray(w.memberIds) && w.memberIds.includes(userId)));
}

function ensureDefaultWorkspace(db, user) {
  let workspace = db.workspaces.find((w) => w.ownerId === user.id && w.isDefault);
  if (!workspace) {
    workspace = {
      id: uid('wsp_'),
      ownerId: user.id,
      memberIds: [user.id],
      name: `${user.name}'s Workspace`,
      isDefault: true,
      learningProfile: defaultLearningProfile(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.workspaces.push(workspace);
  }
  return workspace;
}

function resolveWorkspaceForUser(db, userId, workspaceId) {
  const workspaces = userWorkspaces(db, userId);
  if (workspaceId) {
    const found = workspaces.find((w) => w.id === workspaceId);
    if (found) return found;
  }
  return workspaces[0] || null;
}

function publicAgentView(agent, db) {
  const convos = db.conversations.filter((c) => c.agentId === agent.id);
  const messages = convos.flatMap((c) => c.messages || []);
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    businessType: agent.businessType,
    tone: agent.tone,
    personality: agent.personality,
    language: agent.language,
    workspaceId: agent.workspaceId,
    theme: agent.theme,
    publicKey: agent.publicKey,
    workspaceLearningProfile: normalizeLearningProfile(workspaceForAgent(db, agent)?.learningProfile),
    knowledgeCount: (agent.knowledgeItems || []).length,
    telegramTokenStored: telegramTokenExists(agent),
    automation: agent.automation || defaultAutomation(),
    modelStack: normalizeModelStack(agent.modelStack, db.settings),
    fineTuneProfile: normalizeFineTuneProfile(agent.fineTuneProfile),
    hiveMindConfig: normalizeHiveMindConfig(agent.hiveMindConfig),
    learningProfile: normalizeLearningProfile(agent.learningProfile),
    fineTuneJobs: db.fineTuneJobs.filter((job) => job.agentId === agent.id).slice(-5).reverse(),
    hiveRuns: db.hiveRuns.filter((run) => run.agentId === agent.id).slice(-5).reverse(),
    shadowReviews: db.shadowReviews.filter((review) => review.agentId === agent.id).slice(-5).reverse(),
    schoolIds: agent.schoolIds || [],
    stats: {
      conversations: convos.length,
      messages: messages.length,
      lastActivityAt: agent.updatedAt,
    },
  };
}

async function notifyReady() {
  if (readyNotified) return;
  const webhook = String(process.env.TELEGRAM_READY_WEBHOOK || '').trim();
  if (!webhook) return;
  readyNotified = true;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Rick-C63 is ready and connected.' }),
    });
  } catch {
    readyNotified = false;
  }
}

app.get('/health', (req, res) => {
  const db = loadDb();
  res.json({ ok: true, app: BRAND, users: db.users.length, agents: db.agents.length, time: nowIso() });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/agent/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'agent.html'));
});

app.get('/hosted/:slug', (req, res) => {
  res.redirect(302, `/generated/${req.params.slug}/`);
});

app.get('/api/me', (req, res) => {
  const auth = getSession(req);
  res.json({ user: auth ? { id: auth.user.id, name: auth.user.name, email: auth.user.email, plan: auth.user.plan } : null });
});

app.post('/api/auth/register', async (req, res) => {
  if (!rateLimit(rateBuckets, `reg:${getIp(req)}`, 10, 60 * 60 * 1000)) return respondRateLimited(res);
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const safeName = String(name).trim();

  const result = await mutate((db) => {
    if (db.users.some((u) => u.email === normalizedEmail)) {
      return { error: 'email_exists' };
    }
    const user = {
      id: uid('usr_'),
      name: safeName,
      email: normalizedEmail,
      passwordHash: hashPassword(String(password)),
      plan: 'starter',
      createdAt: nowIso(),
    };
    db.users.push(user);
    const workspace = ensureDefaultWorkspace(db, user);
    const token = createToken();
    db.sessions.push({ id: uid('ses_'), userId: user.id, tokenHash: tokenHash(token), createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString() });
    return { user, token, workspace };
  });

  if (result?.error) return res.status(409).json({ error: result.error });
  res.setHeader('Set-Cookie', buildCookie(result.token));
  res.json({ ok: true, user: { id: result.user.id, name: result.user.name, email: result.user.email, plan: result.user.plan }, workspace: { id: result.workspace.id, name: result.workspace.name } });
});

app.post('/api/auth/login', async (req, res) => {
  if (!rateLimit(rateBuckets, `log:${getIp(req)}`, 20, 60 * 60 * 1000)) return respondRateLimited(res);
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'invalid_input' });
  const normalizedEmail = String(email).trim().toLowerCase();
  const db = loadDb();
  const user = db.users.find((u) => u.email === normalizedEmail);
  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = createToken();
  await mutate((db2) => {
    db2.sessions.push({ id: uid('ses_'), userId: user.id, tokenHash: tokenHash(token), createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString() });
  });

  res.setHeader('Set-Cookie', buildCookie(token));
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

app.get('/api/workspaces', requireAuth, (req, res) => {
  const db = loadDb();
  const workspaces = userWorkspaces(db, req.auth.user.id).map((w) => ({
    id: w.id,
    name: w.name,
    isDefault: !!w.isDefault,
    learningProfile: normalizeLearningProfile(w.learningProfile),
    memberCount: (w.memberIds || []).length,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }));
  res.json({ ok: true, workspaces });
});

app.post('/api/workspaces', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'invalid_input' });
  const workspace = await mutate((db) => {
    const record = {
      id: uid('wsp_'),
      ownerId: req.auth.user.id,
      memberIds: [req.auth.user.id],
      name,
      isDefault: false,
      learningProfile: defaultLearningProfile(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.workspaces.push(record);
    return record;
  });
  res.json({ ok: true, workspace });
});

app.patch('/api/workspaces/:id/learning-profile', requireAuth, async (req, res) => {
  const updated = await mutate((db) => {
    const workspace = userWorkspaces(db, req.auth.user.id).find((w) => w.id === req.params.id);
    if (!workspace) return null;
    workspace.learningProfile = normalizeLearningProfile({ ...(workspace.learningProfile || {}), ...(req.body || {}) });
    workspace.updatedAt = nowIso();
    return workspace;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, workspace: { ...updated, learningProfile: normalizeLearningProfile(updated.learningProfile) } });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const db = loadDb();
  const workspaces = userWorkspaces(db, req.auth.user.id);
  const agents = db.agents.filter((a) => a.userId === req.auth.user.id || workspaces.some((w) => w.id === a.workspaceId));
  const conversations = db.conversations.filter((c) => agents.some((a) => a.id === c.agentId));
  res.json({
    user: { id: req.auth.user.id, name: req.auth.user.name, email: req.auth.user.email, plan: req.auth.user.plan },
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, isDefault: !!w.isDefault, memberCount: (w.memberIds || []).length, learningProfile: normalizeLearningProfile(w.learningProfile) })),
    stats: {
      agents: agents.length,
      conversations: conversations.length,
      messages: conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0),
    },
    agents: agents.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      language: a.language,
      businessType: a.businessType,
      tone: a.tone,
      status: a.status,
      workspaceId: a.workspaceId,
      workspaceName: (db.workspaces.find((w) => w.id === a.workspaceId) || {}).name || 'Workspace',
      publicUrl: `/agent/${a.slug}?key=${a.publicKey}`,
      hostedUrl: hostedUrlFor(a),
      automation: a.automation || defaultAutomation(),
      modelStack: normalizeModelStack(a.modelStack, db.settings),
      fineTuneProfile: normalizeFineTuneProfile(a.fineTuneProfile),
      hiveMindConfig: normalizeHiveMindConfig(a.hiveMindConfig),
      telegramTokenStored: telegramTokenExists(a),
      knowledgeItems: a.knowledgeItems || [],
      learningProfile: normalizeLearningProfile(a.learningProfile),
      workspaceLearningProfile: normalizeLearningProfile(workspaceForAgent(db, a)?.learningProfile),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    settings: normalizeSettings(db.settings),
  });
});

app.get('/api/settings', requireAuth, (req, res) => {
  const db = loadDb();
  res.json({ ok: true, settings: normalizeSettings(db.settings) });
});

app.get('/api/openclaw/agents', requireAuth, (req, res) => {
  const runtime = listOpenClawAgents();
  if (!runtime.ok) return res.status(500).json({ error: 'openclaw_list_failed', message: runtime.error, agents: [] });
  res.json({ ok: true, agents: runtime.agents });
});

app.put('/api/settings', requireAuth, async (req, res) => {
  const updated = await mutate((db) => {
    db.settings = normalizeSettings({ ...(db.settings || {}), ...(req.body || {}) });
    return db.settings;
  });
  res.json({ ok: true, settings: normalizeSettings(updated) });
});

app.post('/api/agents', requireAuth, async (req, res) => {
  if (!rateLimit(rateBuckets, `agent:${req.auth.user.id}`, 30, 60 * 60 * 1000)) return respondRateLimited(res);
  const body = req.body || {};
  const required = ['name', 'description', 'businessType', 'tone', 'personality', 'language'];
  if (required.some((key) => !String(body[key] || '').trim())) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const agent = await mutate(async (db) => {
    const name = String(body.name).trim();
    const workspace = resolveWorkspaceForUser(db, req.auth.user.id, body.workspaceId);
    if (!workspace) return null;
    const slugBase = slugify(name);
    let slug = slugBase;
    let suffix = 2;
    while (db.agents.some((a) => a.slug === slug)) {
      slug = `${slugBase}-${suffix++}`;
    }

    const publicKey = uid('pub_');
    const systemPrompt = await generateSystemPrompt({
      name,
      description: String(body.description).trim(),
      businessType: String(body.businessType).trim(),
      tone: String(body.tone).trim(),
      personality: String(body.personality).trim(),
      language: String(body.language).trim(),
      services: String(body.services || '').trim(),
      rules: String(body.rules || '').trim(),
      integrations: Array.isArray(body.integrations) ? body.integrations : [],
    });

    const record = {
      id: uid('agt_'),
      userId: req.auth.user.id,
      workspaceId: workspace.id,
      name,
      appIdea: String(body.appIdea || body.description || '').trim(),
      template: String(body.template || 'saas').trim(),
      blueprint: buildAppBlueprint({ name, prompt: String(body.appIdea || body.description || '').trim(), template: body.template }),
      slug,
      description: String(body.description).trim(),
      businessType: String(body.businessType).trim(),
      tone: String(body.tone).trim(),
      personality: String(body.personality).trim(),
      language: String(body.language).trim(),
      services: String(body.services || '').trim(),
      rules: String(body.rules || '').trim(),
      integrations: Array.isArray(body.integrations) ? body.integrations : [],
      knowledgeItems: [],
      automation: defaultAutomation(),
      modelStack: normalizeModelStack(body.modelStack, db.settings),
      fineTuneProfile: normalizeFineTuneProfile(body.fineTuneProfile),
      hiveMindConfig: normalizeHiveMindConfig(body.hiveMindConfig),
      learningProfile: defaultLearningProfile(),
      trainingNotes: '',
      schoolIds: [],
      theme: {
        primary: String(body.primaryColor || '#667eea'),
        secondary: String(body.secondaryColor || '#764ba2'),
      },
      publicKey,
      systemPrompt,
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.agents.push(record);
    return record;
  });

  if (!agent) return res.status(400).json({ error: 'invalid_workspace' });
  res.json({ ok: true, agent: { ...agent, modelStack: normalizeModelStack(agent.modelStack, db.settings), fineTuneProfile: normalizeFineTuneProfile(agent.fineTuneProfile), hiveMindConfig: normalizeHiveMindConfig(agent.hiveMindConfig), learningProfile: normalizeLearningProfile(agent.learningProfile), publicUrl: `/agent/${agent.slug}?key=${agent.publicKey}` } });
});

app.post('/api/agents/import-openclaw', requireAuth, async (req, res) => {
  const runtimeAgentId = String(req.body?.runtimeAgentId || '').trim();
  const telegramAccountIdInput = String(req.body?.telegramAccountId || '').trim();
  const telegramBotNameInput = String(req.body?.telegramBotName || '').trim();
  const workspaceId = String(req.body?.workspaceId || '').trim();
  if (!runtimeAgentId) return res.status(400).json({ error: 'invalid_input' });

  const runtime = listOpenClawAgents();
  if (!runtime.ok) return res.status(500).json({ error: 'openclaw_list_failed', message: runtime.error });
  const runtimeAgent = runtime.agents.find((item) => item.id === runtimeAgentId);
  if (!runtimeAgent) return res.status(404).json({ error: 'runtime_agent_not_found' });

  const result = await mutate(async (db) => {
    const workspace = resolveWorkspaceForUser(db, req.auth.user.id, workspaceId);
    if (!workspace) return { error: 'invalid_workspace' };

    const existing = db.agents.find((a) => a.userId === req.auth.user.id && a.automation?.openclawAgentId === runtimeAgent.id);
    if (existing) return { existing };

    const name = runtimeAgent.name || runtimeAgent.id;
    const slugBase = slugify(runtimeAgent.id || name);
    let slug = slugBase;
    let suffix = 2;
    while (db.agents.some((a) => a.slug === slug)) slug = `${slugBase}-${suffix++}`;

    const description = `Importiert aus vorhandenem OpenClaw-Agenten ${runtimeAgent.id}.`;
    const publicKey = uid('pub_');
    const telegramAccountId = telegramAccountIdInput || runtimeAgent.id;
    const telegramBotName = telegramBotNameInput || runtimeAgent.name || runtimeAgent.id;
    const systemPrompt = await generateSystemPrompt({
      name,
      description,
      businessType: 'existing-openclaw-agent',
      tone: 'direct',
      personality: 'helpful',
      language: 'de',
      services: `Bestehender Runtime-Agent: ${runtimeAgent.id}`,
      rules: 'Bestehende Telegram/OpenClaw-Integration stabil halten.',
      integrations: ['telegram', 'openclaw'],
    });

    const record = {
      id: uid('agt_'),
      userId: req.auth.user.id,
      workspaceId: workspace.id,
      name,
      appIdea: `Verwalte vorhandenen Agenten ${runtimeAgent.id} in Agent Studio`,
      template: 'existing-agent',
      blueprint: buildAppBlueprint({ name, prompt: description, template: 'existing-agent' }),
      slug,
      description,
      businessType: 'existing-openclaw-agent',
      tone: 'direct',
      personality: 'helpful',
      language: 'de',
      services: `Runtime Agent ID: ${runtimeAgent.id}`,
      rules: 'Bestehende Bindings nicht kaputt machen. Änderungen zuerst im Studio spiegeln.',
      integrations: ['telegram', 'openclaw'],
      knowledgeItems: [normalizeKnowledgeItem({
        title: 'Import-Hinweis',
        content: `Dieser Agent wurde aus dem bestehenden OpenClaw-Agenten ${runtimeAgent.id} importiert. Modell: ${runtimeAgent.model || 'unbekannt'}.`,
        source: 'openclaw-runtime',
      })],
      automation: {
        enabled: true,
        telegramAccountId,
        telegramBotName,
        openclawAgentId: runtimeAgent.id,
        readyWebhookUrl: '',
      },
      modelStack: normalizeModelStack({ mainModel: runtimeAgent.model || db.settings?.mainModel }, db.settings),
      fineTuneProfile: defaultFineTuneProfile(),
      hiveMindConfig: defaultHiveMindConfig(),
      learningProfile: defaultLearningProfile(),
      trainingNotes: `Importiert aus vorhandenem OpenClaw-Agenten ${runtimeAgent.id}. Workspace: ${runtimeAgent.workspace || 'unbekannt'}.`,
      schoolIds: [],
      theme: { primary: '#667eea', secondary: '#764ba2' },
      publicKey,
      systemPrompt,
      status: 'active',
      importedFromRuntime: {
        agentId: runtimeAgent.id,
        workspace: runtimeAgent.workspace,
        model: runtimeAgent.model,
        importedAt: nowIso(),
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.agents.push(record);
    return { created: record };
  });

  if (result?.error === 'invalid_workspace') return res.status(400).json({ error: 'invalid_workspace' });
  if (result?.existing) return res.json({ ok: true, imported: false, agent: result.existing, message: 'Agent war bereits importiert.' });
  res.json({ ok: true, imported: true, agent: result.created });
});

app.get('/api/agents/:id', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id);
  if (!agent || !requireOwner(agent, req.auth.user.id)) return res.status(404).json({ error: 'not_found' });
  const conversation = ownerConversationForAgent(db, agent.id, req.auth.user.id);
  res.json({ ok: true, agent: { ...agent, modelStack: normalizeModelStack(agent.modelStack, db.settings), fineTuneProfile: normalizeFineTuneProfile(agent.fineTuneProfile), hiveMindConfig: normalizeHiveMindConfig(agent.hiveMindConfig), learningProfile: normalizeLearningProfile(agent.learningProfile), workspaceLearningProfile: normalizeLearningProfile(workspaceForAgent(db, agent)?.learningProfile), publicUrl: `/agent/${agent.slug}?key=${agent.publicKey}`, hostedUrl: hostedUrlFor(agent) }, conversation, fineTuneJobs: db.fineTuneJobs.filter((job) => job.agentId === agent.id).slice(-10).reverse(), hiveRuns: db.hiveRuns.filter((run) => run.agentId === agent.id).slice(-10).reverse(), shadowReviews: db.shadowReviews.filter((review) => review.agentId === agent.id).slice(-12).reverse() });
});

app.patch('/api/agents/:id', requireAuth, async (req, res) => {
  const body = req.body || {};
  const updated = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id);
    if (!agent || !requireOwner(agent, req.auth.user.id)) return null;
    const fields = ['name', 'description', 'businessType', 'tone', 'personality', 'language', 'services', 'rules', 'appIdea', 'template', 'trainingNotes'];
    for (const field of fields) {
      if (body[field] !== undefined) agent[field] = String(body[field]).trim();
    }
    if (body.appIdea || body.template || body.name || body.description) {
      agent.blueprint = buildAppBlueprint({ name: body.name || agent.name, prompt: body.appIdea || body.description || agent.appIdea || agent.description, template: body.template || agent.template || 'saas' });
    }
    if (Array.isArray(body.integrations)) agent.integrations = body.integrations;
    if (body.knowledgeItems !== undefined && Array.isArray(body.knowledgeItems)) agent.knowledgeItems = body.knowledgeItems.map(normalizeKnowledgeItem);
    if (body.automation !== undefined) agent.automation = normalizeAutomation(body.automation);
    if (body.modelStack !== undefined) agent.modelStack = normalizeModelStack(body.modelStack, db.settings);
    if (body.fineTuneProfile !== undefined) agent.fineTuneProfile = normalizeFineTuneProfile(body.fineTuneProfile);
    if (body.hiveMindConfig !== undefined) agent.hiveMindConfig = normalizeHiveMindConfig(body.hiveMindConfig);
    if (body.learningProfile !== undefined) agent.learningProfile = normalizeLearningProfile(body.learningProfile);
    if (Array.isArray(body.schoolIds)) agent.schoolIds = body.schoolIds.map((v) => String(v).trim()).filter(Boolean);
    if (body.primaryColor || body.secondaryColor) {
      agent.theme = { primary: body.primaryColor || agent.theme.primary, secondary: body.secondaryColor || agent.theme.secondary };
    }
    agent.updatedAt = nowIso();
    return agent;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, agent: { ...updated, publicUrl: `/agent/${updated.slug}?key=${updated.publicKey}`, hostedUrl: hostedUrlFor(updated) } });
});

app.delete('/api/agents/:id', requireAuth, async (req, res) => {
  const deleted = await mutate((db) => {
    const idx = db.agents.findIndex((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (idx === -1) return false;
    const [agent] = db.agents.splice(idx, 1);
    db.conversations = db.conversations.filter((c) => c.agentId !== agent.id);
    return true;
  });
  if (!deleted) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.get('/api/agents/:id/advice', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, advice: buildAgentAdvice(agent, db) });
});

app.get('/api/agents/:id/knowledge', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, knowledgeItems: agent.knowledgeItems || [] });
});

app.post('/api/agents/:id/knowledge', requireAuth, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const content = String(req.body?.content || '').trim();
  if (!title && !content) return res.status(400).json({ error: 'invalid_input' });
  const item = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    agent.knowledgeItems ||= [];
    const record = normalizeKnowledgeItem({ title: title || 'Notiz', content, source: req.body?.source });
    agent.knowledgeItems.unshift(record);
    agent.updatedAt = nowIso();
    return record;
  });
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, item });
});

app.delete('/api/agents/:id/knowledge/:kid', requireAuth, async (req, res) => {
  const removed = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    const idx = (agent.knowledgeItems || []).findIndex((item) => item.id === req.params.kid);
    if (idx === -1) return false;
    agent.knowledgeItems.splice(idx, 1);
    agent.updatedAt = nowIso();
    return true;
  });
  if (!removed) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.put('/api/agents/:id/automation', requireAuth, async (req, res) => {
  const automation = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    agent.automation = normalizeAutomation(req.body || {});
    agent.updatedAt = nowIso();
    return agent.automation;
  });
  if (!automation) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, automation });
});

app.get('/api/agents/:id/telegram-token', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, stored: telegramTokenExists(agent), tokenFile: telegramTokenFileFor(agent) });
});

app.post('/api/agents/:id/telegram-token', requireAuth, async (req, res) => {
  const token = String(req.body?.telegramToken || '').trim();
  if (!token) return res.status(400).json({ error: 'invalid_input' });
  const result = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    const tokenFile = telegramTokenFileFor(agent);
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(tokenFile, token, { mode: 0o600 });
    return { tokenFile };
  });
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, stored: true, tokenFile: result.tokenFile });
});

app.post('/api/agents/:id/train', requireAuth, async (req, res) => {
  const result = await mutate(async (db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    const convoIds = db.conversations.filter((c) => c.agentId === agent.id);
    const trainingNotes = await generateTrainingDigest({
      name: agent.name,
      description: agent.description,
      businessType: agent.businessType,
      tone: agent.tone,
      personality: agent.personality,
      language: agent.language,
      services: agent.services,
      rules: agent.rules,
      knowledgeItems: agent.knowledgeItems || [],
      automation: agent.automation || defaultAutomation(),
      schools: (db.schools || defaultSchools()).filter((s) => (agent.schoolIds || []).includes(s.id)),
      conversations: convoIds.map((c) => ({ id: c.id, messages: c.messages || [] })),
    });
    agent.trainingNotes = String(trainingNotes || '').trim();
    agent.updatedAt = nowIso();
    return { trainingNotes: agent.trainingNotes, conversations: convoIds.length, knowledgeItems: (agent.knowledgeItems || []).length };
  });
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, ...result });
});

app.get('/api/agents/:id/fine-tune-jobs', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, jobs: db.fineTuneJobs.filter((job) => job.agentId === agent.id).slice(-20).reverse() });
});

app.post('/api/agents/:id/fine-tune-jobs', requireAuth, async (req, res) => {
  const created = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    const job = buildFineTuneJob(agent, db, { notes: req.body?.notes });
    db.fineTuneJobs.unshift(job);
    agent.fineTuneProfile = normalizeFineTuneProfile({
      ...(agent.fineTuneProfile || {}),
      status: job.status,
      lastRunAt: nowIso(),
      lastJobId: job.id,
    });
    agent.updatedAt = nowIso();
    return job;
  });
  if (!created) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, job: created });
});

app.post('/api/agents/:id/fine-tune-export', requireAuth, async (req, res) => {
  const result = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    let job = db.fineTuneJobs.find((item) => item.id === normalizeFineTuneProfile(agent.fineTuneProfile).lastJobId && item.agentId === agent.id);
    if (!job) {
      job = buildFineTuneJob(agent, db, { notes: 'Auto-created during export' });
      db.fineTuneJobs.unshift(job);
      agent.fineTuneProfile = normalizeFineTuneProfile({ ...(agent.fineTuneProfile || {}), lastJobId: job.id, lastRunAt: nowIso(), status: job.status });
    }
    const exported = exportFineTuneDataset(agent, db, job);
    job.updatedAt = nowIso();
    job.providerStatus = 'dataset_exported';
    job.export = exported;
    agent.updatedAt = nowIso();
    return { job, exported };
  });
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, job: result.job, export: result.exported });
});

app.post('/api/agents/:id/fine-tune-provider-upload', requireAuth, async (req, res) => {
  const provider = String(req.body?.provider || 'openai').trim().toLowerCase();
  const prepared = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    let job = db.fineTuneJobs.find((item) => item.id === normalizeFineTuneProfile(agent.fineTuneProfile).lastJobId && item.agentId === agent.id);
    if (!job) {
      job = buildFineTuneJob(agent, db, { notes: 'Auto-created during provider upload' });
      db.fineTuneJobs.unshift(job);
      agent.fineTuneProfile = normalizeFineTuneProfile({ ...(agent.fineTuneProfile || {}), lastJobId: job.id, lastRunAt: nowIso(), status: job.status });
    }
    if (!job.export?.outputDir) {
      const exported = exportFineTuneDataset(agent, db, job);
      job.export = exported;
      job.providerStatus = 'dataset_exported';
    }
    return { jobId: job.id, provider };
  });
  if (!prepared) return res.status(404).json({ error: 'not_found' });

  let uploadResult;
  try {
    const db = loadDb();
    const job = db.fineTuneJobs.find((item) => item.id === prepared.jobId);
    uploadResult = await runProviderUpload(job, provider);
  } catch (err) {
    uploadResult = { provider, status: 'failed', message: String(err.message || err) };
  }

  const updated = await mutate((db) => {
    const job = db.fineTuneJobs.find((item) => item.id === prepared.jobId);
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!job || !agent) return null;
    job.providerUpload = uploadResult;
    job.providerStatus = uploadResult.status;
    job.updatedAt = nowIso();
    agent.fineTuneProfile = normalizeFineTuneProfile({
      ...(agent.fineTuneProfile || {}),
      status: uploadResult.status === 'submitted' ? 'submitted' : agent.fineTuneProfile?.status,
      lastRunAt: nowIso(),
      lastJobId: job.id,
    });
    agent.updatedAt = nowIso();
    return { job, upload: uploadResult };
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, ...updated });
});

app.post('/api/agents/:id/fine-tune-provider-sync', requireAuth, async (req, res) => {
  const prepared = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    const job = db.fineTuneJobs.find((item) => item.id === normalizeFineTuneProfile(agent.fineTuneProfile).lastJobId && item.agentId === agent.id);
    if (!job) return { missing: true };
    return { jobId: job.id };
  });
  if (!prepared) return res.status(404).json({ error: 'not_found' });
  if (prepared.missing) return res.status(400).json({ error: 'no_job' });

  let syncResult;
  try {
    const db = loadDb();
    const job = db.fineTuneJobs.find((item) => item.id === prepared.jobId);
    syncResult = await syncProviderUpload(job);
  } catch (err) {
    syncResult = { status: 'failed', message: String(err.message || err) };
  }

  const updated = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    const job = db.fineTuneJobs.find((item) => item.id === prepared.jobId);
    if (!agent || !job) return null;
    job.providerSync = syncResult;
    job.providerStatus = syncResult.fineTuneStatus || syncResult.status;
    job.updatedAt = nowIso();
    if (syncResult.fineTuneStatus) {
      agent.fineTuneProfile = normalizeFineTuneProfile({
        ...(agent.fineTuneProfile || {}),
        status: syncResult.fineTuneStatus,
        lastRunAt: nowIso(),
        lastJobId: job.id,
      });
    }
    agent.updatedAt = nowIso();
    return { job, sync: syncResult };
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, ...updated });
});

app.get('/api/agents/:id/hive-runs', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, runs: db.hiveRuns.filter((run) => run.agentId === agent.id).slice(-20).reverse() });
});

app.get('/api/agents/:id/shadow-reviews', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, reviews: db.shadowReviews.filter((review) => review.agentId === agent.id).slice(-30).reverse() });
});

app.post('/api/agents/:id/shadow-review-run', requireAuth, async (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  const convo = ownerConversationForAgent(db, agent.id, req.auth.user.id);
  const messages = convo.messages || [];
  const lastUser = [...messages].reverse().find((item) => item.role === 'user');
  const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
  if (!lastUser || !lastAssistant) return res.status(400).json({ error: 'no_messages' });
  const review = await generateShadowReview(agent, db, {
    source: 'manual',
    conversationId: convo.id,
    message: lastUser.content,
    reply: lastAssistant.content,
  });
  await mutate((db2) => {
    db2.shadowReviews.unshift(review);
    db2.shadowReviews = db2.shadowReviews.slice(0, 500);
    return true;
  });
  res.json({ ok: true, review });
});

app.post('/api/agents/:id/hive-runs', requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const created = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    const run = buildHiveRun(agent, db, prompt);
    db.hiveRuns.unshift(run);
    agent.updatedAt = nowIso();
    return { run, agent: { ...agent }, settings: db.settings };
  });
  if (!created) return res.status(404).json({ error: 'not_found' });
  const execution = await executeHiveRun(created.agent, { settings: created.settings }, created.run);
  const finalRun = await mutate((db) => {
    const run = db.hiveRuns.find((item) => item.id === created.run.id);
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!run || !agent) return null;
    Object.assign(run, execution, { updatedAt: nowIso() });
    agent.updatedAt = nowIso();
    return run;
  });
  if (!finalRun) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, run: finalRun });
});

app.post('/api/agents/:id/regenerate-key', requireAuth, async (req, res) => {
  const agent = await mutate((db) => {
    const record = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!record) return null;
    record.publicKey = uid('pub_');
    record.updatedAt = nowIso();
    return record;
  });
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, publicUrl: `/agent/${agent.slug}?key=${agent.publicKey}`, hostedUrl: hostedUrlFor(agent) });
});

app.get('/api/public/agent/:slug', (req, res) => {
  const { key } = req.query;
  const db = loadDb();
  const agent = db.agents.find((a) => a.slug === req.params.slug && a.publicKey === key);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, agent: publicAgentView(agent, db) });
});

app.post('/api/public/agent/:slug/feedback', async (req, res) => {
  const { key } = req.query;
  const { rating, message = '', reply = '', visitorId = uid('vis_') } = req.body || {};
  if (!['good', 'bad'].includes(String(rating))) return res.status(400).json({ error: 'invalid_input' });
  const db = loadDb();
  const agent = db.agents.find((a) => a.slug === req.params.slug && a.publicKey === key);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  await mutate((db2) => {
    const live = db2.agents.find((a) => a.id === agent.id);
    if (!live) return null;
    applyFeedbackLearn(live, { rating: String(rating), message: String(message), reply: String(reply) });
    const workspace = workspaceForAgent(db2, live);
    if (workspace) applyFeedbackLearn(workspace, { rating: String(rating), message: String(message), reply: String(reply) });
    let convo = db2.conversations.find((c) => c.agentId === live.id && c.visitorId === visitorId);
    if (!convo) {
      convo = { id: uid('con_'), agentId: live.id, visitorId, createdAt: nowIso(), updatedAt: nowIso(), messages: [] };
      db2.conversations.push(convo);
    }
    convo.messages.push({ role: 'user', content: `[feedback:${rating}] ${String(message).slice(0, 200)}`, createdAt: nowIso() });
    convo.messages.push({ role: 'assistant', content: `[feedback noted] ${String(reply).slice(0, 200)}`, createdAt: nowIso() });
    live.updatedAt = nowIso();
    return true;
  });
  res.json({ ok: true });
});

app.post('/api/public/agent/:slug/chat', async (req, res) => {
  const ip = getIp(req);
  if (!rateLimit(publicChatBuckets, `pub:${ip}`, 30, 60 * 1000)) return respondRateLimited(res);
  const { key } = req.query;
  const { message, visitorId = uid('vis_') } = req.body || {};
  if (!message) return res.status(400).json({ error: 'invalid_input' });
  const db = loadDb();
  const agent = db.agents.find((a) => a.slug === req.params.slug && a.publicKey === key);
  if (!agent) return res.status(404).json({ error: 'not_found' });

  let convo = db.conversations.find((c) => c.agentId === agent.id && c.visitorId === visitorId);
  const history = convo ? convo.messages.slice(-20) : [];
  const reply = await generateReply({ systemPrompt: composeAgentSystemPrompt(agent, db, history), history, message: String(message), routing: normalizeModelStack(agent.modelStack, db.settings) });

  await mutate((db2) => {
    const liveAgent = db2.agents.find((a) => a.id === agent.id);
    if (!liveAgent) return null;
    let liveConvo = db2.conversations.find((c) => c.agentId === agent.id && c.visitorId === visitorId);
    if (!liveConvo) {
      liveConvo = { id: uid('con_'), agentId: agent.id, visitorId, createdAt: nowIso(), updatedAt: nowIso(), messages: [] };
      db2.conversations.push(liveConvo);
    }
    liveConvo.messages.push({ role: 'user', content: String(message), createdAt: nowIso() });
    liveConvo.messages.push({ role: 'assistant', content: reply, createdAt: nowIso() });
    liveConvo.updatedAt = nowIso();
    if ((normalizeLearningProfile(liveAgent.learningProfile)).enabled) applyAutoLearn(liveAgent, { message: String(message), reply, history });
    const workspace = workspaceForAgent(db2, liveAgent);
    if (workspace && normalizeLearningProfile(workspace.learningProfile).enabled) applyAutoLearn(workspace, { message: String(message), reply, history });
    liveAgent.updatedAt = nowIso();
  });

  void enqueueShadowReview(agent.id, {
    source: 'public',
    conversationId: convo?.id || null,
    message: String(message),
    reply,
  });

  res.json({ ok: true, response: reply, visitorId, agentName: agent.name });
});

app.post('/api/agents/:id/chat', requireAuth, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'invalid_input' });
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });

  const ownerVisitorId = `owner:${req.auth.user.id}`;
  const convo = ownerConversationForAgent(db, agent.id, req.auth.user.id);
  const history = (convo.messages || []).slice(-20);
  const reply = await generateReply({
    systemPrompt: composeAgentSystemPrompt(agent, db, history),
    history,
    message,
    routing: normalizeModelStack(agent.modelStack, db.settings),
  });

  await mutate((db2) => {
    const liveAgent = db2.agents.find((a) => a.id === agent.id);
    if (!liveAgent) return null;
    let liveConvo = db2.conversations.find((c) => c.agentId === agent.id && (c.ownerUserId === req.auth.user.id || c.visitorId === ownerVisitorId));
    if (!liveConvo) {
      liveConvo = { id: uid('con_'), agentId: agent.id, ownerUserId: req.auth.user.id, visitorId: ownerVisitorId, createdAt: nowIso(), updatedAt: nowIso(), messages: [] };
      db2.conversations.push(liveConvo);
    }
    liveConvo.messages.push({ role: 'user', content: message, createdAt: nowIso() });
    liveConvo.messages.push({ role: 'assistant', content: reply, createdAt: nowIso() });
    liveConvo.updatedAt = nowIso();
    if ((normalizeLearningProfile(liveAgent.learningProfile)).enabled) applyAutoLearn(liveAgent, { message, reply, history });
    const workspace = workspaceForAgent(db2, liveAgent);
    if (workspace && normalizeLearningProfile(workspace.learningProfile).enabled) applyAutoLearn(workspace, { message, reply, history });
    liveAgent.updatedAt = nowIso();
    return true;
  });

  void enqueueShadowReview(agent.id, {
    source: 'owner',
    conversationId: convo.id || null,
    message,
    reply,
  });

  res.json({ ok: true, response: reply, conversationId: convo.id || null, agentName: agent.name });
});

app.get('/api/agents/:id/conversations', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  const convo = db.conversations.filter((c) => c.agentId === agent.id);
  res.json({ ok: true, conversations: convo });
});

app.get('/api/agents/:id/export', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  const convo = db.conversations.filter((c) => c.agentId === agent.id);
  const format = String(req.query.format || 'json');
  if (format === 'md') {
    res.type('text/markdown').send(`# ${agent.name}

${agent.description}

## Blueprint

- Template: ${agent.template || 'saas'}
- App idea: ${agent.appIdea || agent.description}
- Features: ${(agent.blueprint?.features || []).join(', ')}
- Stack: ${(agent.blueprint?.stack || []).join(', ')}
- Pages: ${(agent.blueprint?.pages || []).join(', ')}
`);
    return;
  }
  res.json({ ok: true, agent, conversations: convo, blueprint: agent.blueprint || null });
});

app.get('/api/agents/:id/autolearn-export', requireAuth, (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  const workspace = workspaceForAgent(db, agent);
  res.json({
    ok: true,
    exportedAt: nowIso(),
    agentId: agent.id,
    workspaceId: workspace?.id || null,
    learningProfile: normalizeLearningProfile(agent.learningProfile),
    workspaceLearningProfile: normalizeLearningProfile(workspace?.learningProfile),
  });
});

app.post('/api/agents/:id/autolearn-import', requireAuth, async (req, res) => {
  const body = req.body || {};
  const updated = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    if (body.learningProfile) {
      agent.learningProfile = normalizeLearningProfile({ ...(agent.learningProfile || {}), ...body.learningProfile });
    }
    if (body.workspaceLearningProfile) {
      const workspace = workspaceForAgent(db, agent);
      if (workspace) workspace.learningProfile = normalizeLearningProfile({ ...(workspace.learningProfile || {}), ...body.workspaceLearningProfile });
    }
    agent.updatedAt = nowIso();
    return agent;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, agent: { ...updated, learningProfile: normalizeLearningProfile(updated.learningProfile) } });
});

app.post('/api/agents/:id/generate', requireAuth, async (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  const out = await writeScaffold(agent);
  res.json({ ok: true, outputDir: out.dir, files: out.files, hostedUrl: hostedUrlFor(agent) });
});

app.post('/api/agents/:id/export-openclaw', requireAuth, async (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  const out = await writeOpenClawExport(agent);
  res.json({ ok: true, outputDir: out.dir, files: out.files, deployScript: path.join(out.dir, 'deploy.sh') });
});

app.post('/api/agents/:id/deploy-openclaw', requireAuth, async (req, res) => {
  const db = loadDb();
  const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });

  const out = await writeOpenClawExport(agent);
  const deployScript = path.join(out.dir, 'deploy.sh');

  const telegramToken = String(req.body?.telegramToken || '').trim();
  let tokenFile = telegramTokenFileFor(agent);
  if (telegramToken) {
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(tokenFile, telegramToken, { mode: 0o600 });
  }

  const storedToken = telegramTokenExists(agent);
  if (!telegramToken && !storedToken) {
    return res.status(400).json({ error: 'telegram_token_missing', message: 'Telegram-Token zuerst speichern.' });
  }

  const installAllowed = String(process.env.OPENCLAW_DEPLOY_EXEC || '').trim() === '1' || req.body?.apply === true;
  let install = { ok: false, skipped: true, reason: 'not_requested' };

  if (installAllowed) {
    const accountId = agent.automation?.telegramAccountId || agent.slug;
    const runtimeAgentId = String(agent.automation?.openclawAgentId || agent.slug).trim();
    const exists = openClawAgentExists(runtimeAgentId);
    const cli = exists ? { ok: true, skipped: true, reason: 'already_exists' } : runOpenClawCli([
      'agents', 'add', runtimeAgentId,
      '--workspace', out.dir,
      '--model', 'openai/gpt-5.4-mini',
      '--non-interactive',
      '--bind', `telegram:${accountId}`,
      '--json',
    ], process.cwd());

    const setIdentity = runOpenClawCli([
      'agents', 'set-identity', '--agent', runtimeAgentId,
      '--name', agent.name,
      '--emoji', '🧪',
      '--json',
    ], process.cwd());

    const bind = runOpenClawCli([
      'agents', 'bind', '--agent', runtimeAgentId, '--bind', `telegram:${accountId}`, '--json',
    ], process.cwd());

    install = {
      ok: cli.ok && setIdentity.ok && bind.ok,
      add: cli,
      setIdentity,
      bind,
    };
  }

  res.json({ ok: true, outputDir: out.dir, files: out.files, deployScript, tokenFile, install });
});

app.get('/api/admin/summary', requireAuth, (req, res) => {
  const db = loadDb();
  const mine = db.agents.filter((a) => a.userId === req.auth.user.id);
  res.json({
    ok: true,
    summary: {
      agents: mine.length,
      publicAgents: mine.length,
      conversations: db.conversations.filter((c) => mine.some((a) => a.id === c.agentId)).length,
      totalUsers: db.users.length,
    },
  });
});

app.get('/api/schools', requireAuth, (req, res) => {
  const db = loadDb();
  res.json({ ok: true, schools: db.schools?.length ? db.schools : defaultSchools() });
});

app.post('/api/schools', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const focus = String(req.body?.focus || '').trim();
  const lessonText = String(req.body?.lessonText || '').trim();
  if (!name || !focus) return res.status(400).json({ error: 'invalid_input' });
  const school = await mutate((db) => {
    db.schools ||= defaultSchools();
    const record = {
      id: uid('school_'),
      name,
      focus,
      lessons: lessonText ? lessonText.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      createdAt: nowIso(),
    };
    db.schools.unshift(record);
    return record;
  });
  res.json({ ok: true, school });
});

app.post('/api/agents/:id/schools/:schoolId', requireAuth, async (req, res) => {
  const result = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    db.schools ||= defaultSchools();
    const school = db.schools.find((s) => s.id === req.params.schoolId);
    if (!school) return null;
    agent.schoolIds ||= [];
    if (!agent.schoolIds.includes(school.id)) agent.schoolIds.push(school.id);
    agent.updatedAt = nowIso();
    return { agent, school };
  });
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, schoolId: result.school.id, schoolName: result.school.name, schoolIds: result.agent.schoolIds });
});

app.delete('/api/agents/:id/schools/:schoolId', requireAuth, async (req, res) => {
  const removed = await mutate((db) => {
    const agent = db.agents.find((a) => a.id === req.params.id && a.userId === req.auth.user.id);
    if (!agent) return null;
    agent.schoolIds ||= [];
    agent.schoolIds = agent.schoolIds.filter((id) => id !== req.params.schoolId);
    agent.updatedAt = nowIso();
    return true;
  });
  if (!removed) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

let server = null;

function startServer() {
  if (server) return server;
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${BRAND} running on http://0.0.0.0:${PORT}\n`);
    void notifyReady();
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };
