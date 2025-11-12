import NodeCache from 'node-cache';

// Create cache instance with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Cache middleware for GET requests
 * Caches responses based on URL and user ID
 */
export const cacheMiddleware = (duration = 300) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Create cache key from URL and user ID
    const userId = req.user?.id || 'anonymous';
    const cacheKey = `${req.originalUrl}:${userId}`;

    // Check cache
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    // Store original json method
    const originalJson = res.json.bind(res);
    let cached = false;

    // Override json method to cache response
    res.json = function (data) {
      // Cache successful responses only once
      if (res.statusCode === 200 && !cached) {
        cache.set(cacheKey, data, duration);
        cached = true;
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Clear cache for a specific pattern
 */
export const clearCache = (pattern) => {
  const keys = cache.keys();
  const matchingKeys = keys.filter(key => key.includes(pattern));
  matchingKeys.forEach(key => cache.del(key));
};

/**
 * Clear cache for a user's specific resource
 */
export const clearUserCache = (userId, resource) => {
  const pattern = `/api/${resource}:${userId}`;
  clearCache(pattern);
};

/**
 * Clear all cache
 */
export const clearAllCache = () => {
  cache.flushAll();
};

/**
 * Middleware to clear cache after mutations
 */
export const clearCacheOnMutation = (resource) => {
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to clear cache on success
    res.json = function (data) {
      // Clear cache on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.user?.id;
        if (userId && resource) {
          clearUserCache(userId, resource);
        }
      }
      return originalJson(data);
    };

    next();
  };
};

export default cacheMiddleware;

