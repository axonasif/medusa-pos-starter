export const normalizeUrl = (url: string): string =>
  url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

export const validateMedusaUrl = async (url: string): Promise<boolean> => {
  const host = normalizeUrl(url);
  if (!host) return false;
  try {
    const parsed = new URL(`https://${host}`);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return false;
  } catch {
    return false;
  }

  // /auth reaches Medusa even when a split storefront tunnel routes /health
  // to Next.js. Fall back to /health for older Medusa versions without providers.
  for (const path of ['/auth/user/providers', '/health']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://${host}${path}`, {
        method: 'GET',
        signal: controller.signal,
        credentials: 'omit',
      });
      if (!response.ok) continue;
      if (path === '/health') {
        if ((await response.text()).trim().toLowerCase() === 'ok') return true;
      } else {
        const body = await response.json();
        if (
          Array.isArray(body.providers) &&
          body.providers.some((provider: { id?: string }) => provider?.id === 'emailpass')
        )
          return true;
      }
    } catch {
      // Try the alternate public endpoint, without leaking HTML or credentials.
    } finally {
      clearTimeout(timeout);
    }
  }
  return false;
};
