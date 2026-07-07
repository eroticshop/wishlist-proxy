// lib/kurye-engine/resolve.js
// Bursa hızlı kurye ücret çözümleme motoru — pure functions, side-effect yok.
// Sorumluluk (SRP): geometrik girdi + config => fiyat teklifi.
// Veri yükleme / HTTP / KV erişimi burada YOK; onlar caller (endpoint) sorumluluğu.

const EARTH_RADIUS_KM = 6371;

// ---- Koordinat doğrulama (null-check + aralık) ----
export function isValidCoord(p) {
  return (
    p != null &&
    typeof p.lat === 'number' &&
    typeof p.lon === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -90 && p.lat <= 90 &&
    p.lon >= -180 && p.lon <= 180
  );
}

// ---- 2 ondalık yuvarlama (float güvenli) ----
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---- Haversine: iki koordinat arası kuş uçuşu mesafe (km) ----
export function haversineKm(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) {
    throw new TypeError('haversineKm: geçersiz koordinat (lat/lon finite number olmalı).');
  }
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

// ---- Progressive band fiyatı (mesafe km => TL) ----
// tariff.bands: [{ from, to, rate }] contiguous. base + min tabanı.
// Dönüş: number (TL) | null (son band üstü = kapsam dışı).
export function distancePrice(distKm, tariff) {
  if (typeof distKm !== 'number' || !Number.isFinite(distKm) || distKm < 0) {
    throw new TypeError('distancePrice: distKm negatif olmayan finite number olmalı.');
  }
  const bands = tariff?.bands;
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new TypeError('distancePrice: tariff.bands eksik veya boş.');
  }
  const base = tariff.base ?? 0;
  const min = tariff.min ?? 0;
  const maxTo = bands[bands.length - 1].to;

  if (distKm > maxTo) return null; // kurye kapsamı dışı

  let total = base;
  for (const band of bands) {
    if (distKm <= band.from) break;
    total += (Math.min(distKm, band.to) - band.from) * band.rate;
  }
  return round2(Math.max(total, min));
}

// ---- Ağırlık ek ücreti (additive) ----
// weightConfig.tiers: [{ key, add }]. Dönüş: number (TL).
export function weightSurcharge(weightTier, weightConfig) {
  const tiers = weightConfig?.tiers;
  if (!Array.isArray(tiers)) {
    throw new TypeError('weightSurcharge: weightConfig.tiers eksik.');
  }
  const tier = tiers.find((t) => t.key === weightTier);
  if (!tier) {
    throw new RangeError(`weightSurcharge: geçersiz ağırlık dilimi "${weightTier}".`);
  }
  return round2(tier.add ?? 0);
}

// ---- Self-delivery taban fiyatı (geofence => en ucuz flat, yoksa null) ----
export function selfDeliveryBase(point, selfPoints) {
  if (!Array.isArray(selfPoints) || selfPoints.length === 0) return null;
  if (!isValidCoord(point)) return null;

  let best = null;
  for (const sp of selfPoints) {
    if (sp?.active === false) continue; // pasif nokta atlanır
    if (!isValidCoord(sp)) continue;
    const d = haversineKm(point, sp);
    if (d <= (sp.radius_km ?? 0)) {
      const flat = round2(sp.flat_price ?? 0);
      if (best === null || flat < best) best = flat;
    }
  }
  return best;
}

// ---- Ana çözümleme (dispatcher) ----
// input.mode: 'point' (GPS, kesin) | 'mahalle' (dropdown, aralık)
export function resolveQuote(input, config) {
  if (input == null || typeof input !== 'object') {
    throw new TypeError('resolveQuote: input objesi gerekli.');
  }
  if (config == null || typeof config !== 'object') {
    throw new TypeError('resolveQuote: config objesi gerekli.');
  }

  const tariff = config.courier_tariff;
  const ctx = {
    tariff,
    selfPoints: config.self_points ?? [],
    add: weightSurcharge(input.weight_tier, config.weight),
    roadFactor: tariff?.road_factor ?? 1.3,
    store: tariff?.store,
  };

  if (input.mode === 'point') return resolvePoint(input, ctx);
  if (input.mode === 'mahalle') return resolveMahalle(input, ctx);
  throw new RangeError(`resolveQuote: bilinmeyen mode "${input.mode}".`);
}

// --- GPS: kesin fiyat, cheapest-wins ---
function resolvePoint(input, ctx) {
  const { tariff, selfPoints, add, roadFactor, store } = ctx;
  const point = { lat: input.lat, lon: input.lon };

  // self-delivery (ağırlık eki self'e de eklenir)
  const selfBase = selfDeliveryBase(point, selfPoints);
  const selfPrice = selfBase === null ? null : round2(selfBase + add);

  // motorlu kurye (override varsa mesafe fiyatının yerine geçer, ağırlık yine eklenir)
  let courierPrice = null;
  if (input.in_courier_coverage && isValidCoord(store)) {
    const distKm = haversineKm(store, point) * roadFactor;
    const base =
      typeof input.override === 'number'
        ? input.override
        : distancePrice(distKm, tariff);
    if (base !== null) courierPrice = round2(base + add);
  }

  return pickCheapest(selfPrice, courierPrice, add);
}

// --- Dropdown: tahmini aralık + konum teşviki ---
function resolveMahalle(input, ctx) {
  const { tariff, selfPoints, add, roadFactor, store } = ctx;
  const centroid = input.centroid;
  const radius = input.radius_km ?? 0;

  // centroid bir self-geofence içinde mi (kaba, mahalle-altı hassasiyet GPS ister)
  const centroidSelf = selfDeliveryBase(centroid, selfPoints);

  // kurye aralığı (centroid ± yarıçap)
  let range = null;
  if (input.in_courier_coverage && isValidCoord(store) && isValidCoord(centroid)) {
    if (typeof input.override === 'number') {
      const p = round2(input.override + add);
      range = { min: p, max: p };
    } else {
      const dCenter = haversineKm(store, centroid) * roadFactor;
      const dNear = Math.max(0, dCenter - radius * roadFactor);
      const dFar = dCenter + radius * roadFactor;
      const pNear = distancePrice(dNear, tariff);
      const pFar = distancePrice(dFar, tariff);
      if (pNear !== null && pFar !== null) {
        range = { min: round2(pNear + add), max: round2(pFar + add) };
      }
    }
  }

  if (range) {
    return {
      type: 'range',
      method: 'Motorlu kurye',
      min: range.min,
      max: range.max,
      breakdown: { weight_add: add },
      needsLocation: true, // kesin fiyat + olası self indirimi için GPS
      note:
        centroidSelf !== null
          ? 'Konumunu paylaşırsan kendi teslimatımızla daha uygun olabilir.'
          : 'Kesin fiyat için konumunu paylaş.',
    };
  }

  // kurye kapsamı yok ama self olasılığı var => konum iste
  if (centroidSelf !== null) {
    return {
      type: 'needs_location',
      needsLocation: true,
      note: 'Bu bölgede kendi teslimatımız olabilir; kesin fiyat için konumunu paylaş.',
    };
  }

  // hiçbir yöntem uygulanamıyor
  return { type: 'kargo', method: 'Standart kargo', price: null };
}

// --- cheapest-wins seçici (şeffaflık: diğer yöntemi alternatives'te tut) ---
function pickCheapest(selfPrice, courierPrice, add) {
  const opts = [];
  if (selfPrice !== null) opts.push({ method: 'Kendi teslimat', price: selfPrice });
  if (courierPrice !== null) opts.push({ method: 'Motorlu kurye', price: courierPrice });

  if (opts.length === 0) {
    return { type: 'kargo', method: 'Standart kargo', price: null };
  }

  opts.sort((a, b) => a.price - b.price);
  const [best, ...rest] = opts;
  return {
    type: 'exact',
    method: best.method,
    price: best.price,
    breakdown: { weight_add: add },
    alternatives: rest,
  };
}
