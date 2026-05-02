const fetch = require('node-fetch');

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN;
const ALLOWED_ORIGIN       = process.env.ALLOWED_ORIGIN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { customerId } = req.query;
  if (!customerId) return res.status(400).json({ error: 'customerId required' });

  const gid = `gid://shopify/Customer/${customerId}`;
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`;

  // GET — wishlist oku
  if (req.method === 'GET') {
    const query = `{
      customer(id: "${gid}") {
        metafield(namespace: "wishlist", key: "items") { value }
      }
    }`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN },
      body: JSON.stringify({ query })
    });
    const data = await r.json();
    const value = data?.data?.customer?.metafield?.value || '[]';
    return res.status(200).json(JSON.parse(value));
  }

  // POST — ürün ekle
  if (req.method === 'POST') {
    const { productId } = req.body;
    const current = await getWishlist(gid, url);
    if (!current.includes(productId)) current.push(productId);
    await saveWishlist(gid, url, current);
    return res.status(200).json(current);
  }

  // DELETE — ürün çıkar
  if (req.method === 'DELETE') {
    const { productId } = req.body;
    const current = await getWishlist(gid, url);
    const updated = current.filter(id => id !== productId);
    await saveWishlist(gid, url, updated);
    return res.status(200).json(updated);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

async function getWishlist(gid, url) {
  const query = `{
    customer(id: "${gid}") {
      metafield(namespace: "wishlist", key: "items") { value }
    }
  }`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN },
    body: JSON.stringify({ query })
  });
  const data = await r.json();
  const value = data?.data?.customer?.metafield?.value || '[]';
  return JSON.parse(value);
}

async function saveWishlist(gid, url, items) {
  const mutation = `mutation {
    customerUpdate(input: {
      id: "${gid}",
      metafields: [{ namespace: "wishlist", key: "items", value: ${JSON.stringify(JSON.stringify(items))}, type: "json" }]
    }) { userErrors { field message } }
  }`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN },
    body: JSON.stringify({ query: mutation })
  });
}
