/**
 * lib/shopifyAdmin.js
 * Shopify Admin API (GraphQL) ince istemci.
 * Faz 0'da yalnız iskelet; Faz 1'de customerUpdate / address mutation'ları buraya gelir.
 *
 * GÜVENLİK / ORTAM DEĞİŞKENLERİ (Vercel → Settings → Environment Variables):
 *  - SHOPIFY_API_SECRET    → App Proxy imza doğrulaması (API secret key, shpss_...)
 *  - SHOPIFY_ADMIN_TOKEN   → Admin API erişim token'ı (shpat_...) — secret key'den FARKLIDIR
 *  - SHOPIFY_STORE_DOMAIN  → örn. eroticshop.myshopify.com (kalıcı .myshopify.com adresi)
 * Hiçbiri koda gömülmez; yalnızca process.env üzerinden okunur.
 */

// API versiyonu SABİT: Shopify versiyonları geriye dönük uyumludur; kontrollü yükseltiriz.
// 2025-07 desteği Temmuz 2026'da doluyor — kontrollü yükseltme (tüm endpoint'ler birlikte)
export const SHOPIFY_API_VERSION = '2026-01';

/**
 * Admin API'ye tek bir GraphQL çağrısı yapar.
 * @param {string} query  - GraphQL sorgu/mutation metni
 * @param {object} variables - GraphQL değişkenleri
 * @returns {Promise<object>} data
 * @throws  anlamlı hata (HTTP / GraphQL / userErrors değil — userErrors çağıran tarafça yorumlanır)
 */
export async function shopifyAdminGraphQL(query, variables = {}) {
  const shop  = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!shop)  throw new Error('Yapılandırma hatası: SHOPIFY_STORE_DOMAIN tanımsız');
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
    // Ağ / DNS / timeout
    throw new Error(`Admin API ağ hatası: ${networkErr.message}`);
  }

  if (!resp.ok) {
    // 401/403 (token), 429 (rate limit), 5xx
    throw new Error(`Admin API HTTP ${resp.status}`);
  }

  const json = await resp.json();
  if (json.errors) {
    // GraphQL seviye hataları (yetki, sorgu hatası vb.)
    throw new Error(`Admin API GraphQL hata: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

/**
 * Müşteri GID üretir. App Proxy'den gelen logged_in_customer_id sayısaldır;
 * Admin API GraphQL GID formatı ister.
 * @param {string|number} customerId
 * @returns {string} gid://shopify/Customer/123
 */
export function toCustomerGID(customerId) {
  const id = String(customerId).trim();
  if (!/^\d+$/.test(id)) throw new Error('Geçersiz müşteri kimliği');
  return `gid://shopify/Customer/${id}`;
}
