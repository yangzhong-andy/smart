import assert from "node:assert/strict";
import test from "node:test";
import {
  exchangeMercadoLivreCode,
  getMercadoLivreAuthorizationUrl,
  refreshMercadoLivreToken,
} from "./mercado-livre-api";

test("builds the Mercado Livre Brazil authorization URL with state", () => {
  const url = new URL(getMercadoLivreAuthorizationUrl({
    clientId: "123456",
    redirectUri: "https://www.baxi8.com/api/mercadolivre/oauth/callback",
    state: "state-123",
  }));
  assert.equal(url.origin + url.pathname, "https://auth.mercadolivre.com.br/authorization");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "123456");
  assert.equal(url.searchParams.get("redirect_uri"), "https://www.baxi8.com/api/mercadolivre/oauth/callback");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("scope"), "offline_access read");
  assert.equal(url.searchParams.has("code_challenge"), false);
});

test("adds S256 PKCE parameters when the application enables PKCE", () => {
  const url = new URL(getMercadoLivreAuthorizationUrl({
    clientId: "123456",
    redirectUri: "https://www.baxi8.com/api/mercadolivre/oauth/callback",
    state: "state-123",
    codeChallenge: "challenge-123",
  }));
  assert.equal(url.searchParams.get("code_challenge"), "challenge-123");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("exchanges a code using form encoding and the exact redirect URI", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://api.mercadolibre.com/oauth/token");
    assert.equal(init?.method, "POST");
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("client_id"), "123456");
    assert.equal(body.get("client_secret"), "secret");
    assert.equal(body.get("code"), "oauth-code");
    assert.equal(body.get("redirect_uri"), "https://www.baxi8.com/api/mercadolivre/oauth/callback");
    assert.equal(body.get("code_verifier"), "verifier");
    return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 21600 }), { status: 200 });
  }) as typeof fetch;
  try {
    const token = await exchangeMercadoLivreCode({
      clientId: "123456", clientSecret: "secret", code: "oauth-code",
      redirectUri: "https://www.baxi8.com/api/mercadolivre/oauth/callback", codeVerifier: "verifier",
    });
    assert.equal(token.access_token, "access");
    assert.equal(token.expires_in, 21600);
  } finally {
    global.fetch = originalFetch;
  }
});

test("refreshes a token and accepts rotated refresh tokens", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "old-refresh");
    return new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 21600 }), { status: 200 });
  }) as typeof fetch;
  try {
    const token = await refreshMercadoLivreToken({ clientId: "123456", clientSecret: "secret", refreshToken: "old-refresh" });
    assert.equal(token.access_token, "new-access");
    assert.equal(token.refresh_token, "new-refresh");
  } finally {
    global.fetch = originalFetch;
  }
});
