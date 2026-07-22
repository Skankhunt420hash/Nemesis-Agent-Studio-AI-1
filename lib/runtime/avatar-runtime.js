const fs = require('fs');
const path = require('path');

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function colorFrom(text = '') {
  let hash = 0;
  for (const ch of String(text)) hash = ((hash << 5) - hash) + ch.charCodeAt(0);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 55%)`;
}

function buildAvatarSvg(agent) {
  const prompt = agent?.avatarState?.currentPrompt || `${agent.name} digital avatar`;
  const look = agent?.avatarState?.look || 'digital operator';
  const primary = colorFrom(agent.slug || agent.name || 'agent');
  const secondary = colorFrom(`${agent.slug || agent.name || 'agent'}:secondary`);
  const initials = String(agent.name || 'A').split(/\s+/).map((v) => v[0]).join('').slice(0, 2).toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${esc(agent.name)} avatar">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${secondary}" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="120" fill="url(#bg)"/>
  <circle cx="512" cy="388" r="184" fill="rgba(255,255,255,0.18)"/>
  <rect x="250" y="590" width="524" height="220" rx="110" fill="rgba(15,23,42,0.35)"/>
  <text x="512" y="448" text-anchor="middle" font-size="160" font-family="Inter,Arial,sans-serif" font-weight="800" fill="white">${esc(initials)}</text>
  <text x="512" y="878" text-anchor="middle" font-size="38" font-family="Inter,Arial,sans-serif" fill="rgba(255,255,255,0.92)">${esc(look.slice(0, 42))}</text>
  <metadata>${esc(prompt)}</metadata>
</svg>`;
}

function ensureAvatarAsset(agent, generatedDir) {
  const rel = `/generated/avatars/${agent.slug}.svg`;
  const dir = path.join(generatedDir, 'avatars');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${agent.slug}.svg`), buildAvatarSvg(agent));
  agent.avatarState ||= {};
  agent.avatarState.assetUrl = rel;
  return rel;
}

module.exports = { ensureAvatarAsset, buildAvatarSvg };
