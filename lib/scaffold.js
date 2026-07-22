const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function buildHostedAppScaffold(agent) {
  const blueprint = agent.blueprint || {};
  const slug = agent.slug;
  const title = agent.name || blueprint.title || 'App';
  const safeBlueprint = JSON.stringify(blueprint, null, 2).replace(/</g, '\\u003c');
  const seedTasks = (blueprint.features || ['Login/Register', 'Dashboard', 'Billing'])
    .slice(0, 4)
    .map((name, index) => ({
      id: `task_${index + 1}`,
      title: name,
      done: index < 2,
      priority: index === 0 ? 'high' : 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

  return {
    'README.md': `# ${title}

${blueprint.tagline || 'CRUD starter with real JSON storage.'}

## Run

npm install
npm start

## Deploy on Replit

1. Open the generated folder in Replit.
2. Run npm install.
3. Press Run or use npm start.
4. Deploy the app from Replit's Deploy UI.

## Features

- CRUD for tasks and leads
- JSON file database
- Local demo fallback in preview mode
- Replit-ready run/deploy files
`,
    'package.json': JSON.stringify({
      name: slug,
      private: true,
      version: '1.0.0',
      type: 'commonjs',
      scripts: { start: 'node server.js', dev: 'node server.js' },
      dependencies: { express: '^4.18.2' },
    }, null, 2),
    '.replit': `run = "npm install && npm start"
entrypoint = "server.js"
`,
    'replit.nix': `{ pkgs }:
{
  deps = [
    pkgs.nodejs-20_x
  ];
}
`,
    'deploy.md': `# Deploy Flow

1. Open this folder in Replit.
2. Run the app.
3. Verify CRUD works.
4. Hit Deploy.
5. Use the generated public URL.
`,
    'db.json': JSON.stringify({
      meta: {
        app: title,
        slug,
        createdAt: new Date().toISOString(),
      },
      tasks: seedTasks,
      leads: [],
    }, null, 2),
    'server.js': `const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'db.json');
const appName = ${JSON.stringify(title)};
const blueprint = ${JSON.stringify(blueprint, null, 2)};

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function seedDb() {
  return {
    meta: { app: appName, blueprint, createdAt: now() },
    tasks: ${JSON.stringify(seedTasks, null, 2)},
    leads: [],
  };
}

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(seedDb(), null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    const db = seedDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return db;
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function mutate(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

function notFound(res) {
  return res.status(404).json({ error: 'not_found' });
}

app.use(express.json());
app.use(express.static(ROOT));

app.get('/api/bootstrap', (req, res) => {
  const db = readDb();
  res.json({ ok: true, app: appName, blueprint, tasks: db.tasks || [], leads: db.leads || [], stats: { tasks: (db.tasks || []).length, leads: (db.leads || []).length } });
});

app.get('/api/tasks', (req, res) => {
  const db = readDb();
  res.json({ ok: true, tasks: db.tasks || [] });
});

app.post('/api/tasks', (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'invalid_input' });
  const task = mutate((db) => {
    db.tasks ||= [];
    const record = { id: uid('task'), title, done: !!req.body?.done, priority: String(req.body?.priority || 'normal'), createdAt: now(), updatedAt: now() };
    db.tasks.unshift(record);
    return record;
  });
  res.status(201).json({ ok: true, task });
});

app.patch('/api/tasks/:id', (req, res) => {
  const updated = mutate((db) => {
    const task = (db.tasks || []).find((item) => item.id === req.params.id);
    if (!task) return null;
    if (req.body?.title !== undefined) task.title = String(req.body.title).trim();
    if (req.body?.done !== undefined) task.done = !!req.body.done;
    if (req.body?.priority !== undefined) task.priority = String(req.body.priority).trim() || task.priority;
    task.updatedAt = now();
    return task;
  });
  if (!updated) return notFound(res);
  res.json({ ok: true, task: updated });
});

app.delete('/api/tasks/:id', (req, res) => {
  const removed = mutate((db) => {
    const idx = (db.tasks || []).findIndex((item) => item.id === req.params.id);
    if (idx === -1) return false;
    db.tasks.splice(idx, 1);
    return true;
  });
  if (!removed) return notFound(res);
  res.json({ ok: true });
});

app.get('/api/leads', (req, res) => {
  const db = readDb();
  res.json({ ok: true, leads: db.leads || [] });
});

app.post('/api/leads', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'invalid_input' });
  const lead = mutate((db) => {
    db.leads ||= [];
    const record = { id: uid('lead'), name, email: String(req.body?.email || '').trim(), note: String(req.body?.note || '').trim(), createdAt: now(), updatedAt: now() };
    db.leads.unshift(record);
    return record;
  });
  res.status(201).json({ ok: true, lead });
});

app.patch('/api/leads/:id', (req, res) => {
  const updated = mutate((db) => {
    const lead = (db.leads || []).find((item) => item.id === req.params.id);
    if (!lead) return null;
    if (req.body?.name !== undefined) lead.name = String(req.body.name).trim();
    if (req.body?.email !== undefined) lead.email = String(req.body.email).trim();
    if (req.body?.note !== undefined) lead.note = String(req.body.note).trim();
    lead.updatedAt = now();
    return lead;
  });
  if (!updated) return notFound(res);
  res.json({ ok: true, lead: updated });
});

app.delete('/api/leads/:id', (req, res) => {
  const removed = mutate((db) => {
    const idx = (db.leads || []).findIndex((item) => item.id === req.params.id);
    if (idx === -1) return false;
    db.leads.splice(idx, 1);
    return true;
  });
  if (!removed) return notFound(res);
  res.json({ ok: true });
});

app.get('/api/deploy', (req, res) => {
  res.json({
    ok: true,
    steps: [
      'npm install',
      'npm start',
      'Check /api/bootstrap',
      'Create Replit deployment',
    ],
  });
});

app.listen(PORT, () => {
  console.log('\\n' + appName + ' running on http://localhost:' + PORT + '\\n');
});
`,
    'index.html': `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Replit-ready CRUD app</p>
        <h1>${title}</h1>
        <p class="lead">${escapeHtml(blueprint.tagline || 'CRUD starter with real JSON storage.')}</p>
      </div>
      <div class="hero-card">
        <div class="pill">${escapeHtml(blueprint.template || 'replit')}</div>
        <div class="hero-stat"><strong id="taskCount">0</strong><span>Tasks</span></div>
        <div class="hero-stat"><strong id="leadCount">0</strong><span>Leads</span></div>
        <div class="hero-stat"><strong>DB</strong><span>JSON</span></div>
      </div>
    </header>
    <main class="grid">
      <section class="panel">
        <div class="nav">
          <button class="active" data-view="tasks">Tasks</button>
          <button data-view="leads">Leads</button>
          <button data-view="deploy">Deploy</button>
        </div>
        <div id="view"></div>
      </section>
      <aside class="panel">
        <h2>Blueprint</h2>
        <pre id="blueprint" class="code"></pre>
      </aside>
    </main>
  </div>
  <script id="app-blueprint" type="application/json">${safeBlueprint}</script>
  <script src="./app.js"></script>
</body>
</html>
`,
    'styles.css': `:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(135deg,#0f172a,#312e81 52%,#7c3aed);color:#e5e7eb}.shell{max-width:1180px;margin:0 auto;padding:28px}.hero{display:flex;justify-content:space-between;gap:20px;align-items:stretch;flex-wrap:wrap;padding:18px 0 28px}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:#c4b5fd;margin:0 0 8px}.hero h1{margin:0;font-size:clamp(36px,6vw,58px);line-height:1.02}.lead{max-width:60ch;color:#cbd5e1;font-size:18px}.hero-card,.panel{background:rgba(15,23,42,.74);border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}.hero-card{min-width:280px;padding:20px;display:grid;gap:12px}.pill{display:inline-flex;width:max-content;padding:8px 12px;border-radius:999px;background:rgba(129,140,248,.18);color:#c7d2fe;font-weight:700}.hero-stat{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-top:1px solid rgba(148,163,184,.14)}.hero-stat strong{font-size:28px}.grid{display:grid;grid-template-columns:1.35fr .85fr;gap:20px}.panel{padding:22px}.nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.nav button{border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.06);color:#e5e7eb;border-radius:999px;padding:10px 14px;font-weight:700;cursor:pointer}.nav button.active{background:#fff;color:#111827}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:16px 0}.card,.item{background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.16);border-radius:18px;padding:16px}.card h3,.panel h2{margin:0 0 12px}.muted{color:#94a3b8}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px;margin-bottom:12px}.field input,.field textarea,.field select,button{font:inherit}.field input,.field textarea,.field select{background:#fff;border:0;border-radius:14px;padding:12px 14px;color:#0f172a}.field textarea{min-height:100px;resize:vertical}.btn{border:0;border-radius:14px;padding:12px 16px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#a78bfa,#6366f1);color:#fff}.btn.secondary{background:#e0e7ff;color:#3730a3}.btn.danger{background:#ef4444}.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.code{white-space:pre-wrap;background:#020617;color:#cbd5e1;padding:16px;border-radius:18px;overflow:auto;max-height:72vh}.list{display:grid;gap:12px}.task,.lead-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.pill-sm{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(59,130,246,.16);color:#bfdbfe;font-size:12px;font-weight:700}.progress{height:8px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}.progress > i{display:block;height:100%;background:linear-gradient(90deg,#34d399,#60a5fa);width:0%}.deploy{display:grid;gap:12px}.steps{margin:0;padding-left:18px;color:#cbd5e1}.tiny{font-size:13px}.footer{margin-top:12px;color:#94a3b8;font-size:14px}@media (max-width:900px){.grid,.cards,.row{grid-template-columns:1fr}.hero{flex-direction:column}}`,
    'app.js': `const blueprint = JSON.parse(document.getElementById('app-blueprint').textContent);
const storageKey = 'app-factory-demo:${slug}';
const demo = JSON.parse(localStorage.getItem(storageKey) || '{"tasks":[],"leads":[]}');
demo.tasks ||= [];
demo.leads ||= [];
const state = { view: 'tasks', tasks: [], leads: [], api: true };
const $ = (sel) => document.querySelector(sel);
const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const saveDemo = () => localStorage.setItem(storageKey, JSON.stringify({ tasks: state.tasks, leads: state.leads }));

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'HTTP ' + res.status);
  return data;
}

function taskCard(task) {
  return '<div class="item"><div class="task"><div><strong>' + esc(task.title) + '</strong><div class="muted tiny">Priority: ' + esc(task.priority || 'normal') + '</div></div><div class="pill-sm">' + (task.done ? 'done' : 'open') + '</div></div><div class="actions" style="margin-top:12px;"><button class="btn secondary" data-action="toggle-task" data-id="' + esc(task.id) + '">Toggle</button><button class="btn secondary" data-action="edit-task" data-id="' + esc(task.id) + '">Edit</button><button class="btn danger" data-action="delete-task" data-id="' + esc(task.id) + '">Delete</button></div></div>';
}

function leadCard(lead) {
  return '<div class="item"><div class="lead-row"><div><strong>' + esc(lead.name) + '</strong><div class="muted tiny">' + esc(lead.email || 'no email') + '</div></div><div class="pill-sm">Lead</div></div><p class="muted">' + esc(lead.note || '') + '</p><div class="actions"><button class="btn secondary" data-action="edit-lead" data-id="' + esc(lead.id) + '">Edit</button><button class="btn danger" data-action="delete-lead" data-id="' + esc(lead.id) + '">Delete</button></div></div>';
}

function deployCard() {
  return '<div class="deploy"><h3>Deploy-Flow</h3><ol class="steps"><li>Open this folder in Replit.</li><li>Run <code>npm install</code>.</li><li>Press Run / start the server.</li><li>Check the CRUD flows.</li><li>Deploy from Replit.</li></ol><div class="notice">Server listens on <code>PORT</code>, so Replit works out of the box.</div></div>';
}

async function loadData() {
  try {
    const data = await api('/api/bootstrap');
    state.api = true;
    state.tasks = data.tasks || [];
    state.leads = data.leads || [];
    return;
  } catch {
    state.api = false;
    state.tasks = demo.tasks || [];
    state.leads = demo.leads || [];
  }
}

function render() {
  document.getElementById('blueprint').textContent = JSON.stringify(blueprint, null, 2);
  document.getElementById('taskCount').textContent = String(state.tasks.length);
  document.getElementById('leadCount').textContent = String(state.leads.length);
  document.querySelectorAll('.nav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === state.view));

  const view = $('#view');
  if (state.view === 'tasks') {
    view.innerHTML = '<div class="cards">' +
      '<div class="card"><h3>Task CRUD</h3><form id="taskForm" class="form"><div class="field"><label>Title</label><input name="title" required placeholder="Build login"></div><div class="field"><label>Priority</label><select name="priority"><option>low</option><option selected>normal</option><option>high</option></select></div><button class="btn" type="submit">Add task</button></form></div>' +
      '<div class="card"><h3>Task list</h3><div class="list">' + (state.tasks.length ? state.tasks.map(taskCard).join('') : '<div class="muted">No tasks yet.</div>') + '</div></div>' +
      '<div class="card"><h3>Summary</h3><p class="muted">' + esc(blueprint.tagline || 'CRUD starter') + '</p><div class="progress"><i style="width:' + (state.tasks.length ? Math.round(state.tasks.filter((t) => t.done).length / state.tasks.length * 100) : 0) + '%"></i></div></div>' +
    '</div>';
  } else if (state.view === 'leads') {
    view.innerHTML = '<div class="cards">' +
      '<div class="card"><h3>Lead CRUD</h3><form id="leadForm" class="form"><div class="field"><label>Name</label><input name="name" required placeholder="Acme GmbH"></div><div class="field"><label>Email</label><input name="email" type="email" placeholder="hello@acme.com"></div><div class="field"><label>Note</label><textarea name="note" placeholder="Qualification note"></textarea></div><button class="btn" type="submit">Add lead</button></form></div>' +
      '<div class="card"><h3>Lead list</h3><div class="list">' + (state.leads.length ? state.leads.map(leadCard).join('') : '<div class="muted">No leads yet.</div>') + '</div></div>' +
      '<div class="card"><h3>Pipeline</h3><p class="muted">Store prospects in JSON, then scale the same flow on Replit.</p></div>' +
    '</div>';
  } else {
    view.innerHTML = deployCard();
  }
}

async function mutate(kind, method, body) {
  const path = kind === 'task' ? '/api/tasks' : '/api/leads';
  const suffix = body?.id ? '/' + body.id : '';
  if (state.api) {
    if (method === 'POST') return api(path, { method, body: JSON.stringify(body) });
    if (method === 'PATCH') return api(path + suffix, { method, body: JSON.stringify(body) });
    if (method === 'DELETE') return api(path + suffix, { method });
  }

  const listName = kind === 'task' ? 'tasks' : 'leads';
  if (method === 'POST') {
    const record = { id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...body };
    state[listName].unshift(record);
    saveDemo();
    return { [kind]: record };
  }
  const idx = state[listName].findIndex((item) => item.id === body.id);
  if (idx === -1) return null;
  if (method === 'PATCH') {
    state[listName][idx] = { ...state[listName][idx], ...body, updatedAt: new Date().toISOString() };
    saveDemo();
    return { [kind]: state[listName][idx] };
  }
  state[listName].splice(idx, 1);
  saveDemo();
  return { ok: true };
}

$('#view').addEventListener('click', async (e) => {
  const action = e.target?.dataset?.action;
  const id = e.target?.dataset?.id;
  if (!action || !id) return;
  const kind = action.includes('task') ? 'task' : 'lead';
  const list = kind === 'task' ? state.tasks : state.leads;
  const record = list.find((item) => item.id === id);
  if (!record) return;

  if (action === 'toggle-task') {
    await mutate('task', 'PATCH', { id, done: !record.done });
  }
  if (action === 'edit-task') {
    const title = prompt('Task title', record.title);
    if (title === null) return;
    const priority = prompt('Priority (low/normal/high)', record.priority || 'normal');
    await mutate('task', 'PATCH', { id, title, priority: priority || record.priority });
  }
  if (action === 'delete-task' && confirm('Delete task?')) {
    await mutate('task', 'DELETE', { id });
  }
  if (action === 'edit-lead') {
    const name = prompt('Lead name', record.name);
    if (name === null) return;
    const email = prompt('Lead email', record.email || '');
    if (email === null) return;
    const note = prompt('Lead note', record.note || '');
    if (note === null) return;
    await mutate('lead', 'PATCH', { id, name, email, note });
  }
  if (action === 'delete-lead' && confirm('Delete lead?')) {
    await mutate('lead', 'DELETE', { id });
  }
  await refresh();
});

$('#view').addEventListener('submit', async (e) => {
  if (e.target.id === 'taskForm') {
    e.preventDefault();
    const fd = new FormData(e.target);
    await mutate('task', 'POST', { title: fd.get('title'), priority: fd.get('priority'), done: false });
    e.target.reset();
    await refresh();
  }
  if (e.target.id === 'leadForm') {
    e.preventDefault();
    const fd = new FormData(e.target);
    await mutate('lead', 'POST', { name: fd.get('name'), email: fd.get('email'), note: fd.get('note') });
    e.target.reset();
    await refresh();
  }
});

document.querySelectorAll('.nav button').forEach((btn) => btn.addEventListener('click', async () => {
  state.view = btn.dataset.view;
  render();
}));

async function refresh() {
  await loadData();
  render();
}

refresh();
`,
  };
}

module.exports = { buildHostedAppScaffold };
