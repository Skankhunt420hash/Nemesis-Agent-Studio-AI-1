function defaultMemoryConfig() {
  return {
    historyLimit: 20,
    longTermEnabled: true,
    retrievalEnabled: false,
  };
}

function normalizeMemoryConfig(config) {
  const base = defaultMemoryConfig();
  if (!config || typeof config !== 'object') return base;
  return {
    ...base,
    ...config,
    historyLimit: Math.max(1, Math.min(100, Number(config.historyLimit || base.historyLimit) || base.historyLimit)),
    longTermEnabled: config.longTermEnabled !== false,
    retrievalEnabled: config.retrievalEnabled === true,
  };
}

function defaultDeployConfig() {
  return {
    app: true,
    web: false,
    telegram: false,
    openclaw: false,
  };
}

function normalizeDeployConfig(config) {
  const base = defaultDeployConfig();
  if (!config || typeof config !== 'object') return base;
  return {
    ...base,
    ...config,
    app: config.app !== false,
    web: config.web === true,
    telegram: config.telegram === true,
    openclaw: config.openclaw === true,
  };
}

function normalizeToolList(tools) {
  const list = Array.isArray(tools)
    ? tools
    : String(tools || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))].slice(0, 32);
}

function defaultChannelConfig() {
  return {
    app: true,
    publicWeb: true,
    telegram: { enabled: false, accountId: '', botName: '', testChatId: '' },
    whatsapp: { enabled: false, target: '', accountId: '', webhookUrl: '' },
  };
}

function normalizeChannelConfig(config) {
  const base = defaultChannelConfig();
  if (!config || typeof config !== 'object') return base;
  return {
    app: config.app !== false,
    publicWeb: config.publicWeb !== false,
    telegram: {
      enabled: config.telegram?.enabled === true,
      accountId: String(config.telegram?.accountId || '').trim(),
      botName: String(config.telegram?.botName || '').trim(),
      testChatId: String(config.telegram?.testChatId || '').trim(),
    },
    whatsapp: {
      enabled: config.whatsapp?.enabled === true,
      target: String(config.whatsapp?.target || '').trim(),
      accountId: String(config.whatsapp?.accountId || '').trim(),
      webhookUrl: String(config.whatsapp?.webhookUrl || '').trim(),
    },
  };
}

function defaultBrainConfig() {
  return {
    enabled: false,
    autonomyLevel: 'guided',
    ownCharacter: false,
    selfLearning: true,
    selfEvolution: false,
    avatarMode: 'manual',
    mutableAppearance: false,
    memoryDrive: 'steady',
  };
}

function normalizeBrainConfig(config) {
  const base = defaultBrainConfig();
  if (!config || typeof config !== 'object') return base;
  return {
    ...base,
    ...config,
    enabled: config.enabled === true,
    autonomyLevel: ['guided', 'semi_auto', 'autonomous'].includes(String(config.autonomyLevel || '')) ? String(config.autonomyLevel) : base.autonomyLevel,
    ownCharacter: config.ownCharacter === true,
    selfLearning: config.selfLearning !== false,
    selfEvolution: config.selfEvolution === true,
    avatarMode: ['manual', 'assisted', 'self_generated'].includes(String(config.avatarMode || '')) ? String(config.avatarMode) : base.avatarMode,
    mutableAppearance: config.mutableAppearance === true,
    memoryDrive: ['low', 'steady', 'high'].includes(String(config.memoryDrive || '')) ? String(config.memoryDrive) : base.memoryDrive,
  };
}

function defaultLifecycleConfig() {
  return {
    enabled: false,
    stage: 'newborn',
    mood: 'focused',
    energy: 100,
    arc: 'stable',
    lastReflectionAt: '',
    birthAt: '',
  };
}

function normalizeLifecycleConfig(config) {
  const base = defaultLifecycleConfig();
  if (!config || typeof config !== 'object') return base;
  return {
    ...base,
    ...config,
    enabled: config.enabled === true,
    stage: String(config.stage || base.stage).trim() || base.stage,
    mood: String(config.mood || base.mood).trim() || base.mood,
    energy: Math.max(0, Math.min(100, Number(config.energy ?? base.energy))),
    arc: String(config.arc || base.arc).trim() || base.arc,
    lastReflectionAt: String(config.lastReflectionAt || '').trim(),
    birthAt: String(config.birthAt || '').trim(),
  };
}

function defaultAgencyConfig() {
  return {
    mode: 'safe',
    filesystemScope: 'workspace_only',
    allowedPaths: ['/root/.openclaw/workspace/projects/agent-generator-v2/generated'],
    canReadFiles: true,
    canWriteFiles: false,
    canGenerateFiles: false,
    canRunCommands: false,
    canInstallDependencies: false,
    canDeploy: false,
    systemAccess: false,
    maxFilesPerRun: 20,
    requireApprovalFor: ['run_commands', 'install_deps', 'deploy', 'outside_workspace'],
  };
}

function normalizeAgencyConfig(config) {
  const base = defaultAgencyConfig();
  if (!config || typeof config !== 'object') return base;
  const mode = ['safe', 'builder', 'rick_c63'].includes(String(config.mode || '')) ? String(config.mode) : base.mode;
  const allowedPaths = Array.isArray(config.allowedPaths)
    ? config.allowedPaths.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20)
    : base.allowedPaths;
  const requireApprovalFor = Array.isArray(config.requireApprovalFor)
    ? config.requireApprovalFor.map((v) => String(v || '').trim()).filter(Boolean)
    : base.requireApprovalFor;
  return {
    ...base,
    ...config,
    mode,
    filesystemScope: ['workspace_only', 'project_only', 'custom'].includes(String(config.filesystemScope || '')) ? String(config.filesystemScope) : base.filesystemScope,
    allowedPaths,
    canReadFiles: config.canReadFiles !== false,
    canWriteFiles: mode !== 'safe' ? config.canWriteFiles !== false : false,
    canGenerateFiles: mode !== 'safe' ? config.canGenerateFiles !== false : false,
    canRunCommands: mode === 'rick_c63' ? config.canRunCommands === true : false,
    canInstallDependencies: mode === 'rick_c63' ? config.canInstallDependencies === true : false,
    canDeploy: mode === 'rick_c63' ? config.canDeploy === true : false,
    systemAccess: false,
    maxFilesPerRun: Math.max(1, Math.min(200, Number(config.maxFilesPerRun || base.maxFilesPerRun) || base.maxFilesPerRun)),
    requireApprovalFor,
  };
}

function buildGoal(body = {}) {
  return String(body.goal || body.description || '').trim();
}

function buildPersona(body = {}) {
  if (body.persona !== undefined) return String(body.persona || '').trim();
  return [body.tone, body.personality].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
}

module.exports = {
  defaultMemoryConfig,
  normalizeMemoryConfig,
  defaultDeployConfig,
  normalizeDeployConfig,
  normalizeToolList,
  defaultChannelConfig,
  normalizeChannelConfig,
  defaultBrainConfig,
  normalizeBrainConfig,
  defaultLifecycleConfig,
  normalizeLifecycleConfig,
  defaultAgencyConfig,
  normalizeAgencyConfig,
  buildGoal,
  buildPersona,
};
