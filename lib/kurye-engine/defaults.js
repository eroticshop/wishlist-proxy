// lib/kurye-engine/defaults.js
// Kurye config'inin tek doğruluk kaynağı (single source of truth).
// KV boş/bozuksa getConfig() buna fallback eder; admin panel ilk kayıtta KV'ye yazar.
// Değerler kullanıcı tarafından verildi; yanlışlık olursa admin panelden optimize edilir.

export const DEFAULT_CONFIG = {
  courier_tariff: {
    // Progressive band'ler: contiguous (boşluksuz). Son band to:null => üst sınırsız.
    bands: [
      { from: 0, to: 20, rate: 30 },   // 0–20 km: 30 TL/km
      { from: 20, to: 50, rate: 25 },  // 20–50 km: 25 TL/km
      { from: 50, to: null, rate: 22 } // 50+ km: 22 TL/km (açık uçlu)
    ],
    base: 500,          // taban ücret (TL)
    min: 300,           // minimum ücret tabanı (TL)
    road_factor: 1.3,   // kuş uçuşu -> yol mesafesi katsayısı
    store: { lat: 40.1832009, lon: 29.0645624 } // Erox Bursa mağaza koordinatı
  },
  weight: {
    model: 'add', // additive: mesafe fiyatının üstüne sabit ek (hem kurye hem self)
    tiers: [
      { key: '0-10', add: 0 },     // 0–10 kg
      { key: '10-20', add: 150 },  // 10–20 kg
      { key: '20+', add: 300 }     // 20+ kg
    ]
  },
  // Metro/hub self-delivery noktaları: Adım 1 (BursaRay ETL) ile doldurulacak.
  self_points: [],
  // Kurye hizmet kapsamı: Adım 1b admin panelde işaretlenecek.
  coverage: { ilce_ids: [], mahalle_ids: [] },
  // Mahalle bazlı sabit fiyat ezmeleri: { mahalle_id: fiyat }
  overrides: {}
};
