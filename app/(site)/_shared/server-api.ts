// Server-side GET against the Express API (server components only).
// The browser uses the /api/v1 proxy; on the server we call the API directly:
// NEXT_PUBLIC_API_URL when it is absolute, otherwise API_PROXY_TARGET.
// Short timeout + null on any failure, so a slow API never blocks a page.

const base = () => {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  if (publicUrl && /^https?:\/\//.test(publicUrl)) return publicUrl.replace(/\/$/, '');
  return `${(process.env.API_PROXY_TARGET || 'http://localhost:3100').replace(/\/$/, '')}/api/v1`;
};

export async function serverApiGet<T>(path: string, { revalidate = 60, timeoutMs = 2500 } = {}): Promise<T | null> {
  try {
    const res = await fetch(`${base()}${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
