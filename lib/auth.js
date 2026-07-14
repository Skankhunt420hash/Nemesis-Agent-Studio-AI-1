const crypto = require('crypto');

const COOKIE_NAME = 'aggtok';

function pbkdf2(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${pbkdf2(password, salt)}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = pbkdf2(password, salt);
  if (hash.length !== candidate.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function buildCookie(token, maxAgeSeconds = 60 * 60 * 24 * 14) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function clearCookie() {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  createToken,
  tokenHash,
  parseCookies,
  buildCookie,
  clearCookie,
};
