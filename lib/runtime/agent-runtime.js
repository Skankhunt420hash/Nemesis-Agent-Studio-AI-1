const { generateReply } = require('../llm');

function buildRunLog({ uid, nowIso, agent, source, message, reply, conversationId, systemPrompt, history, toolCalls = [], toolOutput = {} }) {
  return {
    id: uid('run_'),
    agentId: agent.id,
    automationId: null,
    source,
    status: 'success',
    input: { message },
    output: { reply, ...toolOutput },
    toolCalls,
    error: null,
    conversationId: conversationId || null,
    model: agent?.modelStack?.mainModel || null,
    promptMeta: {
      historyCount: Array.isArray(history) ? history.length : 0,
      systemPromptChars: String(systemPrompt || '').length,
    },
    startedAt: nowIso(),
    finishedAt: nowIso(),
  };
}

async function runAgentChat({
  agent,
  db,
  message,
  history = [],
  source = 'chat',
  conversationId = null,
  composeSystemPrompt,
  normalizeModelStack,
  nowIso,
  uid,
  toolRunner,
}) {
  const safeMessage = String(message || '').trim();
  const systemPrompt = composeSystemPrompt(agent, db, history);
  const toolResult = toolRunner
    ? await toolRunner({ agent, db, message: safeMessage })
    : { toolCalls: [], output: {} };
  const toolContext = Array.isArray(toolResult.toolCalls) && toolResult.toolCalls.length
    ? `\n\nTool-Ergebnisse:\n${toolResult.toolCalls.map((call) => `- ${call.tool}: ${JSON.stringify(call.output || {})}`).join('\n').slice(0, 3000)}`
    : '';
  const reply = await generateReply({
    systemPrompt,
    history,
    message: `${safeMessage}${toolContext}`,
    routing: normalizeModelStack(agent.modelStack, db.settings),
  });

  return {
    reply,
    systemPrompt,
    toolCalls: toolResult.toolCalls || [],
    toolOutput: toolResult.output || {},
    runLog: buildRunLog({
      uid,
      nowIso,
      agent,
      source,
      message: safeMessage,
      reply,
      conversationId,
      systemPrompt,
      history,
      toolCalls: toolResult.toolCalls || [],
      toolOutput: toolResult.output || {},
    }),
  };
}

module.exports = { runAgentChat, buildRunLog };
