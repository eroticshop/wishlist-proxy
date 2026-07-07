import crypto from 'crypto';

export function verifyAppProxySignature(query, secret) {
  if (!query || typeof query !== 'object' || !secret) return false;
  const signature = query.signature;
  if (!signature || typeof signature !== 'string') return false;

  const message = Object.keys(query)
    .filter((k) => k !== 'signature')
    .map((k) => {
      const v = query[k];
      return `${k}=${Array.isArray(v) ? v.join(',') : v}`;
    })
    .sort()
    .join('');

  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');

  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function authenticateProxyRequest(query, { secret, maxAgeSec = 90, requireLogin = true } = {}) {
  if (!verifyAppProxySignature(query, secret)) {
    return { ok: false, status: 401, error: 'invalid_signature' };
  }
  const ts = parseInt(query.timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > maxAgeSec) {
    return { ok: false, status: 401, error: 'stale_timestamp' };
  }
  const customerId = String(query.logged_in_customer_id || '').trim();
  if (!customerId) {
    return { ok: false, status: 403, error: 'not_logged_in' };
  }
  return { ok: true, customerId, shop: String(query.shop || '') };
}
