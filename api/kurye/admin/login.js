// api/kurye/admin/login.js
// POST { password } → doğruysa HttpOnly session cookie set eder.
import { checkPassword, signSession, sessionCookie } from '../../../lib/kurye-engine/adminAuth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  const expected = process.env.KURYE_ADMIN_PASSWORD;
  if (!secret || !expected) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const password = body && typeof body.password === 'string' ? body.password : '';

  if (!checkPassword(password, expected)) {
    return res.status(401).json({ ok: false, error: 'invalid_password' });
  }

  res.setHeader('Set-Cookie', sessionCookie(signSession(secret)));
  return res.status(200).json({ ok: true });
}
