const $ = (s) => document.querySelector(s);
const slug = location.pathname.split('/').filter(Boolean).pop();
const key = new URLSearchParams(location.search).get('key');
const visitorKey = localStorage.getItem('agt-visitor') || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
localStorage.setItem('agt-visitor', visitorKey);
let agent = null;
const history = [];

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function addMessage(role, content) {
  const el = document.createElement('div');
  el.className = 'item';
  el.style.background = role === 'assistant' ? '#fff' : '#eef2ff';
  const safe = String(content).replace(/</g, '&lt;');
  const feedback = role === 'assistant' ? '<div class="actions" style="margin-top:8px;"><button class="btn secondary tiny" data-feedback="good">👍</button><button class="btn secondary tiny" data-feedback="bad">👎</button></div>' : '';
  el.innerHTML = `<strong>${role === 'assistant' ? agent.name : 'Du'}:</strong> ${safe}${feedback}`;
  $('#messages').appendChild(el);
}

async function loadAgent() {
  const data = await api(`/api/public/agent/${slug}?key=${encodeURIComponent(key || '')}`);
  agent = data.agent;
  document.title = agent.name;
  $('#title').textContent = agent.name;
  $('#subtitle').textContent = agent.description;
  $('#info').innerHTML = `
    <div class="item"><strong>Business:</strong> ${agent.businessType}</div>
    <div class="item"><strong>Sprache:</strong> ${agent.language}</div>
    <div class="item"><strong>Messages:</strong> ${agent.stats.messages}</div>
    <div class="item"><strong>Conversations:</strong> ${agent.stats.conversations}</div>
    <div class="item"><strong>Autolearn:</strong> ${agent.learningProfile?.enabled ? 'on' : 'off'}</div>
    <div class="item"><strong>Learning:</strong> ${agent.learningProfile?.summary || '—'}</div>
    <div class="item"><strong>Key:</strong> ${key ? 'OK' : 'missing'}</div>
  `;
  addMessage('assistant', 'Hallo! Wie kann ich helfen?');
}

$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;
  history.push({ role: 'user', content: message });
  addMessage('user', message);
  input.value = '';
  input.focus();
  const loading = document.createElement('div');
  loading.className = 'item';
  loading.textContent = '… denkt';
  $('#messages').appendChild(loading);
  try {
    const data = await api(`/api/public/agent/${slug}/chat?key=${encodeURIComponent(key || '')}`, {
      method: 'POST',
      body: JSON.stringify({ message, visitorId: visitorKey }),
    });
    loading.remove();
    history.push({ role: 'assistant', content: data.response });
    addMessage('assistant', data.response);
  } catch (err) {
    loading.textContent = err.message;
  }
});

$('#messages').addEventListener('click', async (e) => {
  const rating = e.target?.dataset?.feedback;
  if (!rating) return;
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')?.content || '';
  try {
    await api(`/api/public/agent/${slug}/feedback?key=${encodeURIComponent(key || '')}`, {
      method: 'POST',
      body: JSON.stringify({ rating, message: lastUser, reply: lastAssistant, visitorId: visitorKey }),
    });
  } catch (err) {
    alert(err.message);
  }
});

loadAgent().catch((err) => {
  $('#subtitle').textContent = err.message;
  $('#messages').innerHTML = `<div class="item">Fehler: ${err.message}</div>`;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
