const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'app';
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function inferDomain(blueprint = {}) {
  const text = `${blueprint.title || ''} ${blueprint.tagline || ''} ${(blueprint.features || []).join(' ')}`.toLowerCase();
  if (/field|service|dispatch|ticket/.test(text)) return { label: 'Task', plural: 'Tasks', workflow: 'execution' };
  if (/shop|store|catalog|product/.test(text)) return { label: 'Order', plural: 'Orders', workflow: 'commerce' };
  if (/lead|sales|crm|pipeline/.test(text)) return { label: 'Lead', plural: 'Leads', workflow: 'pipeline' };
  if (/booking|appointment|calendar/.test(text)) return { label: 'Booking', plural: 'Bookings', workflow: 'scheduling' };
  return { label: 'Record', plural: 'Records', workflow: 'delivery' };
}

function detectModules(blueprint = {}) {
  const text = `${blueprint.title || ''} ${blueprint.tagline || ''} ${(blueprint.features || []).join(' ')} ${(blueprint.pages || []).join(' ')}`.toLowerCase();
  const modules = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'crud', label: 'CRUD' },
  ];
  if (/login|auth|register|account/.test(text)) modules.push({ id: 'auth', label: 'Authentication' });
  if (/notification|alert|inbox/.test(text)) modules.push({ id: 'notifications', label: 'Notifications' });
  if (/billing|pricing|invoice|subscription|stripe/.test(text)) modules.push({ id: 'billing', label: 'Billing' });
  if (/search|filter|find/.test(text)) modules.push({ id: 'search', label: 'Search' });
  if (/admin|approval|role|permission/.test(text)) modules.push({ id: 'admin', label: 'Admin' });
  if (/analytics|report|metric/.test(text)) modules.push({ id: 'analytics', label: 'Analytics' });
  if (/chat|message|support/.test(text)) modules.push({ id: 'messaging', label: 'Messaging' });
  if (/setting|preference|config/.test(text)) modules.push({ id: 'settings', label: 'Settings' });
  return unique(modules.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item));
}

function createSeed(title, blueprint, domain, modules) {
  const records = [
    { id: 1, title: `${domain.label} intake`, owner: 'Ops', status: 'planned', priority: 'high' },
    { id: 2, title: `${domain.label} implementation`, owner: 'Product', status: 'active', priority: 'high' },
    { id: 3, title: `${domain.label} launch review`, owner: 'QA', status: 'review', priority: 'medium' },
  ];
  const releaseGates = [
    'Functional app shell generated',
    'Interactive state flow works',
    'Verification script passes',
    'Build artifact created',
    'Backend lane scaffolded',
  ];
  return {
    project: {
      name: title,
      tagline: blueprint.tagline || `${title} ships as a real app slice.`,
      template: blueprint.template || 'saas',
      stack: blueprint.stack || ['Node', 'HTML', 'JSON API'],
    },
    session: modules.some((item) => item.id === 'auth')
      ? { user: { id: 'demo-owner', name: 'Demo Owner', email: 'owner@example.com', role: 'admin' }, token: 'demo-session-token' }
      : { user: null, token: null },
    items: records,
    milestones: releaseGates.map((title, index) => ({ id: index + 1, title, done: index < 2 })),
    notifications: [
      { id: 1, title: 'Factory run finished', tone: 'info' },
      { id: 2, title: `Modules ready: ${modules.map((item) => item.label).join(', ')}`, tone: 'success' },
    ],
    settings: [
      { id: 1, name: 'Theme', value: 'Dark premium' },
      { id: 2, name: 'Preview mode', value: 'Functional app shell' },
    ],
    billing: [
      { id: 1, plan: 'Starter', status: 'active', amount: '$49' },
      { id: 2, plan: 'Growth', status: 'draft', amount: '$199' },
    ],
    adminQueue: [
      { id: 1, title: 'Review generated roles', status: 'open' },
      { id: 2, title: 'Approve release checklist', status: 'pending' },
    ],
    deployment: {
      environment: 'preview',
      health: 'healthy',
      baseUrl: 'http://127.0.0.1:4173',
      lastDeployAt: new Date().toISOString(),
    },
    activity: [
      { id: 1, text: 'Seed workspace generated', when: 'just now' },
      { id: 2, text: 'Feature modules composed into app shell', when: 'just now' },
    ],
  };
}

function buildHtml(title, blueprint, domain, modules, seedJson, slug) {
  const safeTitle = escapeHtml(title);
  const safeTagline = escapeHtml(blueprint.tagline || `${title} ships as a real app slice.`);
  const featureCards = modules
    .map((feature) => `<article class="card"><span class="badge">${escapeHtml(feature.label)}</span><b>${escapeHtml(feature.label)} module</b><small>Generated from your brief by modular composition.</small></article>`)
    .join('');
  const navButtons = unique(['overview', 'workspace', 'records', ...modules.map((feature) => feature.id), 'release'])
    .map((view) => `<button class="tab${view === 'overview' ? ' active' : ''}" data-route="${view}">${escapeHtml(view === 'records' ? domain.plural : view === 'workspace' ? domain.workflow : view === 'overview' ? 'Overview' : view === 'release' ? 'Release' : modules.find((feature) => feature.id === view)?.label || view)}</button>`)
    .join('');
  const featureViews = modules.map((feature) => {
    if (feature.id === 'auth') {
      return `<section class="panel section view hidden" data-view="auth"><header><div><span class="eyebrow">Authentication</span><h2>Account access flow</h2></div></header><form id="auth-form" class="form"><div class="form-grid"><label><span class="muted">Email</span><input name="email" type="email" placeholder="owner@example.com" required /></label><label><span class="muted">Password</span><input name="password" type="password" placeholder="••••••••" required /></label></div><button class="primary" type="submit">Sign in</button></form><div class="cards"><article class="card"><b>Session status</b><small id="auth-session-copy">No active session yet.</small></article><article class="card"><b>Access policy</b><small>Demo auth is wired now and can be swapped to production auth later.</small></article></div></section>`;
    }
    if (feature.id === 'settings') return `<section class="panel section view hidden" data-view="settings"><header><div><span class="eyebrow">Settings</span><h2>Workspace preferences</h2></div></header><div class="list" id="settings-list"></div></section>`;
    if (feature.id === 'notifications') return `<section class="panel section view hidden" data-view="notifications"><header><div><span class="eyebrow">Notifications</span><h2>Alerts and delivery state</h2></div></header><div class="list" id="notifications-list"></div></section>`;
    if (feature.id === 'billing') return `<section class="panel section view hidden" data-view="billing"><header><div><span class="eyebrow">Billing</span><h2>Plans and invoices</h2></div></header><div class="cards" id="billing-grid"></div></section>`;
    if (feature.id === 'admin') return `<section class="panel section view hidden" data-view="admin"><header><div><span class="eyebrow">Admin</span><h2>Approvals and operations</h2></div></header><div class="list" id="admin-queue"></div></section>`;
    if (feature.id === 'search') return `<section class="panel section view hidden" data-view="search"><header><div><span class="eyebrow">Search</span><h2>Find and filter records</h2></div></header><input id="search-input" placeholder="Search records" /><div class="list" id="search-results"></div></section>`;
    if (feature.id === 'analytics') return `<section class="panel section view hidden" data-view="analytics"><header><div><span class="eyebrow">Analytics</span><h2>Trend and growth surface</h2></div></header><div class="cards"><article class="card"><b>Growth velocity</b><small>Generated analytics slice for future backend wiring.</small></article><article class="card"><b>Conversion summary</b><small>Metrics surface included from module detection.</small></article></div></section>`;
    if (feature.id === 'messaging') return `<section class="panel section view hidden" data-view="messaging"><header><div><span class="eyebrow">Messaging</span><h2>Conversation workflows</h2></div></header><div class="cards"><article class="card"><b>Inbox</b><small>Thread list surface generated.</small></article><article class="card"><b>Conversation state</b><small>Ready for real backend messaging later.</small></article></div></section>`;
    return `<section class="panel section view hidden" data-view="${feature.id}"><header><div><span class="eyebrow">${escapeHtml(feature.label)}</span><h2>${escapeHtml(feature.label)} module</h2></div></header><article class="card"><b>${escapeHtml(feature.label)}</b><small>Generated feature surface.</small></article></section>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root{--bg:#08110c;--panel:#0e1712;--panel-soft:#101d16;--card:#122119;--line:#203229;--text:#eef9f1;--muted:#92a99b;--accent:#b8ff3d;--accent-soft:rgba(184,255,61,.14);--cyan:#55f3dc;font-family:Inter,Arial,Helvetica,sans-serif}
    *{box-sizing:border-box} html,body{margin:0;min-height:100%;background:radial-gradient(circle at top,#102117 0%,var(--bg) 54%);color:var(--text)} body{min-height:100vh} button,input,select,textarea{font:inherit} button{cursor:pointer}
    .shell{min-height:100vh;display:grid;grid-template-rows:auto auto 1fr}.topbar{padding:20px clamp(18px,4vw,48px);display:flex;justify-content:space-between;align-items:center;gap:18px;border-bottom:1px solid var(--line);background:rgba(8,17,12,.88)}
    .brand strong,.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.22em;font-size:11px}.brand h1{margin:8px 0 0;font-size:clamp(28px,5vw,56px);line-height:.95}.brand p{margin:10px 0 0;color:var(--muted);max-width:720px;line-height:1.6}
    .status-chip,.panel{border:1px solid var(--line);background:rgba(14,23,18,.92)} .status-chip{padding:10px 12px;color:var(--muted);min-width:180px}.status-chip b{color:var(--text);display:block;margin-bottom:4px}
    .hero{padding:24px clamp(18px,4vw,48px);display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr);gap:18px}.hero-card{padding:22px;display:grid;gap:18px}.hero-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .metric,.card{border:1px solid var(--line);background:var(--panel-soft);padding:16px}.metric small{color:var(--muted);text-transform:uppercase;letter-spacing:.12em}.metric b{display:block;margin-top:8px;font-size:28px}
    .hero-actions,.nav{display:flex;gap:10px;flex-wrap:wrap}.primary,.secondary,.ghost,.tab{border:1px solid var(--line);padding:12px 14px;background:var(--panel);color:var(--text)}.primary{background:var(--accent);color:#07100b;border-color:var(--accent);font-weight:900;text-transform:uppercase}.secondary{color:var(--accent)}.ghost,.tab{background:transparent}.tab.active{background:var(--accent-soft);color:var(--accent)}
    .content{padding:0 clamp(18px,4vw,48px) 34px;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:18px}.stack,.section,.list,.checklist,.timeline{display:grid;gap:16px}.section{padding:20px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .badge{width:fit-content;padding:4px 8px;background:var(--accent-soft);color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:.14em}.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.wrap{flex-wrap:wrap;align-items:flex-start}
    .pill{padding:6px 10px;border:1px solid var(--line);color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:.12em}.pill.planned{color:#ffd36b}.pill.active{color:var(--cyan)}.pill.review{color:#ffb3ff}.pill.done{color:#88f7a1}.priority{color:var(--accent);font-size:12px}.progress{height:10px;background:#132219;border:1px solid var(--line)}.progress>span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--cyan))}
    .form,.form-grid{display:grid;gap:12px}.form-grid{grid-template-columns:repeat(2,minmax(0,1fr))} input,select,textarea{width:100%;padding:12px 13px;color:var(--text);background:#09120d;border:1px solid var(--line)} textarea{min-height:110px;resize:vertical}
    .check{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);background:var(--card);padding:12px}.check input{width:18px;height:18px;margin-top:2px;accent-color:var(--accent)} .timeline-item{padding:12px 14px;border-left:2px solid var(--accent);background:rgba(18,33,25,.72)} .hidden{display:none}.footer-note{color:var(--muted);padding:0 clamp(18px,4vw,48px) 28px}
    @media (max-width:1060px){.hero,.content{grid-template-columns:1fr}} @media (max-width:860px){.hero-grid,.cards,.form-grid{grid-template-columns:1fr 1fr}} @media (max-width:640px){.hero-grid,.cards,.form-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar"><div class="brand"><strong>Agent Generator V2</strong><h1>${safeTitle}</h1><p>${safeTagline}</p></div><div class="status-chip"><b>${escapeHtml(domain.plural)}</b><span id="sync-status">Connecting to backend API…</span></div></header>
    <section class="hero"><div class="panel hero-card"><span class="eyebrow">Live product surface</span><div class="hero-grid"><div class="metric"><small>Records</small><b id="metric-items">0</b></div><div class="metric"><small>Completed</small><b id="metric-done">0</b></div><div class="metric"><small>Open gates</small><b id="metric-gates">0</b></div><div class="metric"><small>Modules</small><b id="metric-modules">${modules.length}</b></div></div><div class="hero-actions"><button class="primary" data-route="overview">Overview</button><button class="secondary" data-route="workspace">Workspace</button><button class="secondary" data-route="release">Release</button></div></div><aside class="panel section"><header><div><span class="eyebrow">Detected modules</span><h2>Fast-clone composition</h2></div></header><div class="cards">${featureCards}</div></aside></section>
    <section class="content"><div class="stack"><nav class="nav panel section">${navButtons}</nav>
      <section class="panel section view" data-view="overview"><header><div><span class="eyebrow">Overview</span><h2>Whole app foundation, not a landing page</h2></div></header><div class="cards"><article class="card"><span class="badge">Dashboard</span><b>Operational summary</b><small>Metrics, progress, activity, and release state are interactive.</small></article><article class="card"><span class="badge">Workflow</span><b>${escapeHtml(domain.workflow)} pipeline</b><small>Create, move, and complete records inside the app.</small></article><article class="card"><span class="badge">Modules</span><b>${modules.length} composed features</b><small>Feature extraction created targeted product surfaces.</small></article><article class="card"><span class="badge">Release</span><b>Launch checklist</b><small>Gates, deploy defaults, and readiness scoring are included.</small></article></div><div><div class="row wrap"><b>Readiness progress</b><span class="muted" id="readiness-label">0 of 0 gates complete</span></div><div class="progress"><span id="readiness-bar" style="width:0%"></span></div></div></section>
      <section class="panel section view hidden" data-view="workspace"><header><div><span class="eyebrow">Workspace</span><h2>Run the core ${escapeHtml(domain.workflow)}</h2></div></header><form id="item-form" class="form"><div class="form-grid"><label><span class="muted">${escapeHtml(domain.label)} title</span><input name="title" placeholder="Add the next high-value ${escapeHtml(domain.label.toLowerCase())}" required /></label><label><span class="muted">Owner</span><input name="owner" placeholder="Product, Ops, Support..." required /></label><label><span class="muted">Status</span><select name="status"><option value="planned">Planned</option><option value="active">Active</option><option value="review">Review</option><option value="done">Done</option></select></label><label><span class="muted">Priority</span><select name="priority"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></div><button class="primary" type="submit">Create ${escapeHtml(domain.label)}</button></form><div class="list" id="workspace-list"></div></section>
      <section class="panel section view hidden" data-view="records"><header><div><span class="eyebrow">Records</span><h2>Milestones and domain data</h2></div></header><div class="cards" id="records-grid"></div></section>
      ${featureViews}
      <section class="panel section view hidden" data-view="release"><header><div><span class="eyebrow">Release center</span><h2>Verification and launch gating</h2></div></header><div class="cards" id="deploy-summary"></div><div class="checklist" id="release-checklist"></div></section>
    </div>
    <aside class="stack"><section class="panel section"><header><div><span class="eyebrow">Architecture</span><h2>Composed surfaces</h2></div></header><textarea readonly>${escapeHtml(JSON.stringify({ pages: blueprint.pages || [], stack: blueprint.stack || [], modules: modules.map((item) => item.id) }, null, 2))}</textarea></section><section class="panel section"><header><div><span class="eyebrow">Activity</span><h2>Recent changes</h2></div></header><div class="timeline" id="activity-feed"></div></section></aside></section>
    <p class="footer-note">Generated by Agent Generator V2. This workspace includes modular app logic, auth flow, backend CRUD/API wiring, deploy defaults, and release evidence.</p>
  </div>
<script>
const STORAGE_KEY = ${JSON.stringify('agent-generator-v2:' + slug)};
const initialState = ${seedJson};
const API_BASE = '/api';
let route = 'overview';
let searchValue = '';
let state = clone(initialState);
function clone(value){return JSON.parse(JSON.stringify(value))}
function persistLocal(){localStorage.setItem(STORAGE_KEY, JSON.stringify(state))}
function readLocal(){try{const saved=localStorage.getItem(STORAGE_KEY);return saved?JSON.parse(saved):clone(initialState)}catch{return clone(initialState)}}
function normalizeState(payload){const base=clone(initialState);const next=(payload&&typeof payload==='object')?payload:{};return{...base,...next,project:next.project??base.project,session:next.session??base.session,items:Array.isArray(next.items)?next.items:base.items,milestones:Array.isArray(next.milestones)?next.milestones:base.milestones,notifications:Array.isArray(next.notifications)?next.notifications:base.notifications,settings:Array.isArray(next.settings)?next.settings:base.settings,billing:Array.isArray(next.billing)?next.billing:base.billing,adminQueue:Array.isArray(next.adminQueue)?next.adminQueue:base.adminQueue,deployment:next.deployment??base.deployment,activity:Array.isArray(next.activity)?next.activity:base.activity}}
function syncLabel(message){const host=document.getElementById('sync-status');if(host)host.textContent=message}
function addActivity(text){state.activity.unshift({id:Date.now(),text,when:new Date().toLocaleString()});state.activity=state.activity.slice(0,12)}
function counts(){const doneItems=state.items.filter((item)=>item.status==='done').length;const closedGates=state.milestones.filter((gate)=>gate.done).length;const readiness=Math.round((closedGates/Math.max(state.milestones.length,1))*100);return{doneItems,closedGates,readiness}}
function setRoute(nextRoute){route=nextRoute;document.querySelectorAll('.tab').forEach((button)=>button.classList.toggle('active', button.dataset.route===nextRoute));document.querySelectorAll('.view').forEach((view)=>view.classList.toggle('hidden', view.dataset.view!==nextRoute))}
async function request(path, options={}){const response=await fetch(API_BASE+path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});if(!response.ok){const body=await response.json().catch(()=>({error:'Request failed'}));throw new Error(body.error||('HTTP '+response.status))}return response.json()}
async function loadRemoteState(){const remote=await request('/projects',{headers:{accept:'application/json'}});state=normalizeState(remote);persistLocal();syncLabel('Connected to backend API · state hydrated');render()}
async function saveProject(label){const remote=await request('/projects',{method:'PUT',body:JSON.stringify(state)});state=normalizeState(remote);persistLocal();syncLabel(label+' · saved to backend API');render();return remote}
async function createCheckpoint(label){await request('/checkpoints',{method:'POST',body:JSON.stringify({label,state})});syncLabel(label+' · checkpoint stored')}
async function signIn(email,password){const session=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});state.session=session;addActivity('Authenticated as '+session.user.name);await saveProject('Session updated');return session}
function renderMetrics(){const summary=counts();document.getElementById('metric-items').textContent=String(state.items.length);document.getElementById('metric-done').textContent=String(summary.doneItems);document.getElementById('metric-gates').textContent=String(state.milestones.length-summary.closedGates);document.getElementById('readiness-bar').style.width=summary.readiness+'%';document.getElementById('readiness-label').textContent=summary.closedGates+' of '+state.milestones.length+' gates complete'}
function renderWorkspace(){const host=document.getElementById('workspace-list');if(!host)return;host.innerHTML='';state.items.forEach((item)=>{const row=document.createElement('div');row.className='card';row.innerHTML=['<div class="row wrap">','<div><b>'+item.title+'</b><div class="muted">Owner: '+item.owner+'</div></div>','<div class="row"><span class="pill '+item.status+'">'+item.status+'</span><span class="priority">'+item.priority+' priority</span></div>','</div>','<div class="row wrap"><button class="ghost" data-action="advance" data-id="'+item.id+'">Advance</button><button class="ghost" data-action="remove" data-id="'+item.id+'">Remove</button></div>'].join('');host.appendChild(row)})}
function renderRecords(){const host=document.getElementById('records-grid');if(!host)return;host.innerHTML=state.milestones.map((milestone)=>['<article class="card">','<span class="badge">Milestone</span>','<b>'+milestone.title+'</b>','<small>'+(milestone.done?'Complete':'Still open')+'</small>','<button class="ghost" data-action="toggle-milestone" data-id="'+milestone.id+'">'+(milestone.done?'Mark open':'Mark done')+'</button>','</article>'].join('')).join('')}
function renderRelease(){const host=document.getElementById('release-checklist');if(!host)return;host.innerHTML=state.milestones.map((gate,index)=>['<label class="check">','<input type="checkbox" data-action="gate" data-index="'+index+'" '+(gate.done?'checked':'')+' />','<div><b>'+gate.title+'</b><div class="muted">Required before shipping the generated app.</div></div>','</label>'].join('')).join('')}
function renderDeploy(){const host=document.getElementById('deploy-summary');if(!host||!state.deployment)return;host.innerHTML=['<article class="card"><span class="badge">Deploy</span><b>'+state.deployment.environment+'</b><small>'+state.deployment.baseUrl+'</small></article>','<article class="card"><span class="badge">Health</span><b>'+state.deployment.health+'</b><small>Last deploy: '+new Date(state.deployment.lastDeployAt).toLocaleString()+'</small></article>'].join('')}
function renderActivity(){const host=document.getElementById('activity-feed');if(!host)return;host.innerHTML=state.activity.map((item)=>['<div class="timeline-item">','<b>'+item.text+'</b>','<div class="muted">'+item.when+'</div>','</div>'].join('')).join('')}
function renderAuth(){const host=document.getElementById('auth-session-copy');if(!host)return;host.textContent=state.session?.user?state.session.user.email+' · '+state.session.user.role:'No active session yet.'}
function renderSettings(){const host=document.getElementById('settings-list');if(!host)return;host.innerHTML=state.settings.map((entry)=>'<div class="card"><b>'+entry.name+'</b><small>'+entry.value+'</small></div>').join('')}
function renderNotifications(){const host=document.getElementById('notifications-list');if(!host)return;host.innerHTML=state.notifications.map((entry)=>'<div class="card"><b>'+entry.title+'</b><small>'+entry.tone+'</small></div>').join('')}
function renderBilling(){const host=document.getElementById('billing-grid');if(!host)return;host.innerHTML=state.billing.map((entry)=>'<article class="card"><span class="badge">'+entry.status+'</span><b>'+entry.plan+'</b><small>'+entry.amount+'</small></article>').join('')}
function renderAdmin(){const host=document.getElementById('admin-queue');if(!host)return;host.innerHTML=state.adminQueue.map((entry)=>'<div class="card"><b>'+entry.title+'</b><small>'+entry.status+'</small></div>').join('')}
function renderSearch(){const host=document.getElementById('search-results');if(!host)return;const filtered=state.items.filter((item)=>!searchValue||item.title.toLowerCase().includes(searchValue)||item.owner.toLowerCase().includes(searchValue));host.innerHTML=filtered.map((item)=>'<div class="card"><b>'+item.title+'</b><small>'+item.owner+' · '+item.status+'</small></div>').join('')||'<div class="card"><b>No matches</b><small>Try another query.</small></div>'}
function render(){renderMetrics();renderWorkspace();renderRecords();renderRelease();renderDeploy();renderActivity();renderAuth();renderSettings();renderNotifications();renderBilling();renderAdmin();renderSearch();persistLocal()}
document.addEventListener('click',async(event)=>{const target=event.target;if(!(target instanceof HTMLElement))return;const routeTarget=target.closest('[data-route]');if(routeTarget instanceof HTMLElement)setRoute(routeTarget.dataset.route||'overview');const actionTarget=target.closest('[data-action]');if(!(actionTarget instanceof HTMLElement))return;const action=actionTarget.dataset.action;const id=Number(actionTarget.dataset.id);try{if(action==='advance'){const item=state.items.find((entry)=>entry.id===id);if(!item)return;const order=['planned','active','review','done'];const nextStatus=order[Math.min(order.indexOf(item.status)+1, order.length-1)];const remote=await request('/records/'+id,{method:'PATCH',body:JSON.stringify({status:nextStatus})});state.items=Array.isArray(remote.items)?remote.items:state.items;addActivity(item.title+' moved to '+nextStatus);await saveProject('Record advanced')}if(action==='remove'){const removed=state.items.find((entry)=>entry.id===id);await request('/records/'+id,{method:'DELETE'});state.items=state.items.filter((entry)=>entry.id!==id);addActivity((removed?.title||'${domain.label}')+' removed from queue');await saveProject('Record removed')}if(action==='toggle-milestone'){const milestone=state.milestones.find((entry)=>entry.id===id);if(!milestone)return;milestone.done=!milestone.done;addActivity(milestone.title+' '+(milestone.done?'completed':'reopened'));await saveProject('Milestone updated')}if(action==='gate'){const index=Number(actionTarget.dataset.index);if(state.milestones[index]){state.milestones[index].done=!state.milestones[index].done;addActivity(state.milestones[index].title+' '+(state.milestones[index].done?'passed':'reopened'));await saveProject('Release gate updated');if(state.milestones[index].done)await createCheckpoint(state.milestones[index].title)}}}catch(error){syncLabel(error instanceof Error?error.message:'Update failed')}});
const form=document.getElementById('item-form');if(form)form.addEventListener('submit',async(event)=>{event.preventDefault();const currentTarget=event.currentTarget;if(!(currentTarget instanceof HTMLFormElement))return;const data=new FormData(currentTarget);const title=String(data.get('title')||'').trim();const owner=String(data.get('owner')||'').trim();const status=String(data.get('status')||'planned');const priority=String(data.get('priority')||'medium');if(!title||!owner)return;try{const remote=await request('/records',{method:'POST',body:JSON.stringify({title,owner,status,priority})});state.items=Array.isArray(remote.items)?remote.items:state.items;addActivity(title+' created in the ${domain.workflow} flow');currentTarget.reset();await saveProject('Record created');setRoute('workspace')}catch(error){syncLabel(error instanceof Error?error.message:'Create failed')}});
const authForm=document.getElementById('auth-form');if(authForm)authForm.addEventListener('submit',async(event)=>{event.preventDefault();const currentTarget=event.currentTarget;if(!(currentTarget instanceof HTMLFormElement))return;const data=new FormData(currentTarget);const email=String(data.get('email')||'').trim();const password=String(data.get('password')||'').trim();if(!email||!password)return;try{await signIn(email,password);currentTarget.reset()}catch(error){syncLabel(error instanceof Error?error.message:'Sign-in failed')}});
const searchInput=document.getElementById('search-input');if(searchInput instanceof HTMLInputElement){searchInput.addEventListener('input',()=>{searchValue=searchInput.value.trim().toLowerCase();renderSearch()})}
(async()=>{state=normalizeState(readLocal());render();setRoute(route);try{await loadRemoteState()}catch{syncLabel('Backend API unavailable · using local fallback')}})();
</script>
</body>
</html>`;
}

function buildHostedAppScaffold(agent) {
  const blueprint = agent.blueprint || {};
  const slug = agent.slug || slugify(agent.name || blueprint.title || 'app');
  const title = agent.name || blueprint.title || 'App';
  const domain = inferDomain(blueprint);
  const modules = detectModules(blueprint);
  const seed = createSeed(title, blueprint, domain, modules);
  const seedJson = JSON.stringify(seed, null, 2);
  const apiContract = {
    app: title,
    target: 'web',
    domain,
    modules,
    endpoints: [
      { method: 'POST', path: '/api/auth/login', purpose: 'Create a session for the generated app' },
      { method: 'GET', path: '/api/projects', purpose: 'Load current project state' },
      { method: 'PUT', path: '/api/projects', purpose: 'Persist project state' },
      { method: 'GET', path: '/api/records', purpose: 'List domain records' },
      { method: 'POST', path: '/api/records', purpose: 'Create domain record' },
      { method: 'PATCH', path: '/api/records/:id', purpose: 'Update domain record' },
      { method: 'DELETE', path: '/api/records/:id', purpose: 'Delete domain record' },
      { method: 'GET', path: '/api/checkpoints', purpose: 'List checkpoints' },
      { method: 'POST', path: '/api/checkpoints', purpose: 'Create checkpoint' },
      { method: 'GET', path: '/api/health', purpose: 'Backend health probe' },
    ],
  };

  return {
    'README.md': `# ${title}\n\n${blueprint.tagline || `${title} ships as a real app slice.`}\n\n## Included\n\n- Interactive overview dashboard\n- Stateful ${domain.workflow} flow\n- ${domain.plural} manager with API-backed CRUD persistence\n- Detected product modules: ${modules.map((item) => item.label).join(', ')}\n- Auth flow, backend lane contract, schema, and runnable JSON API\n- Deploy defaults: Dockerfile, env template, Compose file, and release notes\n\n## Run\n\n\`\`\`bash\nnpm test\nnpm run build\nnpm start\n\`\`\`\n\n## Notes\n\nThe generated workspace boots with a runnable backend JSON API (\`/api/auth/login\`, \`/api/projects\`, \`/api/records\`, \`/api/checkpoints\`) and keeps \`localStorage\` only as an offline fallback.\n`,
    'package.json': JSON.stringify({
      name: slug,
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: {
        start: 'node scripts/serve.mjs',
        dev: 'node scripts/serve.mjs',
        test: 'node scripts/verify.mjs',
        build: 'node scripts/build.mjs',
      },
    }, null, 2),
    '.env.example': `PORT=4173\nAPP_BASE_URL=http://127.0.0.1:4173\nSESSION_SECRET=change-me\n`,
    'Dockerfile': `FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nEXPOSE 4173\nCMD ["node", "scripts/serve.mjs"]\n`,
    'docker-compose.yml': `services:\n  app:\n    build: .\n    ports:\n      - "4173:4173"\n    env_file:\n      - .env.example\n`,
    'app.config.json': JSON.stringify({ name: title, slug, blueprint, modules, generatedAt: new Date().toISOString() }, null, 2),
    'index.html': buildHtml(title, blueprint, domain, modules, seedJson, slug),
    'data/seed.json': seedJson,
    'data/modules.json': JSON.stringify(modules, null, 2),
    'backend/schema.sql': `-- Backend lane for ${title}\n\nCREATE TABLE users (\n  id TEXT PRIMARY KEY,\n  email TEXT NOT NULL UNIQUE,\n  role TEXT NOT NULL DEFAULT 'member',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE ${domain.label.toLowerCase()}_records (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'planned',\n  owner_id TEXT,\n  metadata TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE activity_events (\n  id TEXT PRIMARY KEY,\n  type TEXT NOT NULL,\n  message TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE release_checkpoints (\n  id TEXT PRIMARY KEY,\n  label TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'open',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n`,
    'backend/api-contract.json': JSON.stringify(apiContract, null, 2),
    'backend/README.md': `# Backend Lane\n\nThis app ships with a backend-ready contract so the generated product can move off local-only state.\n\n## What is generated\n\n- SQL schema for users, domain records, activity events, and release checkpoints\n- API contract for auth, project, record, and checkpoint operations\n- Local JSON persistence for running the generated app immediately\n- Health endpoint placeholder for deployment checks\n\n## Next step\n\nSwap the JSON persistence layer for your production database/hosting stack while preserving the same API contract.\n`,
    'backend/state.json': seedJson,
    'backend/checkpoints.json': JSON.stringify([], null, 2),
    'docs/architecture.md': `# ${title} Architecture\n\n## Product brief\n\n${blueprint.tagline || `${title} ships as a functional app shell.`}\n\n## Detected modules\n\n${modules.map((item) => `- ${item.label}`).join('\n')}\n\n## Domain model\n\n- ${domain.label}\n- Milestone\n- Verification gate\n- Session\n- Deployment status\n`,
    'docs/composition.json': JSON.stringify({ blueprint, domain, modules }, null, 2),
    'scripts/verify.mjs': `import { existsSync, readFileSync } from 'node:fs';\nconst required = ['index.html','package.json','app.config.json','data/seed.json','data/modules.json','.env.example','Dockerfile','docker-compose.yml','backend/schema.sql','backend/api-contract.json','backend/README.md','backend/state.json','backend/checkpoints.json','docs/architecture.md','docs/composition.json'];\nconst missing = required.filter((file) => !existsSync(file));\nif (missing.length) { console.error('Missing required files:', missing.join(', ')); process.exit(1); }\nconst html = readFileSync('index.html', 'utf8');\nfor (const needle of [${JSON.stringify(title)}, 'Fast-clone composition', 'Backend Lane', "request('/projects'", "request('/records'", "request('/auth/login'"]) {\n  if (!html.includes(needle)) { console.error('index.html is missing:', needle); process.exit(1); }\n}\nconsole.log('Agent Generator V2 scaffold verification passed.');\n`,
    'scripts/build.mjs': `import { cpSync, existsSync, mkdirSync } from 'node:fs';\nmkdirSync('dist', { recursive: true });\nfor (const path of ['index.html','app.config.json','data','backend','docs','.env.example','Dockerfile','docker-compose.yml']) {\n  if (existsSync(path)) cpSync(path, 'dist/' + path, { recursive: true });\n}\nconsole.log('Built dist application bundle');\n`,
    'scripts/serve.mjs': `import { createServer } from 'node:http';\nimport { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';\nimport { URL } from 'node:url';\n\nconst port = Number(process.env.PORT ?? 4173);\nconst html = readFileSync('index.html');\nconst statePath = 'backend/state.json';\nconst checkpointsPath = 'backend/checkpoints.json';\nconst seedPath = 'data/seed.json';\n\nfunction ensureBackendFiles() {\n  mkdirSync('backend', { recursive: true });\n  if (!existsSync(statePath)) writeFileSync(statePath, readFileSync(seedPath, 'utf8'));\n  if (!existsSync(checkpointsPath)) writeFileSync(checkpointsPath, '[]\\n');\n}\nfunction readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }\nfunction writeJson(path, data) { writeFileSync(path, JSON.stringify(data, null, 2)); }\nfunction readState() { ensureBackendFiles(); return readJson(statePath); }\nfunction writeState(next) { ensureBackendFiles(); writeJson(statePath, next); return next; }\nfunction readCheckpoints() { ensureBackendFiles(); return readJson(checkpointsPath); }\nfunction writeCheckpoints(next) { ensureBackendFiles(); writeJson(checkpointsPath, next); return next; }\nfunction sendJson(response, status, body) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); }\nasync function readBody(request) { const chunks = []; for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); if (!chunks.length) return {}; return JSON.parse(Buffer.concat(chunks).toString('utf8')); }\ncreateServer(async (request, response) => {\n  const method = request.method || 'GET';\n  const url = new URL(request.url || '/', 'http://127.0.0.1:' + port);\n  try {\n    if (method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true });\n    if (method === 'POST' && url.pathname === '/api/auth/login') {\n      const body = await readBody(request);\n      const session = { user: { id: 'user-1', name: String(body.email || 'owner@example.com').split('@')[0] || 'owner', email: String(body.email || 'owner@example.com'), role: 'admin' }, token: 'session-' + Date.now() };\n      const state = readState(); state.session = session; writeState(state); return sendJson(response, 200, session);\n    }\n    if (method === 'GET' && url.pathname === '/api/projects') return sendJson(response, 200, readState());\n    if (method === 'PUT' && url.pathname === '/api/projects') return sendJson(response, 200, writeState(await readBody(request)));\n    if (method === 'GET' && url.pathname === '/api/records') return sendJson(response, 200, { items: readState().items ?? [] });\n    if (method === 'POST' && url.pathname === '/api/records') {\n      const body = await readBody(request); const state = readState();\n      const item = { id: Date.now(), title: String(body.title || 'Untitled').trim(), owner: String(body.owner || 'Team').trim(), status: String(body.status || 'planned'), priority: String(body.priority || 'medium') };\n      state.items = [item, ...(Array.isArray(state.items) ? state.items : [])]; writeState(state); return sendJson(response, 201, { item, items: state.items });\n    }\n    if ((method === 'PATCH' || method === 'DELETE') && url.pathname.startsWith('/api/records/')) {\n      const id = Number(url.pathname.split('/').pop()); const state = readState(); const items = Array.isArray(state.items) ? state.items : [];\n      if (method === 'DELETE') { state.items = items.filter((entry) => Number(entry.id) !== id); writeState(state); return sendJson(response, 200, { items: state.items }); }\n      const body = await readBody(request); state.items = items.map((entry) => Number(entry.id) === id ? { ...entry, ...body } : entry); writeState(state); return sendJson(response, 200, { items: state.items });\n    }\n    if (method === 'GET' && url.pathname === '/api/checkpoints') return sendJson(response, 200, readCheckpoints());\n    if (method === 'POST' && url.pathname === '/api/checkpoints') {\n      const body = await readBody(request); const checkpoints = readCheckpoints();\n      const checkpoint = { id: Date.now(), label: String(body.label || 'Manual checkpoint'), createdAt: new Date().toISOString(), state: body.state || readState() };\n      checkpoints.unshift(checkpoint); writeCheckpoints(checkpoints.slice(0, 25)); return sendJson(response, 201, checkpoint);\n    }\n    if (method === 'GET' && url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html); return; }\n    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: 'Not found' }));\n  } catch (error) { sendJson(response, 500, { error: error instanceof Error ? error.message : 'Server failed' }); }\n}).listen(port, '127.0.0.1', () => console.log('Preview running on http://127.0.0.1:' + port));\n`,
  };
}

module.exports = { buildHostedAppScaffold };
