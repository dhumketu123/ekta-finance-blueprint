import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a client photo storage path → time-limited signed URL.
 *
 * Accepts either:
 *  - storage object path  (e.g. "abc123.webp" or "tenant/abc123.webp")  ✅ preferred
 *  - legacy full URL      (returned as-is for backward compatibility)
 *
 * In-memory cache prevents refetch loops; entries auto-refresh ~5 min before expiry.
 * Never throws — failure resolves to `null` so AvatarFallback always renders.
 */

const SIGNED_TTL_SECONDS = 3600;          // 1h
const REFRESH_BEFORE_MS = 5 * 60 * 1000;  // refresh 5 min before expiry

interface CacheEntry {
  url: string;
  expiresAt: number;
  inflight?: Promise<string | null>;
}

const cache = new Map<string, CacheEntry>();

const isFullUrl = (v: string) => /^https?:\/\//i.test(v);

const stripLegacyUrl = (v: string): string | null => {
  // If a legacy full URL slipped through, extract the object path.
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign)\/client-photos\/([^?]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
};

async function fetchSignedUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("client-photos")
      .createSignedUrl(path, SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;

    cache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000,
    });
    return data.signedUrl;
  } catch {
    return null;
  }
}

function getOrCreate(path: string): Promise<string | null> {
  const hit = cache.get(path);
  const now = Date.now();
  if (hit && hit.expiresAt - now > REFRESH_BEFORE_MS) {
    return Promise.resolve(hit.url);
  }
  if (hit?.inflight) return hit.inflight;
  const inflight = fetchSignedUrl(path);
  cache.set(path, { url: hit?.url ?? "", expiresAt: hit?.expiresAt ?? 0, inflight });
  inflight.finally(() => {
    const e = cache.get(path);
    if (e) delete e.inflight;
  });
  return inflight;
}

export function useClientAvatarUrl(rawValue: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!rawValue) return null;
    if (isFullUrl(rawValue)) {
      // Legacy full URL — return as-is (private bucket: may 404; AvatarFallback handles it)
      const path = stripLegacyUrl(rawValue);
      if (!path) return rawValue;
      const hit = cache.get(path);
      return hit?.url ?? null;
    }
    const hit = cache.get(rawValue);
    return hit?.url ?? null;
  });

  useEffect(() => {
    let cancelled = false;
    if (!rawValue) {
      setUrl(null);
      return;
    }

    // Resolve to a storage path (extract from legacy URL if needed)
    const path = isFullUrl(rawValue) ? stripLegacyUrl(rawValue) : rawValue;
    if (!path) {
      // Unrecognized legacy URL → use as-is (likely fails → fallback shows)
      setUrl(rawValue);
      return;
    }

    getOrCreate(path).then((signed) => {
      if (!cancelled) setUrl(signed);
    });

    return () => {
      cancelled = true;
    };
  }, [rawValue]);

  return url;
}
