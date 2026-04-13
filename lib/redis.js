import { Redis } from "@upstash/redis";

/**
 * Vercel / Upstash may expose either UPSTASH_REDIS_REST_* or legacy KV_REST_API_*.
 * @see @upstash/redis nodejs auto-env
 */
export function getRedisCredentials() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim();
  return { url, token };
}

export function isRedisEnvConfigured() {
  const { url, token } = getRedisCredentials();
  return !!(url && token);
}

export function getRedis() {
  const { url, token } = getRedisCredentials();
  if (!url || !token) return null;
  return new Redis({ url, token });
}
