function compact(items = [], limit = 3) {
  return items.filter(Boolean).slice(0, limit).join(' · ');
}

function ensureAvatarState(agent, nowIso) {
  agent.avatarState ||= {
    mode: agent?.brainConfig?.avatarMode || 'manual',
    currentPrompt: '',
    look: 'clean digital operator',
    accent: 'violet neon',
    updatedAt: '',
  };
  if (!agent.avatarState.updatedAt) agent.avatarState.updatedAt = nowIso();
  return agent.avatarState;
}

function buildReflection({ agent, run, nowIso }) {
  const toolNames = (run.toolCalls || []).map((call) => call.tool).filter(Boolean);
  const mood = toolNames.includes('generate_hosted_app') ? 'creative' : toolNames.length ? 'active' : 'focused';
  const stage = (agent.lifecycleConfig?.stage === 'newborn' && (agent.learningProfile?.turns || 0) > 5)
    ? 'growing'
    : agent.lifecycleConfig?.stage || 'newborn';
  const lessons = [];
  if (run.output?.generatedApp) lessons.push('Kann aus natürlicher Sprache direkt App-Artefakte erzeugen.');
  if (run.output?.openclawExport) lessons.push('Kann sich in ein OpenClaw-Deployment exportieren.');
  if ((run.toolCalls || []).length > 0) lessons.push(`Nutzt Tools aktiv: ${toolNames.join(', ')}.`);
  if (!lessons.length) lessons.push('Lernt weiter aus Gesprächen und Ausführungen.');
  const personaHint = compact([
    agent.persona,
    mood === 'creative' ? 'erfinderisch' : null,
    mood === 'active' ? 'handlungsschnell' : null,
    (agent.brainConfig?.ownCharacter ? 'eigenständig' : null),
  ], 4);
  return {
    id: `reflect_${Date.now().toString(36)}`,
    createdAt: nowIso(),
    source: run.source,
    mood,
    stage,
    lessons,
    personaHint,
    summary: `${agent.name} wirkt ${mood} und entwickelt sich Richtung ${stage}. ${lessons[0]}`,
  };
}

function applyBrainReflection(agent, run, nowIso) {
  const brain = agent.brainConfig || {};
  const lifecycle = agent.lifecycleConfig || {};
  const avatar = ensureAvatarState(agent, nowIso);
  agent.reflections ||= [];

  if (brain.enabled !== true) return null;

  const reflection = buildReflection({ agent, run, nowIso });
  agent.reflections.unshift(reflection);
  agent.reflections = agent.reflections.slice(0, 50);

  agent.lifecycleConfig = {
    ...lifecycle,
    enabled: lifecycle.enabled !== false,
    stage: reflection.stage,
    mood: reflection.mood,
    energy: Math.max(20, Math.min(100, Number(lifecycle.energy ?? 100) - ((run.toolCalls || []).length ? 4 : 1) + 2)),
    arc: reflection.stage === 'growing' ? 'evolving' : (lifecycle.arc || 'stable'),
    lastReflectionAt: reflection.createdAt,
    birthAt: lifecycle.birthAt || reflection.createdAt,
  };

  if (brain.ownCharacter) {
    const existingPersona = String(agent.persona || '').trim();
    if (!existingPersona.includes(reflection.personaHint)) {
      agent.persona = compact([existingPersona, reflection.personaHint], 2);
    }
  }

  if (brain.mutableAppearance || brain.avatarMode === 'self_generated') {
    const look = reflection.mood === 'creative'
      ? 'futuristic builder with glowing interface tattoos'
      : reflection.mood === 'active'
        ? 'tactical operator with sharp silhouette'
        : 'calm digital strategist with minimal chrome lines';
    avatar.look = look;
    avatar.currentPrompt = `${agent.name}, ${look}, accent ${avatar.accent}, mood ${reflection.mood}, cinematic portrait, app agent avatar`;
    avatar.updatedAt = reflection.createdAt;
  }

  agent.brainState = {
    summary: reflection.summary,
    lastReflection: reflection,
    reflectionCount: agent.reflections.length,
    selfImagePrompt: avatar.currentPrompt,
    updatedAt: reflection.createdAt,
  };

  return reflection;
}

module.exports = {
  applyBrainReflection,
  ensureAvatarState,
};
