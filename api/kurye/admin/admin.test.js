// api/kurye/admin/admin.test.js — adminAuth birim + endpoint smoke (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'proxy_secret_abc';
process.env.SHOPIFY_API_SECRET = SECRET;
process.env.KURYE_ADMIN_PASSWORD = 'gizli-parola-123';

const {
  checkPassword, signSession, verifySession, parseCookie, sessionCookie, clearCookie, COOKIE_NAME,
} = await import('../../../lib/kurye-engine/adminAuth.js');
const loginHandler = (await import('./login.js')).default;
const configHandler = (await import('./config.js')).default;

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

// ---- adminAuth: şifre ----
test('checkPassword: doğru/yanlış/uzunluk', () => {
  assert.equal(checkPassword('abc', 'abc'), true);
  assert.equal(checkPassword('abc', 'abd'), false);
  assert.equal(checkPassword('ab', 'abc'), false);
  assert.equal(checkPassword('', ''), false);
});

// ---- adminAuth: session ----
test('signSession/verifySession: geçerli token doğrular', () => {
  const t = signSession(SECRET);
  assert.equal(verifySession(t, SECRET), true);
});
test('verifySession: yanlış secret reddeder', () => {
  const t = signSession(SECRET);
  assert.equal(verifySession(t, 'baska_secret'), false);
});
test('verifySession: kurcalanmış token reddeder', () => {
  const t = signSession(SECRET) + 'x';
  assert.equal(verifySession(t, SECRET), false);
});
test('verifySession: süresi dolmuş reddeder', () => {
  const t = signSession(SECRET, -10); // 10 sn önce expire
  assert.equal(verifySession(t, SECRET), false);
});
test('verifySession: boş/çöp güvenli', () => {
  assert.equal(verifySession('', SECRET), false);
  assert.equal(verifySession('%%%', SECRET), false);
});

// ---- cookie ----
test('parseCookie: değer çeker', () => {
  const c = `foo=1; ${COOKIE_NAME}=abc%20def; bar=2`;
  assert.equal(parseCookie(c), 'abc def');
});
test('sessionCookie: güvenlik flag’leri', () => {
  const c = sessionCookie('tok');
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Strict/);
  assert.match(c, /Max-Age=\d+/);
});
test('clearCookie: Max-Age=0', () => {
  assert.match(clearCookie(), /Max-Age=0/);
});

// ---- login endpoint ----
test('login: yanlış şifre => 401', async () => {
  const res = mockRes();
  await loginHandler({ method: 'POST', body: { password: 'yanlis' } }, res);
  assert.equal(res.statusCode, 401);
});
test('login: doğru şifre => 200 + Set-Cookie', async () => {
  const res = mockRes();
  await loginHandler({ method: 'POST', body: { password: 'gizli-parola-123' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], new RegExp(COOKIE_NAME));
});
test('login: GET => 405', async () => {
  const res = mockRes();
  await loginHandler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
});

// ---- config endpoint ----
function authedReq(method, body) {
  const token = signSession(SECRET);
  return { method, headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}` }, body };
}
test('config: session yok => 401', async () => {
  const res = mockRes();
  await configHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
});
test('config GET: session var => config + Bursa tree', async () => {
  const res = mockRes();
  await configHandler(authedReq('GET'), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.config.courier_tariff);          // config geldi
  assert.equal(res.body.tree.meta.districtCount, 17); // Bursa ağacı geldi
});
test('config POST: config eksik => 400', async () => {
  const res = mockRes();
  await configHandler(authedReq('POST', {}), res);
  assert.equal(res.statusCode, 400);
});
test('config POST: geçersiz config => 422', async () => {
  const res = mockRes();
  const bad = { courier_tariff: 'bozuk', weight: { tiers: [] } };
  await configHandler(authedReq('POST', { config: bad }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error, 'invalid_config');
});
