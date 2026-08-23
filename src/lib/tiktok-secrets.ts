import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function key() {
  const configured = process.env.TIKTOK_SECRET_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!configured) throw new Error("Missing TIKTOK_SECRET_KEY/NEXTAUTH_SECRET for TikTok secret encryption");
  return createHash("sha256").update(configured).digest();
}

/** Encrypt new secrets while remaining able to read legacy plaintext values. */
export function encryptTikTokSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (value.startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Decrypt encrypted values and transparently support values saved before encryption was added. */
export function decryptTikTokSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (!value.startsWith(PREFIX)) return value;
  const [ivText, tagText, encryptedText] = value.slice(PREFIX.length).split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Invalid encrypted TikTok secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function hashTikTokOAuthState(state: string) {
  const configured = process.env.TIKTOK_SECRET_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!configured) throw new Error("Missing secret for TikTok OAuth state validation");
  return createHmac("sha256", configured).update(state).digest("hex");
}
