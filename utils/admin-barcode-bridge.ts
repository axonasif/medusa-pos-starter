export const variantEditPath = /^\/app\/products\/[^/]+\/variants\/[^/]+\/edit\/?$/;
const tableVariantEditPath = /^\/app\/products\/[^/]+\/edit-variant\/?$/;

export function isVariantEditorUrl(url: URL): boolean {
  return (
    variantEditPath.test(url.pathname) ||
    (tableVariantEditPath.test(url.pathname) && /^variant_[a-z0-9]+$/i.test(url.searchParams.get('variant_id') || ''))
  );
}

export type AdminScanRequest = { type: 'astha-scan'; id: string; path: string };

export function readAdminScanRequest(data: string, pageUrl: string, origin: string): AdminScanRequest | null {
  try {
    const sender = new URL(pageUrl);
    const message = JSON.parse(data);
    if (typeof message?.path !== 'string' || !message.path.startsWith('/app/')) return null;
    const url = new URL(message.path, origin);
    // Android's WEB_MESSAGE_LISTENER supplies sourceOrigin, not location.href.
    // Authenticate that origin, then validate the editor path carried by our
    // page bridge. Legacy Android/iOS full URLs must still match exactly.
    const originOnly = sender.pathname === '/' && !sender.search && !sender.hash;
    if (
      sender.origin !== origin ||
      url.origin !== origin ||
      !isVariantEditorUrl(url) ||
      message.type !== 'astha-scan' ||
      typeof message.id !== 'string' ||
      !/^[a-z0-9-]{1,80}$/.test(message.id) ||
      message.path !== url.pathname + url.search ||
      (!originOnly && message.path !== sender.pathname + sender.search)
    ) {
      return null;
    }
    return message;
  } catch {
    return null;
  }
}

// Install once per document. Observe React's SPA navigation and lazily rendered edit dialogs.
// Keep the exact input reference: a scan must never fill a subsequently opened editor.
export const adminBarcodeBridge = `
(function () {
  if (window.__asthaBarcodeBridge) {
    window.__asthaBarcodeBridge.refresh();
    return;
  }
  if (!document.documentElement) return;
  var pending = null;
  var route = /^\\/app\\/products\\/[^/]+\\/variants\\/[^/]+\\/edit\\/?$/;
  var tableRoute = /^\\/app\\/products\\/[^/]+\\/edit-variant\\/?$/;
  function isEditor() {
    return route.test(location.pathname) || (tableRoute.test(location.pathname) &&
      /^variant_[a-z0-9]+$/i.test(new URLSearchParams(location.search).get('variant_id') || ''));
  }
  function editorLocation() { return location.pathname + location.search; }
  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  window.__asthaBarcodeBridge = {
    acknowledge: function (id, path) {
      if (pending && pending.id === id && pending.path === path) clearTimeout(pending.timeout);
    },
    refresh: function () {
      install();
      post({ type: 'astha-admin-ready' });
    },
    finish: function (id, path, barcode) {
      if (!pending || pending.id !== id || pending.path !== path) return;
      var request = pending;
      clearTimeout(request.timeout);
      pending = null;
      request.button.disabled = false;
      request.button.textContent = 'Scan';
      if (barcode === null) return;
      if (editorLocation() !== path || !request.input.isConnected ||
          document.querySelector('input[name="barcode"]') !== request.input) {
        post({ type: 'astha-scan-result', id: id, success: false });
        return;
      }
      if (request.input.value && request.input.value !== barcode &&
          !window.confirm('Replace the existing barcode with ' + barcode + '?')) return;
      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      request.input.focus();
      setter.call(request.input, barcode);
      request.input.dispatchEvent(new Event('input', { bubbles: true }));
      request.input.dispatchEvent(new Event('change', { bubbles: true }));
      request.input.blur();
      post({ type: 'astha-scan-result', id: id, success: true });
    }
  };
  function install() {
    if (!isEditor()) return;
    var input = document.querySelector('input[name="barcode"]');
    if (!input || input.disabled || input.readOnly || (input.__asthaScanButton && input.__asthaScanButton.isConnected)) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Scan';
    button.setAttribute('data-astha-scan', '');
    button.setAttribute('aria-label', 'Scan barcode with the POS camera');
    button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;margin-left:8px;min-width:52px;min-height:28px;padding:3px 10px;border:1px solid #888;border-radius:6px;background:transparent;color:inherit;font-size:12px;line-height:20px;white-space:nowrap;flex-shrink:0;cursor:pointer';
    button.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (pending || !isEditor() || !input.isConnected) return;
      var id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      pending = { id: id, path: editorLocation(), input: input, button: button };
      pending.timeout = setTimeout(function () {
        if (!pending || pending.id !== id) return;
        window.__asthaBarcodeBridge.finish(id, pending.path, null);
        post({ type: 'astha-scan-timeout' });
      }, 5000);
      button.disabled = true;
      button.textContent = 'Scanning…';
      post({ type: 'astha-scan', id: id, path: editorLocation() });
    };
    var label = input.id && Array.from(document.querySelectorAll('label')).find(function (label) { return label.htmlFor === input.id; });
    if (label) label.appendChild(button);
    else input.parentElement.insertAdjacentElement('afterend', button);
    input.__asthaScanButton = button;
  }
  new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  // Cover history-only SPA transitions as well as React DOM mutations.
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      setTimeout(install, 0);
      return result;
    };
  });
  window.addEventListener('popstate', install);
  window.__asthaBarcodeBridge.refresh();
})(); true;
`;

export function finishAdminScan(request: AdminScanRequest, barcode: string | null): string {
  // JSON encoding prevents barcode content from becoming executable JavaScript.
  return `window.__asthaBarcodeBridge?.finish(${JSON.stringify(request.id)}, ${JSON.stringify(request.path)}, ${JSON.stringify(barcode)}); true;`;
}

export function acknowledgeAdminScan(request: AdminScanRequest): string {
  return `window.__asthaBarcodeBridge?.acknowledge(${JSON.stringify(request.id)}, ${JSON.stringify(request.path)}); true;`;
}
