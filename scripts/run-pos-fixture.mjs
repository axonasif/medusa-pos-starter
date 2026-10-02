// Only the disposable Medusa test runner may supply this fixture and token.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { completePosSale } from '../utils/complete-pos-sale.ts';

assert.equal(process.env.ASTHA_POS_DISPOSABLE_TEST, '1');
const baseUrl = process.env.ASTHA_POS_TEST_URL;
assert.match(baseUrl ?? '', /^http:\/\/localhost:\d+$/);
assert.notEqual(new URL(baseUrl).port, '9000', 'Never target the shop server');
const sdkPackage = createRequire(import.meta.url)('@medusajs/js-sdk');
const Medusa = sdkPackage.default ?? sdkPackage;
const sdk = new Medusa({ baseUrl, auth: { type: 'jwt', jwtTokenStorageMethod: 'memory' } });
await sdk.client.setToken(process.env.ASTHA_POS_TEST_TOKEN);
const id = process.env.ASTHA_POS_TEST_ORDER_ID;
const locationId = process.env.ASTHA_POS_TEST_LOCATION_ID;
const request = sdk.client.fetch.bind(sdk.client);
sdk.client.fetch = async (path, ...args) => {
  const response = await request(path, ...args);
  if (path.endsWith('/mark-as-paid')) throw new Error('Injected lost cash response');
  return response;
};
await assert.rejects(completePosSale(sdk, id, locationId, 300), /Injected lost cash response/);
sdk.client.fetch = request;
// Simulate a disconnected phone AFTER Medusa has deducted stock and posted
// cost. Recovery must read that fulfillment instead of consuming it again.
const fulfill = sdk.admin.order.createFulfillment.bind(sdk.admin.order);
sdk.admin.order.createFulfillment = async (...args) => {
  await fulfill(...args);
  throw new Error('Injected lost fulfillment response');
};
await assert.rejects(completePosSale(sdk, id, locationId, 300), /Injected lost fulfillment response/);
sdk.admin.order.createFulfillment = fulfill;
await completePosSale(sdk, id, locationId, 300);
await completePosSale(sdk, id, locationId, 300);
const { order } = await sdk.admin.order.retrieve(id, {
  fields: '+payment_collections.*,+payment_collections.payments.*',
});
assert.equal(order.payment_collections.length, 1);
assert.equal(order.payment_collections[0].status, 'completed');
assert.equal(Number(order.payment_collections[0].captured_amount), 300);
assert.equal(order.payment_collections[0].payments.length, 1);
assert.equal(order.payment_collections[0].payments[0].provider_id, 'pp_system_default');
console.log('POS cash and stock retries recovered lost responses without duplicate payment or fulfillment.');
