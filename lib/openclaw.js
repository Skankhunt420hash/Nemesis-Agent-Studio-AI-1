const path = require('node:path');

function safe(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function buildOpenClawAgentBundle(agent) {
  const name = safe(agent.name, 'Agent');
  const slug = safe(agent.slug, 'agent');
  const model = 'openai/gpt-5.4-mini';
  const accountId = safe(agent.automation?.telegramAccountId, slug);
  const botName = safe(agent.automation?.telegramBotName, name);
  const description = safe(agent.description, 'OpenClaw agent clone');
  const knowledge = (agent.knowledgeItems || [])
    .map((item) => `- ${item.title || 'Notiz'}: ${item.content || ''}`.trim())
    .join('\n') || '- Keine Wissenseinträge';
  const instructions = [
    `Name: ${name}`,
    `Ziel: ${description}`,
    `Business: ${safe(agent.businessType, 'general')}`,
    `Tonalität: ${safe(agent.tone, 'professional')}`,
    `Persönlichkeit: ${safe(agent.personality, 'helpful')}`,
    `Sprache: ${safe(agent.language, 'de')}`,
    agent.services ? `Services: ${agent.services}` : null,
    agent.rules ? `Regeln: ${agent.rules}` : null,
    agent.trainingNotes ? `Training Notes:\n${agent.trainingNotes}` : null,
    `Wissen:\n${knowledge}`,
  ].filter(Boolean).join('\n\n');

  return {
    'README.md': `# ${name}

OpenClaw Agent Export.

## Inhalt
- Workspace bootstrap
- Telegram Account Wiring
- OpenClaw deploy script

## Deploy
1. Setze den Telegram Bot Token in \`secrets/${slug}.telegram.token\`
2. Passe ggf. \`deploy.sh\` an
3. Starte \`./deploy.sh\`
`,
    'AGENTS.md': `# AGENTS.md

This agent is a Telegram-controlled OpenClaw export.

- Agent id: ${slug}
- Model: ${model}
- Telegram account: ${accountId}
`,
    'SOUL.md': `# SOUL.md

${description}

- Take initiative.
- Reply in German unless asked otherwise.
- Use OpenClaw automation when available.
`,
    'USER.md': `# USER.md

- User: Elij
- Preferred language: German
`,
    'IDENTITY.md': `# IDENTITY.md

- **Name:** ${name}
- **Creature:** OpenClaw Telegram agent
- **Vibe:** sharp, useful, direct
- **Emoji:** 🧪
- **Avatar:** _(not set)_
`,
    'MEMORY.md': `# MEMORY.md

- Telegram bot name: ${botName}
- OpenClaw agent id: ${slug}
- Model: ${model}
`,
    'HEARTBEAT.md': '<!-- keep empty to skip heartbeats -->\n',
    'TOOLS.md': `# TOOLS.md

- Telegram account: ${accountId}
- OpenClaw model: ${model}
`,
    'agent/models.json': JSON.stringify({ providers: { default: { model } } }, null, 2),
    'openclaw-agent.json': JSON.stringify({
      id: slug,
      name,
      model,
      telegram: {
        accountId,
        botName,
        tokenFile: `/root/.openclaw/secrets/${slug}.telegram.token`,
      },
      instructions,
    }, null, 2),
    'deploy.sh': `#!/usr/bin/env bash
set -euo pipefail

AGENT_ID=${JSON.stringify(slug)}
WORKSPACE=$(cd "$(dirname "$0")" && pwd)
MODEL=${JSON.stringify(model)}
ACCOUNT_ID=${JSON.stringify(accountId)}

openclaw agents add "$AGENT_ID" --workspace "$WORKSPACE" --model "$MODEL" --non-interactive --bind "telegram:$ACCOUNT_ID" || true
openclaw agents set-identity --agent "$AGENT_ID" --name ${JSON.stringify(name)} --emoji 🧪 || true
openclaw agents bind --agent "$AGENT_ID" --bind "telegram:$ACCOUNT_ID" || true
echo "Deployed $AGENT_ID"
`,
    '.openclaw/workspace-state.json': JSON.stringify({ version: 1, setupCompletedAt: new Date().toISOString() }, null, 2),
  };
}

function buildDeploymentDirectory(agent) {
  const slug = safe(agent.slug, 'agent');
  return path.join('/root/.openclaw', 'agent-studio-deployments', slug);
}

module.exports = { buildOpenClawAgentBundle, buildDeploymentDirectory };
