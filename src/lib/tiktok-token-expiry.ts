const UNIX_TIMESTAMP_THRESHOLD = 1_000_000_000;

/**
 * TikTok Shop returns token expiry fields as Unix timestamps, while some
 * environments return a lifetime in seconds. Convert either representation
 * to the lifetime expected by the existing token persistence code.
 */
export function normalizeTikTokTokenLifetime(value: unknown, nowMs = Date.now()): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("TikTok returned an invalid token expiry");
  }

  if (seconds >= UNIX_TIMESTAMP_THRESHOLD) {
    return Math.max(0, Math.floor(seconds - nowMs / 1000));
  }

  return Math.floor(seconds);
}
