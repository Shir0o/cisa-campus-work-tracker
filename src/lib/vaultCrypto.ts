// Credential vault crypto (ADR 0051, #1965): PBKDF2-SHA-256 derives an
// AES-256-GCM key from the shared passphrase, and every secret is one sealed
// JSON blob. Only ciphertext ever leaves this module — it deliberately knows
// nothing about Firestore, so the salt, iteration count and check value are
// arguments here and the meta document that stores them belongs to #1966.

/** The ADR's count. A parameter so tests can derive at 1,000 iterations in a
 *  millisecond; 600,000 is the OWASP baseline for PBKDF2-SHA-256. */
export const DEFAULT_ITERATIONS = 600_000;

const CHECK_PLAINTEXT = 'cisa-vault-v1';

export interface CipherBlob {
  iv: string;
  ciphertext: string;
}

export interface VaultEntry {
  label: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

/** 16 random bytes: one salt per vault, not per entry (ADR 0051). */
export function newSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** 12 random bytes: the AES-GCM nonce, fresh for every seal. */
export function newIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(12));
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  // Non-extractable: the derived key lives in memory for the session and has no
  // path back out through this API.
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(key: CryptoKey, payload: unknown): Promise<CipherBlob> {
  const iv = newIv();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function open<T>(key: CryptoKey, blob: CipherBlob): Promise<T> {
  // The GCM tag is the wrong-passphrase and tamper check, so a failure is
  // allowed to throw rather than hand back anything that looks like plaintext.
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function sealEntry(key: CryptoKey, entry: VaultEntry): Promise<CipherBlob> {
  return seal(key, entry);
}

export function openEntry(key: CryptoKey, blob: CipherBlob): Promise<VaultEntry> {
  return open<VaultEntry>(key, blob);
}

/** A fixed plaintext under the vault key, so a wrong passphrase is told apart
 *  from an empty vault — where no entry exists to fail a tag. */
export function makeCheck(key: CryptoKey): Promise<CipherBlob> {
  return seal(key, CHECK_PLAINTEXT);
}

export async function verifyCheck(key: CryptoKey, blob: CipherBlob): Promise<boolean> {
  try {
    return (await open<string>(key, blob)) === CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

/** One pass over every entry for passphrase rotation; results are written only
 *  after all of them succeeded, so a half-rotated vault is never saved. */
export function rekey(entries: CipherBlob[], oldKey: CryptoKey, newKey: CryptoKey): Promise<CipherBlob[]> {
  return Promise.all(entries.map(async (blob) => seal(newKey, await open<VaultEntry>(oldKey, blob))));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
