export type SessionUser = { id: string; name: string; email: string };

export type SessionCheck =
  | { status: 'connected'; user: SessionUser }
  | { status: 'expired' }
  | { status: 'reconnecting' };

// Only an explicit authentication rejection may invalidate a saved login.
export async function checkServerSession(medusaUrl: string, apiKey: string, timeoutMs = 8000): Promise<SessionCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${medusaUrl.replace(/\/$/, '')}/admin/users/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (response.status === 401) return { status: 'expired' };
    if (!response.ok) return { status: 'reconnecting' };
    const { user } = await response.json();
    if (!user?.id || !user?.email) return { status: 'reconnecting' };
    return {
      status: 'connected',
      user: {
        id: user.id,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email.split('@')[0],
        email: user.email,
      },
    };
  } catch {
    return { status: 'reconnecting' };
  } finally {
    clearTimeout(timeout);
  }
}
