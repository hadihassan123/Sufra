// Query cache - stores recent responses to avoid redundant network requests
const queryCache = new Map();
const CACHE_TTL_MS = 60_000; // 1 minute cache

// Helper: Create a cache key from args
function makeCacheKey(fnName, args) {
  return `${fnName}:${JSON.stringify(args)}`;
}

// Helper: Cache wrapper
function withCache(fn, key) {
  return async function(...args) {
    const cacheKey = `${key}:${JSON.stringify(args)}`;
    const cached = queryCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.debug(`[Cache HIT] ${cacheKey}`);
      return cached.data;
    }
    
    console.debug(`[Cache MISS] ${cacheKey}`);
    const data = await fn.apply(this, args);
    
    queryCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  };
}

// Cache invalidation helpers
function invalidateCache(prefix) {
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) {
      queryCache.delete(key);
    }
  }
}

function clearAllCache() {
  queryCache.clear();
}