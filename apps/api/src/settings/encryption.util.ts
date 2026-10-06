import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "v1:";

/** Resolves an input key into a guaranteed 32-byte Buffer for AES-256 */
function resolveKey(keyInput?: string): Buffer {
  if (!keyInput) {
    return createHash("sha256").update("prospex-default-encryption-seed").digest();
  }
  try {
    const buf = Buffer.from(keyInput, "base64");
    if (buf.length === 32) return buf;
  } catch {
    // Fallback to hashing below
  }
  return createHash("sha256").update(keyInput, "utf8").digest();
}

/** Encrypts plaintext with AES-256-GCM. */
export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = resolveKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/**
 * Decrypts a value produced by `encryptSecret`. Values without the `v1:` prefix are
 * returned unchanged, so legacy plaintext rows keep working until they are re-saved.
 */
export function decryptSecret(value: string, keyBase64: string): string {
  if (!value || !value.startsWith(PREFIX)) return value;

  try {
    const [ivB64, authTagB64, ciphertextB64] = value.slice(PREFIX.length).split(":");
    const key = resolveKey(keyBase64);
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
