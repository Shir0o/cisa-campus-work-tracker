import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import {
  DEFAULT_ITERATIONS,
  deriveKey,
  makeCheck,
  newSalt,
  rekey,
  sealEntry,
  verifyCheck,
  type CipherBlob,
  type VaultEntry,
} from "./vaultCrypto";

// Credential vault data layer (#1967, ADR 0051). The cryptography lives in
// vaultCrypto; this module is the Firestore side — one meta document, the
// sealed entries, and the append-only audit feed — shaped like toAsk.ts: one
// subscription per collection and one guarded write per intent.
//
// The derived key is passed in and handed back, never held here: it lives in
// the page's state for the session and nowhere else.
//
// Audit rows always name `user.uid`, never `effectiveUserId`. A Full-timer
// previewing a Trainee still acted as themselves, and a log that named the
// Trainee would be a lie (ADR 0051).

/** The only schema this build writes; the field exists so a later format can
 *  tell an older vault apart instead of guessing. */
export const VAULT_SCHEMA_VERSION = 1;

/** How many audit rows the page reads and shows. */
export const VAULT_AUDIT_LIMIT = 20;

/** The audit row's `credentialId` when the action belongs to the vault itself
 *  (unlock, unlock-failed, rotate) rather than to one entry. */
export const VAULT_AUDIT_ID = "vault";

export interface VaultMeta {
  /** Base64 — Firestore stores it as a string (the rules bound it at 128). */
  salt: string;
  /** The sealed check value in its JSON form: the rules type `check` as a
   *  string of at most 512 characters, not a nested map. */
  check: string;
  iterations: number;
  schemaVersion: number;
}

export interface VaultEntryDoc {
  id: string;
  iv: string;
  ciphertext: string;
  createdAt: Timestamp | null;
}

export type CredentialAction =
  | "unlock"
  | "unlock-failed"
  | "reveal"
  | "copy"
  | "create"
  | "update"
  | "delete"
  | "rotate";

export interface CredentialAuditRow {
  id: string;
  actorUid: string;
  credentialId: string;
  action: CredentialAction;
  field: string | null;
  createdAt: Timestamp | null;
}

export function saltToBytes(salt: string): Uint8Array<ArrayBuffer> {
  const raw = atob(salt);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function bytesToSalt(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function encodeCheck(check: CipherBlob): string {
  return JSON.stringify(check);
}

export function decodeCheck(value: string): CipherBlob {
  return JSON.parse(value) as CipherBlob;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function subscribeVaultMeta(
  cb: (meta: VaultMeta | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "credentialsMeta", "current"),
    (snap) => cb((snap.data() as VaultMeta | undefined) ?? null),
    (e) => (onError ? onError(e) : handleFirestoreError(e, OperationType.LIST, "credentialsMeta/current")),
  );
}

/** Entries oldest first: labels are encrypted, so `createdAt` is the only
 *  order the server can give (ADR 0051). */
export function subscribeVaultEntries(
  cb: (entries: VaultEntryDoc[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "credentials"), orderBy("createdAt", "asc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as { iv: string; ciphertext: string; createdAt?: Timestamp | null };
          return {
            id: d.id,
            iv: data.iv,
            ciphertext: data.ciphertext,
            createdAt: data.createdAt ?? null,
          };
        }),
      ),
    (e) => (onError ? onError(e) : handleFirestoreError(e, OperationType.LIST, "credentials")),
  );
}

/** The audit feed query, parameterised by `db` so the query-contract test runs
 *  the real builder against the rules emulator rather than a copy of it. One
 *  field plus the implicit document-id tiebreak needs no composite index. */
export function credentialAuditFeedQuery(database: Firestore, size: number = VAULT_AUDIT_LIMIT) {
  return query(collection(database, "credentialAudit"), orderBy("createdAt", "desc"), limit(size));
}

export function subscribeCredentialAudit(
  cb: (rows: CredentialAuditRow[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    credentialAuditFeedQuery(db),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Omit<CredentialAuditRow, "id">;
          return {
            id: d.id,
            actorUid: data.actorUid,
            credentialId: data.credentialId,
            action: data.action,
            field: data.field ?? null,
            createdAt: data.createdAt ?? null,
          };
        }),
      ),
    (e) => (onError ? onError(e) : handleFirestoreError(e, OperationType.LIST, "credentialAudit")),
  );
}

// ── Passphrase: create, unlock, rotate ──────────────────────────────────────

/** The first passphrase *is* the vault: there is no meta to check it against
 *  yet, so this writes the salt, the cost and the check value. */
export async function createVault(passphrase: string): Promise<CryptoKey> {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt, DEFAULT_ITERATIONS);
  const check = await makeCheck(key);
  try {
    await setDoc(doc(db, "credentialsMeta", "current"), {
      salt: bytesToSalt(salt),
      iterations: DEFAULT_ITERATIONS,
      check: encodeCheck(check),
      schemaVersion: VAULT_SCHEMA_VERSION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "credentialsMeta/current");
  }
  return key;
}

/** Derive at the vault's stored cost, then let the check value say whether the
 *  passphrase is right — a wrong one on an empty vault still fails, which the
 *  entries alone could not tell. */
export async function unlockVault(
  passphrase: string,
  meta: VaultMeta,
): Promise<{ key: CryptoKey; ok: boolean }> {
  const key = await deriveKey(passphrase, saltToBytes(meta.salt), meta.iterations);
  const ok = await verifyCheck(key, decodeCheck(meta.check));
  return { key, ok };
}

/** Re-derive under a new salt and re-seal every entry, then write the meta, the
 *  entries and the audit row in ONE batch: the meta and the entries are only
 *  ever consistent within a single commit (ADR 0051). */
export async function rotatePassphrase(
  uid: string,
  oldKey: CryptoKey,
  newPassphrase: string,
  entries: VaultEntryDoc[],
  iterations: number,
): Promise<CryptoKey> {
  const salt = newSalt();
  const nextKey = await deriveKey(newPassphrase, salt, iterations);
  const resealed = await rekey(
    entries.map((entry) => ({ iv: entry.iv, ciphertext: entry.ciphertext })),
    oldKey,
    nextKey,
  );
  const check = await makeCheck(nextKey);

  const batch = writeBatch(db);
  batch.set(doc(db, "credentialsMeta", "current"), {
    salt: bytesToSalt(salt),
    iterations,
    check: encodeCheck(check),
    schemaVersion: VAULT_SCHEMA_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  entries.forEach((entry, index) => {
    batch.set(
      doc(db, "credentials", entry.id),
      { iv: resealed[index].iv, ciphertext: resealed[index].ciphertext, updatedAt: serverTimestamp() },
      { merge: true },
    );
  });
  batch.set(doc(collection(db, "credentialAudit")), {
    actorUid: uid,
    credentialId: VAULT_AUDIT_ID,
    action: "rotate",
    field: null,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "credentials (rotate)");
  }
  return nextKey;
}

/** The way out of a lost passphrase. There is nothing to decrypt with, so the
 *  entries are destroyed and the meta is rewritten under a new key — the rules
 *  deny deleting the meta document, so overwriting it is the only exit that
 *  leaves the vault usable again (ADR 0051). */
export async function resetVault(
  uid: string,
  newPassphrase: string,
  entries: VaultEntryDoc[],
): Promise<CryptoKey> {
  const salt = newSalt();
  const key = await deriveKey(newPassphrase, salt, DEFAULT_ITERATIONS);
  const check = await makeCheck(key);

  const batch = writeBatch(db);
  batch.set(doc(db, "credentialsMeta", "current"), {
    salt: bytesToSalt(salt),
    iterations: DEFAULT_ITERATIONS,
    check: encodeCheck(check),
    schemaVersion: VAULT_SCHEMA_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  entries.forEach((entry) => {
    batch.delete(doc(db, "credentials", entry.id));
    batch.set(doc(collection(db, "credentialAudit")), {
      actorUid: uid,
      credentialId: entry.id,
      action: "delete",
      field: null,
      createdAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "credentials (reset)");
  }
  return key;
}

// ── Entries ─────────────────────────────────────────────────────────────────

export async function createEntry(key: CryptoKey, entry: VaultEntry): Promise<string> {
  const blob = await sealEntry(key, entry);
  try {
    const ref = await addDoc(collection(db, "credentials"), {
      iv: blob.iv,
      ciphertext: blob.ciphertext,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "credentials");
    throw e;
  }
}

/** A merge write: `createdAt` stays the one the create rule pinned, which the
 *  update rule requires to be unchanged. */
export async function updateEntry(id: string, key: CryptoKey, entry: VaultEntry): Promise<void> {
  const blob = await sealEntry(key, entry);
  try {
    await updateDoc(doc(db, "credentials", id), {
      iv: blob.iv,
      ciphertext: blob.ciphertext,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `credentials/${id}`);
  }
}

export async function deleteEntry(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "credentials", id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `credentials/${id}`);
  }
}

/** One append-only row. `uid` must be the real auth uid — see the note at the
 *  top of this file. */
export async function writeCredentialAudit(
  uid: string,
  action: CredentialAction,
  credentialId: string = VAULT_AUDIT_ID,
  field?: string,
): Promise<void> {
  try {
    await addDoc(collection(db, "credentialAudit"), {
      actorUid: uid,
      credentialId,
      action,
      ...(field ? { field } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "credentialAudit");
  }
}
