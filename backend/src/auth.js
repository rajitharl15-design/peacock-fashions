import crypto from 'crypto';

export const ADMIN_COOKIE = 'peacock_admin';
export const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

let settings = null; // { username, password, secret }

export function setSettings(s) {
  settings = s || null;
}

export function getSettings() {
  return settings;
}

function envCreds() {
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    return { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS, secret: process.env.AUTH_SECRET || 'env-secret' };
  }
  return null;
}

function creds() {
  return settings || envCreds();
}

export function isConfigured() {
  return !!creds();
}

function secret() {
  return process.env.AUTH_SECRET || (creds() && creds().secret) || 'dev-secret';
}

export function newSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function signToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

export function verifyToken(token) {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch (e) {
    return null;
  }
  if (!data.u || data.exp < Date.now()) return null;
  return data.u;
}

export function getCookieValue(headers, name) {
  const raw = headers.cookie || '';
  const cookies = {};
  raw.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies[name];
}

export function verifyRequestAuth(headers) {
  return verifyToken(getCookieValue(headers, ADMIN_COOKIE)) || verifyToken(headers['x-admin-key']);
}

export function setAdminCookie(res, username) {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${encodeURIComponent(signToken(username))}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=43200`);
}

export function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(stored, input) {
  if (!stored) return false;
  if (String(stored).startsWith('scrypt$')) {
    const parts = String(stored).split('$');
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    if (!salt || !hash) return false;
    try {
      const h = crypto.scryptSync(String(input), salt, 64).toString('hex');
      const a = Buffer.from(h);
      const b = Buffer.from(hash);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (e) {
      return false;
    }
  }
  return String(stored) === String(input) ? 'legacy' : false;
}

export function isHashed(stored) {
  return !!stored && String(stored).startsWith('scrypt$');
}

export function requireAdmin(req, res, next) {
  const user = verifyRequestAuth(req.headers);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.adminUser = user;
  next();
}
