/**
 * EroticShop — Kurye Quote  v1.0
 * Vercel Serverless Function · App Proxy üzerinden çağrılır (same-origin):
 *   POST /apps/hesap/kurye/quote
 *   body: { lat, lon, weight_tier, mahalle_id? }
 *   → { ok, result }   result: exact | range | needs_location | kargo
 *
 * Güvenlik modeli (wishlist.js v3.0 ile aynı çekirdek):
 *  • Kimlik: HMAC imzalı App Proxy isteği. Fiyat hesaplayıcı MİSAFİRLERE açık
 *    olduğundan requireLogin:false (imza yine doğrulanır, login zorunlu değil).
 *  • Fiyata etki eden her şey SERVER-SIDE: coverage/override/tarife config'ten
 *    okunur; client yalnız konum + ağırlık dilimi + mahalle_id gönderir.
 *  • config: lib/kurye-engine/config.js (KV + fallback + cache).
 */
import { authenticateProxyRequest } from '../../lib/verifyAppProxy.js';
import { getConfig } from '../../lib/kurye-engine/config.js';
import { resolveQuote } from '../../lib/kurye-engine/resolve.js';

// Bursa bounding-box: il dışı/saçma koordinatlara karşı guard (abuse önleme)
const BURSA_BBOX = { minLat: 39.6, maxLat: 40.7, minLon: 28.3, maxLon: 30.1 };

function inBursaBBox(lat, lon) {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= BURSA_BBOX.minLat && lat <= BURSA_BBOX.maxLat &&
    lon >= BURSA_BBOX.minLon && lon <= BURSA_BBOX.maxLon
  );
}

export default async function handler(req, res) {
  // Kimlik: App Proxy HMAC. Public hesaplayıcı => requireLogin:false
  const auth = authenticateProxyRequest(req.query, {
    secret: process.env.SHOPIFY_API_SECRET,
    requireLogin: false,
  });
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); // fiyat dinamik, cache'lenmez

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Toleranslı body parse (wishlist deseni: ham string gelebilir)
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const weightTier = typeof body.weight_tier === 'string' ? body.weight_tier : '';
  const mahalleId = body.mahalle_id != null ? String(body.mahalle_id) : '';
  const lat = typeof body.lat === 'number' ? body.lat : null;
  const lon = typeof body.lon === 'number' ? body.lon : null;

  try {
    const config = await getConfig(); // KV erişilemezse DEFAULT_CONFIG fallback

    // weight_tier whitelist (config'ten — enum dışı reddedilir)
    const validTier = config.weight.tiers.some((t) => t.key === weightTier);
    if (!validTier) {
      return res.status(400).json({ ok: false, error: 'invalid_weight_tier' });
    }

    // Koordinat guard: point modu kesin fiyat için lat/lon şart
    if (lat === null || lon === null) {
      return res.status(400).json({ ok: false, error: 'coords_required' });
    }
    if (!inBursaBBox(lat, lon)) {
      return res.status(400).json({ ok: false, error: 'coords_out_of_bounds' });
    }

    // Coverage + override SERVER-SIDE (client'a asla güvenme)
    const coverage = config.coverage || {};
    const mahalleIds = Array.isArray(coverage.mahalle_ids) ? coverage.mahalle_ids : [];
    const inCoverage = mahalleId ? mahalleIds.includes(mahalleId) : false;

    const overrides = config.overrides || {};
    const hasOverride = mahalleId && typeof overrides[mahalleId] === 'number';

    const result = resolveQuote(
      {
        mode: 'point',
        lat,
        lon,
        weight_tier: weightTier,
        in_courier_coverage: inCoverage,
        ...(hasOverride ? { override: overrides[mahalleId] } : {}),
      },
      config
    );

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error('kurye quote error:', err.message);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
