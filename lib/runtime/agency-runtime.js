const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function allowedRoots(config = {}) {
  const roots = Array.isArray(config.allowedPaths) ? config.allowedPaths : [];
  return roots.map((item) => String(item || '').trim()).filter(Boolean);
}

function pickAllowedRoot(config = {}, requestedPath = '') {
  const roots = allowedRoots(config);
  const cleaned = String(requestedPath || '').trim();
  for (const root of roots) {
    const candidate = path.resolve(root, cleaned);
    if (ensureInside(root, candidate)) return { root, fullPath: candidate };
  }
  return null;
}

function requestApproval({ db, uid, nowIso, agent, kind, payload, reason }) {
  db.approvals ||= [];
  const approval = {
    id: uid('apr_'),
    agentId: agent.id,
    kind,
    status: 'pending',
    payload,
    reason: String(reason || '').trim(),
    createdAt: nowIso(),
    approvedAt: '',
  };
  db.approvals.unshift(approval);
  db.approvals = db.approvals.slice(0, 500);
  return approval;
}

function logAudit({ db, uid, nowIso, agent, action, status, detail }) {
  db.audit ||= [];
  db.audit.unshift({
    id: uid('aud_'),
    agentId: agent.id,
    action,
    status,
    detail,
    createdAt: nowIso(),
  });
  db.audit = db.audit.slice(0, 1000);
}

function executeFileWrite({ db, uid, nowIso, agent, config, payload }) {
  if (config.canWriteFiles !== true && config.canGenerateFiles !== true) {
    logAudit({ db, uid, nowIso, agent, action: 'write_file', status: 'denied', detail: { reason: 'write_disabled' } });
    return { status: 'denied', reason: 'write_disabled' };
  }
  const target = pickAllowedRoot(config, payload.path);
  if (!target) {
    const approval = requestApproval({ db, uid, nowIso, agent, kind: 'file_write_outside_scope', payload, reason: 'Pfad außerhalb erlaubter Workspace-Scopes.' });
    logAudit({ db, uid, nowIso, agent, action: 'write_file', status: 'approval_required', detail: { approvalId: approval.id, path: payload.path } });
    return { status: 'approval_required', approval };
  }
  fs.mkdirSync(path.dirname(target.fullPath), { recursive: true });
  fs.writeFileSync(target.fullPath, String(payload.content || ''));
  logAudit({ db, uid, nowIso, agent, action: 'write_file', status: 'success', detail: { path: target.fullPath } });
  return { status: 'success', path: target.fullPath };
}

function executeCommand({ db, uid, nowIso, agent, config, payload }) {
  if (config.canRunCommands !== true) {
    logAudit({ db, uid, nowIso, agent, action: 'run_command', status: 'denied', detail: { reason: 'command_disabled' } });
    return { status: 'denied', reason: 'command_disabled' };
  }
  const cwdPick = pickAllowedRoot(config, payload.cwd || '');
  const needsApproval = config.requireApprovalFor?.includes('run_commands') !== false;
  if (needsApproval && payload.approved !== true) {
    const approval = requestApproval({ db, uid, nowIso, agent, kind: 'run_command', payload, reason: 'Command-Ausführung braucht Freigabe.' });
    logAudit({ db, uid, nowIso, agent, action: 'run_command', status: 'approval_required', detail: { approvalId: approval.id, command: payload.command } });
    return { status: 'approval_required', approval };
  }
  const workdir = cwdPick?.fullPath || (allowedRoots(config)[0] || process.cwd());
  const result = spawnSync(String(payload.command || ''), {
    cwd: workdir,
    shell: true,
    encoding: 'utf8',
    timeout: Math.max(1000, Math.min(60000, Number(payload.timeoutMs || 15000))),
  });
  const out = {
    status: result.status === 0 ? 'success' : 'error',
    command: payload.command,
    cwd: workdir,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
  logAudit({ db, uid, nowIso, agent, action: 'run_command', status: out.status, detail: { command: out.command, cwd: out.cwd, exitCode: out.exitCode } });
  return out;
}

function executeAgencyAction({ db, uid, nowIso, agent, agencyConfig, action, payload }) {
  if (action === 'write_file') return executeFileWrite({ db, uid, nowIso, agent, config: agencyConfig, payload });
  if (action === 'run_command') return executeCommand({ db, uid, nowIso, agent, config: agencyConfig, payload });
  return { status: 'unsupported_action' };
}

module.exports = { executeAgencyAction, requestApproval, logAudit };
