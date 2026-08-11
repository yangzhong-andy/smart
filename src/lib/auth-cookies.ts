export type AuthCookieNames = {
  sessionToken: string;
  callbackUrl: string;
  csrfToken: string;
  pkceCodeVerifier: string;
  state: string;
  nonce: string;
  customToken: string;
};

function sanitizeNamespace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveAuthCookieNamespace(
  configuredNamespace?: string,
  nextAuthUrl?: string,
): string {
  const configured = sanitizeNamespace(configuredNamespace || "");
  if (configured) return configured;

  if (nextAuthUrl) {
    try {
      const url = new URL(nextAuthUrl);
      const originNamespace = sanitizeNamespace(`smart-${url.hostname}-${url.port || url.protocol.replace(":", "")}`);
      if (originNamespace) return originNamespace;
    } catch {
      // Fall through to the stable local default for malformed development URLs.
    }
  }

  return "smart-erp";
}

export function buildAuthCookieNames(namespace: string): AuthCookieNames {
  const prefix = sanitizeNamespace(namespace) || "smart-erp";
  return {
    sessionToken: `${prefix}.session-token`,
    callbackUrl: `${prefix}.callback-url`,
    csrfToken: `${prefix}.csrf-token`,
    pkceCodeVerifier: `${prefix}.pkce.code-verifier`,
    state: `${prefix}.state`,
    nonce: `${prefix}.nonce`,
    customToken: `${prefix}.token`,
  };
}

export const AUTH_COOKIE_NAMESPACE = resolveAuthCookieNamespace(
  process.env.AUTH_COOKIE_NAMESPACE,
  process.env.NEXTAUTH_URL,
);

export const AUTH_COOKIE_NAMES = buildAuthCookieNames(AUTH_COOKIE_NAMESPACE);
export const AUTH_COOKIE_SECURE = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
