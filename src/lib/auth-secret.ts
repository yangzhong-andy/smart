import 'server-only';

/**
 * Shared authentication secret. Production must provide it through the
 * environment so signing and verification always use the same value.
 */
export function getAuthSecret(): string {
  const authSecret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!authSecret) {
    throw new Error('NEXTAUTH_SECRET or JWT_SECRET must be set');
  }
  return authSecret;
}
