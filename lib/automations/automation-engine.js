const { executeAgentTools } = require('../runtime/tool-runner');

function defaultAutomationRecord() {
  return {
    name: 'Automation',
    enabled: true,
    trigger: { type: 'manual' },
    steps: [],
    lastRunAt: '',
    createdAt: '',
    updatedAt: '',
  };
}

function normalizeAutomationRecord(input = {}, { uid, nowIso, agentId } = {}) {
  const base = defaultAutomationRecord();
  const trigger = input.trigger && typeof input.trigger === 'object' ? input.trigger : { type: input.triggerType || 'manual' };
  const steps = Array.isArray(input.steps) ? input.steps : [];
  return {
    ...base,
    ...input,
    id: String(input.id || uid?.('aut_') || '').trim() || undefined,
    agentId: String(input.agentId || agentId || '').trim(),
    name: String(input.name || base.name).trim() || base.name,
    enabled: input.enabled !== false,
    trigger: {
      type: ['manual', 'webhook', 'cron'].includes(String(trigger.type || '').trim()) ? String(trigger.type || '').trim() : 'manual',
      token: String(trigger.token || input.webhookToken || '').trim(),
      cron: String(trigger.cron || '').trim(),
      path: String(trigger.path || '').trim(),
    },
    steps: steps.map((step, index) => ({
      id: String(step.id || `step_${index + 1}`),
      type: String(step.type || 'run_agent').trim(),
      input: String(step.input || '').trim(),
      tool: String(step.tool || '').trim(),
      config: step.config && typeof step.config === 'object' ? step.config : {},
    })),
    lastRunAt: String(input.lastRunAt || '').trim(),
    createdAt: String(input.createdAt || nowIso?.() || '').trim(),
    updatedAt: String(input.updatedAt || nowIso?.() || '').trim(),
  };
}

let queue = Promise.resolve();
function enqueueAutomationRun(task) {
  queue = queue.then(() => task());
  return queue;
}

async function executeAutomation({ automation, agent, db, payload = {}, deps }) {
  const startedAt = deps.nowIso();
  const toolCalls = [];
  let lastReply = '';
  let generatedApp = null;
  let openclawExport = null;
  const history = [];

  for (const step of automation.steps || []) {
    if (step.type === 'run_agent') {
      const run = await deps.runAgentChat({
        agent,
        db,
        message: step.input || payload.message || payload.text || `Führe Automation ${automation.name} aus.`,
        history,
        source: automation.trigger?.type || 'manual',
        conversationId: null,
        composeSystemPrompt: deps.composeSystemPrompt,
        normalizeModelStack: deps.normalizeModelStack,
        nowIso: deps.nowIso,
        uid: deps.uid,
        toolRunner: ({ agent: liveAgent, message }) => executeAgentTools({
          agent: liveAgent,
          message,
          helpers: deps.helpers,
        }),
      });
      toolCalls.push(...(run.toolCalls || []));
      if (run.toolOutput?.generatedApp) generatedApp = run.toolOutput.generatedApp;
      if (run.toolOutput?.openclawExport) openclawExport = run.toolOutput.openclawExport;
      lastReply = run.reply;
      history.push({ role: 'user', content: step.input || payload.message || payload.text || automation.name });
      history.push({ role: 'assistant', content: run.reply });
      continue;
    }

    if (step.type === 'tool' && step.tool) {
      const result = await executeAgentTools({
        agent,
        message: step.input || payload.message || payload.text || step.tool,
        helpers: deps.helpers,
      });
      toolCalls.push(...(result.toolCalls || []));
      if (result.output?.generatedApp) generatedApp = result.output.generatedApp;
      if (result.output?.openclawExport) openclawExport = result.output.openclawExport;
      continue;
    }
  }

  return {
    id: deps.uid('run_'),
    agentId: agent.id,
    automationId: automation.id,
    source: automation.trigger?.type || 'manual',
    status: 'success',
    input: payload,
    output: {
      reply: lastReply,
      generatedApp,
      openclawExport,
    },
    toolCalls,
    error: null,
    conversationId: null,
    model: agent?.modelStack?.mainModel || null,
    promptMeta: {
      historyCount: history.length,
      systemPromptChars: 0,
    },
    startedAt,
    finishedAt: deps.nowIso(),
  };
}

module.exports = {
  defaultAutomationRecord,
  normalizeAutomationRecord,
  enqueueAutomationRun,
  executeAutomation,
};
