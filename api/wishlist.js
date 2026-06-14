/**
 * EroticShop — Wishlist Proxy  v2.0
 * Vercel Serverless Function · Node.js 18+
 *
 * GET  /api/wishlist?customerId=123        → { items: [...] }
 * POST /api/wishlist                        → { customerId, action, productId?, handle?, items? }
 *
 * action: "add" | "remove" | "merge" | "clear"
 * Metafield: namespace="custom", key="wishlist"  (Step 0 ile uyumlu)
 */

const STORE     = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN     = process.env.SHOPIFY_ADMIN_TOKEN;
const ORIGIN    = process.env.ALLOWED_ORIGIN;
const GQL_URL   = `https://${STORE}/admin/api/2024-04/graphql.json`;
const MAX_ITEMS = 100;

/* ── CORS ──────────────────────────────────────────────────── */
function setCORS(res, reqOrigin) {
  const allowed =
    reqOrigin === ORIGIN || (reqOrigin || '').endsWith('.vercel.app');
  res.setHeader('Access-Control-Allow-Origin', allowed ? reqOrigin : ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/* ── GraphQL helper ────────────────────────────────────────── */
async function gql(query) {
  const r = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Shopify HTTP ${r.status}`);
  return r.json();
}

/* ── Metafield oku ─────────────────────────────────────────── */
async function getWishlist(customerId) {
  const gid = `gid://shopify/Customer/${customerId}`;
  const data = await gql(`{
    customer(id: "${gid}") {
      metafield(namespace: "custom", key: "wishlist") { value }
    }
  }`);
  const raw = data?.data?.customer?.metafield?.value;
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/* ── Metafield yaz ─────────────────────────────────────────── */
async function setWishlist(customerId, items) {
  const gid = `gid://shopify/Customer/${customerId}`;
  const escaped = JSON.stringify(JSON.stringify(items));
  const data = await gql(`mutation {
    customerUpdate(input: {
      id: "${gid}",
      metafields: [{
        namespace: "custom",
        key: "wishlist",
        value: ${escaped},
        type: "json"
      }]
    }) {
      userErrors { field message }
    }
  }`);
  const errors = data?.data?.customerUpdate?.userErrors;
  if (errors?.length) throw new Error(errors[0].message);
}

/* ── Ana handler ───────────────────────────────────────────── */
export default async (req, res) => {
  const reqOrigin = req.headers.origin || '';
  setCORS(res, reqOrigin);

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!STORE || !TOKEN) {
    return res.status(500).json({ error: 'Sunucu yapılandırma hatası' });
  }

  /* ── GET ───────────────────────────────────────────────── */
  if (req.method === 'GET') {
    const { customerId } = req.query;
    if (!customerId || !/^\d+$/.test(customerId)) {
      return res.status(400).json({ error: 'Geçersiz customerId' });
    }
    try {
      const items = await getWishlist(customerId);
      return res.status(200).json({ items });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  /* ── POST ──────────────────────────────────────────────── */
  if (req.method === 'POST') {
    const { customerId, action, productId, handle, items: incoming, ops } = req.body || {};

    if (!customerId || !/^\d+$/.test(String(customerId))) {
      return res.status(400).json({ error: 'Geçersiz customerId' });
    }

    let current;
    try {
      current = await getWishlist(String(customerId));
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }

    /* ─── v2.0 BATCH FORMAT ──────────────────────────────
       Body: { customerId, ops: [{ op, productId, handle, ts }, ...] }
       Reducer: op'ları sırayla uygular. Geçersiz op → sessizce atla.
       MAX_ITEMS aşımı → sessizce atla (batch'te hata dönmek anlamsız,
       client zaten optimistic update yaptı). */
    if (Array.isArray(ops) && ops.length) {
      for (const o of ops) {
        const opName = o.op || o.action;
        const pid    = o.productId ? String(o.productId) : '';

        if (opName === 'add' && pid) {
          const exists = current.some((i) => String(i.id) === pid);
          if (!exists && current.length < MAX_ITEMS) {
            current.push({
              id: pid,
              handle: o.handle || '',
              addedAt: o.ts || Date.now(),
            });
          }
        } else if (opName === 'remove' && pid) {
          current = current.filter((i) => String(i.id) !== pid);
        } else if (opName === 'clear') {
          current = [];
        }
      }

      try {
        await setWishlist(String(customerId), current);
        return res.status(200).json({ items: current });
      } catch (e) {
        return res.status(502).json({ error: e.message });
      }
    }

    /* ─── LEGACY FORMAT (eski client / direct API) ─────── */
    switch (action) {

      case 'add': {
        if (!productId) return res.status(400).json({ error: 'productId gerekli' });
        const exists = current.some((i) => String(i.id) === String(productId));
        if (!exists) {
          if (current.length >= MAX_ITEMS) {
            return res.status(400).json({ error: 'Maksimum favori sınırına ulaşıldı (100)' });
          }
          current.push({
            id: String(productId),
            handle: handle || '',
            addedAt: Date.now(),
          });
        }
        break;
      }

      case 'remove': {
        if (!productId) return res.status(400).json({ error: 'productId gerekli' });
        current = current.filter((i) => String(i.id) !== String(productId));
        break;
      }

      case 'merge': {
        if (!Array.isArray(incoming)) {
          return res.status(400).json({ error: 'items dizisi gerekli' });
        }
        const existingIds = new Set(current.map((i) => String(i.id)));
        for (const item of incoming) {
          if (!existingIds.has(String(item.id))) {
            current.push({
              id: String(item.id),
              handle: item.handle || '',
              addedAt: item.addedAt || Date.now(),
            });
            existingIds.add(String(item.id));
          }
        }
        if (current.length > MAX_ITEMS) current = current.slice(0, MAX_ITEMS);
        break;
      }

      case 'clear': {
        current = [];
        break;
      }

      default:
        return res.status(400).json({ error: 'Geçersiz action' });
    }

    try {
      await setWishlist(String(customerId), current);
      return res.status(200).json({ items: current });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
