// api/kurye/admin/config.js
// Session korumalı config yönetimi:
//   GET  → { config, tree }  (mevcut config + Bursa ilçe/mahalle ağacı)
//   POST → { config }        (validate + KV'ye yaz)
import { verifySession, parseCookie } from '../../../lib/kurye-engine/adminAuth.js';
import { getConfig, setConfig } from '../../../lib/kurye-engine/config.js';
import bursaData from '../../../lib/kurye-engine/bursa-data.json' with { type: 'json' };

function hasSession(req) {
  const secret = process.env.SHOPIFY_API_SECRET;
  return verifySession(parseCookie(req.headers?.cookie), secret);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!hasSession(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const config = await getConfig({ useCache: false }); // admin daima taze görsün
      return res.status(200).json({ ok: true, config, tree: bursaData });
    } catch (err) {
      console.error('admin config GET:', err.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  }

  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const next = body && body.config;
    if (!next || typeof next !== 'object') {
      return res.status(400).json({ ok: false, error: 'config_required' });
    }
    try {
      const saved = await setConfig(next); // validate + KV yaz (geçersiz => throw)
      return res.status(200).json({ ok: true, config: saved });
    } catch (err) {
      if (err.code === 'INVALID_CONFIG') {
        return res.status(422).json({ ok: false, error: 'invalid_config', detail: err.message });
      }
      console.error('admin config POST:', err.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
