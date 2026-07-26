/**
 * Web Crypto API utilities for Client-Side Zero-Knowledge Encryption
 * Uses AES-256-GCM and PBKDF2 for key derivation.
 */

// Helper to convert ArrayBuffer/Uint8Array to hex string
function bufToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper to convert hex string to Uint8Array
function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derive an AES-GCM 256-bit key from a user secret key string using PBKDF2
 */
async function deriveKey(secretKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const saltBuf = new Uint8Array(salt).buffer as ArrayBuffer;

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a JSON serializable payload with AES-256-GCM.
 * Returns base64/hex encrypted string and hex initialization vector (IV) combined with salt.
 */
export async function encryptPayload<T = unknown>(
  payload: T,
  secretKey: string
): Promise<{ encryptedData: string; iv: string }> {
  const encoder = new TextEncoder();
  const jsonStr = JSON.stringify(payload);
  const data = encoder.encode(jsonStr);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(secretKey, salt);
  const ivBuf = new Uint8Array(iv).buffer as ArrayBuffer;
  const dataBuf = new Uint8Array(data).buffer as ArrayBuffer;

  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuf },
    key,
    dataBuf
  );

  // Combine salt (16 bytes) + iv (12 bytes) into single iv string format: saltHex:ivHex
  const combinedIvHex = `${bufToHex(salt)}:${bufToHex(iv)}`;
  const encryptedHex = bufToHex(encryptedBuf);

  return {
    encryptedData: encryptedHex,
    iv: combinedIvHex,
  };
}

/**
 * Decrypt an AES-256-GCM encrypted hex string using secretKey and combined salt:iv hex string.
 */
export async function decryptPayload<T = unknown>(
  encryptedHex: string,
  combinedIvHex: string,
  secretKey: string
): Promise<T> {
  const [saltHex, ivHex] = combinedIvHex.split(":");
  if (!saltHex || !ivHex) {
    throw new Error("Invalid IV format");
  }

  const salt = hexToBuf(saltHex);
  const iv = hexToBuf(ivHex);
  const encryptedBuf = hexToBuf(encryptedHex);

  const key = await deriveKey(secretKey, salt);
  const ivBuf = new Uint8Array(iv).buffer as ArrayBuffer;
  const encDataBuf = new Uint8Array(encryptedBuf).buffer as ArrayBuffer;

  const decryptedBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuf },
    key,
    encDataBuf
  );

  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(decryptedBuf);
  return JSON.parse(jsonStr) as T;
}

/**
 * Hash a room ID using SHA-256 to create an un-linkable identifier for encrypted backups.
 */
export async function hashRoomId(roomId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(roomId);
  const dataBuf = new Uint8Array(data).buffer as ArrayBuffer;
  const hashBuf = await crypto.subtle.digest("SHA-256", dataBuf);
  return bufToHex(hashBuf);
}

/**
 * Generate a random Secret Backup Key (24 hex characters)
 */
export function generateSecretKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bufToHex(bytes);
}
