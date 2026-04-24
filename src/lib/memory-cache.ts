// 🚀 PHASE 0.4 — Lightweight in-memory cache (60s TTL)
// Use ONLY for idempotent GET-style reads. Not persisted.
// Prefer TanStack Query for component data; this helper exists for
// non-React utility callers (services, ad-hoc fetches).

type Entry<T = unknown> = { data: T; time: number };

const CACHE = new Map<string, Entry>();
const DEFAULT_TTL_MS = 60_000;

export function getCache<T = unknown>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > ttlMs) {
    CACHE.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T = unknown>(key: string, data: T): void {
  CACHE.set(key, { data, time: Date.now() });
}

export function invalidateCache(key: string): void {
  CACHE.delete(key);
}

export function clearCache(): void {
  CACHE.clear();
}

/** Wrap an async fetcher with cache-aside pattern. */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const hit = getCache<T>(key, ttlMs);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  setCache(key, fresh);
  return fresh;
}
