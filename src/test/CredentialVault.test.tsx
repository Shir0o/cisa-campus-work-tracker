import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Fixtures ────────────────────────────────────────────────────────────────
const PASSPHRASE = 'correct horse battery staple';
const ENTRY = {
  label: 'Ministry inbox',
  username: 'cisa@example.org',
  password: 'hunter2',
  url: 'https://mail.example.org',
  notes: 'Recovery codes are in the safe.',
};
const META = {
  salt: 'c2FsdA==',
  iterations: 1_000,
  // The rules type `check` as a string, so the sealed check value travels in
  // its JSON form.
  check: JSON.stringify({ iv: 'check-iv', ciphertext: 'check-ct' }),
  schemaVersion: 1,
};

const h = vi.hoisted(() => ({
  meta: null as unknown,
  entries: [] as { id: string; iv: string; ciphertext: string }[],
  entriesCb: null as null | ((snap: unknown) => void),
  metaCb: null as null | ((snap: unknown) => void),
  // What a transaction reads as the meta; separate from the subscription so
  // a race (someone else created it first) can be staged.
  txMetaExists: false,
  auditWrites: [] as Record<string, unknown>[],
  addedDocs: [] as { path: string; data: Record<string, unknown> }[],
  batches: [] as { set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }[],
  derive: vi.fn(),
  verify: vi.fn(),
  openEntry: vi.fn(),
  sealEntry: vi.fn(),
  makeCheck: vi.fn(),
  rekey: vi.fn(),
  setDoc: vi.fn((_ref: { path: string }, _data: Record<string, unknown>) => Promise.resolve(undefined)),
  updateDoc: vi.fn((_ref: { path: string }, _data: Record<string, unknown>) => Promise.resolve(undefined)),
  deleteDoc: vi.fn((_ref: { path: string }) => Promise.resolve(undefined)),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'admin1' }, effectiveUserId: 'someone-else', role: 'admin' }),
}));

// The crypto boundary is mocked; the data layer above it is the real one, so
// the assertions cover the query shapes, the writes and the audit rows too.
vi.mock('../lib/vaultCrypto', () => ({
  DEFAULT_ITERATIONS: 600_000,
  newSalt: () => new Uint8Array(16),
  deriveKey: (...args: unknown[]) => h.derive(...args),
  verifyCheck: (...args: unknown[]) => h.verify(...args),
  openEntry: (...args: unknown[]) => h.openEntry(...args),
  sealEntry: (...args: unknown[]) => h.sealEntry(...args),
  makeCheck: (...args: unknown[]) => h.makeCheck(...args),
  rekey: (...args: unknown[]) => h.rekey(...args),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'list', CREATE: 'create', UPDATE: 'update', DELETE: 'delete', WRITE: 'write' },
}));

const entrySnap = (docs: { id: string; iv: string; ciphertext: string }[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => ({ ...d, createdAt: null }) })),
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (...args: unknown[]) =>
    args.length === 1
      ? { path: (args[0] as { path: string }).path }
      : typeof args[1] === 'string'
        ? { path: (args.slice(1) as string[]).join('/') }
        : { path: (args[1] as { path: string }).path },
  query: (ref: unknown) => ref,
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: (ref: { path: string }, cb: (snap: unknown) => void) => {
    if (ref.path === 'credentialsMeta/current') {
      h.metaCb = cb;
      cb({ data: () => h.meta ?? undefined });
    } else if (ref.path === 'credentials') {
      h.entriesCb = cb;
      cb(entrySnap(h.entries));
    } else if (ref.path === 'credentialAudit') {
      cb({ docs: [] });
    }
    return vi.fn();
  },
  addDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    h.addedDocs.push({ path: ref.path, data });
    if (ref.path === 'credentialAudit') h.auditWrites.push(data);
    return { id: 'new-cred' };
  },
  setDoc: (ref: { path: string }, data: Record<string, unknown>) => h.setDoc(ref, data),
  updateDoc: (ref: { path: string }, data: Record<string, unknown>) => h.updateDoc(ref, data),
  deleteDoc: (ref: { path: string }) => h.deleteDoc(ref),
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const writes: Promise<unknown>[] = [];
    const tx = {
      get: async () => ({ exists: () => h.txMetaExists || h.meta != null }),
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        writes.push(h.setDoc(ref, data));
      },
    };
    const result = await fn(tx);
    await Promise.all(writes);
    return result;
  },
  writeBatch: () => {
    const batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) };
    h.batches.push(batch);
    return batch;
  },
}));

import CredentialVault from '../views/CredentialVault';

const renderVault = () => render(<CredentialVault />);

async function unlock() {
  const input = await screen.findByLabelText('Passphrase');
  fireEvent.change(input, { target: { value: PASSPHRASE } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.meta = META;
  h.entries = [
    { id: 'cred-1', iv: 'iv-1', ciphertext: 'ct-1' },
    { id: 'cred-2', iv: 'iv-2', ciphertext: 'ct-2' },
  ];
  h.entriesCb = null;
  h.metaCb = null;
  h.txMetaExists = false;
  h.auditWrites = [];
  h.addedDocs = [];
  h.batches = [];
  h.derive.mockResolvedValue({ sentinel: 'key' });
  h.verify.mockResolvedValue(true);
  h.openEntry.mockImplementation(async (_key: unknown, blob: { iv: string }) =>
    blob.iv === 'iv-1' ? ENTRY : { ...ENTRY, label: 'Second login', username: 'second@example.org' },
  );
  h.sealEntry.mockResolvedValue({ iv: 'iv-new', ciphertext: 'ct-new' });
  h.makeCheck.mockResolvedValue({ iv: 'check-iv', ciphertext: 'check-ct' });
  h.rekey.mockResolvedValue([]);
});

describe('Credential vault page (#1967)', () => {
  it('unlocks, never renders the passphrase, and Lock drops the key with the plaintext', async () => {
    renderVault();

    // Locked: the entries are subscribed but not decrypted.
    expect(await screen.findByLabelText('Passphrase')).toBeTruthy();
    expect(screen.queryByText(ENTRY.label)).toBeNull();
    expect(h.openEntry).not.toHaveBeenCalled();

    await unlock();

    expect(await screen.findByText(ENTRY.label)).toBeTruthy();
    expect(h.derive).toHaveBeenCalledWith(PASSPHRASE, expect.anything(), META.iterations);
    // The stored check is a string and is decoded before the check runs.
    expect(h.verify).toHaveBeenCalledWith({ sentinel: 'key' }, { iv: 'check-iv', ciphertext: 'check-ct' });

    // The passphrase is not left in the DOM once it has been used.
    expect(screen.queryByDisplayValue(PASSPHRASE)).toBeNull();
    expect(document.body.textContent).not.toContain(PASSPHRASE);
    // The activity log is cut (cut-or-keep §3): unlocking writes nothing.
    expect(h.auditWrites).toHaveLength(0);

    // The password stays masked until reveal; revealing it writes nothing.
    expect(screen.getAllByTestId('vault-password')[0].textContent).not.toContain(ENTRY.password);
    fireEvent.click(screen.getAllByRole('button', { name: 'Show password' })[0]);
    expect(screen.getAllByTestId('vault-password')[0].textContent).toBe(ENTRY.password);
    expect(h.auditWrites).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));

    // Locked again: no plaintext, and no key to decrypt a newly arrived entry.
    expect(screen.queryByText(ENTRY.label)).toBeNull();
    expect(await screen.findByLabelText('Passphrase')).toBeTruthy();
    const opened = h.openEntry.mock.calls.length;
    act(() => {
      h.entriesCb?.(entrySnap([...h.entries, { id: 'cred-3', iv: 'iv-3', ciphertext: 'ct-3' }]));
    });
    expect(h.openEntry.mock.calls.length).toBe(opened);

    // ...so a second visit has to derive again rather than reuse anything.
    await unlock();
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();
    expect(h.derive).toHaveBeenCalledTimes(2);
  });

  it('says the passphrase did not open the vault, without saying whether it is empty', async () => {
    h.verify.mockResolvedValue(false);
    renderVault();

    await unlock();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('That passphrase did not open the vault.');
    expect(alert.textContent).not.toMatch(/empty/i);
    expect(screen.queryByText(ENTRY.label)).toBeNull();
    expect(h.openEntry).not.toHaveBeenCalled();
    // A failed attempt writes nothing either — there is no log to write to.
    expect(h.auditWrites).toHaveLength(0);
  });

  it('mints the vault from the first passphrase when there is no meta yet', async () => {
    h.meta = null;
    renderVault();

    expect(await screen.findByRole('heading', { name: 'Set the vault passphrase' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole('button', { name: 'Create the vault' }));

    await waitFor(() => expect(h.setDoc).toHaveBeenCalled());
    const [ref, written] = h.setDoc.mock.calls[0];
    expect(ref.path).toBe('credentialsMeta/current');
    expect(written).toMatchObject({ iterations: 600_000, schemaVersion: 1 });
    expect(written.salt).toBe('AAAAAAAAAAAAAAAAAAAAAA==');
    // A string, because that is what the rules accept for `check`.
    expect(typeof written.check).toBe('string');
    expect(JSON.parse(written.check as string)).toEqual({ iv: 'check-iv', ciphertext: 'check-ct' });
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();
  });

  it('starts over after a lost passphrase: new meta, entries destroyed, nothing logged', async () => {
    renderVault();
    await screen.findByLabelText('Passphrase');

    fireEvent.click(screen.getByRole('button', { name: 'Forgot the passphrase?' }));
    fireEvent.change(screen.getByLabelText('New passphrase'), { target: { value: 'new shared phrase' } });
    expect(screen.getByText('2 entries will be deleted.')).toBeTruthy();

    // One tap arms it; nothing is written until the second, because there is no undo.
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(h.batches).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));

    await waitFor(() => expect(h.batches).toHaveLength(1));
    const batch = h.batches[0];
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(h.derive).toHaveBeenCalledWith('new shared phrase', expect.anything(), 600_000);
    // The meta is overwritten in place: the rules forbid deleting it, so a new
    // salt under a new key is the only way back in.
    expect(batch.set).toHaveBeenCalledWith(
      { path: 'credentialsMeta/current' },
      expect.objectContaining({ iterations: 600_000, schemaVersion: 1, check: expect.any(String) }),
    );
    // Every entry goes; no audit row is written for the deletions.
    expect(batch.delete).toHaveBeenCalledWith({ path: 'credentials/cred-1' });
    expect(batch.delete).toHaveBeenCalledWith({ path: 'credentials/cred-2' });
    expect((batch.set.mock.calls as [{ path: string }][]).map(([ref]) => ref.path)).not.toContain(
      'credentialAudit',
    );
    expect(h.auditWrites).toHaveLength(0);

    // Resetting unlocks the vault rather than leaving it locked under a key nobody has.
    expect(await screen.findByText('Vault reset. Share the new passphrase with the other Full-timers.')).toBeTruthy();
    expect(screen.queryByDisplayValue('new shared phrase')).toBeNull();
  });

  it('seals a new entry before writing it, and writes no audit row', async () => {
    renderVault();
    await unlock();
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }));
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'New login' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new@example.org' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(h.addedDocs.some((doc) => doc.path === 'credentials')).toBe(true));
    expect(h.sealEntry).toHaveBeenCalledWith(
      { sentinel: 'key' },
      expect.objectContaining({ label: 'New login', password: 'secret-value' }),
    );

    const written = h.addedDocs.find((doc) => doc.path === 'credentials');
    expect(written?.data).toMatchObject({ iv: 'iv-new', ciphertext: 'ct-new' });
    expect(JSON.stringify(written?.data)).not.toContain('secret-value');
    expect(h.auditWrites).toHaveLength(0);
  });

  it('edits an entry through a re-seal, leaving its createdAt alone, and writes no audit row', async () => {
    renderVault();
    await unlock();
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();

    const card = screen.getAllByRole('article')[0];
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(h.updateDoc).toHaveBeenCalled());
    const [ref, written] = h.updateDoc.mock.calls[0];
    expect(ref.path).toBe('credentials/cred-1');
    expect(written).toMatchObject({ iv: 'iv-new', ciphertext: 'ct-new' });
    expect(JSON.stringify(written)).not.toContain('new-secret');
    // The update rule freezes `createdAt`, so the write must not touch it.
    expect(written).not.toHaveProperty('createdAt');
    expect(h.auditWrites).toHaveLength(0);
  });

  it('deletes an entry only on the second tap, and writes no audit row', async () => {
    renderVault();
    await unlock();
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();

    const card = screen.getAllByRole('article')[0];
    fireEvent.click(within(card).getByRole('button', { name: 'Delete' }));
    // The first tap asks; keeping it writes nothing.
    fireEvent.click(within(card).getByRole('button', { name: 'Keep' }));
    expect(h.deleteDoc).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(h.deleteDoc).toHaveBeenCalled());
    expect(h.deleteDoc.mock.calls[0][0]).toEqual({ path: 'credentials/cred-1' });
    expect(h.auditWrites).toHaveLength(0);
  });

  it('re-seals every entry under the new passphrase in one batch, after showing the count', async () => {
    h.rekey.mockResolvedValue([
      { iv: 'iv-1b', ciphertext: 'ct-1b' },
      { iv: 'iv-2b', ciphertext: 'ct-2b' },
    ]);
    renderVault();
    await unlock();
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    // The entry count comes before the change, so nobody rotates blind.
    expect(screen.getByText(/2 entries will be sealed again/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('New passphrase'), { target: { value: 'a new passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change the passphrase' }));

    await waitFor(() => expect(h.batches).toHaveLength(1));
    expect(h.derive).toHaveBeenLastCalledWith('a new passphrase', expect.anything(), META.iterations);
    expect(h.rekey).toHaveBeenCalledWith(
      [
        { iv: 'iv-1', ciphertext: 'ct-1' },
        { iv: 'iv-2', ciphertext: 'ct-2' },
      ],
      { sentinel: 'key' },
      { sentinel: 'key' },
    );

    const batch = h.batches[0];
    const calls = batch.set.mock.calls as [{ path: string }, Record<string, unknown>][];
    expect(calls.map(([ref]) => ref.path)).toEqual([
      'credentialsMeta/current',
      'credentials/cred-1',
      'credentials/cred-2',
    ]);
    expect(calls[1][1]).toMatchObject({ iv: 'iv-1b', ciphertext: 'ct-1b' });
    expect(h.auditWrites).toHaveLength(0);
    expect(batch.commit).toHaveBeenCalled();
  });

  it('does not set a second passphrase when someone else created the vault first (Nov 2026)', async () => {
    h.meta = null;
    h.txMetaExists = true;
    renderVault();

    expect(await screen.findByRole('heading', { name: 'Set the vault passphrase' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole('button', { name: 'Create the vault' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Another Full-timer set up the vault a moment ago. Unlock it with their passphrase.',
    );
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(screen.queryByText(ENTRY.label)).toBeNull();
  });

  it('locks when the passphrase is changed on another device (Nov 2026)', async () => {
    renderVault();
    await unlock();
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();

    act(() => {
      h.metaCb?.({ data: () => ({ ...META, salt: 'bmV3LXNhbHQ=' }) });
    });

    expect(await screen.findByLabelText('Passphrase')).toBeTruthy();
    expect(screen.queryByText(ENTRY.label)).toBeNull();
    expect(
      screen.getByText('The vault passphrase was changed by another Full-timer. Unlock it with the new passphrase.'),
    ).toBeTruthy();
  });

  it('re-opens an entry that was edited elsewhere instead of showing the old plaintext (Nov 2026)', async () => {
    renderVault();
    await unlock();
    expect(await screen.findByText(ENTRY.label)).toBeTruthy();

    h.openEntry.mockImplementation(async (_key: unknown, blob: { iv: string }) =>
      blob.iv === 'iv-1-edited'
        ? { ...ENTRY, label: 'Ministry inbox (new)' }
        : blob.iv === 'iv-1'
          ? ENTRY
          : { ...ENTRY, label: 'Second login', username: 'second@example.org' },
    );
    act(() => {
      h.entriesCb?.(
        entrySnap([
          { id: 'cred-1', iv: 'iv-1-edited', ciphertext: 'ct-1-edited' },
          { id: 'cred-2', iv: 'iv-2', ciphertext: 'ct-2' },
        ]),
      );
    });

    expect(await screen.findByText('Ministry inbox (new)')).toBeTruthy();
    expect(screen.queryByText(ENTRY.label)).toBeNull();
  });
});
