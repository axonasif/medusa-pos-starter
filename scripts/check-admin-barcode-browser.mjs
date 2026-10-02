// Read-only browser integration check. All admin writes are intercepted before
// reaching Medusa, including the deliberately clicked Save used to verify React.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { adminBarcodeBridge, finishAdminScan } from '../utils/admin-barcode-bridge.ts';

const require = createRequire(
  process.env.MEDUSA_TEST_PACKAGE || new URL('../../store/apps/backend/package.json', import.meta.url),
);
const { chromium } = require('@playwright/test');
const origin = process.env.MEDUSA_TEST_URL || 'http://localhost:9000';
const path =
  process.env.MEDUSA_TEST_VARIANT_PATH ||
  '/app/products/prod_01M3F0SJEAFQ8GCKDGCQ9SQ7JP/variants/variant_01M3F0SJH6V34YFVGE3ZZ2Q5KB/edit';
const browser = await chromium.launch({ headless: true });
let context;
try {
  context = await browser.newContext(
    process.env.MEDUSA_TEST_MOBILE
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        }
      : {},
  );
  const login = await context.request.post(origin + '/auth/user/emailpass', {
    data: {
      email: process.env.MEDUSA_TEST_EMAIL || 'admin@local.test',
      password: process.env.MEDUSA_TEST_PASSWORD || 'medusa-demo-2026',
    },
    timeout: 15000,
  });
  assert.equal(login.status(), 200, 'POS login must succeed');
  const { token } = await login.json();
  const session = await context.request.post(origin + '/auth/session', {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
    timeout: 15000,
  });
  assert.equal(session.status(), 200, 'Token-to-cookie handoff must succeed');
  assert.ok(
    (await context.cookies()).some((cookie) => cookie.httpOnly),
    'Session should use an HttpOnly cookie',
  );

  const page = await context.newPage();
  const writes = [];
  await page.route('**/admin/**', async (route) => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    writes.push({ url: request.url(), body: request.postDataJSON() });
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Read-only test: save intercepted' }),
    });
  });
  await page.addInitScript(() => {
    window.__scanMessages = [];
    window.ReactNativeWebView = { postMessage: (data) => window.__scanMessages.push(JSON.parse(data)) };
  });
  await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 30000 });
  const input = page.locator('input[name="barcode"]');
  await input.waitFor({ timeout: 15000 });
  const original = await input.inputValue();
  await page.evaluate(adminBarcodeBridge);
  assert.equal(await page.locator('[data-astha-scan]').count(), 1);
  if (process.env.MEDUSA_TEST_MOBILE) {
    console.log(
      'Mobile bridge:',
      await page.evaluate(() => ({
        path: location.pathname,
        inputName: document.querySelector('input[name="barcode"]').name,
        buttonVisible: !!document.querySelector('[data-astha-scan]').getClientRects().length,
        label: document.querySelector('[data-astha-scan]').parentElement.tagName,
      })),
    );
  }
  await page.evaluate(adminBarcodeBridge);
  assert.equal(await page.locator('[data-astha-scan]').count(), 1, 'No duplicate buttons');
  await page.locator('[data-astha-scan]').click();
  const request = await page.evaluate(() => window.__scanMessages.find((message) => message.type === 'astha-scan'));
  assert.equal(request.path, path);
  await page.evaluate(finishAdminScan(request, null));
  assert.equal(await input.inputValue(), original, 'Cancel must not change the barcode');
  await page.locator('[data-astha-scan]').click();
  const second = await page.evaluate(() =>
    window.__scanMessages.filter((message) => message.type === 'astha-scan').at(-1),
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.evaluate(finishAdminScan(second, '0012345678905'));
  assert.equal(await input.inputValue(), '0012345678905');
  assert.equal(writes.length, 0, 'Scanning must not save automatically');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(500);
  assert.ok(
    writes.some((write) => write.body?.barcode === '0012345678905'),
    'React form submission must contain the scanned barcode',
  );
  console.log(
    'PASS: session sign-in, injected button, cancellation, leading zeroes, no auto-save, React save payload. No backend data changed.',
  );

  // Test stale references against the actual injected bridge in a minimal page.
  await page.setContent('<input name="barcode" value="original">');
  await page.evaluate(() => {
    delete window.__asthaBarcodeBridge;
  });
  await page.evaluate(adminBarcodeBridge);
  await page.locator('[data-astha-scan]').click();
  const stale = await page.evaluate(() =>
    window.__scanMessages.filter((message) => message.type === 'astha-scan').at(-1),
  );
  await page.evaluate(() => {
    document.querySelector('input').outerHTML = '<input name="barcode" value="new-editor">';
  });
  await page.evaluate(finishAdminScan(stale, '999'));
  assert.equal(await page.locator('input[name="barcode"]').inputValue(), 'new-editor');
  console.log('PASS: stale scan cannot fill a replaced editor.');
} finally {
  if (context) await context.request.delete(origin + '/auth/session');
  await browser.close();
}
