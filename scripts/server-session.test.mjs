import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkServerSession } from '../utils/server-session.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('a network outage keeps the saved session eligible for reconnect', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Network request failed');
  };
  assert.deepEqual(await checkServerSession('https://shop.example', 'saved-token'), { status: 'reconnecting' });
});

test('server and tunnel errors are not mistaken for an expired login', async () => {
  for (const status of [403, 404, 500, 502, 503, 504, 530]) {
    globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status });
    assert.deepEqual(await checkServerSession('https://shop.example', 'saved-token'), { status: 'reconnecting' });
  }
});

test('only an explicit 401 requires sign-in', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  assert.deepEqual(await checkServerSession('https://shop.example', 'saved-token'), { status: 'expired' });
});

test('an unresponsive server is aborted and retried, not logged out', async () => {
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')));
    });
  assert.deepEqual(await checkServerSession('https://shop.example', 'saved-token', 10), { status: 'reconnecting' });
});

test('recovery uses the same saved token and refreshes the user', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://shop.example/admin/users/me');
    assert.equal(options.headers.Authorization, 'Bearer saved-token');
    return Response.json({ user: { id: 'user_123', email: 'cashier@example.com', first_name: 'Cashier' } });
  };
  assert.deepEqual(await checkServerSession('https://shop.example/', 'saved-token'), {
    status: 'connected',
    user: { id: 'user_123', email: 'cashier@example.com', name: 'Cashier' },
  });
});

test('HTML and malformed responses keep reconnecting', async () => {
  for (const body of ['<html>Tunnel error</html>', '{}']) {
    globalThis.fetch = async () => new Response(body);
    assert.deepEqual(await checkServerSession('https://shop.example', 'saved-token'), { status: 'reconnecting' });
  }
});
