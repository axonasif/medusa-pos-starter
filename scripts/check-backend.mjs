import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const sdkPackage = createRequire(import.meta.url)('@medusajs/js-sdk');

const Medusa = sdkPackage.default ?? sdkPackage;
const baseUrl = process.env.ASTHA_BACKEND_URL ?? 'http://localhost:9000';
const password = process.env.ASTHA_ADMIN_PASSWORD;
assert(password, 'Set ASTHA_ADMIN_PASSWORD in your shell; do not save it in the app');
const sdk = new Medusa({ baseUrl, auth: { type: 'jwt', jwtTokenStorageMethod: 'nostore' } });
const token = await sdk.auth.login('user', 'emailpass', {
  email: process.env.ASTHA_ADMIN_EMAIL ?? 'admin@local.test',
  password,
});
assert.equal(typeof token, 'string');
const headers = { Authorization: 'Bearer ' + token };
const { user } = await sdk.admin.user.me(undefined, headers);
assert(user.id);
const { regions } = await sdk.admin.region.list({ limit: 100 }, headers);
assert(regions.some((region) => region.currency_code === 'bdt'));
const { stock_locations } = await sdk.admin.stockLocation.list({ limit: 100 }, headers);
assert(stock_locations.length);
const { products } = await sdk.admin.product.list({ limit: 1, fields: '*variants' }, headers);
assert(products.length);
// The same read-only barcode lookup used by the mobile app. No fixture products,
// orders, payments, fulfillments or stock changes are created by this check.
const lookup = await sdk.admin.product.list(
  {
    limit: 1,
    offset: 0,
    variants: {
      $or: [{ ean: 'ASTHA-SMOKE-NO-MATCH' }, { upc: 'ASTHA-SMOKE-NO-MATCH' }, { barcode: 'ASTHA-SMOKE-NO-MATCH' }],
    },
  },
  headers,
);
assert.equal(lookup.products.length, 0);
console.log(
  'POS SDK compatibility passed: admin login, current user, BDT region, stock locations, products, barcode lookup. No store data changed.',
);
