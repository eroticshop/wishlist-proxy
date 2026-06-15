/**
 * api/account/addresses.js
 * FAZ 1a (GET okuma) + FAZ 1b (POST yazma) — tek endpoint.
 *
 * GET  /apps/hesap/account/addresses           → adres listesi
 * POST /apps/hesap/account/addresses           → { action, address?, addressId?, setAsDefault? }
 *        action: 'create' | 'update' | 'delete' | 'setDefault'
 *
 * Güvenlik:
 *  • App Proxy imzası → güvenilir logged_in_customer_id (başka müşteri enjekte edilemez).
 *  • update/delete/setDefault'ta ownership pre-check: addressId gerçekten bu
 *    müşteriye mi ait? Değilse 403. (Defense-in-depth: imza + sahiplik.)
 *  • Adres alanları whitelist'ten geçer (beklenmedik alan/injection engellenir).
 *  • Admin token env var'dan; koda gömülmez.
 */
import { authenticateProxyRequest } from '../../lib/verifyAppProxy.js';
import { shopifyAdminGraphQL, toCustomerGID } from '../../lib/shopifyAdmin.js';

/* ── GraphQL ── */
const ADDRESS_FIELDS = `
  id firstName lastName company
  address1 address2 city province provinceCode
  country countryCodeV2 zip phone
  formatted(withName: true, withCompany: false)
`;

const ADDRESSES_QUERY = `
  query GetCustomerAddresses($id: ID!) {
    customer(id: $id) {
      id firstName lastName
      defaultAddress { ${ADDRESS_FIELDS} }
      addressesV2(first: 20) { nodes { ${ADDRESS_FIELDS} } }
    }
  }
`;

const OWNED_IDS_QUERY = `
  query OwnedIds($id: ID!) {
    customer(id: $id) { addressesV2(first: 50) { nodes { id } } }
  }
`;

const M_CREATE = `
  mutation($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
    customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
      address { id } userErrors { field message }
    }
  }
`;
const M_UPDATE = `
  mutation($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
    customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: $setAsDefault) {
      address { id } userErrors { field message }
    }
  }
`;
const M_DELETE = `
  mutation($customerId: ID!, $addressId: ID!) {
    customerAddressDelete(customerId: $customerId, addressId: $addressId) {
      deletedCustomerAddressId userErrors { field message }
    }
  }
`;
const M_SET_DEFAULT = `
  mutation($customerId: ID!, $addressId: ID!) {
    customerUpdateDefaultAddress(customerId: $customerId, addressId: $addressId) {
      customer { id } userErrors { field message }
    }
  }
`;

/* ── Yardımcılar ── */
function mapAddress(a) {
  if (!a) return null;
  return {
    id: a.id,
    firstName: a.firstName || '', lastName: a.lastName || '', company: a.company || '',
    address1: a.address1 || '', address2: a.address2 || '', city: a.city || '',
    province: a.province || '', provinceCode: a.provinceCode || '',
    country: a.country || '', countryCode: a.countryCodeV2 || '',
    zip: a.zip || '', phone: a.phone || '',
    formatted: Array.isArray(a.formatted) ? a.formatted : [],
  };
}

// MailingAddressInput whitelist — yalnız izinli, dolu string alanlar geçer
const ALLOWED = ['address1', 'address2', 'city', 'company', 'firstName', 'lastName', 'phone', 'provinceCode', 'zip', 'countryCode'];
function sanitizeAddress(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {};
  for (const k of ALLOWED) {
    if (typeof a[k] === 'string' && a[k].trim() !== '') out[k] = a[k].trim();
  }
  if (!out.countryCode) out.countryCode = 'TR'; // varsayılan ülke: Türkiye
  return out;
}

async function fetchAddresses(customerGID) {
  const data = await shopifyAdminGraphQL(ADDRESSES_QUERY, { id: customerGID });
  const c = data && data.customer;
  if (!c) return null;
  const def = mapAddress(c.defaultAddress);
  const nodes = (c.addressesV2 && c.addressesV2.nodes) || [];
  return {
    customer: { firstName: c.firstName || '', lastName: c.lastName || '' },
    defaultAddressId: def ? def.id : null,
    defaultAddress: def,
    addresses: nodes.map(mapAddress),
  };
}

async function ownsAddress(customerGID, addressId) {
  const data = await shopifyAdminGraphQL(OWNED_IDS_QUERY, { id: customerGID });
  const ids = ((data.customer && data.customer.addressesV2 && data.customer.addressesV2.nodes) || []).map((n) => n.id);
  return ids.indexOf(addressId) !== -1;
}

/* ── Handler ── */
export default async function handler(req, res) {
  const auth = authenticateProxyRequest(req.query, { secret: process.env.SHOPIFY_API_SECRET });
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const customerGID = toCustomerGID(auth.customerId);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  /* ── GET: okuma ── */
  if (req.method === 'GET') {
    try {
      const result = await fetchAddresses(customerGID);
      if (!result) return res.status(404).json({ ok: false, error: 'customer_not_found' });
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      console.error('addresses GET error:', err.message);
      return res.status(502).json({ ok: false, error: 'upstream_error' });
    }
  }

  /* ── POST: yazma ── */
  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action;
    const addressId = body.addressId ? String(body.addressId) : '';

    try {
      if (action === 'create') {
        const address = sanitizeAddress(body.address);
        if (!address || !address.address1) return res.status(400).json({ ok: false, error: 'invalid_address' });
        const d = await shopifyAdminGraphQL(M_CREATE, { customerId: customerGID, address, setAsDefault: !!body.setAsDefault });
        const ue = d.customerAddressCreate.userErrors;
        if (ue.length) return res.status(422).json({ ok: false, error: 'validation', userErrors: ue });

      } else if (action === 'update' || action === 'delete' || action === 'setDefault') {
        if (!addressId) return res.status(400).json({ ok: false, error: 'addressId_required' });
        // Ownership pre-check: bu adres gerçekten bu müşteriye mi ait?
        if (!(await ownsAddress(customerGID, addressId))) {
          return res.status(403).json({ ok: false, error: 'forbidden' });
        }

        if (action === 'update') {
          const address = sanitizeAddress(body.address);
          if (!address) return res.status(400).json({ ok: false, error: 'invalid_address' });
          const d = await shopifyAdminGraphQL(M_UPDATE, { customerId: customerGID, addressId, address, setAsDefault: !!body.setAsDefault });
          const ue = d.customerAddressUpdate.userErrors;
          if (ue.length) return res.status(422).json({ ok: false, error: 'validation', userErrors: ue });

        } else if (action === 'delete') {
          const d = await shopifyAdminGraphQL(M_DELETE, { customerId: customerGID, addressId });
          const ue = d.customerAddressDelete.userErrors;
          if (ue.length) return res.status(422).json({ ok: false, error: 'validation', userErrors: ue });

        } else { // setDefault
          const d = await shopifyAdminGraphQL(M_SET_DEFAULT, { customerId: customerGID, addressId });
          const ue = d.customerUpdateDefaultAddress.userErrors;
          if (ue.length) return res.status(422).json({ ok: false, error: 'validation', userErrors: ue });
        }

      } else {
        return res.status(400).json({ ok: false, error: 'invalid_action' });
      }

      // Başarı → güncel listeyi döndür (frontend tek yanıtla yenilenir)
      const fresh = await fetchAddresses(customerGID);
      return res.status(200).json({ ok: true, ...fresh });

    } catch (err) {
      console.error('addresses POST error:', err.message);
      return res.status(502).json({ ok: false, error: 'upstream_error' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
