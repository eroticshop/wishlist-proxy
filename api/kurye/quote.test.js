// api/kurye/quote.test.js — endpoint entegrasyon dumanı (node --test)
// Gerçek HMAC imzası üretilir, config KV yerine cache'e enjekte edilir (offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

const SECRET = 'test_secret_123';
process.env.SHOPIFY_API_SECRET = SECRET;

const { getConfig, _clearCache } = await import('../../lib/kurye-engine/config.js');
const { DEFAULT_CONFIG } = await import('../../lib/kurye-engine/defaults.js');
const handler = (await import('./quote.js')).default;

// --- Yardımcılar ---
function sign(query, secret) {
  const message = Object.keys(query)
    .filter((k) => k !== 'signature')
    .map((k) => `${k}=${Array.isArray(query[k]) ? query[k].join(',') : query[k]}`)
    .sort()
    .join('');
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}
function signedQuery(extra = {}) {
  const q = {
    shop: 'eroticshop.myshopify.com',
    timestamp: String(Math.floor(Date.now() / 1000)),
    path_prefix: '/apps/hesap',
    ...extra,
  };
  q.signature = sign(q, SECRET);
  return q;
}
function mockReq(method, query, body) {
  return { method, query, body };
}
function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
// Test config'ini cache'e enjekte et (handler getConfig() bunu okuyacak)
async function seedConfig(cfg) {
  _clearCache();
  const mock = { async get() { return cfg; } };
  await getConfig({ client: mock, useCache: true }); // cache'i doldurur
}

const STORE = DEFAULT_CONFIG.courier_tariff.store; // Erox
const testConfig = {
  ...structuredClone(DEFAULT_CONFIG),
  coverage: { ilce_ids: [], mahalle_ids: ['16260001'] },
  self_points: [{ label: 'Test Metro', lat: 40.1955, lon: 29.0625, radius_km: 1.0, flat_price: 40, active: true }],
};

// ---- AUTH ----
test('imzasız istek => 401', async () => {
  const res = mockRes();
  await handler(mockReq('POST', { shop: 'x' }, {}), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'invalid_signature');
});

test('misafir (login yok) geçerli imza => auth geçer', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(), { lat: 40.19, lon: 29.06, weight_tier: '0-10' }), res);
  assert.notEqual(res.statusCode, 401);
  assert.notEqual(res.statusCode, 403);
});

// ---- METHOD ----
test('GET => 405', async () => {
  const res = mockRes();
  await handler(mockReq('GET', signedQuery(), null), res);
  assert.equal(res.statusCode, 405);
});

// ---- VALIDATION ----
test('geçersiz weight_tier => 400', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(), { lat: 40.19, lon: 29.06, weight_tier: 'ZZZ' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_weight_tier');
});
test('koordinat yok => 400', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(), { weight_tier: '0-10' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'coords_required');
});
test('Bursa dışı koordinat => 400', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(), { lat: 41.0, lon: 28.9, weight_tier: '0-10' }), res); // İstanbul
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'coords_out_of_bounds');
});

// ---- RESOLUTION (uçtan uca) ----
test('metro yakını + kapsamda => Kendi teslimat kazanır', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(),
    { lat: 40.1958, lon: 29.0628, weight_tier: '0-10', mahalle_id: '16260001' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.result.method, 'Kendi teslimat');
  assert.equal(res.body.result.price, 40);
});
test('kapsamda ama metrodan uzak => Motorlu kurye', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(),
    { lat: 40.26, lon: 29.14, weight_tier: '10-20', mahalle_id: '16260001' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.result.method, 'Motorlu kurye');
  assert.equal(res.body.result.breakdown.weight_add, 150);
});
test('kapsam dışı mahalle + metro uzağı => kargo', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(),
    { lat: 40.26, lon: 29.14, weight_tier: '0-10', mahalle_id: '99999999' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.result.type, 'kargo');
});
test('no-store header set edilir', async () => {
  await seedConfig(testConfig);
  const res = mockRes();
  await handler(mockReq('POST', signedQuery(), { lat: 40.19, lon: 29.06, weight_tier: '0-10' }), res);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
