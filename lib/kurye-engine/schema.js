// lib/kurye-engine/schema.js
// Config doğrulama katmanı. Hem getConfig (KV okuma) hem setConfig (admin yazma) kullanır.
// Asla throw etmez; { valid, errors[] } döner. Böylece bozuk KV verisi sistemi çökertmez.

import { isValidCoord } from './resolve.js'; // DRY: koordinat doğrulaması tek yerden

export function validateConfig(cfg) {
  const errors = [];

  if (cfg == null || typeof cfg !== 'object') {
    return { valid: false, errors: ['config bir obje olmalı.'] };
  }

  // --- courier_tariff ---
  const t = cfg.courier_tariff;
  if (t == null || typeof t !== 'object') {
    errors.push('courier_tariff eksik.');
  } else {
    if (!Array.isArray(t.bands) || t.bands.length === 0) {
      errors.push('courier_tariff.bands boş olamaz.');
    } else {
      t.bands.forEach((b, i) => {
        const isLast = i === t.bands.length - 1;
        if (typeof b.from !== 'number' || b.from < 0) {
          errors.push(`band[${i}].from >= 0 number olmalı.`);
        }
        if (isLast) {
          // Son band: to null (açık uçlu) veya from'dan büyük number
          if (b.to !== null && (typeof b.to !== 'number' || b.to <= b.from)) {
            errors.push(`band[${i}].to son band için null ya da from'dan büyük number olmalı.`);
          }
        } else if (typeof b.to !== 'number' || b.to <= b.from) {
          errors.push(`band[${i}].to from'dan büyük number olmalı.`);
        }
        if (typeof b.rate !== 'number' || b.rate <= 0) {
          errors.push(`band[${i}].rate pozitif olmalı.`);
        }
        // Contiguity: boşluk/çakışma olmamalı
        if (i > 0 && t.bands[i - 1].to !== b.from) {
          errors.push(`band[${i}] önceki bandla bitişik değil (boşluk/çakışma).`);
        }
      });
    }
    if (t.base != null && (typeof t.base !== 'number' || t.base < 0)) {
      errors.push('courier_tariff.base >= 0 olmalı.');
    }
    if (t.min != null && (typeof t.min !== 'number' || t.min < 0)) {
      errors.push('courier_tariff.min >= 0 olmalı.');
    }
    if (typeof t.road_factor !== 'number' || t.road_factor <= 0) {
      errors.push('courier_tariff.road_factor pozitif olmalı.');
    }
    if (!isValidCoord(t.store)) {
      errors.push('courier_tariff.store geçerli koordinat olmalı.');
    }
  }

  // --- weight ---
  const w = cfg.weight;
  if (w == null || typeof w !== 'object' || !Array.isArray(w.tiers) || w.tiers.length === 0) {
    errors.push('weight.tiers boş olamaz.');
  } else {
    w.tiers.forEach((tier, i) => {
      if (typeof tier.key !== 'string' || tier.key.length === 0) {
        errors.push(`weight.tiers[${i}].key eksik.`);
      }
      if (typeof tier.add !== 'number' || tier.add < 0) {
        errors.push(`weight.tiers[${i}].add >= 0 olmalı.`);
      }
    });
  }

  // --- self_points (boş olabilir) ---
  if (cfg.self_points != null) {
    if (!Array.isArray(cfg.self_points)) {
      errors.push('self_points bir dizi olmalı.');
    } else {
      cfg.self_points.forEach((sp, i) => {
        if (!isValidCoord(sp)) errors.push(`self_points[${i}] geçerli koordinat değil.`);
        if (typeof sp.radius_km !== 'number' || sp.radius_km < 0) {
          errors.push(`self_points[${i}].radius_km >= 0 olmalı.`);
        }
        if (typeof sp.flat_price !== 'number' || sp.flat_price < 0) {
          errors.push(`self_points[${i}].flat_price >= 0 olmalı.`);
        }
      });
    }
  }

  // --- coverage / overrides (opsiyonel tip kontrolü) ---
  if (cfg.coverage != null && typeof cfg.coverage !== 'object') {
    errors.push('coverage obje olmalı.');
  }
  if (cfg.overrides != null && typeof cfg.overrides !== 'object') {
    errors.push('overrides obje olmalı.');
  }

  return { valid: errors.length === 0, errors };
}
