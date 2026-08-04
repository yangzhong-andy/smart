import 'server-only';

/**
 * Shared authentication secret. Production must provide it through the
 * environment so signing and verification always use the same value.
 */
const authSecret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;

if (!authSecret) {
  throw new Error('NEXTAUTH_SECRET or JWT_SECRET must be set');
}

export const AUTH_SECRET = authSecret;
