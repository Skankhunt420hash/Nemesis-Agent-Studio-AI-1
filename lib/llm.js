const { loadDb } = require('./store');

let anthropic = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  if (process.env.ANTHROPIC_API_KEY) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch {
  anthropic = null;
}

const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;

const DEFAULT_FALLBACK_MODELS = [
  'openrouter/auto',
  'openrouter/google/gemini-3.1-flash-lite',
  'deepseek/deepseek-v4-flash',
];

function normalizeText(value = '') {
  return String(value).toLowerCase();
}

function splitModels(value, fallback = []) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .concat(fallback)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function getRoutingSettings(override = null) {
  const db = loadDb();
  const settings = db.settings || {};
  const resolved = {
    routerEnabled: settings.routerEnabled !== false && String(process.env.LLM_ROUTER || '1') !== '0',
    mainModel: settings.mainModel || process.env.MAIN_MODEL || process.env.CHAT_MODEL || 'openai/gpt-4.5',
    codingModel: settings.codingModel || process.env.CODING_MODEL || process.env.CHAT_MODEL_CODING || 'anthropic/claude-sonnet-4',
    fallbackModels: splitModels(settings.fallbackModels || process.env.CHAT_MODEL_FALLBACKS, DEFAULT_FALLBACK_MODELS),
  };
  if (!override || typeof override !== 'object') return resolved;
  return {
    routerEnabled: override.routerEnabled !== undefined ? override.routerEnabled !== false : resolved.routerEnabled,
    mainModel: String(override.mainModel || resolved.mainModel).trim() || resolved.mainModel,
    codingModel: String(override.codingModel || resolved.codingModel).trim() || resolved.codingModel,
    fallbackModels: splitModels(override.fallbackModels, resolved.fallbackModels),
  };
}

function formatKnowledgeItems(knowledgeItems = []) {
  return (Array.isArray(knowledgeItems) ? knowledgeItems : [])
    .filter((item) => item && (item.title || item.content))
    .map((item) => `- ${item.title || 'Notiz'}: ${item.content || ''}`.trim())
    .join('\n');
}

function formatAutomation(automation = {}) {
  const parts = [];
  if (automation.telegramAccountId) parts.push(`Telegram Account: ${automation.telegramAccountId}`);
  if (automation.telegramBotName) parts.push(`Telegram Bot: ${automation.telegramBotName}`);
  if (automation.openclawAgentId) parts.push(`OpenClaw Agent: ${automation.openclawAgentId}`);
  if (automation.readyWebhookUrl) parts.push(`Ready Webhook: ${automation.readyWebhookUrl}`);
  return parts.join('\n');
}

function generateFallbackPrompt({ name, description, businessType, tone, personality, language, rules = '', services = '', knowledgeItems = [], automation = {}, trainingNotes = '' }) {
  return [
    `Du bist ${name}.`,
    `Aufgabe: ${description}`,
    `Business: ${businessType}`,
    `Tonalität: ${tone}`,
    `Persönlichkeit: ${personality}`,
    `Sprache: ${language}`,
    services ? `Services: ${services}` : null,
    rules ? `Regeln: ${rules}` : null,
    formatKnowledgeItems(knowledgeItems) ? `Wissen/Futter:\n${formatKnowledgeItems(knowledgeItems)}` : null,
    formatAutomation(automation) ? `Automation:\n${formatAutomation(automation)}` : null,
    trainingNotes ? `Trainingsnotizen:\n${trainingNotes}` : null,
    '',
    'Arbeite präzise, freundlich und professionell.',
    'Stelle Rückfragen, wenn Informationen fehlen.',
    'Erfinde keine Fakten.',
  ].filter(Boolean).join('\n');
}

async function generateSystemPrompt(input) {
  const fallback = generateFallbackPrompt(input);
  if (!anthropic) return fallback;
  try {
    const response = await anthropic.messages.create({
      model: process.env.SYSTEM_PROMPT_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 900,
      messages: [{ role: 'user', content: `Erstelle einen produktiven System-Prompt für diesen AI-Agenten:\n\n${JSON.stringify(input, null, 2)}\n\nAntworte NUR mit dem finalen System-Prompt.` }],
    });
    const text = response?.content?.[0]?.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function classifyRoute(text) {
  const lower = normalizeText(text);
  const codingSignals = [
    /```/,
    /\b(function|class|const|let|var|import|export|async|await|return)\b/,
    /\b(error|exception|stack trace|traceback|compile|build failed|typeerror|syntaxerror|referenceerror)\b/,
    /\b(fix|debug|debuggen|refactor|implement|implementieren|patch|test|bauen|umsetzen|typescript|javascript|python|node|react|sql|docker|bash|cli)\b/,
    /\b(npm|pnpm|yarn|git|terminal|command line|shell|stderr|stdout|befehl|konsole)\b/,
    /(^|\n)\s*(diff --git|\+\+\+ |--- |@@ )/,
  ];
  const generalSignals = [
    /\b(summarize|explain|strategy|compare|brainstorm|write|draft|rewrite|translate|plan|analyze|erkläre|zusammenfassen|übersetze|entwurf)\b/,
    /\b(email|message|reply|text|copy|landing page|marketing|product|antwort|nachricht|text)\b/,
  ];
  const fallbackSignals = [
    /\b(free|freebie|cheap|budget|quota|token limit|kontingent|limits? exhausted|fallback|second opinion|kostenlos|gratis)\b/,
  ];

  const score = (list) => list.reduce((n, re) => n + (re.test(lower) ? 1 : 0), 0);
  const codingScore = score(codingSignals);
  const generalScore = score(generalSignals);
  const fallbackScore = score(fallbackSignals);

  if (fallbackScore > 0) return { route: 'fallback', codingScore, generalScore, fallbackScore };
  if (codingScore > generalScore) return { route: 'coding', codingScore, generalScore, fallbackScore };
  return { route: 'general', codingScore, generalScore, fallbackScore };
}

function buildRoutingPlan({ message, history = [], settings: overrideSettings } = {}) {
  const settings = getRoutingSettings(overrideSettings);
  const fullText = [...history.map((m) => m?.content || ''), message || ''].join('\n');
  const classification = classifyRoute(fullText);
  const primaryByRoute = {
    coding: settings.codingModel,
    general: settings.mainModel,
    fallback: settings.fallbackModels[0],
  };
  const candidates = [primaryByRoute[classification.route], ...(classification.route === 'fallback' ? settings.fallbackModels : settings.fallbackModels)].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];
  return { ...classification, routerEnabled: settings.routerEnabled, primaryModel: uniqueCandidates[0], candidates: uniqueCandidates };
}

function providerInfoForModel(model) {
  const value = String(model || '').trim();
  if (!value) return { provider: 'openai', model: 'gpt-4.5', baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY };

  if (value.startsWith('openai/')) {
    return { provider: 'openai', model: value.slice('openai/'.length), baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY };
  }
  if (value.startsWith('anthropic/')) {
    return { provider: 'anthropic', model: value.slice('anthropic/'.length) };
  }
  if (value.startsWith('openrouter/')) {
    return { provider: 'openrouter', model: value.slice('openrouter/'.length), baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY };
  }
  if (value.startsWith('deepseek/')) {
    return { provider: 'deepseek', model: value.slice('deepseek/'.length), baseUrl: 'https://api.deepseek.com/v1', apiKey: process.env.DEEPSEEK_API_KEY };
  }
  if (/^claude|sonnet|opus|haiku/i.test(value)) {
    return { provider: 'anthropic', model: value };
  }
  return { provider: 'openai', model: value, baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY };
}

function buildChatMessages(systemPrompt, history, message) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const item of history || []) {
    if (item?.content) messages.push({ role: item.role || 'user', content: String(item.content) });
  }
  messages.push({ role: 'user', content: String(message) });
  return messages;
}

async function callChatCompletions({ baseUrl, apiKey, model, messages }) {
  if (!fetchFn) throw new Error('fetch_unavailable');
  if (!apiKey) throw new Error('missing_api_key');
  const resp = await fetchFn(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://openclaw.local',
      'X-Title': 'App Factory',
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(text || `HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  return String(text || '').trim();
}

async function callAnthropic({ model, systemPrompt, history, message }) {
  if (!anthropic) throw new Error('missing_api_key');
  const response = await anthropic.messages.create({
    model,
    max_tokens: 900,
    system: systemPrompt,
    messages: [...(history || []).map((m) => ({ role: m.role || 'user', content: String(m.content || '') })), { role: 'user', content: String(message) }],
  });
  return response?.content?.[0]?.text?.trim() || '';
}

function isQuotaLikeError(err) {
  const text = `${err?.message || ''} ${err?.status || ''}`.toLowerCase();
  return /quota|limit|insufficient|billing|rate.?limit|429|tokens? exhausted|payment/.test(text);
}

async function generateReply({ systemPrompt, history = [], message, routing }) {
  const plan = buildRoutingPlan({ message, history, settings: routing });
  const candidates = plan.routerEnabled ? plan.candidates : [getRoutingSettings().mainModel];
  let lastError = null;

  for (const modelRef of candidates) {
    try {
      const info = providerInfoForModel(modelRef);
      if (info.provider === 'anthropic') {
        const text = await callAnthropic({ model: info.model, systemPrompt, history, message });
        if (text) return text;
        throw new Error('empty_response');
      }
      const text = await callChatCompletions({ baseUrl: info.baseUrl, apiKey: info.apiKey, model: info.model, messages: buildChatMessages(systemPrompt, history, message) });
      if (text) return text;
      throw new Error('empty_response');
    } catch (err) {
      lastError = err;
      if (!plan.routerEnabled && !isQuotaLikeError(err)) break;
    }
  }

  if (lastError) return `LLM Fehler: ${lastError.message}`;
  return 'Keine Antwort erhalten.';
}

async function generateTrainingDigest({ name, description, businessType, tone, personality, language, services = '', rules = '', knowledgeItems = [], automation = {}, schools = [], conversations = [] }) {
  const fallback = [
    `Agent: ${name}`,
    description ? `Ziel: ${description}` : null,
    businessType ? `Business: ${businessType}` : null,
    tone ? `Tonalität: ${tone}` : null,
    personality ? `Persönlichkeit: ${personality}` : null,
    language ? `Sprache: ${language}` : null,
    services ? `Services: ${services}` : null,
    rules ? `Regeln: ${rules}` : null,
    knowledgeItems.length ? `Wissensquellen: ${knowledgeItems.length}` : null,
    schools.length ? `Schools: ${schools.map((s) => s.name).join(', ')}` : null,
    conversations.length ? `Gespräche: ${conversations.length}` : null,
    automation.telegramAccountId ? `Telegram: ${automation.telegramAccountId}` : null,
  ].filter(Boolean).join(' · ');

  if (!fetchFn && !anthropic) return fallback;

  const payload = [
    `Analysiere und verdichte diesen Agenten in kurze Trainingsnotizen.`,
    `Ziel: bessere Antworten, klare Rolle, saubere Automatisierung.`,
    `Gib nur den finalen Text aus, keine Einleitung.`,
    '',
    JSON.stringify({ name, description, businessType, tone, personality, language, services, rules, knowledgeItems, automation, schools, recentConversations: conversations.slice(-6) }, null, 2),
  ].join('\n');

  try {
    const provider = String(process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || !fetchFn) return fallback;
      const resp = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: process.env.CHAT_MODEL || 'openai/gpt-4.5', messages: [{ role: 'user', content: payload }] }),
      });
      const data = await resp.json();
      return data?.choices?.[0]?.message?.content?.trim() || fallback;
    }

    if (!anthropic) return fallback;
    const response = await anthropic.messages.create({
      model: process.env.SYSTEM_PROMPT_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 700,
      messages: [{ role: 'user', content: payload }],
    });
    return response?.content?.[0]?.text?.trim() || fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  generateSystemPrompt,
  generateReply,
  generateFallbackPrompt,
  generateTrainingDigest,
  classifyRoute,
  buildRoutingPlan,
};
