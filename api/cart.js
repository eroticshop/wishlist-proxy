/**
 * ═══════════════════════════════════════════════════════════════
 * EROTICSHOP — Account Cart Sync — api/cart.js — v1.0
 * ─────────────────────────────────────────────────────────────
 * Sepet snapshot'ını müşteri metafield'ında saklar/okur.
 * Depo: Customer metafield → namespace "eroticshop", key "saved_cart" (json)
 *   • Ekstra veritabanı yok — veri Shopify'da, müşteri kaydına bağlı yaşar.
 *   • Müşteri silinirse metafield de silinir (KVKK-temiz).
 *
 * GET  /api/cart?customerId=123
 *   → 200 { items: [{ id, quantity }], updatedAt }
 * POST /api/cart   body: { customerId, items: [{ id, quantity }] }
 *   → 200 { ok: true }
 *
 * GÜVENLİK NOTU (v1): customerId client beyanıdır — mevcut wishlist
 * endpoint'iyle aynı güven seviyesi. App Proxy imza doğrulaması
 * (Shopify'ın eklediği logged_in_customer_id) her iki endpoint için
 * ortak bir sağlamlaştırma maddesi olarak ayrıca planlanacak.
 * ═══════════════════════════════════════════════════════════════
 */

/* Env adlarını mevcut Vercel projesindeki (adres CRUD'un kullandığı)
   değişkenlerle eşleştir — asla hardcode etme. */
const SHOP        = process.env.SHOPIFY_STORE_DOMAIN; // Vercel'deki mevcut değişken adı
const TOKEN       = process.env.SHOPIFY_ADMIN_TOKEN;  // Admin API access token
const API_VERSION = '2026-01';

const NS        = 'eroticshop';
const KEY       = 'saved_cart';
const MAX_LINES = 100;   // snapshot satır üst sınırı (kötüye kullanım freni)
const MAX_QTY   = 999;

const ALLOWED_ORIGINS = [
  'https://eroticshop.com.tr',
  'https://www.eroticshop.com.tr'
];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

async function adminGraphQL(query, variables) {
  const res = await fetch(
    `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({ query, variables })
    }
  );
  if (!res.ok) throw new Error(`Admin API HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Admin API: ${JSON.stringify(json.errors)}`);
  return json.data;
}

/* items doğrulama: [{ id: pozitif tamsayı (variant_id), quantity: 1..999 }] */
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

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    /* ── GET: kayıtlı sepeti oku ─────────────────────────────── */
    if (req.method === 'GET') {
      const customerId = String(req.query.customerId || '').trim();
      if (!/^\d+$/.test(customerId)) {
        return res.status(400).json({ error: 'invalid customerId' });
      }

      const data = await adminGraphQL(
        `query ($id: ID!) {
           customer(id: $id) {
             metafield(namespace: "${NS}", key: "${KEY}") { value }
           }
         }`,
        { id: `gid://shopify/Customer/${customerId}` }
      );

      const value = data?.customer?.metafield?.value;
      if (!value) return res.status(200).json({ items: [], updatedAt: null });

      let parsed;
      try { parsed = JSON.parse(value); } catch { parsed = {}; }

      return res.status(200).json({
        items: Array.isArray(parsed.items) ? parsed.items : [],
        updatedAt: parsed.updatedAt || null
      });
    }

    /* ── POST: sepeti kaydet ─────────────────────────────────── */
    if (req.method === 'POST') {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const customerId = String(body.customerId || '').trim();
      if (!/^\d+$/.test(customerId)) {
        return res.status(400).json({ error: 'invalid customerId' });
      }

      const items = sanitizeItems(body.items);
      if (items === null) {
        return res.status(400).json({ error: 'invalid items' });
      }

      const data = await adminGraphQL(
        `mutation ($metafields: [MetafieldsSetInput!]!) {
           metafieldsSet(metafields: $metafields) {
             userErrors { field message }
           }
         }`,
        {
          metafields: [{
            ownerId:   `gid://shopify/Customer/${customerId}`,
            namespace: NS,
            key:       KEY,
            type:      'json',
            value:     JSON.stringify({
              items,
              updatedAt: new Date().toISOString()
            })
          }]
        }
      );

      const errs = data?.metafieldsSet?.userErrors;
      if (errs && errs.length) {
        return res.status(422).json({ error: errs[0].message });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('[cart-api]', e.message);
    return res.status(500).json({ error: 'internal' });
  }
};
