/**
 * ═══════════════════════════════════════════════════════════════
 * EROTICSHOP — Account Cart Sync — api/cart.js — v2.0 (App Proxy)
 * ─────────────────────────────────────────────────────────────
 * v2.0: CORS + client customerId deseni TERK EDİLDİ.
 *   • Kimlik: Shopify App Proxy imzalı isteği → logged_in_customer_id
 *     (client asla customerId göndermez, spoofing imkânsız)
 *   • DRY: lib/shopifyAdmin.js + lib/verifyAppProxy.js (addresses.js deseni)
 *   • Tema çağrısı: /apps/hesap/cart (same-origin, CORS yok)
 *
 * GET  /apps/hesap/cart              → 200 { items:[{id,quantity}], updatedAt }
 * POST /apps/hesap/cart  { items }   → 200 { ok: true }
 * Oturum yoksa                       → 403 { error: "not_logged_in" }
 *
 * Depo: Customer metafield → namespace "eroticshop", key "saved_cart" (json)
 * ═══════════════════════════════════════════════════════════════
 */

import { shopifyAdminGraphQL, toCustomerGID } from '../lib/shopifyAdmin.js';
import { authenticateProxyRequest } from '../lib/verifyAppProxy.js';

const NS        = 'eroticshop';
const KEY       = 'saved_cart';
const MAX_LINES = 100;   /* snapshot satır üst sınırı (kötüye kullanım freni) */
const MAX_QTY   = 999;

/* ── items doğrulama: [{ id: pozitif tamsayı (variant_id), quantity: 1..999 }] */
function sanitizeItems(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_LINES) return null;
  const out = [];
  for (const it of raw) {
    const id = Number(it && it.id);
    const q  = Number(it && it.quantity);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) return null;
    out.push({ id, quantity: q });
  }
  return out;
}

export default async (req, res) => {
  /* App Proxy GET yanıtları CDN'de önbelleklenmesin — sepet kişiye özel */
  res.setHeader('Cache-Control', 'no-store');

  /* ── Kimlik doğrulama: HMAC + timestamp + oturum ─────────── */
  const auth = authenticateProxyRequest(req.query, {
    secret: process.env.SHOPIFY_API_SECRET,
  });
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let gid;
  try {
    gid = toCustomerGID(auth.customerId);
  } catch (e) {
    return res.status(400).json({ error: 'invalid_customer' });
  }

  try {
    /* ── GET: kayıtlı sepeti oku ─────────────────────────── */
    if (req.method === 'GET') {
      const data = await shopifyAdminGraphQL(
        `query ($id: ID!) {
           customer(id: $id) {
             metafield(namespace: "${NS}", key: "${KEY}") { value }
           }
         }`,
        { id: gid }
      );

      const value = data?.customer?.metafield?.value;
      if (!value) return res.status(200).json({ items: [], updatedAt: null });

      let parsed;
      try { parsed = JSON.parse(value); } catch { parsed = {}; }

      return res.status(200).json({
        items: Array.isArray(parsed.items) ? parsed.items : [],
        updatedAt: parsed.updatedAt || null,
      });
    }

    /* ── POST: sepeti kaydet ─────────────────────────────── */
    if (req.method === 'POST') {
      const body  = (req.body && typeof req.body === 'object') ? req.body : {};
      const items = sanitizeItems(body.items);
      if (items === null) {
        return res.status(400).json({ error: 'invalid_items' });
      }

      const data = await shopifyAdminGraphQL(
        `mutation ($metafields: [MetafieldsSetInput!]!) {
           metafieldsSet(metafields: $metafields) {
             userErrors { field message }
           }
         }`,
        {
          metafields: [{
            ownerId:   gid,
            namespace: NS,
            key:       KEY,
            type:      'json',
            value:     JSON.stringify({
              items,
              updatedAt: new Date().toISOString(),
            }),
          }],
        }
      );

      const errs = data?.metafieldsSet?.userErrors;
      if (errs?.length) {
        return res.status(422).json({ error: errs[0].message });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    /* lib anlamlı hata fırlatır (ağ / HTTP / GraphQL) — logla, detayı sızdırma */
    console.error('[cart-api]', e.message);
    return res.status(500).json({ error: 'internal' });
  }
};
