import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import {
  DEFAULT_ITERATIONS,
  deriveKey,
  makeCheck,
  newIv,
  newSalt,
  open,
  openEntry,
  rekey,
  seal,
  sealEntry,
  verifyCheck,
  type VaultEntry,
} from '../lib/vaultCrypto';

// jsdom implements getRandomValues but not Web Crypto's `subtle`, which the
// browser has. Lend the test global the implementation Node already ships
// rather than swapping the module under test for a fake.
if (!globalThis.crypto.subtle) {
  Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle });
}

// Tests derive at a low count so each one costs a millisecond; the ADR's real
// count is pinned by its own test rather than paid for on every derivation.
const ITERATIONS = 1_000;
const PASSPHRASE = 'correct horse battery staple';
const ENTRY: VaultEntry = {
  label: 'Ministry Gmail',
  username: 'cisa@example.org',
  password: 'hunter2',
  url: 'https://mail.google.com',
  notes: 'Recovery codes are in the safe.',
};

async function keyFor(passphrase = PASSPHRASE): Promise<{ key: CryptoKey; salt: Uint8Array<ArrayBuffer> }> {
  const salt = newSalt();
  return { key: await deriveKey(passphrase, salt, ITERATIONS), salt };
}

function flipFirstByte(base64: string): string {
  const bytes = Buffer.from(base64, 'base64');
  bytes[0] ^= 0xff;
  return bytes.toString('base64');
}

describe('vaultCrypto', () => {
  it('mints a 16-byte salt and a 12-byte IV, freshly each time', () => {
    expect(newSalt()).toHaveLength(16);
    expect(newIv()).toHaveLength(12);
    expect(newSalt()).not.toEqual(newSalt());
    expect(newIv()).not.toEqual(newIv());
  });

  it("pins the ADR's 600,000 iterations as the default", async () => {
    expect(DEFAULT_ITERATIONS).toBe(600_000);

    const salt = newSalt();
    const blob = await seal(await deriveKey(PASSPHRASE, salt), ENTRY);
    const sameCount = await deriveKey(PASSPHRASE, salt, DEFAULT_ITERATIONS);
    expect(await openEntry(sameCount, blob)).toEqual(ENTRY);

    // The default is really 600,000, not whatever count a caller passed before.
    await expect(openEntry(await deriveKey(PASSPHRASE, salt, ITERATIONS), blob)).rejects.toThrow();
  });

  it('derives a non-extractable AES-256-GCM key, deterministically per salt and iteration count', async () => {
    const { key, salt } = await keyFor();
    expect(key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect(key.extractable).toBe(false);
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);

    const blob = await seal(key, ENTRY);
    expect(await openEntry(await deriveKey(PASSPHRASE, salt, ITERATIONS), blob)).toEqual(ENTRY);
  });

  it('round-trips a JSON payload through seal and open', async () => {
    const { key } = await keyFor();
    const payload = { id: 'abc', tags: ['one', 'two'], nested: { ok: true } };
    const blob = await seal(key, payload);
    expect(blob).toEqual({ iv: expect.any(String), ciphertext: expect.any(String) });
    expect(await open(key, blob)).toEqual(payload);
  });

  it('round-trips every vault entry field in one blob', async () => {
    const { key } = await keyFor();
    expect(await openEntry(key, await sealEntry(key, ENTRY))).toEqual(ENTRY);
  });

  it('throws on a wrong passphrase instead of returning garbage', async () => {
    const { key } = await keyFor();
    const wrongKey = await deriveKey('not the passphrase', newSalt(), ITERATIONS);
    await expect(openEntry(wrongKey, await sealEntry(key, ENTRY))).rejects.toThrow();
  });

  it('throws when one ciphertext byte or one IV byte is flipped', async () => {
    const { key } = await keyFor();
    const blob = await sealEntry(key, ENTRY);
    await expect(openEntry(key, { ...blob, ciphertext: flipFirstByte(blob.ciphertext) })).rejects.toThrow();
    await expect(openEntry(key, { ...blob, iv: flipFirstByte(blob.iv) })).rejects.toThrow();
  });

  it('never reuses an IV, so two seals of one payload differ', async () => {
    const { key } = await keyFor();
    const first = await seal(key, ENTRY);
    const second = await seal(key, ENTRY);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('tells a wrong passphrase apart from an empty vault with the check value', async () => {
    const { key } = await keyFor();
    const check = await makeCheck(key);
    expect(await verifyCheck(key, check)).toBe(true);
    expect(await verifyCheck(await deriveKey('wrong', newSalt(), ITERATIONS), check)).toBe(false);
    expect(await verifyCheck(key, { ...check, ciphertext: flipFirstByte(check.ciphertext) })).toBe(false);
  });

  it('re-seals every entry under a new key without losing a field', async () => {
    const oldKey = (await keyFor()).key;
    const newKey = (await keyFor('a new passphrase')).key;
    const entries = [ENTRY, { ...ENTRY, label: 'Second', password: 'a different one' }];

    const before = await Promise.all(entries.map((entry) => sealEntry(oldKey, entry)));
    const after = await rekey(before, oldKey, newKey);

    expect(after).toHaveLength(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
      expect(after[index].iv).not.toBe(before[index].iv);
      expect(after[index].ciphertext).not.toBe(before[index].ciphertext);
      expect(await openEntry(newKey, after[index])).toEqual(entries[index]);
    }
    await expect(openEntry(oldKey, after[0])).rejects.toThrow();
  });

  it('never reaches for persistence or the console', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'vaultCrypto.ts'), 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|console\./);
  });
});
