/**
 * api/account/addresses.js
 * FAZ 1a — Adres OKUMA (Vercel Serverless Function).
 *
 * Akış: App Proxy imza doğrulama → güvenli logged_in_customer_id →
 *       Admin API customer sorgusu → storefront-güvenli JSON.
 *
 * Güvenlik: Yalnızca App Proxy'nin imzaladığı müşterinin adresleri okunur.
 * Kullanıcı başkasının customerId'sini enjekte edemez (imza tutmaz).
 *
 * NOT: Yazma işlemleri (create/update/delete/setDefault) Faz 1b'de
 *      ayrı bir POST handler'a eklenecektir. Bu dosya yalnız GET (okuma).
 */
import { authenticateProxyRequest } from '../../lib/verifyAppProxy.js';
import { shopifyAdminGraphQL, toCustomerGID } from '../../lib/shopifyAdmin.js';

// 2025-07 şeması: defaultAddress (tekil) + addressesV2 (connection)
const ADDRESSES_QUERY = `
  query GetCustomerAddresses($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      defaultAddress { ...AddressFields }
      addressesV2(first: 20) {
        nodes { ...AddressFields }
      }
    }
  }
  fragment AddressFields on MailingAddress {
    id
    firstName
    lastName
    company
    address1
    address2
    city
    province
    provinceCode
    country
    countryCodeV2
    zip
    phone
    formatted(withName: true, withCompany: false)
  }
`;

/**
 * MailingAddress düğümünü storefront-güvenli, sade bir nesneye indirger.
 * (Müşterinin kendi verisi; hassas başka alan yok. Yine de yalnız gerekli alanlar.)
 */
function mapAddress(a) {
  if (!a) return null;
  return {
    id: a.id,
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    company: a.company || '',
    address1: a.address1 || '',
    address2: a.address2 || '',
    city: a.city || '',
    province: a.province || '',
    provinceCode: a.provinceCode || '',
    country: a.country || '',
    countryCode: a.countryCodeV2 || '',
    zip: a.zip || '',
    phone: a.phone || '',
    // formatted: Shopify'ın yerel kurallara göre formatladığı adres satırları (gösterim için ideal)
    formatted: Array.isArray(a.formatted) ? a.formatted : [],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // 1) App Proxy kimlik doğrulama (imza + tazelik + oturum)
  const auth = authenticateProxyRequest(req.query, {
    secret: process.env.SHOPIFY_API_SECRET,
  });
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  // 2) Admin API'den adresleri çek
  let data;
  try {
    data = await shopifyAdminGraphQL(ADDRESSES_QUERY, {
      id: toCustomerGID(auth.customerId),
    });
  } catch (err) {
    // Upstream (Admin API) hatası — ayrıntıyı sızdırma, logla
    console.error('addresses GET upstream error:', err.message);
    return res.status(502).json({ ok: false, error: 'upstream_error' });
  }

  const customer = data && data.customer;
  if (!customer) {
    return res.status(404).json({ ok: false, error: 'customer_not_found' });
  }

  const defaultAddress = mapAddress(customer.defaultAddress);
  const nodes = (customer.addressesV2 && customer.addressesV2.nodes) || [];

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Tarayıcıda önbelleğe alınmasın (kişisel veri)
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    customer: {
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
    },
    defaultAddressId: defaultAddress ? defaultAddress.id : null,
    defaultAddress,
    addresses: nodes.map(mapAddress),
  });
}
