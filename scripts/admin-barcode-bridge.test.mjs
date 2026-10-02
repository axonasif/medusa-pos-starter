import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adminBarcodeBridge, finishAdminScan, readAdminScanRequest } from '../utils/admin-barcode-bridge.ts';

const origin = 'https://shop.example';
const path = '/app/products/prod_123/variants/variant_456/edit';
const request = { type: 'astha-scan', id: 'abc-123', path };

test('only accepts scan requests from the configured origin and a variant editor', () => {
  assert.deepEqual(readAdminScanRequest(JSON.stringify(request), origin + path, origin), request);
  for (const url of ['https://evil.example' + path, origin + '/app/products', origin + path + '/other']) {
    assert.equal(readAdminScanRequest(JSON.stringify(request), url, origin), null);
  }
});

test('rejects malformed or mismatched bridge messages', () => {
  for (const data of [
    'invalid',
    'null',
    JSON.stringify({ ...request, path: '/app' }),
    JSON.stringify({ ...request, id: '";evil()' }),
    JSON.stringify({ ...request, type: 'other' }),
  ]) {
    assert.equal(readAdminScanRequest(data, origin + path, origin), null);
  }
});

test('reply safely encodes raw barcodes, preserves leading zeroes, and supports cancellation', () => {
  for (const barcode of ['0012345678905', '";throw new Error("unsafe"); //', "a'\\\n", null]) {
    let received;
    vm.runInNewContext(finishAdminScan(request, barcode), {
      window: {
        __asthaBarcodeBridge: {
          finish: (...args) => {
            received = args;
          },
        },
      },
    });
    assert.deepEqual(received, [request.id, request.path, barcode]);
  }
});

test('injection is valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(adminBarcodeBridge));
});

test('accepts the normal product-table editor and binds its variant query parameter', () => {
  const tablePath = '/app/products/prod_123/edit-variant?variant_id=variant_456';
  const message = { ...request, path: tablePath };
  assert.deepEqual(readAdminScanRequest(JSON.stringify(message), origin + tablePath, origin), message);
  assert.equal(
    readAdminScanRequest(
      JSON.stringify(message),
      origin + '/app/products/prod_123/edit-variant?variant_id=variant_789',
      origin,
    ),
    null,
  );
  assert.equal(
    readAdminScanRequest(JSON.stringify(message), origin + '/app/products/prod_123/edit-variant', origin),
    null,
  );
});

test('accepts Android source-origin-only message events without weakening origin or route checks', () => {
  for (const editorPath of [path, '/app/products/prod_123/edit-variant?variant_id=variant_456']) {
    const message = { ...request, path: editorPath };
    assert.deepEqual(readAdminScanRequest(JSON.stringify(message), origin, origin), message);
    assert.deepEqual(readAdminScanRequest(JSON.stringify(message), origin + '/', origin), message);
    assert.equal(readAdminScanRequest(JSON.stringify(message), 'https://evil.example', origin), null);
  }
  for (const invalidPath of [
    '/app/products',
    '//evil.example/app/products/prod_123/variants/variant_456/edit',
    'https://evil.example' + path,
  ]) {
    assert.equal(readAdminScanRequest(JSON.stringify({ ...request, path: invalidPath }), origin, origin), null);
  }
});
