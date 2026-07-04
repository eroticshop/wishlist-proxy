/**
 * EroticShop — Wishlist Proxy  v3.0
 * Vercel Serverless Function · Node.js 18+
 *
 * App Proxy üzerinden çağrılır (same-origin — CORS katmanı kaldırıldı):
 *   GET  /apps/hesap/wishlist   → { ok, items: [...] }
 *   POST /apps/hesap/wishlist   → body: { ops: [{ op, productId, handle, ts }, ...] }
 *        op: "add" | "remove" | "clear"
 *
 * Güvenlik modeli (api/cart.js v2.0 + api/account/addresses.js ile aynı):
 *  • Kimlik: HMAC imzalı App Proxy isteğindeki logged_in_customer_id.
 *    Client'tan customerId parametresi ALINMAZ (v2.0 deseni kaldırıldı —
 *    başka müşterinin favorisi okunamaz/yazılamaz).
 *  • Admin API: lib/shopifyAdmin.js (SHOPIFY_API_VERSION = 2026-01,
 *    GraphQL yalnız variables ile — string interpolation yok).
 *  • Yazma: metafieldsSet (customerUpdate-içi metafield deseni 2026-01'de yok).
 *
 * Metafield: namespace="custom", key="wishlist", type="json" — v2.0 ile birebir
 * aynı adres; mevcut favori verisi korunur, veri migrasyonu gerekmez.
 *
 * v2.0'dan kaldırılanlar:
 *  • CORS (setCORS, OPTIONS, ALLOWED_ORIGIN bağımlılığı) — App Proxy same-origin
 *  • Legacy action formatı (add/remove/merge/clear switch) — tema v2 engine
 *    yalnız ops batch gönderiyor, login merge client-side hesaplanıyor (ölü kod)
 *  • Hardcoded 2024-04 GraphQL URL ve yerel gql() helper'ı
 */
import { authenticateProxyRequest } from '../lib/verifyAppProxy.js';
import { shopifyAdminGraphQL, toCustomerGID } from '../lib/shopifyAdmin.js';

const MAX_ITEMS = 100;

/* ── GraphQL ── */
const Q_READ = `
  query WishlistRead($id: ID!) {
    customer(id: $id) {
      metafield(namespace: "custom", key: "wishlist") { value }
    }
  }
`;

const M_WRITE = `
  mutation WishlistWrite($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message code }
    }
  }
`;

/* ── Metafield oku ── */
async function readWishlist(customerGID) {
  const data = await shopifyAdminGraphQL(Q_READ, { id: customerGID });
  const raw = data && data.customer && data.customer.metafield
    ? data.customer.metafield.value
    : null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // Bozuk JSON → boş liste (ilk yazımda düzelir)
  }
}

/* ── Metafield yaz ── */
async function writeWishlist(customerGID, items) {
  const data = await shopifyAdminGraphQL(M_WRITE, {
    metafields: [{
      ownerId:   customerGID,
      namespace: 'custom',
      key:       'wishlist',
      type:      'json',
      value:     JSON.stringify(items),
    }],
  });
  const ue = data && data.metafieldsSet ? data.metafieldsSet.userErrors : null;
  if (ue && ue.length) {
    const err = new Error(ue[0].message);
    err.validation = true;
    throw err;
  }
}

/* ── Ops reducer (saf fonksiyon — yan etkisiz, test edilebilir) ──
   v2.0 batch semantiği birebir korunur:
   • add: pid yoksa ve MAX_ITEMS altındaysa ekle; varsa/aşımdaysa sessizce atla
     (client optimistic update yaptı, batch'te hata dönmek anlamsız)
   • remove: pid'i filtrele
   • clear: listeyi boşalt
   • Geçersiz op / sayısal olmayan pid → sessizce atla                        */
export function applyOps(current, ops) {
  let list = current.slice();
  for (const o of ops) {
    if (!o || typeof o !== 'object') continue;
    const opName = o.op || o.action; // eski client uyumu: action alias'ı
    const pid    = o.productId != null ? String(o.productId) : '';

    if (opName === 'add' && /^\d+$/.test(pid)) {
      const exists = list.some((i) => String(i.id) === pid);
      if (!exists && list.length < MAX_ITEMS) {
        list.push({
          id:      pid,
          handle:  typeof o.handle === 'string' ? o.handle.slice(0, 255) : '',
          addedAt: Number.isFinite(o.ts) ? o.ts : Date.now(),
        });
      }
    } else if (opName === 'remove' && /^\d+$/.test(pid)) {
      list = list.filter((i) => String(i.id) !== pid);
    } else if (opName === 'clear') {
      list = [];
    }
  }
  return list;
}

/* ── Handler ── */
export default async function handler(req, res) {
  // Kimlik: App Proxy HMAC imzası → logged_in_customer_id (client verisi değil)
  const auth = authenticateProxyRequest(req.query, { secret: process.env.SHOPIFY_API_SECRET });
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const customerGID = toCustomerGID(auth.customerId);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  /* ── GET: favori listesini oku ── */
  if (req.method === 'GET') {
    try {
      const items = await readWishlist(customerGID);
      return res.status(200).json({ ok: true, items });
    } catch (err) {
      console.error('wishlist GET error:', err.message);
      return res.status(502).json({ ok: false, error: 'upstream_error' });
    }
  }

  /* ── POST: ops batch uygula ── */
  if (req.method === 'POST') {
    /* Toleranslı parse: sendBeacon/proxy bazı durumlarda body'yi ham string
       iletir — JSON.parse dene, bozuksa boş obje → aşağıda 400'e düşer */
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    const ops = Array.isArray(body.ops) ? body.ops : null;
    if (!ops || !ops.length) {
      return res.status(400).json({ ok: false, error: 'ops_required' });
    }
    /* Defense-in-depth: client OPLOG_MAX=200 — üstü anormal trafiktir */
    if (ops.length > 500) {
      return res.status(400).json({ ok: false, error: 'ops_too_many' });
    }

    try {
      const current = await readWishlist(customerGID);
      const next    = applyOps(current, ops);
      await writeWishlist(customerGID, next);
      return res.status(200).json({ ok: true, items: next });
    } catch (err) {
      console.error('wishlist POST error:', err.message);
      const status = err.validation ? 422 : 502;
      return res.status(status).json({
        ok: false,
        error: err.validation ? 'validation' : 'upstream_error',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
