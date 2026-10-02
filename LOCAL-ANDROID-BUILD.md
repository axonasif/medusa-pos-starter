# Astha POS local Android build

This is a separate checkout of Agilo's MIT-licensed Medusa POS starter, pinned initially to commit `9a3b8571b0d2760a3ab1a897981b5e67d4addcea`. Astha's backend/storefront project is not modified by this build.

## Cart UI follow-up (not yet built)

Add Customer and Add promotion now share one row above the cart items. A selected customer's name/email stays in the same compact position. The cart uses a plain React Native FlatList without row layout/exit animations or animated summaries. Android subview clipping is disabled, and quantity inputs have an explicit text color to address disappearing numbers while scrolling. Swipe-to-remove remains, with a short 120 ms transition.

TypeScript, full app lint and whitespace checks pass. These changes have not been tested on a phone or included in a new APK; the latest built APK remains 1.0.10.

## Product quick checkout (APK 1.0.7 / Android versionCode 8)

Navigation correction shipped in APK **1.0.10 / Android versionCode 11**: the product's Checkout button now waits for the item to be added, then opens `/cart` for review, not `/checkout/:id`. The Cart screen's own Checkout button still opens checkout. Add to cart still returns to the previous screen. TypeScript, lint, release build and APK signature verification pass. Install `artifacts/astha-pos-android-arm64-1.0.10.apk`. SHA-256: `5116425317b01a735da93193bdb7f108402b1d9cd2fa38ec5bcc402d4125e0bc`.

Product-sheet layout follow-up shipped in APK **1.0.9 / Android versionCode 10**: removed the Quantity label. Product details opts into a bounded full-height sheet, with a fixed, safe-area-padded bottom action bar outside the scroll view. Images, description, quantity and variants scroll above it with an Android scrollbar when needed. Long descriptions collapse to three lines with Read more / Show less; the expansion control is only shown when measured text exceeds three lines. Other bottom sheets keep their previous sizing behavior. TypeScript, full app lint, release build and APK signature verification pass; not visually checked on a device. Install `artifacts/astha-pos-android-arm64-1.0.9.apk`. SHA-256: `c317839795d6e0ad34769fe37168f3259e8c0bef3bc5b4ff454ee87b66bc9452`.

UI follow-up shipped in APK **1.0.8 / Android versionCode 9**: the normal yellow receive-cash notice is removed (checkout failure notices remain). Only the tapped product action shows a spinner; both actions stay disabled until completion/failure. Quantity is now centered in a bordered control directly below the product description and above product options, instead of beside the bottom actions. TypeScript and full app lint pass. Release build and APK signature verification passed; no emulator run. Install `artifacts/astha-pos-android-arm64-1.0.8.apk`. SHA-256: `5d2c39ff504a5e1cfdbf445525d5c2c601e1f248779a163822b5772975cfef2c`.

Build and APK signature verification passed. Install `artifacts/astha-pos-android-arm64-1.0.7.apk` over the existing app. SHA-256: `bdea2614563465077d653c1d446cb893d546ec206c06b132aa896e5e32ca6b2d`. This uses the release variant, production JavaScript and Hermes. Android R8 code minification and resource shrinking remain off; the development signing key remains for local phone testing.

Product details has side-by-side “Add to cart” and “Checkout” buttons below the quantity picker. Both add the selected variant/quantity to the current cart. Add to cart closes the sheet and stays on the previous screen; Checkout waits for the add to succeed, then replaces the sheet with checkout for the returned draft order ID. It includes other products already in the cart and does not complete a sale automatically. Both buttons are disabled while adding, with an immediate tap guard against duplicate requests. A failed add leaves the sheet open for retry. Back to Cart from checkout explicitly opens Cart, including when checkout was entered directly from a product.

The extra cash-received Alert popup is removed. Pressing “Cash received — Complete sale” records payment and hands over stock directly; the inline receive-cash-first instruction and payment/retry safeguards remain. TypeScript, full app lint, and all 30 existing local tests pass. No emulator run for this change.

## Reconnect and cash checkout (APK 1.0.6 / Android versionCode 7)

Built and APK-signature verified successfully. Install `artifacts/astha-pos-android-arm64-1.0.6.apk` over the existing app. SHA-256: `1ba8216ba35457a8a82513ccf8e4b367c5d4b77f4b4a4c77a676b8eada47ddd8`.

Saved login credentials are restored locally without requiring the server to be online. An authenticated `/admin/users/me` check runs on launch, on foreground resume, every ten seconds while connected, and every five seconds while reconnecting. Each request has an eight-second timeout. Network errors, timeouts, tunnel HTML, and non-401 server errors retain the saved token and show a compact red “Server unavailable — Trying to reconnect…” banner. Only an explicit 401 response expires the login. Successful reconnection refreshes the user and active data queries; it does not automatically replay failed sales or other writes.

Transient settings fetch failures no longer replace selected settings with empty values or redirect the cashier to setup. Cached settings keep the main screens available. If no settings cache exists on an offline launch, the loading screen remains beneath the reconnect banner until the server recovers. This does not add offline checkout support.

The cashier must confirm the displayed full BDT total has been received in cash before completing checkout. The app records the payment with Medusa's existing `pp_system_default` manual provider, then fulfills and marks goods handed over. Order metadata identifies it as cash; the provider's name in Medusa Admin remains the system/manual name, not a custom Cash provider. Retries read existing payment collections and captured payments, preventing duplicate collections/capture after a lost response. Different-method, split, partial or refunded payments require manual review instead of being silently treated as cash. Never collect the money twice when resuming a failed checkout.

TypeScript, full app lint, and all 30 local tests pass. A disposable Medusa HTTP integration fixture also passes using the actual POS helper/SDK, including lost cash-payment and fulfillment responses: one captured Tk. 300 manual payment, one fulfillment, stock 10 to 8, sales Tk. 300, recorded cost Tk. 160 and collected Tk. 300. No live shop orders or stock were used, and no backend runtime code or payment-provider configuration was changed. No emulator run was performed.

## Embedded Admin Panel (included in APK 1.0.2)

Version 1.0.5 / Android versionCode 6 fixes the native scanner handoff. React Native WebView 13.15's Android `WEB_MESSAGE_LISTENER` passes `sourceOrigin.toString()` as the message event URL, not the full page URL. The previous validator consequently rejected valid scan requests. It now verifies the sender origin and the payload's editor route, while still requiring an exact route match when the platform supplies a full URL. A native acknowledgement clears the button's five-second handoff timeout; a dropped request resets Scan and displays a toast rather than remaining stuck. TypeScript, lint, and 19 local tests passed. Emulator testing was stopped at the user's request; the camera handoff awaits their phone check.

Version 1.0.4 / Android versionCode 5 keeps the injected-button approach, as requested. No dashboard package patch or backend change was made. The missed route was Medusa's product-table editor: `/app/products/:productId/edit-variant?variant_id=:variantId`. Both that route and the nested `/app/products/:productId/variants/:variantId/edit` route now work. Scan requests are bound to pathname plus query parameters, so switching `variant_id` invalidates a pending scan even when the pathname stays the same. Five bridge tests, app TypeScript, and the read-only mobile browser check of the table editor passed before this quick APK build. Actual native camera decoding in this version still needs a phone test.

Version 1.0.3 / Android versionCode 4 addresses the phone-reported stuck loading bar and missing Scan button. The loading hint is now a 32px non-blocking overlay, not a row that takes space from the WebView. It clears on native load completion, progress completion, idle navigation, a page bridge readiness message, or an error, with a 15-second visual fallback. Back is not disabled by the loading hint. The bridge also refreshes on native navigation and JavaScript history changes; Scan is placed inline next to the Barcode label instead of below the input. TypeScript and lint passed; no additional emulator tests were run at the user's request.

Settings → Admin Panel opens the configured server's `/app` in an embedded WebView. On Android it exchanges the existing POS JWT using Medusa's `/auth/session` endpoint, then verifies `/admin/users/me` with cookies only. React Native's Android cookie handler shares the native WebView CookieManager. The WebView is mounted before the exchange because `incognito` clears previous cookies. WebView POST cannot carry custom headers on Android, so the authenticated POST is made by native `fetch`, not a WebView navigation. No password is retained, and the JWT is never inserted into page JavaScript, localStorage, or URLs. Other platforms and failed handoffs use normal admin login.

Closing/unmounting the panel attempts to destroy its cookie session, without logging out the POS JWT. Cleanup has a timeout and shows a warning if it fails. The next panel opening clears previous WebView cookies. Android's `incognito` mode is not a completely separate cookie jar: it clears app WebView cookies on opening and disables caching. This app has no other WebView features relying on those cookies.

On `/app/products/:productId/variants/:variantId/edit`, the app injects a Scan button next to `input[name="barcode"]`. It uses the same Expo camera decoder and barcode types as the sales scanner but returns the raw barcode without looking up a product. Leading zeroes are retained. The input's native setter plus input/change events update React's form. Cancel changes nothing, replacing an existing barcode requires confirmation, and closing/replacing the editor invalidates the captured input reference. Scanning never saves automatically; use the admin's Save button. Main-frame navigation is restricted to the configured server origin.

Checks passed before the build: app TypeScript and lint, 17 local tests, and a read-only browser integration check covering session login, button injection, cancellation, leading zeroes, no automatic saving, React's intercepted save payload, and stale editor protection. The integration check intercepts all admin writes; it does not change the test product. APK 1.0.2 includes these changes. Further emulator testing was skipped at the user's request; native Android WebView/camera behavior is awaiting their phone test.

```bash
node --experimental-strip-types --test scripts/*.test.mjs
node --experimental-strip-types scripts/check-admin-barcode-browser.mjs
```

The browser check uses Playwright from the sibling Medusa backend by default. Override `MEDUSA_TEST_PACKAGE`, `MEDUSA_TEST_URL`, `MEDUSA_TEST_VARIANT_PATH`, and credentials via environment variables when testing another checkout. It defaults to the local demo admin and the variant used to request this feature. No credentials are embedded in the app.

## Install and connect

Version 1.0.2 / Android versionCode 3 removes the automatic cart jump after adding a product and adds the embedded Admin Panel/barcode field scanner. The product sheet closes back to the previous Products/Scan screen and shows “Added to cart”. Open the Cart tab when ready, then choose Checkout. The in-store stock/fulfillment flow from 1.0.1 is unchanged. During iteration, run quick lint/type/tests; do not rebuild a release APK unless requested.

The standalone ARM64 test APK is built to `artifacts/astha-pos-android-arm64.apk`. Copy it to a modern ARM64 Android phone/tablet, open it, and allow installation from that source when Android asks. It bundles its JavaScript and does not require Expo Go, a Metro development server, or an Expo account.

On first launch, enter your HTTPS Medusa backend URL (for the existing split tunnel, `https://azzgubi.com`, not `/app`), then log in with your admin credentials. The Medusa backend and tunnel must be running. Select the Bangladesh/BDT region, sales channel and stock location in the setup wizard. Grant camera permission to use scanning. Populate each sellable variant's barcode/EAN/UPC first; an empty barcode field cannot match a scan. Never embed admin passwords or tokens in the APK or source.

This is the **staff POS**, not an Android wrapper of the customer storefront. A phone's `localhost` points at the phone, not your Mac. The upstream app expects HTTPS.

## Build again

Package manager: npm, using the upstream `package-lock.json`. Node 22 is recommended by `.nvmrc`. The installed build tools are Java 21 from Android Studio and project-local Android SDK 36/build-tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Downloads, Gradle caches, generated native files and APKs are ignored by Git.

With Node 22 available:

```sh
cd /Users/volatile/medusa-pos-starter
npm ci --no-audit --no-fund
bash scripts/build-android-local.sh
```

On this Mac you can reuse the shop's Node-only development environment without starting the shop:

```sh
nix develop /Users/volatile/store -c bash -c 'cd /Users/volatile/medusa-pos-starter && bash scripts/build-android-local.sh'
```

Set `ANDROID_HOME` to an accessible complete SDK if you want to use another installation. `~/.android` normally contains emulator/user settings, not SDK compiler packages. The supplied script defaults to `.local/android-sdk`, uses Android Studio's bundled Java unless `JAVA_HOME` is set, and keeps Gradle state in `.local/gradle`.

On this Mac `.local/android-sdk` is now a symlink to the SDK you moved to `/Users/volatile/Library/Android/sdk`. The missing NDK version **27.1.12297006** was added alongside your existing NDK versions without replacing them. Temporary duplicate SDK/download files were moved to Trash and are recoverable. Your moved AVDs/settings were not rewritten; launch testing uses an isolated AVD under this project's `.local/avd`.

The first build exhausted the upstream default 512 MB JVM metaspace during Android lint. The script now allocates 1 GB metaspace with a 2 GB heap and two Gradle workers. The retry passed without disabling Android lint. It also sets `NODE_ENV=production` for standalone bundling.

Changes from upstream app configuration: name **Astha POS**, package `com.azzgubi.astha.pos`, URI scheme `asthapos`, barcode camera enabled, audio permission disabled, and upstream Agilo Expo project/owner/update URL removed. Expo OTA updates are disabled. Upstream icons/visual design are retained. No EAS cloud build or publishing is performed.

The login URL validation now supports Medusa 2.21's public `/auth/user/providers` endpoint, falling back to `/health` for older backends. This fixes split-tunnel setups where `/health` reaches the storefront but `/auth` reaches Medusa. Four local tests cover URL normalization, split tunnels, older health checks, and invalid/HTML endpoints.

## Signing and limitations

The release-variant APK is signed using Expo's generated **development signing key**, solely for local testing. It is not a production/Play Store release identity. Do not use the public development key for real deployment. Before production, create and securely retain your own signing key, set up staff permissions, and review the app's dependencies and checkout/payment behavior.

The upstream Medusa SDK is 2.10.2; Astha is 2.21.1. A read-only compatibility helper is supplied:

```sh
# Set ASTHA_ADMIN_PASSWORD in your shell; do not commit it.
node scripts/check-backend.mjs
```

It verifies login/current user, BDT region, locations, catalog and the app's barcode lookup. It creates no products, orders or stock. Set `ASTHA_BACKEND_URL` and `ASTHA_ADMIN_EMAIL` if needed.

Version **1.0.1 / Android versionCode 2** adds in-store handover at checkout. It converts the draft order, fulfills goods from the selected warehouse, marks them delivered, then completes the order. Managed inventory is deducted by Medusa itself, not by a separate manual quantity adjustment. Variants without inventory management have no stock quantity deducted. There is no automatic payment capture: record money collected in Medusa Admin. A completed/delivered sale is not proof of payment.

The warehouse must be linked to the sale's channel, have a Bangladesh street address and an existing `manual_manual` fulfillment option for each product's shipping profile. The current Astha Warehouse already meets these configuration requirements. The app uses manual fulfillment, adds no shipping charge and books no courier. It groups products by shipping profile and shipping requirement. It does not install a backend route, change Medusa workflows, enable inventory management, onboard purchase costs or change the tunnel.

Only press **Complete In-store Sale** for goods handed to the customer now. Do not use it for an order awaiting delivery. With Purchasing & Profit enabled and initialized, the native HTTP guard records cost at fulfillment and recognizes the sale at delivery. Untracked products/paused tracking still have the module's existing coverage limitations.

If checkout is interrupted, open Cart and **Resume Checkout** for the same sale. The stored order is retained until all steps succeed, and the app checks existing server fulfillments before consuming more stock. It does not show a success dialog merely because draft conversion succeeded. Products/orders refresh afterward. Canceled, non-POS or different-warehouse fulfillments require review in Admin instead of automatic reprocessing. Do not manually adjust inventory or create a replacement sale to get past an error. After Purchasing & Profit recovery is needed, recover there before resuming. This is a sequence of native API operations, not a cross-module transaction or an offline POS. Multiple devices should not operate on the same cart simultaneously.

Real-device barcode decoding, real payment handling and production/multi-device fault testing remain outstanding. This is still a local test-signed APK.

## Checkout verification

Verified on 2026-09-26: 13 app tests, 11 backend purchasing unit tests and 11 HTTP integration tests passed, plus app/backend lint and TypeScript checks. The real-response-loss recovery fixture passed separately. The standalone APK built successfully, its signature verified, and it installed over 1.0.0 and launched in the isolated ARM64 emulator. Your live shop stock was not used for checkout tests.

Current APK: `artifacts/astha-pos-android-arm64-1.0.5.apk` (also copied to `artifacts/astha-pos-android-arm64.apk`), version 1.0.5 / Android versionCode 6, ~47 MB. Rebuilt on 2026-09-26 with the Android origin-only message fix. Gradle release assembly and APK signature verification passed. SHA-256: `41475248b2d6330a45000979863d11e5052f68ca52cb95c38d62bdd5026fb60c`. Previous builds are retained as version-named 1.0.0 through 1.0.4 APKs. The isolated emulator was shut down without further testing, at the user's request.

Run the app's URL/checkout retry tests with Node 22:

```sh
node --experimental-strip-types --test scripts/complete-pos-sale.test.mjs scripts/validate-medusa-url.test.mjs
npx --no-install tsc --noEmit
npm run lint
```

The shop's HTTP suite includes a disposable in-store-sale regression. To execute the **actual app helper and its pinned 2.10.2 SDK** against the test server, run from `/Users/volatile/store`:

```sh
nix develop -c bash -c 'env DB_HOST=localhost DB_PORT=54329 DB_USERNAME=medusa DB_PASSWORD= POS_CHECKOUT_RUNNER=/Users/volatile/medusa-pos-starter/scripts/run-pos-fixture.mjs pnpm --dir apps/backend exec env TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules jest --runInBand --forceExit purchasing.spec.ts'
```

The fixture script refuses the real shop's port 9000. The runner creates/resets only `astha-purchasing-integration`, not the shop database. Assertions check 10 → 8 stocked units, zero remaining reservations, one fulfillment, delivery/completion, Tk. 300 sales, Tk. 160 cost and zero collected payment. It deliberately loses a response after a real fulfillment, resumes and repeats checkout to verify no double deduction/cost posting. Without `POS_CHECKOUT_RUNNER`, the backend test exercises the same native endpoints directly.

Medusa 2.21's order response defaults omit currency/channel fields, so checkout requests them explicitly. Its shipping-option `is_return` query causes a local server error; the app instead reads option rules and excludes return-only options without that query. Both were identified before building the updated APK.

The repository's Expo compatibility check recommends newer patch releases within SDK 54. The initial build preserves the upstream lockfile/dependency versions rather than silently migrating its stack; review patches before a production deployment.
