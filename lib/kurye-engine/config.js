// lib/kurye-engine/config.js
// KV (Upstash Redis) veri erişim katmanı. resolve.js saf mantık; burası I/O.
// - getConfig(): KV oku -> validate -> geçersiz/erişilemezse DEFAULT_CONFIG fallback + kısa TTL cache
// - setConfig(): validate -> KV yaz -> cache invalidate
// Client dependency injection ile gelir (test edilebilirlik + public uçta read-only token kullanımı).

import { Redis } from '@upstash/redis';
import { DEFAULT_CONFIG } from './defaults.js';
import { validateConfig } from './schema.js';

const CONFIG_KEY = 'kurye:config';
const CACHE_TTL_MS = 30_000; // 30 sn: KV okuma sayısını düşürür, panelden değişiklik en geç 30 sn'de yansır

let _client = null;
let _cache = { value: null, expires: 0 };

// Varsayılan yazma/okuma client'ı (full token). Lazy: env yoksa import patlamasın.
function defaultClient() {
  if (_client) return _client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('config: KV_REST_API_URL / KV_REST_API_TOKEN env değişkenleri eksik.');
  }
  _client = new Redis({ url, token });
  return _client;
}

// Pure: ham veriyi doğrula; geçerliyse onu, değilse DEFAULT_CONFIG döndür.
export function resolveConfig(raw) {
  const { valid } = validateConfig(raw);
  return valid ? raw : DEFAULT_CONFIG;
}

// Config oku. client enjekte edilebilir (public uçta read-only client geç).
export async function getConfig({ client, useCache = true } = {}) {
  const now = Date.now();
  if (useCache && _cache.value && _cache.expires > now) {
    return _cache.value;
  }

  let raw = null;
  try {
    const c = client ?? defaultClient();
    raw = await c.get(CONFIG_KEY); // @upstash/redis objeyi otomatik parse eder
  } catch (err) {
    // KV erişilemezse sistem çökmesin; DEFAULT ile devam (cache'leme, geçici hata olabilir).
    console.error('getConfig: KV okuma hatası, DEFAULT_CONFIG fallback:', err?.message);
    return DEFAULT_CONFIG;
  }

  const resolved = resolveConfig(raw);
  _cache = { value: resolved, expires: now + CACHE_TTL_MS };
  return resolved;
}

// Config yaz (admin). Geçersizse yazmaz, anlamlı hata fırlatır.
export async function setConfig(next, { client } = {}) {
  const { valid, errors } = validateConfig(next);
  if (!valid) {
    const err = new Error('setConfig: geçersiz config -> ' + errors.join('; '));
    err.code = 'INVALID_CONFIG';
    throw err;
  }
  const c = client ?? defaultClient();
  await c.set(CONFIG_KEY, next);
  _cache = { value: next, expires: Date.now() + CACHE_TTL_MS };
  return next;
}

// Test/hot-reload için cache sıfırlama.
export function _clearCache() {
  _cache = { value: null, expires: 0 };
}

export { CONFIG_KEY, CACHE_TTL_MS };
