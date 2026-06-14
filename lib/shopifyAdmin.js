export const SHOPIFY_API_VERSION = '2025-07';

export async function shopifyAdminGraphQL(query, variables = {}) {
  const shop  = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!shop)  throw new Error('Yapılandırma hatası: SHOPIFY_SHOP_DOMAIN tanımsız');
  if (!token) throw new Error('Yapılandırma hatası: SHOPIFY_ADMIN_TOKEN tanımsız');

  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (networkErr) {
    throw new Error(`Admin API ağ hatası: ${networkErr.message}`);
  }

  if (!resp.ok) {
    throw new Error(`Admin API HTTP ${resp.status}`);
  }

  const json = await resp.json();
  if (json.errors) {
    throw new Error(`Admin API GraphQL hata: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export function toCustomerGID(customerId) {
  const id = String(customerId).trim();
  if (!/^\d+$/.test(id)) throw new Error('Geçersiz müşteri kimliği');
  return `gid://shopify/Customer/${id}`;
}
