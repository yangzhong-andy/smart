-- PKCE verifier belongs to the one-time OAuth state, not the authorized account.
ALTER TABLE "MercadoLivreOAuthState"
  ADD COLUMN IF NOT EXISTS "codeVerifier" TEXT;

ALTER TABLE "MercadoLivreAccount"
  DROP COLUMN IF EXISTS "codeVerifier";
