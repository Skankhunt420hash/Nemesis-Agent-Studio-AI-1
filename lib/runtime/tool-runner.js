function catalog() {
  return [
    { id: 'generate_hosted_app', label: 'Hosted App Generator', description: 'Erzeugt direkt aus einem Agentenbefehl eine nutzbare Web/App-Struktur.', kind: 'internal' },
    { id: 'export_openclaw_bundle', label: 'OpenClaw Export', description: 'Erstellt ein OpenClaw-kompatibles Agent-Bundle.', kind: 'internal' },
    { id: 'telegram_channel', label: 'Telegram Reachability', description: 'Agent kann über Telegram konfiguriert und deployt werden.', kind: 'channel' },
    { id: 'whatsapp_channel', label: 'WhatsApp Reachability', description: 'Vorbereitung für WhatsApp-Erreichbarkeit und Routing.', kind: 'channel' },
    { id: 'workspace_file_write', label: 'Workspace File Write', description: 'Darf Dateien innerhalb erlaubter Projektpfade erzeugen/ändern.', kind: 'agency' },
    { id: 'workspace_shell', label: 'Workspace Shell', description: 'Darf freigegebene Commands im Projektkontext ausführen.', kind: 'agency' },
  ];
}

function normalizeEnabledTools(tools) {
  const list = Array.isArray(tools)
    ? tools
    : String(tools || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
}

function messageLooksLikeAppGeneration(message = '') {
  return /(generier|baue|erstelle|mach).{0,40}(app|todo|to do|webapp|saas|landingpage|tool)/i.test(String(message || '').toLowerCase());
}

function messageLooksLikeOpenClawExport(message = '') {
  return /(export|deploy|openclaw|telegram-bot|whatsapp-bot)/i.test(String(message || ''));
}

function extractFileInstruction(message = '') {
  const text = String(message || '');
  const match = text.match(/(?:datei|file)\s+([^\n:]+)\s*:\s*([\s\S]+)/i);
  if (!match) return null;
  return { path: match[1].trim(), content: match[2] };
}

function extractCommandInstruction(message = '') {
  const text = String(message || '');
  const match = text.match(/(?:run command|befehl|command)\s*:\s*([^\n]+)/i);
  if (!match) return null;
  return { command: match[1].trim() };
}

function deriveAppName(agent, message) {
  const raw = String(message || '').replace(/^[^a-zA-ZäöüÄÖÜß0-9]+/, '').trim();
  const cleaned = raw.replace(/^(generier(?:e)?|baue|erstelle|mach)( mir)?/i, '').replace(/\b(eine|einen|ein|mir|bitte)\b/gi, '').trim();
  const first = cleaned.split(/[.!?\n]/)[0].trim();
  return first ? first.slice(0, 60) : `${agent.name} App`;
}

async function executeAgentTools({ agent, message, helpers }) {
  const enabled = normalizeEnabledTools(agent.tools);
  const toolCalls = [];
  const output = {};

  if (enabled.includes('generate_hosted_app') && messageLooksLikeAppGeneration(message)) {
    const generatedAgent = {
      ...agent,
      appIdea: String(message || '').trim(),
      blueprint: helpers.buildAppBlueprint({ name: deriveAppName(agent, message), prompt: String(message || '').trim(), template: agent.template || 'saas' }),
    };
    const started = Date.now();
    const out = await helpers.writeScaffold(generatedAgent);
    toolCalls.push({ tool: 'generate_hosted_app', status: 'success', durationMs: Date.now() - started, output: { outputDir: out.dir, hostedUrl: helpers.hostedUrlFor(generatedAgent), files: out.files } });
    output.generatedApp = { outputDir: out.dir, hostedUrl: helpers.hostedUrlFor(generatedAgent), files: out.files, appName: generatedAgent.blueprint?.title || generatedAgent.name };
  }

  if (enabled.includes('export_openclaw_bundle') && messageLooksLikeOpenClawExport(message) && helpers.writeOpenClawExport) {
    const started = Date.now();
    const out = await helpers.writeOpenClawExport(agent);
    toolCalls.push({ tool: 'export_openclaw_bundle', status: 'success', durationMs: Date.now() - started, output: { outputDir: out.dir, files: out.files } });
    output.openclawExport = { outputDir: out.dir, files: out.files };
  }

  const fileInstruction = extractFileInstruction(message);
  if (enabled.includes('workspace_file_write') && fileInstruction && helpers.executeAgencyAction) {
    const result = await helpers.executeAgencyAction({ action: 'write_file', payload: fileInstruction });
    toolCalls.push({ tool: 'workspace_file_write', status: result.status, durationMs: 0, output: result });
    output.fileWrite = result;
  }

  const commandInstruction = extractCommandInstruction(message);
  if (enabled.includes('workspace_shell') && commandInstruction && helpers.executeAgencyAction) {
    const result = await helpers.executeAgencyAction({ action: 'run_command', payload: commandInstruction });
    toolCalls.push({ tool: 'workspace_shell', status: result.status, durationMs: 0, output: result });
    output.commandRun = result;
  }

  return { toolCalls, output };
}

module.exports = { catalog, normalizeEnabledTools, executeAgentTools, messageLooksLikeAppGeneration };
