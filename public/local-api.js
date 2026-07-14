(() => {
  const STORAGE_KEY = 'agent-studio-demo-v2';
  const DEMO_TOKEN_FILE = 'local-demo-token';
  const demoState = (window.__LOCAL_DEMO_API__ = window.__LOCAL_DEMO_API__ || { enabled: false });
  const nativeFetch = window.fetch.bind(window);

  const nowIso = () => new Date().toISOString();
  const uid = (prefix = '') => `${prefix}${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-6)}`;
  const slugify = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'agent';

  const defaultLearningProfile = () => ({
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
  });

  const defaultAutomation = () => ({
    enabled: false,
    telegramAccountId: '',
    telegramBotName: '',
    openclawAgentId: '',
    readyWebhookUrl: '',
  });

  const defaultSchools = () => ([
    { id: 'school_foundation', name: 'Foundation School', focus: 'Rolle, Ton, Verhalten', lessons: ['Rolle schärfen', 'Antwortstil festlegen'] },
    { id: 'school_knowledge', name: 'Knowledge School', focus: 'Wissen und Kontext', lessons: ['Wissen hinzufügen', 'Quellen bündeln'] },
  ]);

  const defaultSettings = () => ({
    appName: 'OpenClaw Agent Studio',
    publicSignup: true,
    routerEnabled: true,
    mainModel: 'openai/gpt-4.5',
    codingModel: 'anthropic/claude-sonnet-4',
    fallbackModels: ['openrouter/auto', 'openrouter/google/gemini-3.1-flash-lite', 'deepseek/deepseek-v4-flash'],
  });

  const defaultState = () => ({
    currentUserId: null,
    users: [],
    workspaces: [],
    agents: [],
    runtimeAgents: defaultRuntimeAgents(),
    settings: defaultSettings(),
    schools: defaultSchools(),
    conversations: [],
  });

  function readState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        ...defaultState(),
        ...raw,
        settings: { ...defaultSettings(), ...(raw.settings || {}) },
        schools: Array.isArray(raw.schools) && raw.schools.length ? raw.schools : defaultSchools(),
        runtimeAgents: Array.isArray(raw.runtimeAgents) && raw.runtimeAgents.length ? raw.runtimeAgents : defaultRuntimeAgents(),
      };
    } catch {
      return defaultState();
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function currentUser(state) {
    return state.users.find((u) => u.id === state.currentUserId) || null;
  }

  function ensureDemoOwner(state) {
    let user = currentUser(state);
    if (user) return user;
    user = state.users[0];
    if (!user) {
      user = {
        id: uid('usr_'),
        name: 'Elija',
        email: 'owner@local.demo',
        password: '',
        plan: 'owner',
        createdAt: nowIso(),
      };
      state.users.unshift(user);
    }
    state.currentUserId = user.id;
    ensureWorkspace(state, user);
    writeState(state);
    return user;
  }

  function sanitizeUser(user) {
    return user ? { id: user.id, name: user.name, email: user.email, plan: user.plan || 'starter' } : null;
  }

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  }

  function parseBody(init) {
    try {
      return init?.body ? JSON.parse(init.body) : {};
    } catch {
      return {};
    }
  }

  function unauthorized() {
    return json({ error: 'unauthorized' }, 401);
  }

  function ensureWorkspace(state, user) {
    let workspace = state.workspaces.find((w) => w.ownerId === user.id);
    if (!workspace) {
      workspace = {
        id: uid('wsp_'),
        ownerId: user.id,
        memberIds: [user.id],
        name: `${user.name} Workspace`,
        isDefault: true,
        learningProfile: defaultLearningProfile(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.workspaces.unshift(workspace);
    }
    return workspace;
  }

  function summarizeAgent(agent) {
    return {
      ...agent,
      automation: { ...defaultAutomation(), ...(agent.automation || {}) },
      learningProfile: { ...defaultLearningProfile(), ...(agent.learningProfile || {}) },
      workspaceLearningProfile: { ...defaultLearningProfile(), ...(agent.workspaceLearningProfile || {}) },
      knowledgeItems: Array.isArray(agent.knowledgeItems) ? agent.knowledgeItems : [],
      schoolIds: Array.isArray(agent.schoolIds) ? agent.schoolIds : [],
      fineTuneJobs: Array.isArray(agent.fineTuneJobs) ? agent.fineTuneJobs : [],
      hiveRuns: Array.isArray(agent.hiveRuns) ? agent.hiveRuns : [],
      shadowReviews: Array.isArray(agent.shadowReviews) ? agent.shadowReviews : [],
      telegramTokenStored: !!agent.telegramTokenStored,
      publicUrl: `/agent/${agent.slug}?key=${encodeURIComponent(agent.publicKey || '')}`,
      hostedUrl: `/generated/${agent.slug}/`,
      demoMode: true,
    };
  }

  function defaultRuntimeAgents() {
    return [
      {
        id: 'demo-sales-agent',
        name: 'Demo Sales Agent',
        runtimeName: 'demo-sales-agent',
        emoji: '🧪',
        model: 'openai/gpt-4.5',
        workspace: '/demo/workspaces/demo-sales-agent',
        agentDir: '/demo/agents/demo-sales-agent',
        bindings: 1,
        isDefault: false,
      },
      {
        id: 'demo-support-agent',
        name: 'Demo Support Agent',
        runtimeName: 'demo-support-agent',
        emoji: '🛠️',
        model: 'anthropic/claude-sonnet-4',
        workspace: '/demo/workspaces/demo-support-agent',
        agentDir: '/demo/agents/demo-support-agent',
        bindings: 2,
        isDefault: false,
      },
    ];
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

  function defaultHiveMindConfig() {
    return {
      enabled: false,
      mode: 'solo',
      objective: '',
      autoSpawn: true,
      specialistRoles: ['research', 'coding', 'critic', 'qa', 'planner'],
      orchestrationNotes: '',
      decisionStyle: 'captain',
      criticEnabled: true,
      shadowEnabled: false,
    };
  }

  function fakeConversation(agent) {
    return {
      id: `demo-conv-${agent.id}`,
      agentId: agent.id,
      messages: Array.isArray(agent.ownerConversation) ? agent.ownerConversation : [],
    };
  }

  function buildFineTuneJob(agent) {
    const profile = { ...defaultFineTuneProfile(), ...(agent.fineTuneProfile || {}) };
    const knowledgeCount = Array.isArray(agent.knowledgeItems) ? agent.knowledgeItems.length : 0;
    const score = [profile.domain, profile.goal, profile.targetModel, profile.styleDirectives?.length, knowledgeCount >= 3].filter(Boolean).length;
    return {
      id: uid('ftjob_'),
      agentId: agent.id,
      status: score >= 5 ? 'ready_for_provider' : 'needs_input',
      providerStatus: 'demo_local_prepared',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      targetModel: profile.targetModel,
      readiness: {
        ready: score >= 5,
        score,
        maxScore: 5,
      },
      warnings: knowledgeCount >= 3 ? [] : ['Mehr Wissen oder Chats sammeln, damit das Fine-Tune nicht dünn wird.'],
      nextActions: score >= 5 ? ['Provider-Upload testen', 'Validierungsdaten prüfen'] : ['Profil vervollständigen', 'Mehr Wissen sammeln'],
      export: {
        outputDir: `/demo/fine-tune/${agent.slug}`,
        counts: {
          train: Math.max(knowledgeCount, 1),
          eval: knowledgeCount >= 5 ? 1 : 0,
        },
      },
    };
  }

  function buildHiveRun(agent, prompt) {
    const config = { ...defaultHiveMindConfig(), ...(agent.hiveMindConfig || {}) };
    const roles = Array.isArray(config.specialistRoles) && config.specialistRoles.length ? config.specialistRoles : defaultHiveMindConfig().specialistRoles;
    return {
      id: uid('hive_'),
      agentId: agent.id,
      prompt,
      objective: String(prompt || config.objective || 'Agent verbessern').trim(),
      mode: config.mode,
      decisionStyle: config.decisionStyle,
      status: 'completed',
      executionMode: 'demo-parallel',
      createdAt: nowIso(),
      specialists: roles.slice(0, 5).map((role) => ({ role })),
      verdict: {
        nextSteps: [
          'Schärfe das Angebot auf eine Zielgruppe.',
          'Füttere 3 echte Support- oder Sales-Beispiele.',
          'Aktiviere danach Automation und teste den Kanal.',
        ],
      },
      captainResponse: `Entscheidung: ${agent.name} zuerst enger positionieren. Risiken: zu generisch, zu wenig echte Beispiele. Nächste Schritte: ICP schärfen, Wissen füttern, dann Kanal testen.`,
    };
  }

  function buildShadowReview(agent) {
    return {
      id: uid('shadow_'),
      agentId: agent.id,
      rating: 'ok',
      source: 'demo-chat',
      createdAt: nowIso(),
      review: `${agent.name} klingt brauchbar, aber noch zu generisch. Größtes Risiko: hübsche Hülle ohne genug echtes Kundenwissen.`,
    };
  }

  function dashboardPayload(state, user) {
    const workspaces = state.workspaces.filter((w) => w.ownerId === user.id || (w.memberIds || []).includes(user.id));
    const agents = state.agents
      .filter((a) => a.userId === user.id || workspaces.some((w) => w.id === a.workspaceId))
      .map(summarizeAgent);
    return {
      ok: true,
      demoMode: true,
      user: sanitizeUser(user),
      stats: {
        agents: agents.length,
        conversations: 0,
        messages: 0,
      },
      workspaces,
      agents,
      settings: state.settings,
    };
  }

  function markDemoUi() {
    if (!demoState.enabled) return;
    const reason = 'Im APK-Demo-Modus ohne Backend deaktiviert.';
    const selectors = [
      '[data-gen]',
      '[data-train]',
      '[data-export-learning]',
      '[data-import-learning]',
      '[data-save-token]',
      '[data-export-openclaw]',
      '[data-deploy-openclaw]',
      '[data-copy-hosted]',
      'a[data-demo-disabled="1"]',
    ];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.dataset.demoDisabled = '1';
        el.title = reason;
        el.style.opacity = '0.55';
        if ('disabled' in el) el.disabled = true;
      });
    });
    const status = document.querySelector('#status');
    if (status && /eingeloggt/i.test(status.textContent || '')) {
      status.textContent += ' • Demo-Modus ohne Backend';
    }
  }

  async function handleLocalApi(input, init) {
    demoState.enabled = true;
    queueMicrotask(markDemoUi);

    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    const path = url.pathname;
    const method = (init?.method || 'GET').toUpperCase();
    const body = parseBody(init);
    const state = readState();
    const user = currentUser(state) || ensureDemoOwner(state);

    if (path === '/api/me' && method === 'GET') return json({ user: sanitizeUser(user), demoMode: true });

    if (path === '/api/auth/register' && method === 'POST') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!name || !email || password.length < 8) return json({ error: 'invalid_input' }, 400);
      if (state.users.some((u) => u.email === email)) return json({ error: 'email_exists' }, 409);
      const newUser = { id: uid('usr_'), name, email, password, plan: 'starter', createdAt: nowIso() };
      state.users.unshift(newUser);
      state.currentUserId = newUser.id;
      const workspace = ensureWorkspace(state, newUser);
      writeState(state);
      return json({ ok: true, demoMode: true, user: sanitizeUser(newUser), workspace });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const found = state.users.find((u) => u.email === email && u.password === password);
      if (!found) return json({ error: 'invalid_credentials' }, 401);
      state.currentUserId = found.id;
      ensureWorkspace(state, found);
      writeState(state);
      return json({ ok: true, demoMode: true, user: sanitizeUser(found) });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      state.currentUserId = null;
      writeState(state);
      return json({ ok: true, demoMode: true });
    }

    if (!user) return unauthorized();

    if (path === '/api/dashboard' && method === 'GET') return json(dashboardPayload(state, user));
    if (path === '/api/openclaw/agents' && method === 'GET') return json({ ok: true, demoMode: true, agents: state.runtimeAgents || defaultRuntimeAgents() });
    if (path === '/api/workspaces' && method === 'GET') return json({ ok: true, demoMode: true, workspaces: state.workspaces.filter((w) => w.ownerId === user.id || (w.memberIds || []).includes(user.id)) });

    if (path === '/api/workspaces' && method === 'POST') {
      const workspace = {
        id: uid('wsp_'),
        ownerId: user.id,
        memberIds: [user.id],
        name: String(body.name || '').trim() || 'New Workspace',
        isDefault: false,
        learningProfile: defaultLearningProfile(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.workspaces.unshift(workspace);
      writeState(state);
      return json({ ok: true, demoMode: true, workspace });
    }

    const workspaceLearningMatch = path.match(/^\/api\/workspaces\/([^/]+)\/learning-profile$/);
    if (workspaceLearningMatch && method === 'PATCH') {
      const workspace = state.workspaces.find((w) => w.id === workspaceLearningMatch[1] && (w.ownerId === user.id || (w.memberIds || []).includes(user.id)));
      if (!workspace) return json({ error: 'not_found' }, 404);
      workspace.learningProfile = {
        ...defaultLearningProfile(),
        ...(workspace.learningProfile || {}),
        summary: String(body.summary || '').trim(),
        preferences: Array.isArray(body.preferences) ? body.preferences : [],
        updatedAt: nowIso(),
      };
      workspace.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, workspace });
    }

    if (path === '/api/settings' && method === 'PUT') {
      state.settings = { ...state.settings, ...body };
      writeState(state);
      return json({ ok: true, demoMode: true, settings: state.settings });
    }
    if (path === '/api/settings' && method === 'GET') return json({ ok: true, demoMode: true, settings: state.settings });
    if (path === '/api/schools' && method === 'GET') return json({ ok: true, demoMode: true, schools: state.schools });

    if (path === '/api/schools' && method === 'POST') {
      const school = {
        id: uid('school_'),
        name: String(body.name || '').trim() || 'School',
        focus: String(body.focus || '').trim(),
        lessons: String(body.lessonText || '').split('\n').map((s) => s.trim()).filter(Boolean),
        createdAt: nowIso(),
      };
      state.schools.unshift(school);
      writeState(state);
      return json({ ok: true, demoMode: true, school });
    }

    if (path === '/api/admin/summary' && method === 'GET') {
      const mine = state.agents.filter((a) => a.userId === user.id);
      return json({ ok: true, demoMode: true, summary: { agents: mine.length, publicAgents: 0, conversations: 0, totalUsers: state.users.length } });
    }

    if (path === '/api/agents/import-openclaw' && method === 'POST') {
      const runtimeAgentId = String(body.runtimeAgentId || '').trim();
      const runtime = (state.runtimeAgents || []).find((item) => item.id === runtimeAgentId);
      if (!runtime) return json({ error: 'not_found' }, 404);
      const workspace = state.workspaces.find((w) => w.id === body.workspaceId) || ensureWorkspace(state, user);
      const existing = state.agents.find((a) => a.runtimeAgentId === runtime.id && a.userId === user.id);
      if (existing) {
        existing.workspaceId = workspace.id;
        existing.workspaceName = workspace.name;
        existing.automation = {
          ...defaultAutomation(),
          ...(existing.automation || {}),
          enabled: true,
          telegramAccountId: String(body.telegramAccountId || existing.automation?.telegramAccountId || existing.slug).trim(),
          telegramBotName: String(body.telegramBotName || existing.automation?.telegramBotName || runtime.name).trim(),
          openclawAgentId: runtime.id,
        };
        existing.updatedAt = nowIso();
        writeState(state);
        return json({ ok: true, demoMode: true, imported: false, agent: summarizeAgent(existing) });
      }
      const agent = {
        id: uid('agt_'),
        userId: user.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        runtimeAgentId: runtime.id,
        name: runtime.name,
        slug: slugify(runtime.name),
        appIdea: `${runtime.name} aus OpenClaw Runtime importiert`,
        template: 'saas',
        businessType: 'Imported Runtime Agent',
        description: `Import von ${runtime.id}`,
        tone: 'direkt',
        personality: 'kompetent',
        language: 'Deutsch',
        services: '',
        rules: '',
        trainingNotes: '',
        status: 'imported-demo',
        publicKey: uid('pub_'),
        knowledgeItems: [],
        automation: {
          ...defaultAutomation(),
          enabled: true,
          telegramAccountId: String(body.telegramAccountId || slugify(runtime.id)).trim(),
          telegramBotName: String(body.telegramBotName || runtime.name).trim(),
          openclawAgentId: runtime.id,
        },
        learningProfile: defaultLearningProfile(),
        fineTuneProfile: defaultFineTuneProfile(),
        hiveMindConfig: defaultHiveMindConfig(),
        fineTuneJobs: [],
        hiveRuns: [],
        shadowReviews: [],
        ownerConversation: [],
        workspaceLearningProfile: workspace.learningProfile || defaultLearningProfile(),
        telegramTokenStored: false,
        schoolIds: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.agents.unshift(agent);
      writeState(state);
      return json({ ok: true, demoMode: true, imported: true, agent: summarizeAgent(agent) });
    }

    if (path === '/api/agents' && method === 'POST') {
      const workspace = state.workspaces.find((w) => w.id === body.workspaceId) || ensureWorkspace(state, user);
      const name = String(body.name || '').trim() || 'New Agent';
      const agent = {
        id: uid('agt_'),
        userId: user.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        name,
        slug: slugify(body.slug || name),
        appIdea: String(body.appIdea || '').trim(),
        template: String(body.template || 'saas').trim(),
        businessType: String(body.businessType || '').trim(),
        description: String(body.description || '').trim(),
        tone: String(body.tone || '').trim(),
        personality: String(body.personality || '').trim(),
        language: String(body.language || 'Deutsch').trim(),
        services: String(body.services || '').trim(),
        rules: String(body.rules || '').trim(),
        trainingNotes: '',
        status: 'demo-ready',
        publicKey: uid('pub_'),
        knowledgeItems: [],
        automation: defaultAutomation(),
        learningProfile: defaultLearningProfile(),
        fineTuneProfile: defaultFineTuneProfile(),
        hiveMindConfig: defaultHiveMindConfig(),
        fineTuneJobs: [],
        hiveRuns: [],
        shadowReviews: [],
        ownerConversation: [],
        workspaceLearningProfile: workspace.learningProfile || defaultLearningProfile(),
        telegramTokenStored: false,
        schoolIds: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.agents.unshift(agent);
      writeState(state);
      return json({ ok: true, demoMode: true, agent: summarizeAgent(agent) });
    }

    const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/);
    if (agentMatch) {
      const agent = state.agents.find((a) => a.id === agentMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      if (method === 'GET') {
        const workspace = state.workspaces.find((w) => w.id === agent.workspaceId);
        agent.workspaceLearningProfile = workspace?.learningProfile || defaultLearningProfile();
        agent.workspaceName = workspace?.name || agent.workspaceName || 'Workspace';
        return json({
          ok: true,
          demoMode: true,
          agent: summarizeAgent(agent),
          conversation: fakeConversation(agent),
          fineTuneJobs: Array.isArray(agent.fineTuneJobs) ? agent.fineTuneJobs : [],
          hiveRuns: Array.isArray(agent.hiveRuns) ? agent.hiveRuns : [],
          shadowReviews: Array.isArray(agent.shadowReviews) ? agent.shadowReviews : [],
        });
      }
      if (method === 'PATCH') {
        Object.assign(agent, body, {
          learningProfile: { ...defaultLearningProfile(), ...(agent.learningProfile || {}), ...(body.learningProfile || {}) },
          fineTuneProfile: { ...defaultFineTuneProfile(), ...(agent.fineTuneProfile || {}), ...(body.fineTuneProfile || {}) },
          hiveMindConfig: { ...defaultHiveMindConfig(), ...(agent.hiveMindConfig || {}), ...(body.hiveMindConfig || {}) },
          updatedAt: nowIso(),
        });
        writeState(state);
        return json({ ok: true, demoMode: true, agent: summarizeAgent(agent) });
      }
      if (method === 'DELETE') {
        state.agents = state.agents.filter((a) => a.id !== agent.id);
        writeState(state);
        return json({ ok: true, demoMode: true });
      }
    }

    const knowledgeListMatch = path.match(/^\/api\/agents\/([^/]+)\/knowledge$/);
    if (knowledgeListMatch) {
      const agent = state.agents.find((a) => a.id === knowledgeListMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      if (method === 'POST') {
        const item = { id: uid('know_'), title: String(body.title || 'Notiz').trim(), content: String(body.content || '').trim(), source: String(body.source || '').trim(), createdAt: nowIso() };
        agent.knowledgeItems.unshift(item);
        agent.updatedAt = nowIso();
        writeState(state);
        return json({ ok: true, demoMode: true, item, items: agent.knowledgeItems });
      }
      return json({ ok: true, demoMode: true, items: agent.knowledgeItems || [] });
    }

    const knowledgeItemMatch = path.match(/^\/api\/agents\/([^/]+)\/knowledge\/([^/]+)$/);
    if (knowledgeItemMatch && method === 'DELETE') {
      const agent = state.agents.find((a) => a.id === knowledgeItemMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.knowledgeItems = (agent.knowledgeItems || []).filter((k) => k.id !== knowledgeItemMatch[2]);
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true });
    }

    const automationMatch = path.match(/^\/api\/agents\/([^/]+)\/automation$/);
    if (automationMatch && method === 'PUT') {
      const agent = state.agents.find((a) => a.id === automationMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.automation = { ...defaultAutomation(), ...(agent.automation || {}), ...body };
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, automation: agent.automation });
    }

    const schoolMatch = path.match(/^\/api\/agents\/([^/]+)\/schools\/([^/]+)$/);
    if (schoolMatch) {
      const agent = state.agents.find((a) => a.id === schoolMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.schoolIds ||= [];
      if (method === 'POST' && !agent.schoolIds.includes(schoolMatch[2])) agent.schoolIds.push(schoolMatch[2]);
      if (method === 'DELETE') agent.schoolIds = agent.schoolIds.filter((id) => id !== schoolMatch[2]);
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, schoolIds: agent.schoolIds });
    }

    const exportLearningMatch = path.match(/^\/api\/agents\/([^/]+)\/autolearn-export$/);
    if (exportLearningMatch && method === 'GET') {
      const agent = state.agents.find((a) => a.id === exportLearningMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      return json({ ok: true, demoMode: true, learningProfile: agent.learningProfile || defaultLearningProfile() });
    }

    const importLearningMatch = path.match(/^\/api\/agents\/([^/]+)\/autolearn-import$/);
    if (importLearningMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === importLearningMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.learningProfile = { ...defaultLearningProfile(), ...(body.learningProfile || body) };
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, agent: summarizeAgent(agent) });
    }

    const keyMatch = path.match(/^\/api\/agents\/([^/]+)\/regenerate-key$/);
    if (keyMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === keyMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.publicKey = uid('pub_');
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, publicKey: agent.publicKey });
    }

    const conversationMatch = path.match(/^\/api\/agents\/([^/]+)\/chat$/);
    if (conversationMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === conversationMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.ownerConversation ||= [];
      const message = String(body.message || '').trim();
      if (!message) return json({ error: 'invalid_input' }, 400);
      const reply = `${agent.name}: Demo-Antwort auf „${message.slice(0, 120)}“. Nächster sinnvoller Schritt: mehr echtes Wissen füttern und dann den Kanal testen.`;
      agent.ownerConversation.push({ role: 'user', content: message, createdAt: nowIso() });
      agent.ownerConversation.push({ role: 'assistant', content: reply, createdAt: nowIso() });
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, response: reply, conversation: fakeConversation(agent) });
    }

    const fineTuneJobsMatch = path.match(/^\/api\/agents\/([^/]+)\/fine-tune-jobs$/);
    if (fineTuneJobsMatch) {
      const agent = state.agents.find((a) => a.id === fineTuneJobsMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.fineTuneJobs ||= [];
      if (method === 'GET') return json({ ok: true, demoMode: true, jobs: agent.fineTuneJobs });
      if (method === 'POST') {
        const job = buildFineTuneJob(agent);
        agent.fineTuneJobs.unshift(job);
        agent.fineTuneProfile = { ...defaultFineTuneProfile(), ...(agent.fineTuneProfile || {}), lastJobId: job.id, lastRunAt: nowIso(), status: job.status };
        agent.updatedAt = nowIso();
        writeState(state);
        return json({ ok: true, demoMode: true, job });
      }
    }

    const fineTuneExportMatch = path.match(/^\/api\/agents\/([^/]+)\/fine-tune-export$/);
    if (fineTuneExportMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === fineTuneExportMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      const exportInfo = { outputDir: `/demo/fine-tune/${agent.slug}`, counts: { train: Math.max(agent.knowledgeItems?.length || 0, 1), eval: (agent.knowledgeItems?.length || 0) >= 5 ? 1 : 0 } };
      const target = agent.fineTuneJobs?.[0];
      if (target) target.export = exportInfo;
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, export: exportInfo });
    }

    const providerUploadMatch = path.match(/^\/api\/agents\/([^/]+)\/fine-tune-provider-upload$/);
    if (providerUploadMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === providerUploadMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      const target = agent.fineTuneJobs?.[0] || buildFineTuneJob(agent);
      if (!agent.fineTuneJobs?.length) agent.fineTuneJobs = [target];
      target.providerUpload = {
        provider: String(body.provider || 'openai'),
        status: 'submitted_demo',
        submittedAt: nowIso(),
        fineTuneJobId: uid('openai_ft_'),
        fineTuneStatus: 'queued',
      };
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, upload: target.providerUpload });
    }

    const providerSyncMatch = path.match(/^\/api\/agents\/([^/]+)\/fine-tune-provider-sync$/);
    if (providerSyncMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === providerSyncMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      const target = agent.fineTuneJobs?.[0];
      if (!target) return json({ error: 'not_found' }, 404);
      target.providerSync = {
        provider: 'openai',
        status: 'synced_demo',
        syncedAt: nowIso(),
        fineTuneJobId: target.providerUpload?.fineTuneJobId || uid('openai_ft_'),
        fineTuneStatus: 'succeeded',
        fineTunedModel: `${agent.fineTuneProfile?.targetModel || 'openai/gpt-4.5'}:demo`,
      };
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, sync: target.providerSync });
    }

    const hiveRunsMatch = path.match(/^\/api\/agents\/([^/]+)\/hive-runs$/);
    if (hiveRunsMatch) {
      const agent = state.agents.find((a) => a.id === hiveRunsMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.hiveRuns ||= [];
      if (method === 'GET') return json({ ok: true, demoMode: true, runs: agent.hiveRuns });
      if (method === 'POST') {
        const run = buildHiveRun(agent, String(body.prompt || '').trim());
        agent.hiveRuns.unshift(run);
        agent.updatedAt = nowIso();
        writeState(state);
        return json({ ok: true, demoMode: true, run });
      }
    }

    const shadowRunMatch = path.match(/^\/api\/agents\/([^/]+)\/shadow-review-run$/);
    if (shadowRunMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === shadowRunMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      agent.shadowReviews ||= [];
      const review = buildShadowReview(agent);
      agent.shadowReviews.unshift(review);
      agent.updatedAt = nowIso();
      writeState(state);
      return json({ ok: true, demoMode: true, review });
    }

    const runtimeSyncMatch = path.match(/^\/api\/agents\/([^/]+)\/(runtime-sync|runtime-push)$/);
    if (runtimeSyncMatch && method === 'POST') {
      const agent = state.agents.find((a) => a.id === runtimeSyncMatch[1] && a.userId === user.id);
      if (!agent) return json({ error: 'not_found' }, 404);
      const mode = runtimeSyncMatch[2];
      const runtime = (state.runtimeAgents || []).find((item) => item.id === agent.automation?.openclawAgentId) || null;
      const payload = { ok: true, demoMode: true, mode, runtime, syncedAt: nowIso() };
      if (mode === 'runtime-sync' && runtime) {
        agent.importedFromRuntime = { id: runtime.id, name: runtime.name, model: runtime.model, emoji: runtime.emoji };
      }
      agent.updatedAt = nowIso();
      writeState(state);
      return json(payload);
    }

    const disabledMatch = path.match(/^\/api\/agents\/([^/]+)\/(generate|train|telegram-token|export-openclaw|deploy-openclaw|conversations)$/);
    if (disabledMatch) {
      return json({ error: 'demo_mode_disabled', message: 'Diese Funktion braucht das echte Backend und ist in der Test-APK deaktiviert.', demoMode: true }, 501);
    }

    if (path.startsWith('/api/agents/') && path.includes('/export')) {
      return json({ error: 'demo_mode_disabled', message: 'Export braucht das echte Backend und ist in der Test-APK deaktiviert.', demoMode: true }, 501);
    }

    return json({ error: 'not_found', demoMode: true, path, method }, 404);
  }

  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    try {
      const response = await nativeFetch(input, init);
      if (![404, 405, 501].includes(response.status)) return response;
    } catch {}
    return handleLocalApi(input, init);
  };
})();
