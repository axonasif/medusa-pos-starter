import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, validateMedusaUrl } from '../utils/validate-medusa-url.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test('normalizes a pasted HTTPS URL without a double slash', () => {
  assert.equal(normalizeUrl(' https://azzgubi.com/ '), 'azzgubi.com');
});
test('recognizes a split tunnel through its public auth endpoint', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://azzgubi.com/auth/user/providers');
    return Response.json({ providers: [{ id: 'emailpass' }] });
  };
  assert.equal(await validateMedusaUrl('https://azzgubi.com/'), true);
});
test('supports older Medusa health checks', async () => {
  globalThis.fetch = async (url) =>
    url.endsWith('/health') ? new Response('OK') : new Response('Not found', { status: 404 });
  assert.equal(await validateMedusaUrl('shop.example'), true);
});
test('rejects storefront HTML and malformed backend URLs', async () => {
  globalThis.fetch = async () => new Response('<html>Storefront</html>');
  assert.equal(await validateMedusaUrl('shop.example'), false);
  assert.equal(await validateMedusaUrl('shop.example/app'), false);
  assert.equal(await validateMedusaUrl('user:password@shop.example'), false);
});
