// Node built-in test runner (node --test). Harici bağımlılık yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  distancePrice,
  weightSurcharge,
  selfDeliveryBase,
  resolveQuote,
} from './resolve.js';

// ---- Ortak test config'i (KV blob simülasyonu) ----
const config = {
  courier_tariff: {
    bands: [
      { from: 0, to: 30, rate: 15 },
      { from: 30, to: 50, rate: 20 },
    ],
    base: 0,
    min: 60,
    road_factor: 1.3,
    store: { lat: 40.1826, lon: 29.0665 },
  },
  weight: {
    model: 'add',
    tiers: [
      { key: '0-10', add: 0 },
      { key: '10-20', add: 75 },
      { key: '20+', add: 150 },
    ],
  },
  self_points: [
    { label: 'Şehreküstü', lat: 40.1955, lon: 29.0625, radius_km: 1.0, flat_price: 40, active: true },
    { label: 'Pasif Nokta', lat: 40.20, lon: 29.10, radius_km: 5.0, flat_price: 10, active: false },
  ],
};

// ---- haversineKm ----
test('haversineKm: aynı nokta = 0', () => {
  assert.equal(haversineKm({ lat: 40, lon: 29 }, { lat: 40, lon: 29 }), 0);
});
test('haversineKm: geçersiz koordinat throw', () => {
  assert.throws(() => haversineKm({ lat: 'x', lon: 29 }, { lat: 40, lon: 29 }), TypeError);
});

// ---- distancePrice: progressive band + sınır sürekliliği ----
test('distancePrice: min fare tabanı (kısa mesafe)', () => {
  assert.equal(distancePrice(3, config.courier_tariff), 60); // 3*15=45 -> min 60
});
test('distancePrice: 10km = 150', () => {
  assert.equal(distancePrice(10, config.courier_tariff), 150);
});
test('distancePrice: 30km sınırı = 450, sıçrama yok', () => {
  assert.equal(distancePrice(30, config.courier_tariff), 450);
  assert.equal(distancePrice(30.1, config.courier_tariff), 452);
});
test('distancePrice: 50km = 850', () => {
  assert.equal(distancePrice(50, config.courier_tariff), 850);
});
test('distancePrice: son band üstü = null (kapsam dışı)', () => {
  assert.equal(distancePrice(55, config.courier_tariff), null);
});
test('distancePrice: bands eksik throw', () => {
  assert.throws(() => distancePrice(10, {}), TypeError);
});

// ---- weightSurcharge ----
test('weightSurcharge: dilim lookup', () => {
  assert.equal(weightSurcharge('10-20', config.weight), 75);
  assert.equal(weightSurcharge('0-10', config.weight), 0);
});
test('weightSurcharge: geçersiz dilim throw', () => {
  assert.throws(() => weightSurcharge('99', config.weight), RangeError);
});

// ---- selfDeliveryBase: geofence ----
test('selfDeliveryBase: yarıçap içi = flat', () => {
  assert.equal(selfDeliveryBase({ lat: 40.1958, lon: 29.0628 }, config.self_points), 40);
});
test('selfDeliveryBase: yarıçap dışı = null', () => {
  assert.equal(selfDeliveryBase({ lat: 40.30, lon: 29.30 }, config.self_points), null);
});
test('selfDeliveryBase: pasif nokta atlanır', () => {
  // Pasif nokta (flat 10) yarıçapı içinde ama active:false => dikkate alınmaz
  assert.equal(selfDeliveryBase({ lat: 40.20, lon: 29.10 }, config.self_points), null);
});

// ---- resolveQuote: POINT modu (kesin, cheapest-wins) ----
test('point: metro yakını => self kazanır, ağırlık eklenir', () => {
  const r0 = resolveQuote({ mode: 'point', lat: 40.1958, lon: 29.0628, weight_tier: '0-10', in_courier_coverage: true }, config);
  assert.equal(r0.method, 'Kendi teslimat');
  assert.equal(r0.price, 40);

  const r2 = resolveQuote({ mode: 'point', lat: 40.1958, lon: 29.0628, weight_tier: '20+', in_courier_coverage: true }, config);
  assert.equal(r2.method, 'Kendi teslimat');
  assert.equal(r2.price, 190); // 40 + 150
});

test('point: metrodan uzak + kapsamda => kurye kazanır', () => {
  const r = resolveQuote({ mode: 'point', lat: 40.2600, lon: 29.1400, weight_tier: '10-20', in_courier_coverage: true }, config);
  assert.equal(r.method, 'Motorlu kurye');
  assert.ok(r.price > 75); // mesafe + 75 ağırlık
  assert.equal(r.breakdown.weight_add, 75);
});

test('point: kapsam yok + self yok => kargo', () => {
  const r = resolveQuote({ mode: 'point', lat: 40.35, lon: 29.40, weight_tier: '0-10', in_courier_coverage: false }, config);
  assert.equal(r.type, 'kargo');
  assert.equal(r.price, null);
});

test('point: override mesafe fiyatını ezer, ağırlık yine eklenir', () => {
  const r = resolveQuote({ mode: 'point', lat: 40.2600, lon: 29.1400, weight_tier: '10-20', in_courier_coverage: true, override: 100 }, config);
  assert.equal(r.method, 'Motorlu kurye');
  assert.equal(r.price, 175); // 100 + 75
});

// ---- resolveQuote: MAHALLE modu (aralık) ----
test('mahalle: kapsamda => range + needsLocation', () => {
  const r = resolveQuote({
    mode: 'mahalle',
    centroid: { lat: 40.2450, lon: 29.1200 },
    radius_km: 1.6,
    weight_tier: '0-10',
    in_courier_coverage: true,
  }, config);
  assert.equal(r.type, 'range');
  assert.equal(r.needsLocation, true);
  assert.ok(r.min <= r.max);
});

test('mahalle: kapsam yok, centroid self yakını => needs_location', () => {
  const r = resolveQuote({
    mode: 'mahalle',
    centroid: { lat: 40.1958, lon: 29.0628 },
    radius_km: 0.3,
    weight_tier: '0-10',
    in_courier_coverage: false,
  }, config);
  assert.equal(r.type, 'needs_location');
});

test('mahalle: kapsam yok, self yok => kargo', () => {
  const r = resolveQuote({
    mode: 'mahalle',
    centroid: { lat: 40.35, lon: 29.40 },
    radius_km: 1.0,
    weight_tier: '0-10',
    in_courier_coverage: false,
  }, config);
  assert.equal(r.type, 'kargo');
});

// ---- Hata yönetimi ----
test('resolveQuote: bilinmeyen mode throw', () => {
  assert.throws(() => resolveQuote({ mode: 'foo', weight_tier: '0-10' }, config), RangeError);
});
test('resolveQuote: input/config null throw', () => {
  assert.throws(() => resolveQuote(null, config), TypeError);
  assert.throws(() => resolveQuote({ mode: 'point', weight_tier: '0-10' }, null), TypeError);
});
