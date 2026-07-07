// lib/kurye-engine/adminAuth.js
// Basit, stateless admin auth: şifre kontrolü + HMAC-imzalı session cookie.
// DB yok. Session anahtarı SHOPIFY_API_SECRET'tan türetilir (yeni env gerekmez).
import crypto from 'crypto';

const SESSION_TTL_SEC = 8 * 3600; // 8 saat
const COOKIE_NAME = 'kurye_admin';

// App Proxy secret'ından ayrık bir oturum anahtarı türet (amaç ayrımı)
function sessionKey(secret) {
  return crypto.createHmac('sha256', secret).update('kurye-admin-session').digest();
}

// Timing-safe şifre karşılaştırma
export function checkPassword(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// exp payload'lı imzalı token üret (base64url)
export function signSession(secret, ttlSec = SESSION_TTL_SEC) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `exp:${exp}`;
  const sig = crypto.createHmac('sha256', sessionKey(secret)).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

// Token doğrula: imza + süre
export function verifySession(token, secret) {
  if (typeof token !== 'string' || !token || !secret) return false;
  let decoded;
  try { decoded = Buffer.from(token, 'base64url').toString('utf8'); } catch { return false; }
  const dot = decoded.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = crypto.createHmac('sha256', sessionKey(secret)).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const m = /^exp:(\d+)$/.exec(payload);
  if (!m) return false;
  return Number(m[1]) > Math.floor(Date.now() / 1000);
}

// Cookie header'ından adı geçen cookie'yi çek
export function parseCookie(header, name = COOKIE_NAME) {
  if (typeof header !== 'string') return '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return '';
}

export function sessionCookie(token, ttlSec = SESSION_TTL_SEC) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/api/kurye/admin; Max-Age=${ttlSec}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/api/kurye/admin; Max-Age=0`;
}

export { COOKIE_NAME, SESSION_TTL_SEC };
