import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * CRITICAL: Must be exactly 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  if (key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

  return Buffer.from(key, "hex");
}

/**
 * Generate deterministic IV based on userId
 * This ensures the same user always gets the same IV
 * but different users get different IVs
 */
function generateDeterministicIV(userId: string): Buffer {
  const hash = crypto.createHash("sha256").update(userId).digest();
  return hash.slice(0, IV_LENGTH);
}

/**
 * Encrypt a string value
 * @param plaintext - The string to encrypt
 * @param userId - User ID for generating deterministic IV
 * @returns Encrypted string in format: <authTag>:<ciphertext>
 */
export function encrypt(plaintext: string, userId: string): string {
  if (!plaintext) return "";

  try {
    const key = getEncryptionKey();
    const iv = generateDeterministicIV(userId);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: <authTag>:<ciphertext>
    return `${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt an encrypted string
 * @param encrypted - The encrypted string in format: <authTag>:<ciphertext>
 * @param userId - User ID for generating deterministic IV
 * @returns Decrypted plaintext string
 */
export function decrypt(encrypted: string, userId: string): string {
  if (!encrypted) return "";

  try {
    const [authTagHex, ciphertext] = encrypted.split(":");

    if (!authTagHex || !ciphertext) {
      throw new Error("Invalid encrypted data format");
    }

    const key = getEncryptionKey();
    const iv = generateDeterministicIV(userId);
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Encrypt multiple API keys at once
 */
export function encryptApiKeys(
  keys: {
    geminiApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
  },
  userId: string
) {
  return {
    geminiApiKey: keys.geminiApiKey ? encrypt(keys.geminiApiKey, userId) : "",
    openaiApiKey: keys.openaiApiKey ? encrypt(keys.openaiApiKey, userId) : "",
    anthropicApiKey: keys.anthropicApiKey
      ? encrypt(keys.anthropicApiKey, userId)
      : "",
  };
}

/**
 * Decrypt multiple API keys at once
 */
export function decryptApiKeys(
  encryptedKeys: {
    geminiApiKey?: string | null;
    openaiApiKey?: string | null;
    anthropicApiKey?: string | null;
  },
  userId: string
) {
  return {
    geminiApiKey: encryptedKeys.geminiApiKey
      ? decrypt(encryptedKeys.geminiApiKey, userId)
      : "",
    openaiApiKey: encryptedKeys.openaiApiKey
      ? decrypt(encryptedKeys.openaiApiKey, userId)
      : "",
    anthropicApiKey: encryptedKeys.anthropicApiKey
      ? decrypt(encryptedKeys.anthropicApiKey, userId)
      : "",
  };
}
