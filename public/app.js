const state = { me: null, dashboard: null, schools: [], settings: null, openclawAgents: [], tab: 'dashboard', workspaceId: null, demoMode: false };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (value) => String(value ?? '').replace(/[&<>"]|'/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const demoDisabledAttr = (disabled) => disabled ? 'disabled title="Im APK-Demo-Modus ohne Backend deaktiviert." style="opacity:.55;pointer-events:none"' : '';
const demoHref = (href, disabled) => disabled ? '#' : (href || '#');
const AGENT_DRAFT_KEY = 'nemesis-agent-draft-v1';
const DASHBOARD_CACHE_KEY = 'nemesis-dashboard-cache-v1';

function showTab(tab) {
  state.tab = tab;
  $('#authTab').classList.toggle('hidden', tab !== 'auth');
  $('#dashboardTab').classList.toggle('hidden', tab !== 'dashboard');
  $('#createTab').classList.toggle('hidden', tab !== 'create');
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

function setStatus(text, kind = 'info') {
  const el = $('#status');
  el.textContent = text;
  el.style.background = kind === 'error' ? '#fef2f2' : kind === 'ok' ? '#ecfdf5' : '#eff6ff';
  el.style.borderColor = kind === 'error' ? '#fecaca' : kind === 'ok' ? '#bbf7d0' : '#bfdbfe';
  el.style.color = kind === 'error' ? '#991b1b' : kind === 'ok' ? '#166534' : '#1d4ed8';
}

function translateError(error) {
  const msg = String(error?.message || error || '');
  if (msg.includes('invalid_credentials')) return 'Login fehlgeschlagen. Bitte E-Mail und Passwort prüfen.';
  if (msg.includes('email_exists')) return 'Diese E-Mail ist bereits registriert.';
  if (msg.includes('invalid_input')) return 'Bitte alle Felder korrekt ausfüllen. Passwort mindestens 8 Zeichen.';
  if (msg.includes('unauthorized')) return 'Bitte zuerst einloggen.';
  if (msg.includes('Failed to fetch')) return 'Backend nicht erreichbar. In der APK sollte jetzt der lokale Modus einspringen.';
  return msg || 'Unbekannter Fehler.';
}

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function saveAgentDraft(form) {
  if (!form) return;
  const fd = new FormData(form);
  const draft = {};
  for (const [key, value] of fd.entries()) draft[key] = value;
  localStorage.setItem(AGENT_DRAFT_KEY, JSON.stringify(draft));
}

function restoreAgentDraft(form) {
  if (!form) return;
  try {
    const raw = JSON.parse(localStorage.getItem(AGENT_DRAFT_KEY) || '{}');
    Object.entries(raw).forEach(([key, value]) => {
      const el = form.elements.namedItem(key);
      if (!el || value == null) return;
      if (el.type === 'checkbox') el.checked = value === true || value === 'on';
      else el.value = value;
    });
  } catch {}
}

function clearAgentDraft() {
  localStorage.removeItem(AGENT_DRAFT_KEY);
}

function buildPreviewModel(form) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim() || 'Neuer Premium-Agent';
  const appIdea = String(fd.get('appIdea') || '').trim();
  const businessType = String(fd.get('businessType') || 'Agent').trim();
  const tone = String(fd.get('tone') || 'premium, klar, hilfreich').trim();
  const personality = String(fd.get('personality') || 'smart, direkt, zuverlässig').trim();
  return {
    name,
    promise: appIdea || 'Hier siehst du sofort, wie der Agent als Produkt wirkt.',
    dna: `${businessType}-Agent • ${tone} • ${personality}`,
    prompt: `Rolle: ${businessType}-Agent\nMission: ${appIdea || 'Noch keine Mission definiert'}\nTon: ${tone}`,
    team: ['Captain', 'Research', 'Execution'],
    deploy: 'Telegram • OpenClaw Web • One-Tap ready',
    lab: ['Neukunde', 'Skeptischer User', 'Hot Lead'],
  };
}

function renderLivePreview() {
  const form = $('#agentForm');
  if (!form) return;
  const model = buildPreviewModel(form);
  if ($('#previewName')) $('#previewName').textContent = model.name;
  if ($('#previewPromise')) $('#previewPromise').textContent = model.promise;
  if ($('#previewDna')) $('#previewDna').textContent = model.dna;
  if ($('#previewPrompt')) $('#previewPrompt').innerHTML = `<pre class="code">${esc(model.prompt)}</pre>`;
  if ($('#previewTeam')) $('#previewTeam').innerHTML = model.team.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ');
  if ($('#previewDeploy')) $('#previewDeploy').textContent = model.deploy;
  if ($('#previewLab')) $('#previewLab').innerHTML = model.lab.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ');
}

function applyMagicFill(mode = 'default') {
  const form = $('#agentForm');
  if (!form) return;
  const presets = mode === 'premium'
    ? {
        name: 'Nemesis Premium Operator',
        appIdea: 'Baut, optimiert und steuert Premium-Agenten für Sales, Support und Automatisierung.',
        businessType: 'Premium Automation',
        description: 'Ein High-End-Agent, der Leads, Gespräche und Automationen steuert.',
        tone: 'premium, souverän, direkt',
        personality: 'smart, strategisch, zuverlässig',
      }
    : {
        name: 'Mein erster Agent',
        appIdea: 'Hilft mir Anfragen zu beantworten und Aufgaben schneller zu erledigen.',
        businessType: 'Assistant',
        description: 'Ein schneller Helfer für Alltag, Kunden und Antworten.',
        tone: 'klar, freundlich, effizient',
        personality: 'hilfreich, direkt, ruhig',
      };
  Object.entries(presets).forEach(([key, value]) => {
    const el = form.elements.namedItem(key);
    if (el) el.value = value;
  });
  saveAgentDraft(form);
  renderLivePreview();
}

function bindDraftForm(formId, storageKey) {
  const form = document.getElementById(formId);
  if (!form) return;
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
    Object.entries(raw).forEach(([key, value]) => {
      const el = form.elements.namedItem(key);
      if (!el || value == null) return;
      if (el.type === 'checkbox') el.checked = value === true || value === 'on';
      else el.value = value;
    });
  } catch {}

  const save = () => {
    const fd = new FormData(form);
    const draft = {};
    for (const [key, value] of fd.entries()) draft[key] = value;
    localStorage.setItem(storageKey, JSON.stringify(draft));
  };

  form.addEventListener('input', save);
  form.addEventListener('change', save);
  form.addEventListener('submit', () => localStorage.removeItem(storageKey));
}

function renderStats(stats = {}) {
  $('#stats').innerHTML = [
    ['Agenten', stats.agents || 0],
    ['Conversations', stats.conversations || 0],
    ['Messages', stats.messages || 0],
  ].map(([label, value]) => `<div class="stat"><div class="muted">${label}</div><div class="n">${value}</div></div>`).join('');
}

function renderWorkspaces(list = []) {
  const select = $('#workspaceSelect');
  select.innerHTML = list.map((w) => `<option value="${w.id}">${w.name}${w.isDefault ? ' • default' : ''}</option>`).join('');
  const selected = state.workspaceId && list.some((w) => w.id === state.workspaceId) ? state.workspaceId : (list[0]?.id || '');
  if (selected) select.value = selected;
  state.workspaceId = select.value || null;

  const importSelect = $('#importWorkspaceSelect');
  if (importSelect) {
    importSelect.innerHTML = list.map((w) => `<option value="${w.id}">${w.name}${w.isDefault ? ' • default' : ''}</option>`).join('');
    if (selected) importSelect.value = selected;
  }

  $('#workspaceList').innerHTML = list.length
    ? list.map((w) => `<div class="item"><strong>${w.name}</strong><br><span class="muted">${w.memberCount} Mitglieder${w.isDefault ? ' • Default' : ''}</span></div>`).join('')
    : '<div class="item">Noch kein Workspace.</div>';
}

function renderSchools(list = []) {
  $('#schoolList').innerHTML = list.length
    ? list.map((s) => `<div class="item"><strong>${esc(s.name)}</strong><br><span class="muted tiny">${esc(s.focus)}</span><div class="muted tiny" style="margin-top:6px;">${esc((s.lessons || []).join(' • '))}</div></div>`).join('')
    : '<div class="item">Noch keine School.</div>';
}

function renderOpenClawAgents(list = []) {
  $('#openclawRuntimeList').innerHTML = list.length
    ? list.map((a) => `<div class="item"><strong>${esc(a.name)}</strong><br><span class="muted tiny">${esc(a.id)} • ${esc(a.model || 'ohne Modell')} • Bindings ${a.bindings || 0}</span></div>`).join('')
    : '<div class="item">Keine vorhandenen OpenClaw-Agenten gefunden.</div>';

  const select = $('#importRuntimeAgentId');
  if (select) {
    select.innerHTML = `<option value="">Bitte wählen</option>${list.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.id)})</option>`).join('')}`;
  }
}

function renderSettings(settings = {}) {
  const form = $('#settingsForm');
  if (!form) return;
  form.routerEnabled.checked = settings.routerEnabled !== false;
  form.mainModel.value = settings.mainModel || 'openai/gpt-4.5';
  form.codingModel.value = settings.codingModel || 'anthropic/claude-sonnet-4';
  form.fallbackModels.value = (settings.fallbackModels || []).join(', ');
}

function renderChatMessages(messages = []) {
  const visible = (messages || []).slice(-10);
  if (!visible.length) return '<div class="item">Noch kein Chat. Teste den Agenten direkt hier.</div>';
  return visible.map((msg) => `<div class="item"><strong>${msg.role === 'assistant' ? 'Agent' : 'Du'}:</strong><div style="margin-top:6px;white-space:pre-wrap">${esc(msg.content || '')}</div></div>`).join('');
}

function renderListText(value = [], separator = '\n') {
  return Array.isArray(value) ? value.join(separator) : String(value || '');
}

function renderFineTuneJobs(jobs = []) {
  if (!jobs.length) return '<div class="item">Noch kein Fine-Tune-Job.</div>';
  return jobs.map((job) => `<div class="item"><strong>${esc(job.status)}</strong><div class="muted tiny">${esc(job.targetModel || 'ohne Zielmodell')} • Score ${job.readiness?.score || 0}/${job.readiness?.maxScore || 0} • ${esc(job.createdAt || '')}</div><div style="margin-top:8px;white-space:pre-wrap">${esc((job.warnings || []).join(' | ') || (job.nextActions || []).join(' | ') || 'Bereit.')}</div><div class="muted tiny" style="margin-top:6px;">${job.export?.counts ? esc(`Export: ${job.export.counts.train} train / ${job.export.counts.eval} eval`) : 'Noch kein Export'}</div><div class="muted tiny" style="margin-top:6px;">${esc(job.providerUpload?.fineTuneJobId ? `Provider Job: ${job.providerUpload.fineTuneJobId}` : 'Kein Provider-Job')}</div><div class="muted tiny" style="margin-top:6px;">${esc(job.providerSync?.fineTuneStatus || job.providerStatus || 'lokal')}</div></div>`).join('');
}

function renderHiveRuns(runs = []) {
  if (!runs.length) return '<div class="item">Noch kein Hive-Run.</div>';
  return runs.map((run) => `<div class="item"><strong>${esc(run.mode || 'solo')} • ${esc(run.objective || 'ohne Ziel')}</strong><div class="muted tiny">${esc(run.decisionStyle || 'captain')} • ${esc(run.status || 'draft')} • ${esc(run.executionMode || 'sequential')} • ${esc(run.createdAt || '')}</div><div style="margin-top:8px;white-space:pre-wrap">${esc((run.specialists || []).map((s) => s.role).join(', '))}</div><div class="muted tiny" style="margin-top:6px;">${esc((run.verdict?.nextSteps || []).join(' | '))}</div>${run.captainResponse ? `<div style="margin-top:8px;white-space:pre-wrap">${esc(run.captainResponse)}</div>` : ''}</div>`).join('');
}

function renderShadowReviews(reviews = []) {
  if (!reviews.length) return '<div class="item">Noch kein Shadow Review.</div>';
  return reviews.map((review) => `<div class="item"><strong>${esc(review.rating || 'ok')}</strong><div class="muted tiny">${esc(review.source || 'chat')} • ${esc(review.createdAt || '')}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(review.review || '')}</div></div>`).join('');
}

function renderRunLogs(logs = []) {
  if (!logs.length) return '<div class="item">Noch kein Run-Log.</div>';
  const colorFor = (status) => ({ delivered: '#16a34a', success: '#16a34a', executed: '#16a34a', failed: '#dc2626', error: '#dc2626', blocked: '#d97706', pending: '#d97706', disabled: '#64748b' }[String(status || '').toLowerCase()] || '#64748b');
  return logs.map((run) => `<div class="item"><div class="task"><strong>${esc(run.source || run.kind || 'run')}</strong><div style="display:flex;gap:8px;align-items:center;"><span class="badge">${esc(run.channel || 'other')}</span><span class="badge" style="background:${colorFor(run.status)};color:white;border-color:${colorFor(run.status)};">${esc(run.status || 'ok')}</span></div></div><div class="muted tiny">${esc(run.createdAt || run.finishedAt || run.startedAt || '')}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(run.output?.reply || run.reply || run.summary || run.preview || '')}</div>${run.output?.delivery ? `<div class="muted tiny" style="margin-top:6px;white-space:pre-wrap">Delivery: ${esc(JSON.stringify(run.output.delivery, null, 2))}</div>` : ''}${run.toolCalls?.length ? `<div class="muted tiny" style="margin-top:6px;">Tools: ${esc(run.toolCalls.map((t) => t.tool || t.id || '?').join(', '))}</div>` : ''}</div>`).join('');
}

function renderApprovals(approvals = []) {
  if (!approvals.length) return '<div class="item">Keine offenen oder letzten Approvals.</div>';
  return approvals.map((item) => `<div class="item"><div class="task"><strong>${esc(item.kind || 'approval')}</strong>${item.status === 'pending' ? `<button class="btn secondary" data-approval-approve="${esc(item.id)}">Freigeben</button>` : `<span class="badge">${esc(item.status || 'done')}</span>`}</div><div class="muted tiny">${esc(item.createdAt || '')}${item.approvedAt ? ` • freigegeben ${esc(item.approvedAt)}` : ''}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(item.reason || '')}</div>${item.result ? `<div class="muted tiny" style="margin-top:6px;white-space:pre-wrap">Ergebnis: ${esc(item.result.stdout || item.result.path || item.result.reason || item.result.status || '')}</div>` : ''}<div class="muted tiny" style="margin-top:6px;white-space:pre-wrap">${esc(JSON.stringify(item.payload || {}, null, 2))}</div></div>`).join('');
}

function renderTelegramStatus(status = {}) {
  const tg = status.telegram || {};
  const readiness = tg.testChatId && tg.tokenStored && tg.runtimeReady ? 'bereit' : 'noch nicht komplett';
  return `<div class="item"><div class="task"><strong>Telegram Fokus</strong><span class="badge">${esc(readiness)}</span></div><div class="muted tiny">Bot: ${esc(tg.botName || tg.accountId || '—')} • Test-Chat: ${esc(tg.testChatId || 'fehlt')} • Runtime: ${tg.runtimeReady ? 'ok' : 'fehlt'}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(tg.testChatId ? 'Mit diesem Chat kann der Agent echte Live-Tests senden.' : 'Für echte Telegram-Live-Tests bitte eine Test Chat ID setzen.')}</div></div>`;
}

function renderAudit(audit = []) {
  if (!audit.length) return '<div class="item">Noch kein Audit-Eintrag.</div>';
  return audit.map((item) => `<div class="item"><strong>${esc(item.action || 'action')}</strong><div class="muted tiny">${esc(item.status || 'ok')} • ${esc(item.createdAt || '')}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(JSON.stringify(item.detail || {}, null, 2))}</div></div>`).join('');
}

function renderChannelStatus(status = {}) {
  const tg = status.telegram || {};
  const wa = status.whatsapp || {};
  const oc = status.openclaw || {};
  return `<div class="list">
    <div class="item"><strong>Telegram</strong><div class="muted tiny">enabled: ${tg.enabled ? 'ja' : 'nein'} • token: ${tg.tokenStored ? 'ok' : 'fehlt'} • runtime: ${tg.runtimeReady ? 'ok' : 'fehlt'} • testChat: ${tg.testChatId ? esc(tg.testChatId) : 'fehlt'}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(tg.ready ? `Bereit als ${tg.accountId || tg.botName || 'Telegram-Agent'}.` : (tg.error || 'Noch nicht komplett live.'))}</div></div>
    <div class="item"><strong>WhatsApp</strong><div class="muted tiny">enabled: ${wa.enabled ? 'ja' : 'nein'} • target: ${wa.target ? esc(wa.target) : 'fehlt'} • account: ${wa.accountId ? esc(wa.accountId) : 'fehlt'} • webhook: ${wa.webhookUrl ? 'ok' : 'fehlt'}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(wa.note || '')}</div></div>
    <div class="item"><strong>OpenClaw Runtime</strong><div class="muted tiny">agent: ${esc(oc.agentId || '—')} • exists: ${oc.exists ? 'ja' : 'nein'}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(oc.error || 'Runtime-Bind vorhanden oder bereit für Sync.')}</div></div>
  </div>`;
}

function agentCard(agent) {
  const blueprint = agent.blueprint ? `${agent.blueprint.template || 'saas'} • ${(agent.blueprint.features || []).slice(0,3).join(', ')}` : 'no blueprint';
  const automation = agent.automation?.enabled ? `Telegram: ${agent.automation.telegramBotName || agent.automation.telegramAccountId || 'on'}` : 'Automation off';
  const learning = agent.learningProfile?.enabled ? `Autolearn: ${agent.learningProfile.summary || 'on'}` : 'Autolearn off';
  return `<div class="agent">
    <div class="meta">
      <div>
        <h3>${esc(agent.name)}</h3>
        <div class="muted">${esc(agent.description)}</div>
        <div class="muted" style="margin-top:6px;">${esc(blueprint)} • Wissen ${agent.knowledgeItems?.length || 0} • ${esc(automation)} • ${esc(learning)} • Token ${agent.telegramTokenStored ? 'gespeichert' : 'fehlt'}</div>
      </div>
      <div class="chips">
        <span class="chip">${esc(agent.businessType)}</span>
        <span class="chip">${esc(agent.language)}</span>
        <span class="chip">${esc(agent.status)}</span>
        <span class="chip">${esc(agent.workspaceName)}</span>
      </div>
    </div>
    <div class="actions" style="margin-top:12px;">
      <button class="btn secondary" data-open="${agent.id}">Details</button>
      <a class="btn" href="${agent.publicUrl}" target="_blank" rel="noreferrer">Public Chat</a>
      <a class="btn secondary" href="${agent.hostedUrl || '#'}" target="_blank" rel="noreferrer">Hosted App</a>
    </div>
  </div>`;
}

async function refreshDashboard() {
  const me = await api('/api/me');
  state.me = me.user;
  if (!state.me) {
    setStatus('Single-User-Modus wird vorbereitet…', 'info');
    $('#agentList').innerHTML = '<div class="item">Initialisiere App…</div>';
    renderStats({});
    renderWorkspaces([]);
    return;
  }
  const dash = await api('/api/dashboard');
  const schools = await api('/api/schools');
  const openclawAgents = await api('/api/openclaw/agents').catch(() => ({ agents: [] }));
  state.dashboard = dash;
  state.demoMode = !!(dash.demoMode || me.demoMode || window.__LOCAL_DEMO_API__?.enabled);
  state.schools = schools.schools || [];
  state.openclawAgents = openclawAgents.agents || [];
  state.settings = dash.settings || {};
  state.workspaceId = state.workspaceId || dash.workspaces?.[0]?.id || null;
  localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(dash));
  document.querySelector('[data-tab="auth"]')?.classList.add('hidden');
  $('#logoutBtn')?.classList.add('hidden');
  $('#authTab')?.classList.add('hidden');
  if (state.tab === 'auth') state.tab = 'dashboard';
  setStatus(`Bereit als ${dash.user.name} • ${dash.stats.agents} Agent(en) • Single-User-Modus${state.demoMode ? ' • lokal' : ''}`, 'ok');
  renderStats(dash.stats);
  renderWorkspaces(dash.workspaces || []);
  renderSchools(state.schools);
  renderOpenClawAgents(state.openclawAgents);
  renderSettings(state.settings);
  $('#agentList').innerHTML = dash.agents.length ? dash.agents.map(agentCard).join('') : '<div class="item">Noch keine Agenten. Erstelle den ersten.</div>';
  showTab(state.tab === 'auth' ? 'dashboard' : state.tab);
}

async function openAgent(id) {
  state.runLogFilter = state.runLogFilter || 'all';
  const data = await api(`/api/agents/${id}?runChannel=${encodeURIComponent(state.runLogFilter)}`);
  const adviceData = await api(`/api/agents/${id}/advice`).catch(() => ({ advice: [] }));
  const a = data.agent;
  const tips = adviceData.advice || [];
  const demoMode = !!(a.demoMode || state.demoMode || window.__LOCAL_DEMO_API__?.enabled);
  const channelStatusHtml = renderChannelStatus(data.channelStatus || {});
  const telegramStatusHtml = renderTelegramStatus(data.channelStatus || {});
  const approvalsHtml = renderApprovals(data.approvals || []);
  const auditHtml = renderAudit(data.audit || []);
  const runLogsHtml = renderRunLogs(data.runLogs || []);
  const knowledge = (a.knowledgeItems || []).map((item) => `
    <div class="item">
      <div class="task"><strong>${esc(item.title)}</strong><button class="btn secondary" data-know-del="${esc(item.id)}">Löschen</button></div>
      <div class="muted tiny">${esc(item.source || 'manuell')} • ${esc(item.createdAt || '')}</div>
      <div style="margin-top:8px;white-space:pre-wrap">${esc(item.content)}</div>
    </div>
  `).join('') || '<div class="item">Noch kein Wissen gefüttert.</div>';
  $('#dialogPanel').innerHTML = `
    <h2>${esc(a.name)}</h2>
    <p class="muted">${esc(a.description)}</p>
    <div class="chips" style="margin:10px 0;">
      <span class="chip">${esc(a.businessType)}</span><span class="chip">${esc(a.language)}</span><span class="chip">${esc(a.tone)}</span><span class="chip">${esc(a.personality)}</span>
      <span class="chip">Wissen: ${a.knowledgeItems?.length || 0}</span>
      <span class="chip">Telegram: ${a.automation?.enabled ? 'on' : 'off'}</span>
      <span class="chip">Autolearn: ${a.learningProfile?.enabled ? 'on' : 'off'}</span>
      <span class="chip">Token: ${a.telegramTokenStored ? 'gespeichert' : 'fehlt'}</span>
      <span class="chip">Schools: ${(a.schoolIds || []).length}</span>
      <span class="chip">Agency: ${esc(a.agencyConfig?.mode || 'safe')}</span>
      <span class="chip">Brain: ${a.brainConfig?.enabled ? 'on' : 'off'}</span>
    </div>
    <div class="actions" style="margin:14px 0;">
      <a class="btn" target="_blank" rel="noreferrer" href="${demoHref(a.publicUrl, demoMode)}" ${demoMode ? 'data-demo-disabled="1"' : ''}>Public Chat</a>
      <a class="btn secondary" target="_blank" rel="noreferrer" href="${demoHref(a.hostedUrl, demoMode)}" ${demoMode ? 'data-demo-disabled="1"' : ''}>Hosted App</a>
      <a class="btn secondary" href="${demoMode ? '#' : `/api/agents/${a.id}/export?format=md`}" target="_blank" rel="noreferrer" ${demoMode ? 'data-demo-disabled="1"' : ''}>Export MD</a>
      <button class="btn secondary" data-gen="${a.id}" ${demoDisabledAttr(demoMode)}>Generate Code</button>
      <button class="btn secondary" data-train="${a.id}" ${demoDisabledAttr(demoMode)}>Train</button>
      <button class="btn secondary" data-fine-tune-run="${a.id}" ${demoDisabledAttr(demoMode)}>Fine-Tune Job</button>
      <button class="btn secondary" data-fine-tune-export="${a.id}" ${demoDisabledAttr(demoMode)}>Dataset Export</button>
      <button class="btn secondary" data-provider-upload="${a.id}" ${demoDisabledAttr(demoMode)}>Provider Upload</button>
      <button class="btn secondary" data-provider-sync="${a.id}" ${demoDisabledAttr(demoMode)}>Provider Sync</button>
      <button class="btn secondary" data-hive-run="${a.id}" ${demoDisabledAttr(demoMode)}>Hive Run</button>
      <button class="btn secondary" data-shadow-run="${a.id}" ${demoDisabledAttr(demoMode)}>Shadow Review</button>
      <button class="btn secondary" data-toggle-learn="${a.id}">${a.learningProfile?.enabled ? 'Autolearn aus' : 'Autolearn an'}</button>
      <button class="btn secondary" data-reset-learn="${a.id}">Learn reset</button>
      <button class="btn secondary" data-brain-reflect="${a.id}">Brain Reflect</button>
      <button class="btn secondary" data-avatar-refresh="${a.id}">Avatar Refresh</button>
      <button class="btn secondary" data-install-brain-loop="${a.id}">Brain Loop</button>
      <button class="btn secondary" data-export-learning="${a.id}" ${demoDisabledAttr(demoMode)}>Learn Export</button>
      <button class="btn secondary" data-import-learning="${a.id}" ${demoDisabledAttr(demoMode)}>Learn Import</button>
      <button class="btn secondary" data-save-token="${a.id}" ${demoDisabledAttr(demoMode)}>Telegram Token speichern</button>
      <button class="btn secondary" data-export-openclaw="${a.id}" ${demoDisabledAttr(demoMode)}>OpenClaw Export</button>
      <button class="btn" data-deploy-openclaw="${a.id}" ${demoDisabledAttr(demoMode)}>OpenClaw Deploy</button>
      <button class="btn secondary" data-runtime-sync="${a.id}" ${demoDisabledAttr(demoMode)}>Runtime lesen</button>
      <button class="btn secondary" data-runtime-push="${a.id}" ${demoDisabledAttr(demoMode)}>In Runtime schreiben</button>
      <button class="btn secondary" data-copy="${location.origin + a.publicUrl}" ${demoDisabledAttr(demoMode)}>Copy Link</button>
      <button class="btn secondary" data-copy-hosted="${location.origin + (a.hostedUrl || '')}" ${demoDisabledAttr(demoMode)}>Copy Hosted Link</button>
      <button class="btn secondary" data-key="${a.id}">Regenerate Key</button>
      <button class="btn danger" data-del="${a.id}">Delete</button>
    </div>
    <h3>Rick-C63 Brain & Agency</h3>
    <div class="item" style="margin-bottom:16px;">
      <div class="task"><strong>${esc(a.brainState?.summary || 'Noch keine Reflexion.')}</strong><span class="badge">${esc(a.lifecycleConfig?.stage || 'newborn')}</span></div>
      <div class="muted tiny" style="margin-top:6px;">Mood: ${esc(a.lifecycleConfig?.mood || 'focused')} • Energy: ${esc(String(a.lifecycleConfig?.energy ?? 100))} • Agency: ${esc(a.agencyConfig?.mode || 'safe')}</div>
      ${a.avatarState?.assetUrl ? `<div style="margin-top:12px;"><img src="${esc(a.avatarState.assetUrl)}" alt="avatar" style="width:120px;height:120px;border-radius:18px;border:1px solid rgba(148,163,184,.18)"></div>` : ''}
      <div class="muted tiny" style="margin-top:8px;white-space:pre-wrap">${esc(a.avatarState?.currentPrompt || a.avatarState?.look || 'Noch kein Avatar-State.')}</div>
      <div class="muted tiny" style="margin-top:8px;white-space:pre-wrap">Telegram: ${a.channelConfig?.telegram?.enabled ? 'on' : 'off'} • WhatsApp: ${a.channelConfig?.whatsapp?.enabled ? 'ready' : 'off'}</div>
    </div>
    <div class="split" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start;margin-bottom:16px;">
      <div>
        <h3>Channels & Runtime</h3>
        ${telegramStatusHtml}
        ${channelStatusHtml}
        <form id="channelTestForm" class="form" style="margin-top:12px;">
          <div class="row">
            <div class="field"><label>Kanal-Test</label><select name="channel"><option value="telegram">telegram</option><option value="whatsapp">whatsapp</option></select></div>
            <div class="field"><label>Testnachricht</label><input name="message" placeholder="kurzer Kanal-Test"></div>
          </div>
          <button class="btn secondary" type="submit">Live-Test triggern</button>
        </form>
        <form id="channelConfigForm" class="form" style="margin-top:12px;">
          <div class="field"><label><input type="checkbox" name="telegramEnabled" ${a.channelConfig?.telegram?.enabled ? 'checked' : ''}> Telegram aktiv</label></div>
          <div class="row">
            <div class="field"><label>Telegram Account ID</label><input name="telegramAccountId" value="${esc(a.channelConfig?.telegram?.accountId || a.automation?.telegramAccountId || '')}"></div>
            <div class="field"><label>Telegram Bot Name</label><input name="telegramBotName" value="${esc(a.channelConfig?.telegram?.botName || a.automation?.telegramBotName || '')}"></div>
          </div>
          <div class="field"><label>Telegram Test Chat ID</label><input name="telegramTestChatId" value="${esc(a.channelConfig?.telegram?.testChatId || '')}" placeholder="z.B. 6363215511 oder -100..."></div>
          <div class="field"><label><input type="checkbox" name="whatsappEnabled" ${a.channelConfig?.whatsapp?.enabled ? 'checked' : ''}> WhatsApp aktiv</label></div>
          <div class="row">
            <div class="field"><label>WhatsApp Target</label><input name="whatsappTarget" value="${esc(a.channelConfig?.whatsapp?.target || '')}" placeholder="z.B. +4179..."></div>
            <div class="field"><label>WhatsApp Account ID</label><input name="whatsappAccountId" value="${esc(a.channelConfig?.whatsapp?.accountId || '')}" placeholder="z.B. rick-c63"></div>
          </div>
          <div class="field"><label>WhatsApp Webhook URL</label><input name="whatsappWebhookUrl" value="${esc(a.channelConfig?.whatsapp?.webhookUrl || '')}" placeholder="https://bridge.example/send"></div>
          <button class="btn secondary" type="submit">Channels speichern</button>
        </form>
      </div>
      <div>
        <h3>Agency Control</h3>
        <form id="agencyConfigForm" class="form">
          <div class="row">
            <div class="field"><label>Mode</label><select name="mode"><option value="safe" ${a.agencyConfig?.mode === 'safe' ? 'selected' : ''}>safe</option><option value="builder" ${a.agencyConfig?.mode === 'builder' ? 'selected' : ''}>builder</option><option value="rick_c63" ${a.agencyConfig?.mode === 'rick_c63' ? 'selected' : ''}>rick_c63</option></select></div>
            <div class="field"><label>Max Files / Run</label><input name="maxFilesPerRun" type="number" min="1" max="200" value="${esc(String(a.agencyConfig?.maxFilesPerRun || 20))}"></div>
          </div>
          <div class="field"><label><input type="checkbox" name="canWriteFiles" ${a.agencyConfig?.canWriteFiles ? 'checked' : ''}> Dateien schreiben</label></div>
          <div class="field"><label><input type="checkbox" name="canRunCommands" ${a.agencyConfig?.canRunCommands ? 'checked' : ''}> Commands erlauben</label></div>
          <div class="field"><label>Allowed Paths (eine pro Zeile)</label><textarea name="allowedPaths">${esc(renderListText(a.agencyConfig?.allowedPaths || []))}</textarea></div>
          <button class="btn secondary" type="submit">Agency speichern</button>
        </form>
        <form id="agencyWriteForm" class="form" style="margin-top:12px;">
          <div class="field"><label>Datei schreiben</label><input name="path" placeholder="generated/test.txt"></div>
          <div class="field"><textarea name="content" placeholder="Inhalt für Testdatei"></textarea></div>
          <button class="btn secondary" type="submit">Write Test</button>
        </form>
        <form id="agencyCommandForm" class="form" style="margin-top:12px;">
          <div class="field"><label>Command ausführen</label><input name="command" placeholder="npm test -- --runInBand"></div>
          <div class="field"><label>CWD relativ zu allowedPath</label><input name="cwd" placeholder="."></div>
          <button class="btn secondary" type="submit">Command anfragen</button>
        </form>
      </div>
    </div>
    <div class="split" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start;margin-bottom:16px;">
      <div>
        <h3>Approvals</h3>
        <div class="list">${approvalsHtml}</div>
      </div>
      <div>
        <h3>Audit</h3>
        <div class="list">${auditHtml}</div>
      </div>
    </div>
    <div class="task" style="margin-bottom:8px;"><h3 style="margin:0;">Run Logs</h3><select id="runLogFilter"><option value="all" ${state.runLogFilter === 'all' ? 'selected' : ''}>alle</option><option value="telegram" ${state.runLogFilter === 'telegram' ? 'selected' : ''}>telegram</option><option value="whatsapp" ${state.runLogFilter === 'whatsapp' ? 'selected' : ''}>whatsapp</option><option value="automation" ${state.runLogFilter === 'automation' ? 'selected' : ''}>automation</option><option value="owner" ${state.runLogFilter === 'owner' ? 'selected' : ''}>owner</option><option value="public" ${state.runLogFilter === 'public' ? 'selected' : ''}>public</option><option value="other" ${state.runLogFilter === 'other' ? 'selected' : ''}>other</option></select></div>
    <div class="list" style="margin-bottom:16px;">${runLogsHtml}</div>
    <h3>Rick-Sanchez-Tipps</h3>
    <div class="list" style="margin-bottom:16px;">${tips.length ? tips.map((tip, idx) => `<div class="item"><strong>#${idx + 1} ${esc(tip.title)}</strong><div class="muted tiny" style="margin-top:6px;">${esc(tip.why)}</div><div style="margin-top:8px;white-space:pre-wrap">${esc(tip.suggestion)}</div></div>`).join('') : '<div class="item">Noch keine Tipps.</div>'}</div>
    <div class="split" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
      <div>
        <h3>Bearbeiten</h3>
        <form id="editAgentForm" class="form">
          <div class="row">
            <div class="field"><label>Name</label><input name="name" value="${esc(a.name)}"></div>
            <div class="field"><label>Business Typ</label><input name="businessType" value="${esc(a.businessType)}"></div>
          </div>
          <div class="field"><label>Beschreibung</label><textarea name="description">${esc(a.description)}</textarea></div>
          <div class="row">
            <div class="field"><label>Tonalität</label><input name="tone" value="${esc(a.tone)}"></div>
            <div class="field"><label>Persönlichkeit</label><input name="personality" value="${esc(a.personality)}"></div>
          </div>
          <div class="row">
            <div class="field"><label>Sprache</label><input name="language" value="${esc(a.language)}"></div>
            <div class="field"><label>Services</label><input name="services" value="${esc(a.services || '')}"></div>
          </div>
          <div class="field"><label>Regeln</label><textarea name="rules">${esc(a.rules || '')}</textarea></div>
          <div class="field"><label>Training Notes</label><textarea name="trainingNotes">${esc(a.trainingNotes || '')}</textarea></div>
          <button class="btn" type="submit">Speichern</button>
        </form>
      </div>
      <div>
        <h3>Automation</h3>
        <form id="automationForm" class="form">
          <div class="field"><label><input type="checkbox" name="enabled" ${a.automation?.enabled ? 'checked' : ''}> Aktiv</label></div>
          <div class="field"><label>Telegram Account ID</label><input name="telegramAccountId" value="${esc(a.automation?.telegramAccountId || '')}" placeholder="elij-agent-clone"></div>
          <div class="field"><label>Telegram Bot Name</label><input name="telegramBotName" value="${esc(a.automation?.telegramBotName || '')}" placeholder="RickC-95Pandora∆"></div>
          <div class="field"><label>OpenClaw Agent ID</label><input name="openclawAgentId" value="${esc(a.automation?.openclawAgentId || '')}" placeholder="elij-agent-clone"></div>
          <div class="field"><label>Ready Webhook URL</label><input name="readyWebhookUrl" value="${esc(a.automation?.readyWebhookUrl || '')}" placeholder="https://..."></div>
          <button class="btn secondary" type="submit">Automation speichern</button>
        </form>
        <div style="margin-top:16px;">
          <h3>Learning</h3>
          <div class="list" style="margin-bottom:12px;">
            <div class="item"><strong>Agent</strong><div class="muted tiny">${esc(a.learningProfile?.summary || '—')}</div></div>
            <div class="item"><strong>Workspace</strong><div class="muted tiny">${esc(a.workspaceLearningProfile?.summary || '—')}</div></div>
            <div class="item"><strong>Feedback</strong><div class="muted tiny">+${(a.learningProfile?.feedback || []).filter((x) => x.rating === 'good').length} / -${(a.learningProfile?.feedback || []).filter((x) => x.rating === 'bad').length}</div></div>
          </div>
          <form id="workspaceLearningForm" class="form">
            <div class="field"><label>Workspace Learn Summary</label><textarea name="summary">${esc(a.workspaceLearningProfile?.summary || '')}</textarea></div>
            <div class="field"><label>Workspace Vorlieben (eine pro Zeile)</label><textarea name="preferences">${esc((a.workspaceLearningProfile?.preferences || []).join('\n'))}</textarea></div>
            <button class="btn secondary" type="submit">Workspace Learning speichern</button>
          </form>
        </div>
        <div style="margin-top:16px;">
          <h3>Model Stack</h3>
          <form id="modelStackForm" class="form">
            <div class="field"><label><input type="checkbox" name="routerEnabled" ${a.modelStack?.routerEnabled !== false ? 'checked' : ''}> Router aktiv</label></div>
            <div class="field"><label>Hauptmodell</label><input name="mainModel" value="${esc(a.modelStack?.mainModel || state.settings?.mainModel || 'openai/gpt-4.5')}"></div>
            <div class="field"><label>Coding-Modell</label><input name="codingModel" value="${esc(a.modelStack?.codingModel || state.settings?.codingModel || 'anthropic/claude-sonnet-4')}"></div>
            <div class="field"><label>Fallback-Kette</label><textarea name="fallbackModels">${esc((a.modelStack?.fallbackModels || state.settings?.fallbackModels || []).join(', '))}</textarea></div>
            <button class="btn secondary" type="submit">Model Stack speichern</button>
          </form>
        </div>
        <div style="margin-top:16px;">
          <h3>Fine-Tune</h3>
          <form id="fineTuneForm" class="form">
            <div class="field"><label><input type="checkbox" name="enabled" ${a.fineTuneProfile?.enabled ? 'checked' : ''}> Fine-Tune aktiv</label></div>
            <div class="field"><label>Fachgebiet</label><input name="domain" value="${esc(a.fineTuneProfile?.domain || '')}" placeholder="restaurant, medizin, legal, ecommerce"></div>
            <div class="field"><label>Ziel</label><input name="goal" value="${esc(a.fineTuneProfile?.goal || '')}" placeholder="Was soll der Agent darin exzellent können?"></div>
            <div class="field"><label>Zielmodell</label><input name="targetModel" value="${esc(a.fineTuneProfile?.targetModel || '')}" placeholder="z.B. openai/gpt-4.5"></div>
            <div class="field"><label>Stilregeln (eine pro Zeile)</label><textarea name="styleDirectives">${esc(renderListText(a.fineTuneProfile?.styleDirectives || []))}</textarea></div>
            <div class="field"><label>Datensatz-Hinweise</label><textarea name="datasetNotes">${esc(a.fineTuneProfile?.datasetNotes || '')}</textarea></div>
            <div class="field"><label>Status</label><input name="status" value="${esc(a.fineTuneProfile?.status || 'draft')}" placeholder="draft / queued / trained"></div>
            <div class="field"><label>Letzter Job</label><input value="${esc(a.fineTuneProfile?.lastJobId || '—')}" disabled></div>
            <button class="btn secondary" type="submit">Fine-Tune Profil speichern</button>
          </form>
          <div class="list" style="margin-top:12px;" id="fineTuneJobList">${renderFineTuneJobs(data.fineTuneJobs || a.fineTuneJobs || [])}</div>
        </div>
        <div style="margin-top:16px;">
          <h3>Hive Mind</h3>
          <form id="hiveMindForm" class="form">
            <div class="field"><label><input type="checkbox" name="enabled" ${a.hiveMindConfig?.enabled ? 'checked' : ''}> Hive Mind aktiv</label></div>
            <div class="field"><label>Modus</label><input name="mode" value="${esc(a.hiveMindConfig?.mode || 'solo')}" placeholder="solo / swarm / shadow-board"></div>
            <div class="field"><label>Missionsziel</label><textarea name="objective">${esc(a.hiveMindConfig?.objective || '')}</textarea></div>
            <div class="field"><label>Spezialagenten (comma separated)</label><textarea name="specialistRoles">${esc(renderListText(a.hiveMindConfig?.specialistRoles || [], ', '))}</textarea></div>
            <div class="field"><label>Entscheidungsstil</label><input name="decisionStyle" value="${esc(a.hiveMindConfig?.decisionStyle || 'captain')}" placeholder="captain / vote / critic-gate"></div>
            <div class="field"><label><input type="checkbox" name="autoSpawn" ${a.hiveMindConfig?.autoSpawn !== false ? 'checked' : ''}> Spezialagenten automatisch erzeugen</label></div>
            <div class="field"><label><input type="checkbox" name="criticEnabled" ${a.hiveMindConfig?.criticEnabled !== false ? 'checked' : ''}> Critic-Gate aktiv</label></div>
            <div class="field"><label><input type="checkbox" name="shadowEnabled" ${a.hiveMindConfig?.shadowEnabled ? 'checked' : ''}> Shadow Operator nach Chats</label></div>
            <div class="field"><label>Orchestrationsnotizen</label><textarea name="orchestrationNotes">${esc(a.hiveMindConfig?.orchestrationNotes || '')}</textarea></div>
            <button class="btn secondary" type="submit">Hive Mind speichern</button>
          </form>
          <form id="hiveRunForm" class="form" style="margin-top:12px;">
            <div class="field"><label>Mission für den Hive</label><textarea name="prompt" placeholder="z.B. Baue einen verkaufbaren Restaurant-Agenten mit Telegram-Automation und Human-Eskalation."></textarea></div>
            <button class="btn secondary" type="submit">Hive-Debatte starten</button>
          </form>
          <div class="list" style="margin-top:12px;" id="hiveRunList">${renderHiveRuns(data.hiveRuns || a.hiveRuns || [])}</div>
          <h3 style="margin-top:16px;">Shadow Operator</h3>
          <div class="list" style="margin-top:12px;" id="shadowReviewList">${renderShadowReviews(data.shadowReviews || a.shadowReviews || [])}</div>
        </div>
        <div style="margin-top:16px;">
          <h3>Schulen zuweisen</h3>
          <div class="list">${(state.schools || []).map((s) => `<div class="item"><div class="task"><strong>${esc(s.name)}</strong><button class="btn secondary" data-school-add="${esc(s.id)}">Zuordnen</button></div><div class="muted tiny">${esc(s.focus)}</div></div>`).join('')}</div>
        </div>
        <div style="margin-top:16px;">
          <h3>Futter / Wissen</h3>
          <form id="knowledgeForm" class="form">
            <div class="field"><label>Titel</label><input name="title" placeholder="z.B. Tone of voice"></div>
            <div class="field"><label>Inhalt</label><textarea name="content" placeholder="Regeln, Beispiele, Kontext"></textarea></div>
            <div class="field"><label>Quelle</label><input name="source" placeholder="chat, dokument, url"></div>
            <button class="btn secondary" type="submit">Wissen hinzufügen</button>
          </form>
        </div>
        <div style="margin-top:16px;">
          <h3>Agent direkt nutzen</h3>
          <div class="list" id="ownerChatList">${renderChatMessages(data.conversation?.messages || [])}</div>
          <form id="ownerChatForm" class="form" style="margin-top:12px;">
            <div class="field"><label>Nachricht</label><textarea name="message" placeholder="Teste hier direkt den Agenten..."></textarea></div>
            <button class="btn" type="submit">An Agent senden</button>
          </form>
        </div>
      </div>
    </div>
    <h3>Wissensbank</h3>
    <div class="list" id="knowledgeList">${knowledge}</div>
    <h3>Schulen</h3>
    <div class="list" id="assignedSchools">${(a.schoolIds || []).map((sid) => {
      const s = (state.schools || []).find((x) => x.id === sid);
      return s ? `<div class="item"><div class="task"><strong>${esc(s.name)}</strong><button class="btn secondary" data-school-remove="${esc(s.id)}">Entfernen</button></div><div class="muted tiny">${esc(s.focus)}</div></div>` : '';
    }).join('') || '<div class="item">Keine School zugewiesen.</div>'}</div>
    <h3>Blueprint</h3>
    <pre class="code">${JSON.stringify(a.blueprint || {}, null, 2).replace(/</g, '&lt;')}</pre>
    <h3>System Prompt</h3>
    <pre class="code">${esc(a.systemPrompt)}</pre>
  `;
  $('#dialog').classList.add('open');
}

async function init() {
  $$('.tab').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  $('#refreshBtn').addEventListener('click', refreshDashboard);
  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    state.me = null;
    state.workspaceId = null;
    setStatus(state.demoMode ? 'Lokal ausgeloggt.' : 'Ausgeloggt.', 'ok');
    showTab('auth');
    await refreshDashboard().catch(() => {});
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
      e.target.reset();
      setStatus(state.demoMode ? 'Lokal eingeloggt.' : 'Eingeloggt.', 'ok');
      await refreshDashboard();
    } catch (err) {
      setStatus(translateError(err), 'error');
      showTab('auth');
    }
  });

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password') }) });
      e.target.reset();
      setStatus(state.demoMode ? 'Lokaler Account erstellt.' : 'Account erstellt.', 'ok');
      await refreshDashboard();
    } catch (err) {
      setStatus(translateError(err), 'error');
      showTab('auth');
    }
  });

  $('#workspaceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: fd.get('name') }) });
    e.target.reset();
    await refreshDashboard();
  });

  $('#schoolForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/api/schools', { method: 'POST', body: JSON.stringify({
      name: fd.get('name'),
      focus: fd.get('focus'),
      lessonText: fd.get('lessonText'),
    }) });
    e.target.reset();
    await refreshDashboard();
  });

  $('#importOpenClawForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const out = await api('/api/agents/import-openclaw', { method: 'POST', body: JSON.stringify({
      workspaceId: fd.get('workspaceId'),
      runtimeAgentId: fd.get('runtimeAgentId'),
      telegramAccountId: fd.get('telegramAccountId'),
      telegramBotName: fd.get('telegramBotName'),
    }) });
    e.target.reset();
    await refreshDashboard();
    if (out.agent?.id) await openAgent(out.agent.id);
    setStatus(out.imported === false ? 'Bestehenden Runtime-Agenten verknüpft.' : 'Runtime-Agent importiert.', 'ok');
  });

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({
      routerEnabled: fd.get('routerEnabled') === 'on',
      mainModel: fd.get('mainModel'),
      codingModel: fd.get('codingModel'),
      fallbackModels: String(fd.get('fallbackModels') || '').split(',').map((s) => s.trim()).filter(Boolean),
    }) });
    await refreshDashboard();
    setStatus('Router gespeichert.', 'ok');
  });

  $('#workspaceSelect').addEventListener('change', (e) => {
    state.workspaceId = e.target.value;
    saveAgentDraft($('#agentForm'));
  });

  restoreAgentDraft($('#agentForm'));
  $('#agentForm').addEventListener('input', () => saveAgentDraft($('#agentForm')));
  $('#agentForm').addEventListener('change', () => saveAgentDraft($('#agentForm')));
  bindDraftForm('workspaceForm', 'nemesis-workspace-draft-v1');
  bindDraftForm('schoolForm', 'nemesis-school-draft-v1');
  bindDraftForm('settingsForm', 'nemesis-settings-draft-v1');
  bindDraftForm('importOpenClawForm', 'nemesis-import-draft-v1');
  $('#magicFillBtn')?.addEventListener('click', () => applyMagicFill('default'));
  $('#premiumPresetBtn')?.addEventListener('click', () => applyMagicFill('premium'));
  renderLivePreview();
  $('#agentForm').addEventListener('input', renderLivePreview);
  $('#agentForm').addEventListener('change', renderLivePreview);

  $('#agentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.me) return showTab('auth');
    const fd = new FormData(e.target);
    const integrations = String(fd.get('integrations') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const payload = {
      workspaceId: String(fd.get('workspaceId') || ''),
      name: String(fd.get('name') || '').trim(),
      appIdea: String(fd.get('appIdea') || '').trim(),
      template: String(fd.get('template') || 'ai-tool').trim(),
      businessType: String(fd.get('businessType') || 'Agent').trim(),
      description: String(fd.get('description') || fd.get('appIdea') || '').trim(),
      tone: String(fd.get('tone') || 'premium, klar, hilfreich').trim(),
      personality: String(fd.get('personality') || 'smart, direkt, zuverlässig').trim(),
      language: String(fd.get('language') || 'de').trim(),
      services: String(fd.get('services') || '').trim(),
      rules: String(fd.get('rules') || '').trim(),
      primaryColor: String(fd.get('primaryColor') || '#667eea').trim(),
      secondaryColor: String(fd.get('secondaryColor') || '#764ba2').trim(),
      integrations,
      channelConfig: {
        telegram: { enabled: fd.get('channelTelegram') === 'on' },
        whatsapp: { enabled: fd.get('channelWhatsapp') === 'on' },
      },
      brainConfig: {
        enabled: fd.get('brainEnabled') === 'on',
        ownCharacter: fd.get('brainOwnCharacter') === 'on',
        mutableAppearance: fd.get('brainMutableAppearance') === 'on',
        selfLearning: fd.get('brainEnabled') === 'on',
        avatarMode: String(fd.get('brainAvatarMode') || 'assisted'),
      },
      lifecycleConfig: {
        enabled: fd.get('brainEnabled') === 'on',
      },
      agencyConfig: {
        mode: String(fd.get('agencyMode') || 'safe'),
        canWriteFiles: fd.get('agencyWriteFiles') === 'on',
        canGenerateFiles: fd.get('agencyWriteFiles') === 'on',
        canRunCommands: fd.get('agencyRunCommands') === 'on',
        allowedPaths: ['/root/.openclaw/workspace/projects/agent-generator-v2/generated', '/root/.openclaw/workspace/projects/agent-generator-v2/public'],
      },
      tools: [
        'generate_hosted_app',
        'export_openclaw_bundle',
        fd.get('agencyWriteFiles') === 'on' ? 'workspace_file_write' : '',
        fd.get('agencyRunCommands') === 'on' ? 'workspace_shell' : '',
        fd.get('channelTelegram') === 'on' ? 'telegram_channel' : '',
        fd.get('channelWhatsapp') === 'on' ? 'whatsapp_channel' : '',
      ].filter(Boolean),
    };
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Baue…';
    try {
      const out = await api('/api/agents', { method: 'POST', body: JSON.stringify(payload) });
      clearAgentDraft();
      e.target.reset();
      setStatus(`Agent erstellt: ${out.agent.name}`, 'ok');
      showTab('dashboard');
      await refreshDashboard();
      await openAgent(out.agent.id);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Agent bauen';
    }
  });

  $('#dialog').addEventListener('click', (e) => { if (e.target.id === 'dialog') $('#dialog').classList.remove('open'); });
  $('#dialogPanel').addEventListener('click', async (e) => {
    const copy = e.target?.dataset?.copy;
    const del = e.target?.dataset?.del;
    const key = e.target?.dataset?.key;
    const gen = e.target?.dataset?.gen;
    const train = e.target?.dataset?.train;
    const exportOpenClaw = e.target?.dataset?.exportOpenclaw;
    const deployOpenClaw = e.target?.dataset?.deployOpenclaw;
    const saveToken = e.target?.dataset?.saveToken;
    const schoolAdd = e.target?.dataset?.schoolAdd;
    const schoolRemove = e.target?.dataset?.schoolRemove;
    const knowDel = e.target?.dataset?.knowDel;
    const hosted = e.target?.dataset?.copyHosted;
    const toggleLearn = e.target?.dataset?.toggleLearn;
    const resetLearn = e.target?.dataset?.resetLearn;
    const exportLearning = e.target?.dataset?.exportLearning;
    const importLearning = e.target?.dataset?.importLearning;
    const fineTuneRun = e.target?.dataset?.fineTuneRun;
    const fineTuneExport = e.target?.dataset?.fineTuneExport;
    const providerUpload = e.target?.dataset?.providerUpload;
    const providerSync = e.target?.dataset?.providerSync;
    const hiveRun = e.target?.dataset?.hiveRun;
    const shadowRun = e.target?.dataset?.shadowRun;
    const runtimeSync = e.target?.dataset?.runtimeSync;
    const runtimePush = e.target?.dataset?.runtimePush;
    const brainReflect = e.target?.dataset?.brainReflect;
    const avatarRefresh = e.target?.dataset?.avatarRefresh;
    const installBrainLoop = e.target?.dataset?.installBrainLoop;
    const approvalApprove = e.target?.dataset?.approvalApprove;
    if (e.target?.dataset?.demoDisabled === '1') return;
    if (copy) navigator.clipboard.writeText(copy);
    if (hosted) navigator.clipboard.writeText(hosted);
    if (gen) {
      const out = await api(`/api/agents/${gen}/generate`, { method: 'POST', body: '{}' });
      alert(`Generated: ${out.outputDir}`);
    }
    if (train) {
      await api(`/api/agents/${train}/train`, { method: 'POST', body: '{}' });
      await refreshDashboard();
      await openAgent(train);
    }
    if (fineTuneRun) {
      await api(`/api/agents/${fineTuneRun}/fine-tune-jobs`, { method: 'POST', body: '{}' });
      await refreshDashboard();
      await openAgent(fineTuneRun);
    }
    if (fineTuneExport) {
      const out = await api(`/api/agents/${fineTuneExport}/fine-tune-export`, { method: 'POST', body: '{}' });
      alert(`Dataset Export: ${out.export.outputDir}`);
      await refreshDashboard();
      await openAgent(fineTuneExport);
    }
    if (providerUpload) {
      const out = await api(`/api/agents/${providerUpload}/fine-tune-provider-upload`, { method: 'POST', body: JSON.stringify({ provider: 'openai' }) });
      alert(`Provider Upload: ${out.upload.status}${out.upload.fineTuneJobId ? `\nJob: ${out.upload.fineTuneJobId}` : ''}`);
      await refreshDashboard();
      await openAgent(providerUpload);
    }
    if (providerSync) {
      const out = await api(`/api/agents/${providerSync}/fine-tune-provider-sync`, { method: 'POST', body: '{}' });
      alert(`Provider Sync: ${out.sync.fineTuneStatus || out.sync.status}`);
      await refreshDashboard();
      await openAgent(providerSync);
    }
    if (hiveRun) {
      const prompt = prompt('Hive Mission:', 'Baue den nächsten besten Ausbauschritt für diesen Agenten.');
      if (!prompt) return;
      await api(`/api/agents/${hiveRun}/hive-runs`, { method: 'POST', body: JSON.stringify({ prompt }) });
      await refreshDashboard();
      await openAgent(hiveRun);
    }
    if (shadowRun) {
      await api(`/api/agents/${shadowRun}/shadow-review-run`, { method: 'POST', body: '{}' });
      await refreshDashboard();
      await openAgent(shadowRun);
    }
    if (runtimeSync) {
      const out = await api(`/api/agents/${runtimeSync}/runtime-sync`, { method: 'POST', body: '{}' });
      alert(`Runtime gelesen: ${out.result?.runtime?.id || 'ok'}`);
      await refreshDashboard();
      await openAgent(runtimeSync);
    }
    if (runtimePush) {
      const out = await api(`/api/agents/${runtimePush}/runtime-push`, { method: 'POST', body: '{}' });
      alert(`Runtime geschrieben: ${out.result?.runtime?.id || 'ok'}`);
      await refreshDashboard();
      await openAgent(runtimePush);
    }
    if (brainReflect) {
      await api(`/api/agents/${brainReflect}/brain/reflect`, { method: 'POST', body: JSON.stringify({ note: 'Manuell aus dem Studio angestoßen.' }) });
      await refreshDashboard();
      await openAgent(brainReflect);
    }
    if (avatarRefresh) {
      await api(`/api/agents/${avatarRefresh}/brain/avatar-refresh`, { method: 'POST', body: '{}' });
      await refreshDashboard();
      await openAgent(avatarRefresh);
    }
    if (installBrainLoop) {
      await api(`/api/agents/${installBrainLoop}/brain/install-loop`, { method: 'POST', body: '{}' });
      await refreshDashboard();
      await openAgent(installBrainLoop);
    }
    if (toggleLearn || resetLearn) {
      const agentId = toggleLearn || resetLearn;
      const current = $('#dialogPanel').querySelector('button[data-train]')?.dataset?.train;
      if (current) {
        const a = state.dashboard?.agents?.find((x) => x.id === current) || {};
        const learningProfile = resetLearn ? { enabled: true, summary: '', preferences: [], dos: [], donts: [], topics: [], feedback: [], events: [], turns: 0 } : { ...(a.learningProfile || {}), enabled: !(a.learningProfile?.enabled !== false) };
        await api(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify({ learningProfile }) });
        await refreshDashboard();
        await openAgent(agentId);
      }
    }
    if (exportLearning) {
      const out = await api(`/api/agents/${exportLearning}/autolearn-export`);
      navigator.clipboard.writeText(JSON.stringify(out, null, 2));
      alert('Autolearn Export in Clipboard.');
    }
    if (importLearning) {
      const raw = prompt('Autolearn JSON einfügen:');
      if (!raw) return;
      await api(`/api/agents/${importLearning}/autolearn-import`, { method: 'POST', body: raw });
      await refreshDashboard();
      await openAgent(importLearning);
    }
    if (exportOpenClaw) {
      const out = await api(`/api/agents/${exportOpenClaw}/export-openclaw`, { method: 'POST', body: '{}' });
      alert(`OpenClaw Export: ${out.outputDir}`);
    }
    if (deployOpenClaw) {
      const out = await api(`/api/agents/${deployOpenClaw}/deploy-openclaw`, { method: 'POST', body: JSON.stringify({ apply: true }) });
      alert(`Deploy: ${out.outputDir}\n${out.install?.ok ? 'OK' : 'teilweise / prüfen'}`);
      await refreshDashboard();
      await openAgent(deployOpenClaw);
    }
    if (saveToken) {
      const token = prompt('Telegram Bot Token:', '');
      if (!token) return;
      const out = await api(`/api/agents/${saveToken}/telegram-token`, { method: 'POST', body: JSON.stringify({ telegramToken: token }) });
      alert(`Token gespeichert: ${out.tokenFile}`);
      await refreshDashboard();
      await openAgent(saveToken);
    }
    if (approvalApprove) {
      const agentId = $('#dialogPanel').querySelector('button[data-train]')?.dataset?.train;
      if (!agentId) return;
      const out = await api(`/api/agents/${agentId}/agency/approve/${approvalApprove}`, { method: 'POST', body: '{}' });
      alert(out.result?.stdout || out.result?.path || out.result?.reason || out.result?.status || 'Approval ausgeführt.');
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (schoolAdd) {
      const agentId = $('#dialogPanel').querySelector('button[data-train]')?.dataset?.train;
      if (agentId) {
        await api(`/api/agents/${agentId}/schools/${schoolAdd}`, { method: 'POST', body: '{}' });
        await refreshDashboard();
        await openAgent(agentId);
      }
    }
    if (schoolRemove) {
      const agentId = $('#dialogPanel').querySelector('button[data-train]')?.dataset?.train;
      if (agentId) {
        await api(`/api/agents/${agentId}/schools/${schoolRemove}`, { method: 'DELETE', body: '{}' });
        await refreshDashboard();
        await openAgent(agentId);
      }
    }
    if (knowDel) {
      const agentId = $('#dialogPanel').querySelector('button[data-train]')?.dataset?.train;
      if (agentId) {
        await api(`/api/agents/${agentId}/knowledge/${knowDel}`, { method: 'DELETE' });
        await refreshDashboard();
        await openAgent(agentId);
      }
    }
    if (key) {
      await api(`/api/agents/${key}/regenerate-key`, { method: 'POST', body: '{}' });
      $('#dialog').classList.remove('open');
      await refreshDashboard();
    }
    if (del && confirm('Agent wirklich löschen?')) {
      await api(`/api/agents/${del}`, { method: 'DELETE' });
      $('#dialog').classList.remove('open');
      await refreshDashboard();
    }
  });

  $('#agentList').addEventListener('click', (e) => {
    const id = e.target?.dataset?.open;
    if (id) openAgent(id).catch((err) => setStatus(err.message, 'error'));
  });

  $('#dialogPanel').addEventListener('submit', async (e) => {
    const form = e.target;
    const agentId = $('#dialogPanel').querySelector('button[data-train]')?.dataset?.train;
    if (!agentId) return;
    const currentAgent = state.dashboard?.agents?.find((x) => x.id === agentId) || {};
    if (form.id === 'editAgentForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify({
        name: fd.get('name'),
        description: fd.get('description'),
        businessType: fd.get('businessType'),
        tone: fd.get('tone'),
        personality: fd.get('personality'),
        language: fd.get('language'),
        services: fd.get('services'),
        rules: fd.get('rules'),
        trainingNotes: fd.get('trainingNotes'),
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'automationForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}/automation`, { method: 'PUT', body: JSON.stringify({
        enabled: fd.get('enabled') === 'on',
        telegramAccountId: fd.get('telegramAccountId'),
        telegramBotName: fd.get('telegramBotName'),
        openclawAgentId: fd.get('openclawAgentId'),
        readyWebhookUrl: fd.get('readyWebhookUrl'),
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'channelConfigForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify({
        channelConfig: {
          telegram: {
            enabled: fd.get('telegramEnabled') === 'on',
            accountId: fd.get('telegramAccountId'),
            botName: fd.get('telegramBotName'),
            testChatId: fd.get('telegramTestChatId'),
          },
          whatsapp: {
            enabled: fd.get('whatsappEnabled') === 'on',
            target: fd.get('whatsappTarget'),
            accountId: fd.get('whatsappAccountId'),
            webhookUrl: fd.get('whatsappWebhookUrl'),
          },
        },
        automation: {
          ...(currentAgent.automation || {}),
          telegramAccountId: fd.get('telegramAccountId'),
          telegramBotName: fd.get('telegramBotName'),
        },
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'channelTestForm') {
      e.preventDefault();
      const fd = new FormData(form);
      const out = await api(`/api/agents/${agentId}/channel-test`, { method: 'POST', body: JSON.stringify({ channel: fd.get('channel'), message: fd.get('message') }) });
      alert(out.run?.summary || out.run?.output?.reply || 'Kanal-Test ausgeführt.');
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'agencyConfigForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify({
        agencyConfig: {
          ...(currentAgent.agencyConfig || {}),
          mode: fd.get('mode'),
          maxFilesPerRun: Number(fd.get('maxFilesPerRun') || 20),
          canWriteFiles: fd.get('canWriteFiles') === 'on',
          canGenerateFiles: fd.get('canWriteFiles') === 'on',
          canRunCommands: fd.get('canRunCommands') === 'on',
          allowedPaths: String(fd.get('allowedPaths') || '').split('\n').map((s) => s.trim()).filter(Boolean),
        },
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'agencyWriteForm') {
      e.preventDefault();
      const fd = new FormData(form);
      const out = await api(`/api/agents/${agentId}/agency/act`, { method: 'POST', body: JSON.stringify({ action: 'write_file', payload: { path: fd.get('path'), content: fd.get('content') } }) });
      form.reset();
      alert(out.result?.status === 'approval_required' ? 'Write braucht Approval.' : `Write: ${out.result?.path || out.result?.status}`);
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'agencyCommandForm') {
      e.preventDefault();
      const fd = new FormData(form);
      const out = await api(`/api/agents/${agentId}/agency/act`, { method: 'POST', body: JSON.stringify({ action: 'run_command', payload: { command: fd.get('command'), cwd: fd.get('cwd') } }) });
      form.reset();
      alert(out.result?.status === 'approval_required' ? 'Command wartet auf Approval.' : `Exit: ${out.result?.exitCode ?? out.result?.status}`);
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'modelStackForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify({
        modelStack: {
          routerEnabled: fd.get('routerEnabled') === 'on',
          mainModel: fd.get('mainModel'),
          codingModel: fd.get('codingModel'),
          fallbackModels: String(fd.get('fallbackModels') || '').split(',').map((s) => s.trim()).filter(Boolean),
        },
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'fineTuneForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify({
        fineTuneProfile: {
          enabled: fd.get('enabled') === 'on',
          domain: fd.get('domain'),
          goal: fd.get('goal'),
          targetModel: fd.get('targetModel'),
          styleDirectives: String(fd.get('styleDirectives') || '').split('\n').map((s) => s.trim()).filter(Boolean),
          datasetNotes: fd.get('datasetNotes'),
          status: fd.get('status'),
        },
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'hiveMindForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify({
        hiveMindConfig: {
          enabled: fd.get('enabled') === 'on',
          mode: fd.get('mode'),
          objective: fd.get('objective'),
          specialistRoles: String(fd.get('specialistRoles') || '').split(',').map((s) => s.trim()).filter(Boolean),
          decisionStyle: fd.get('decisionStyle'),
          autoSpawn: fd.get('autoSpawn') === 'on',
          criticEnabled: fd.get('criticEnabled') === 'on',
          shadowEnabled: fd.get('shadowEnabled') === 'on',
          orchestrationNotes: fd.get('orchestrationNotes'),
        },
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'hiveRunForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}/hive-runs`, { method: 'POST', body: JSON.stringify({ prompt: fd.get('prompt') }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'knowledgeForm') {
      e.preventDefault();
      const fd = new FormData(form);
      await api(`/api/agents/${agentId}/knowledge`, { method: 'POST', body: JSON.stringify({
        title: fd.get('title'),
        content: fd.get('content'),
        source: fd.get('source'),
      }) });
      form.reset();
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'ownerChatForm') {
      e.preventDefault();
      const fd = new FormData(form);
      const message = String(fd.get('message') || '').trim();
      if (!message) return;
      await api(`/api/agents/${agentId}/chat`, { method: 'POST', body: JSON.stringify({ message }) });
      form.reset();
      await refreshDashboard();
      await openAgent(agentId);
    }
    if (form.id === 'workspaceLearningForm') {
      e.preventDefault();
      const fd = new FormData(form);
      const agent = state.dashboard?.agents?.find((x) => x.id === agentId);
      if (!agent?.workspaceId) return;
      await api(`/api/workspaces/${agent.workspaceId}/learning-profile`, { method: 'PATCH', body: JSON.stringify({
        summary: fd.get('summary'),
        preferences: String(fd.get('preferences') || '').split('\n').map((s) => s.trim()).filter(Boolean),
      }) });
      await refreshDashboard();
      await openAgent(agentId);
    }
  });

  $('#dialogPanel').addEventListener('change', async (e) => {
    if (e.target?.id === 'runLogFilter') {
      state.runLogFilter = e.target.value || 'all';
      const agentId = $('#dialogPanel').querySelector('button[data-train]')?.dataset?.train;
      if (agentId) await openAgent(agentId);
    }
  });

  try {
    await refreshDashboard();
  } catch (err) {
    try {
      const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || '{}');
      if (cached?.agents || cached?.workspaces) {
        state.dashboard = cached;
        state.me = cached.user || { name: 'Elija' };
        renderStats(cached.stats || {});
        renderWorkspaces(cached.workspaces || []);
        renderSettings(cached.settings || {});
        $('#agentList').innerHTML = (cached.agents || []).length ? cached.agents.map(agentCard).join('') : '<div class="item">Noch keine Agenten.</div>';
        setStatus('Lokaler Cache geladen. App war offline oder das API hat gehakt.', 'ok');
        showTab('dashboard');
        return;
      }
    } catch {}
    setStatus(translateError(err), 'error');
    showTab('dashboard');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

init();
