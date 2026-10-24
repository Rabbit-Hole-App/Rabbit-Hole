// A token bucket per key, for the browser reporter (web/src/client-telemetry.js) and the client ingestion route
// (telemetry-client-route.js). A leaf module. State is per isolate or per page: it bounds a flood, it is not a global quota.
// take(key) spends one token; refill is continuous. At most maxKeys keys are held (the oldest dropped), so a stream of new keys
// cannot grow it.
export function tokenBucket({ capacity, refillPerSec, maxKeys = 2000, now = Date.now }) {
  const buckets = new Map();
  return {
    take(key, cost = 1) {
      const at = now();
      let bucket = buckets.get(key);
      if (bucket) buckets.delete(key); // re-inserted below, so Map order is least recently used first
      else { bucket = { tokens: capacity, at }; if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value); }
      bucket.tokens = Math.min(capacity, bucket.tokens + ((at - bucket.at) / 1000) * refillPerSec);
      bucket.at = at;
      buckets.set(key, bucket);
      if (bucket.tokens >= cost) { bucket.tokens -= cost; return { ok: true, retryAfterMs: 0 }; }
      return { ok: false, retryAfterMs: Math.ceil(((cost - bucket.tokens) / refillPerSec) * 1000) };
    },
    size: () => buckets.size,
  };
}
