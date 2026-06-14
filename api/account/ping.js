import { authenticateProxyRequest } from '../../lib/verifyAppProxy.js';
import { SHOPIFY_API_VERSION } from '../../lib/shopifyAdmin.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const auth = authenticateProxyRequest(req.query, {
    secret: process.env.SHOPIFY_API_SECRET,
  });

  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({
    ok: true,
    customerId: auth.customerId,
    shop: auth.shop,
    apiVersion: SHOPIFY_API_VERSION,
    phase: 'FAZ-0: güvenli kanal hazır',
  });
}
