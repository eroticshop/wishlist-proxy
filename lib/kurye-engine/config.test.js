// lib/kurye-engine/config.test.js
// node --test. Mock KV client ile gerçek Upstash'a bağlanmadan test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from './defaults.js';
import { validateConfig } from './schema.js';
import { getConfig, setConfig, resolveConfig, _clearCache, CONFIG_KEY } from './config.js';

// Basit in-memory mock: @upstash/redis get/set davranışını taklit eder (obje auto-parse).
function makeMockClient(initial = {}) {
  const store = { ...initial };
  return {
    getCalls: 0,
    setCalls: 0,
    async get(key) { this.getCalls++; return key in store ? store[key] : null; },
    async set(key, val) { this.setCalls++; store[key] = val; return 'OK'; },
    _store: store
  };
}

// ---- validateConfig (schema) ----
test('schema: DEFAULT_CONFIG geçerli', () => {
  const { valid, errors } = validateConfig(DEFAULT_CONFIG);
  assert.equal(valid, true, errors.join('; '));
});
test('schema: null/obje-değil geçersiz', () => {
  assert.equal(validateConfig(null).valid, false);
  assert.equal(validateConfig(42).valid, false);
});
test('schema: bands boş geçersiz', () => {
  const c = structuredClone(DEFAULT_CONFIG); c.courier_tariff.bands = [];
  assert.equal(validateConfig(c).valid, false);
});
test('schema: bitişik olmayan band geçersiz (boşluk)', () => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.courier_tariff.bands = [
    { from: 0, to: 20, rate: 30 },
    { from: 30, to: 50, rate: 25 }, // 20 != 30 boşluk
    { from: 50, to: null, rate: 22 }
  ];
  assert.equal(validateConfig(c).valid, false);
});
test('schema: açık uçlu son band (to:null) geçerli', () => {
  const c = structuredClone(DEFAULT_CONFIG); // zaten to:null ile bitiyor
  assert.equal(validateConfig(c).valid, true);
});
test('schema: geçersiz store koordinatı geçersiz', () => {
  const c = structuredClone(DEFAULT_CONFIG); c.courier_tariff.store = { lat: 'x', lon: 29 };
  assert.equal(validateConfig(c).valid, false);
});
test('schema: negatif weight add geçersiz', () => {
  const c = structuredClone(DEFAULT_CONFIG); c.weight.tiers[1].add = -5;
  assert.equal(validateConfig(c).valid, false);
});

// ---- resolveConfig (pure fallback) ----
test('resolveConfig: geçerli veriyi aynen döner', () => {
  const c = structuredClone(DEFAULT_CONFIG);
  assert.deepEqual(resolveConfig(c), c);
});
test('resolveConfig: null => DEFAULT', () => {
  assert.deepEqual(resolveConfig(null), DEFAULT_CONFIG);
});
test('resolveConfig: bozuk => DEFAULT', () => {
  assert.deepEqual(resolveConfig({ courier_tariff: 'bozuk' }), DEFAULT_CONFIG);
});

// ---- getConfig (KV + fallback + cache) ----
test('getConfig: KV boş (null) => DEFAULT', async () => {
  _clearCache();
  const mock = makeMockClient();
  const cfg = await getConfig({ client: mock, useCache: false });
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});
test('getConfig: KV geçerli config => onu döner', async () => {
  _clearCache();
  const stored = structuredClone(DEFAULT_CONFIG); stored.courier_tariff.base = 777;
  const mock = makeMockClient({ [CONFIG_KEY]: stored });
  const cfg = await getConfig({ client: mock, useCache: false });
  assert.equal(cfg.courier_tariff.base, 777);
});
test('getConfig: KV bozuk config => DEFAULT fallback', async () => {
  _clearCache();
  const mock = makeMockClient({ [CONFIG_KEY]: { courier_tariff: 'bozuk' } });
  const cfg = await getConfig({ client: mock, useCache: false });
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});
test('getConfig: KV hata fırlatırsa çökmez => DEFAULT', async () => {
  _clearCache();
  const badClient = { async get() { throw new Error('KV down'); } };
  const cfg = await getConfig({ client: badClient });
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});
test('getConfig: cache ikinci çağrıda KV okumaz', async () => {
  _clearCache();
  const stored = structuredClone(DEFAULT_CONFIG);
  const mock = makeMockClient({ [CONFIG_KEY]: stored });
  await getConfig({ client: mock, useCache: true });
  await getConfig({ client: mock, useCache: true });
  assert.equal(mock.getCalls, 1, 'ikinci çağrı cache’den gelmeli');
});

// ---- setConfig (validate + yaz) ----
test('setConfig: geçerli config yazılır', async () => {
  _clearCache();
  const mock = makeMockClient();
  const next = structuredClone(DEFAULT_CONFIG); next.courier_tariff.min = 350;
  const res = await setConfig(next, { client: mock });
  assert.equal(res.courier_tariff.min, 350);
  assert.equal(mock.setCalls, 1);
  assert.equal(mock._store[CONFIG_KEY].courier_tariff.min, 350);
});
test('setConfig: geçersiz config throw (INVALID_CONFIG), yazmaz', async () => {
  _clearCache();
  const mock = makeMockClient();
  const bad = structuredClone(DEFAULT_CONFIG); bad.courier_tariff.bands = [];
  await assert.rejects(() => setConfig(bad, { client: mock }), (e) => e.code === 'INVALID_CONFIG');
  assert.equal(mock.setCalls, 0);
});
