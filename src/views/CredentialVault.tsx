import React, { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import PageContainer from "../components/layout/PageContainer";
import { cn } from "../lib/utils";
import { openEntry, type VaultEntry } from "../lib/vaultCrypto";
import {
  createEntry,
  createVault,
  deleteEntry,
  rotatePassphrase,
  subscribeCredentialAudit,
  subscribeVaultEntries,
  subscribeVaultMeta,
  unlockVault,
  updateEntry,
  writeCredentialAudit,
  VAULT_AUDIT_ID,
  type CredentialAction,
  type CredentialAuditRow,
  type VaultEntryDoc,
  type VaultMeta,
} from "../lib/credentialVault";

// ── Credential vault (#1967, ADR 0051) ─────────────────────────────────────
// The team's shared logins, sealed in the browser: Firestore holds ciphertext,
// the key is derived from a passphrase the server never sees, and the key lives
// in this page's state for the session only. A reload re-prompts, Lock drops
// the key and every decrypted field, and nothing about the passphrase is
// rendered once it has been used.
//
// The audit feed below the list is the readable half of the log the rules keep
// append-only: who unlocked, what was revealed or copied, and when.

const EMPTY_ENTRY: VaultEntry = { label: "", username: "", password: "", url: "", notes: "" };

const ACTIVITY_KEYS: Record<CredentialAction, [string, string]> = {
  unlock: ["vault.action_unlock", "Unlocked the vault"],
  "unlock-failed": ["vault.action_unlock_failed", "Wrong passphrase"],
  reveal: ["vault.action_reveal", "Revealed a password"],
  copy: ["vault.action_copy", "Copied a password"],
  create: ["vault.action_create", "Added an entry"],
  update: ["vault.action_update", "Edited an entry"],
  delete: ["vault.action_delete", "Deleted an entry"],
  rotate: ["vault.action_rotate", "Changed the passphrase"],
};

export default function CredentialVault() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const uid = user?.uid ?? "";

  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [metaKnown, setMetaKnown] = useState(false);
  const [entries, setEntries] = useState<VaultEntryDoc[]>([]);
  const [audit, setAudit] = useState<CredentialAuditRow[]>([]);

  // The only place the key ever lives.
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [plain, setPlain] = useState<Record<string, VaultEntry>>({});
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());

  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [nextPassphrase, setNextPassphrase] = useState("");

  useEffect(() => {
    const unsubMeta = subscribeVaultMeta((next) => {
      setMeta(next);
      setMetaKnown(true);
    });
    const unsubEntries = subscribeVaultEntries(setEntries);
    const unsubAudit = subscribeCredentialAudit(setAudit);
    return () => {
      unsubMeta();
      unsubEntries();
      unsubAudit();
    };
  }, []);

  // Every entry is decrypted once, at unlock (ADR 0051) — but a snapshot can
  // land before or after the key, and a rotate changes every blob, so the
  // decryption is keyed off both and skips what it already has.
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void (async () => {
      for (const entryDoc of entries) {
        if (plain[entryDoc.id]) continue;
        try {
          const entry = await openEntry(key, { iv: entryDoc.iv, ciphertext: entryDoc.ciphertext });
          if (!cancelled) setPlain((current) => ({ ...current, [entryDoc.id]: entry }));
        } catch {
          // A blob that will not open under this key is either mid-rotate or
          // not ours; leave it out rather than render half a secret.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, entries, plain]);

  const lock = () => {
    setKey(null);
    setPlain({});
    setRevealed(new Set());
    setPassphrase("");
    setEditing(null);
    setConfirmDelete(null);
    setRotating(false);
    setNextPassphrase("");
    setError(null);
    setNotice(null);
  };

  const remember = (action: CredentialAction, credentialId: string = VAULT_AUDIT_ID, field?: string) => {
    if (!uid) return;
    void writeCredentialAudit(uid, action, credentialId, field);
  };

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!meta) {
        const nextKey = await createVault(passphrase);
        setKey(nextKey);
        setPassphrase("");
        remember("unlock");
        return;
      }
      const attempt = await unlockVault(passphrase, meta);
      if (!attempt.ok) {
        remember("unlock-failed");
        setPassphrase("");
        // Deliberately the same sentence whatever is inside: a wrong
        // passphrase must not tell anyone whether the vault is empty.
        setError(t("vault.wrong_passphrase", "That passphrase did not open the vault."));
        return;
      }
      setKey(attempt.key);
      setPassphrase("");
      remember("unlock");
    } catch {
      setError(t("vault.unlock_failed", "The vault could not be opened. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const save = async (draft: VaultEntry) => {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") {
        const id = await createEntry(key, draft);
        setPlain((current) => ({ ...current, [id]: draft }));
        remember("create", id);
      } else if (editing) {
        await updateEntry(editing, key, draft);
        setPlain((current) => ({ ...current, [editing]: draft }));
        remember("update", editing);
      }
      setEditing(null);
    } catch {
      setError(t("vault.save_failed", "That entry could not be saved. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteEntry(id);
      setPlain((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      remember("delete", id);
      setConfirmDelete(null);
    } catch {
      setError(t("vault.delete_failed", "That entry could not be deleted. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const toggleReveal = (id: string) => {
    const wasOpen = revealed.has(id);
    setRevealed((current) => {
      const next = new Set(current);
      if (wasOpen) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!wasOpen) remember("reveal", id, "password");
  };

  const copy = async (id: string) => {
    const secret = plain[id]?.password;
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      remember("copy", id, "password");
      setNotice(t("vault.copied", "Password copied."));
    } catch {
      setError(t("vault.copy_failed", "The password could not be copied."));
    }
  };

  const rotate = async () => {
    if (!key || !meta || !nextPassphrase || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const nextKey = await rotatePassphrase(uid, key, nextPassphrase, entries, meta.iterations);
      setKey(nextKey);
      // Every blob was re-sealed under the new key, so the old plaintext map
      // is stale; clearing it makes the decrypt effect re-read the new ones.
      setPlain({});
      setRevealed(new Set());
      setNextPassphrase("");
      setRotating(false);
      setNotice(t("vault.rotated", "New passphrase set. Share it with the other Full-timers."));
    } catch {
      setError(t("vault.rotate_failed", "The passphrase could not be changed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const entryName = (credentialId: string) =>
    credentialId === VAULT_AUDIT_ID
      ? t("vault.activity_vault", "The vault")
      : (plain[credentialId]?.label ?? t("vault.activity_unknown", "An entry"));

  return (
    <PageContainer variant="reading">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant m-0">
          {t("vault.eyebrow", "Full-timers only")}
        </p>
        <h1 className="font-serif text-2xl lg:text-3xl text-on-surface font-semibold m-0 mt-2">
          {t("vault.title", "Credential vault")}
        </h1>
        <p className="text-sm text-on-surface-variant m-0 mt-2 max-w-2xl">{t("vault.sub", "The team's shared logins, sealed with a passphrase the app never stores.")}</p>
      </header>

      {!key ? (
        !metaKnown ? (
          <p className="text-sm text-on-surface-variant">{t("vault.loading", "Opening the vault…")}</p>
        ) : (
          <section className="rounded-3xl border border-outline-variant/60 bg-surface p-6">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-on-surface-variant" />
              <h2 className="font-serif text-xl text-on-surface font-semibold m-0">
                {meta ? t("vault.locked_title", "Locked") : t("vault.setup_title", "Set the vault passphrase")}
              </h2>
            </div>
            <p className="text-sm text-on-surface-variant mt-2 mb-4 max-w-xl">
              {meta
                ? t("vault.locked_sub", "Enter the passphrase the Full-timers share out of band.")
                : t(
                    "vault.setup_sub",
                    "The vault is empty. The passphrase you choose here becomes the one every Full-timer unlocks it with.",
                  )}
            </p>
            <form onSubmit={unlock} className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                aria-label={t("vault.passphrase", "Passphrase")}
                placeholder={t("vault.passphrase_placeholder", "Vault passphrase")}
                className="flex-1 px-4 py-2.5 rounded-[14px] bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
              />
              <button
                type="submit"
                disabled={busy || !passphrase}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[14px] bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 min-h-[44px]"
              >
                {meta ? <Unlock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {meta ? t("vault.unlock", "Unlock") : t("vault.create", "Create the vault")}
              </button>
            </form>
            <p className="text-xs text-on-surface-variant mt-3 m-0">
              {t("vault.not_recoverable", "This passphrase is stored nowhere and cannot be recovered. Keep it in the team password manager.")}
            </p>
            {error && (
              <p role="alert" className="text-sm text-error mt-3 m-0">
                {error}
              </p>
            )}
          </section>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-serif text-xl text-on-surface font-semibold m-0">
                {t("vault.entries_title", "Shared logins")}
              </h2>
              <p className="text-xs text-on-surface-variant m-0 mt-1">
                {t("vault.entry_count", "{n} entries").replace("{n}", String(entries.length))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[14px] bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                {t("vault.add_entry", "Add an entry")}
              </button>
              <button
                type="button"
                onClick={lock}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[14px] border border-outline text-on-surface font-medium text-sm hover:bg-surface-variant transition-colors min-h-[44px]"
              >
                <Lock className="w-4 h-4" />
                {t("vault.lock", "Lock")}
              </button>
            </div>
          </div>

          {notice && <p className="text-sm text-success m-0 mb-3">{notice}</p>}
          {error && (
            <p role="alert" className="text-sm text-error m-0 mb-3">
              {error}
            </p>
          )}

          {editing !== null && (
            <div className="mb-4">
              <EntryForm
                initial={editing === "new" ? EMPTY_ENTRY : (plain[editing] ?? EMPTY_ENTRY)}
                busy={busy}
                onSubmit={save}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-on-surface-variant m-0">
              {t("vault.empty", "No logins yet. Add the first one above.")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((entryDoc) => {
                const entry = plain[entryDoc.id];
                if (!entry) return null;
                const open = revealed.has(entryDoc.id);
                const link = /^https?:\/\//i.test(entry.url) ? entry.url : null;
                return (
                  <article
                    key={entryDoc.id}
                    className="rounded-2xl border border-outline-variant/60 bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-serif text-lg text-on-surface font-semibold m-0 break-words">
                          {entry.label}
                        </h3>
                        <p className="text-sm text-on-surface-variant m-0 mt-0.5 break-all">{entry.username}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditing(entryDoc.id)}
                          aria-label={t("vault.edit", "Edit")}
                          className="w-9 h-9 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDelete === entryDoc.id ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                            {t("vault.delete_question", "Delete it?")}
                            <button
                              type="button"
                              onClick={() => remove(entryDoc.id)}
                              disabled={busy}
                              className="px-2.5 py-1.5 rounded-full bg-error text-on-error text-xs font-medium disabled:opacity-60"
                            >
                              {t("vault.delete", "Delete")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="px-2.5 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface"
                            >
                              {t("vault.keep", "Keep")}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(entryDoc.id)}
                            aria-label={t("vault.delete", "Delete")}
                            className="w-9 h-9 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span
                        data-testid="vault-password"
                        className={cn("font-mono text-sm text-on-surface break-all", !open && "tracking-[0.2em]")}
                      >
                        {open ? entry.password : "••••••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleReveal(entryDoc.id)}
                        aria-label={
                          open
                            ? t("vault.hide_password", "Hide password")
                            : t("vault.show_password", "Show password")
                        }
                        className="w-9 h-9 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                      >
                        {open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copy(entryDoc.id)}
                        aria-label={t("vault.copy_password", "Copy password")}
                        className="w-9 h-9 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>

                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-block text-sm text-accent underline underline-offset-2 mt-2 break-all"
                      >
                        {link}
                      </a>
                    )}
                    {entry.notes && (
                      <p className="text-sm text-on-surface-variant line-clamp-3 mt-2 mb-0 max-w-prose">
                        {entry.notes}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {meta && (
            <section className="rounded-3xl border border-outline-variant/60 bg-surface p-6 mt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-lg text-on-surface font-semibold m-0">
                    {t("vault.rotate_title", "Change the passphrase")}
                  </h2>
                  <p className="text-sm text-on-surface-variant m-0 mt-1">
                    {t("vault.rotate_sub", "Everyone who shares this vault will need the new passphrase.")}
                  </p>
                </div>
                {!rotating && (
                  <button
                    type="button"
                    onClick={() => setRotating(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[14px] border border-outline text-on-surface font-medium text-sm hover:bg-surface-variant transition-colors min-h-[44px]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t("vault.rotate", "Change")}
                  </button>
                )}
              </div>
              {rotating && (
                <div className="mt-4 flex flex-col gap-3">
                  <p className="text-sm text-on-surface m-0">
                    {t("vault.rotate_count", "{n} entries will be sealed again under the new passphrase.")
                      .replace("{n}", String(entries.length))}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={nextPassphrase}
                      onChange={(e) => setNextPassphrase(e.target.value)}
                      aria-label={t("vault.new_passphrase", "New passphrase")}
                      placeholder={t("vault.new_passphrase_placeholder", "New passphrase")}
                      className="flex-1 px-4 py-2.5 rounded-[14px] bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
                    />
                    <button
                      type="button"
                      onClick={rotate}
                      disabled={busy || !nextPassphrase}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[14px] bg-primary text-on-primary font-medium text-sm hover:opacity-90 disabled:opacity-60 min-h-[44px]"
                    >
                      <Check className="w-4 h-4" />
                      {busy ? t("vault.rotating", "Working…") : t("vault.rotate_confirm", "Change the passphrase")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRotating(false);
                        setNextPassphrase("");
                      }}
                      className="px-4 py-2.5 rounded-[14px] border border-outline text-on-surface font-medium text-sm hover:bg-surface-variant min-h-[44px]"
                    >
                      {t("actions.cancel", "Cancel")}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <section className="rounded-3xl border border-outline-variant/60 bg-surface mt-6">
        <details className="p-6">
          <summary className="cursor-pointer font-serif text-lg text-on-surface font-semibold select-none">
            {t("vault.activity_title", "Recent activity")}
          </summary>
          <p className="text-xs text-on-surface-variant mt-2 m-0">
            {t("vault.activity_sub", "The last 20 things done here. Rows cannot be edited or removed.")}
          </p>
          {audit.length === 0 ? (
            <p className="text-sm text-on-surface-variant mt-3 mb-0">{t("vault.activity_empty", "Nothing yet.")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-outline-variant/40 list-none p-0 m-0">
              {audit.map((row) => {
                const [keyName, fallback] = ACTIVITY_KEYS[row.action];
                return (
                  <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
                    <span className="text-on-surface">{t(keyName, fallback)}</span>
                    <span className="text-xs text-on-surface-variant">
                      {entryName(row.credentialId)}
                      {row.createdAt ? ` · ${new Date(row.createdAt.toMillis()).toLocaleString()}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      </section>
    </PageContainer>
  );
}

function EntryForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: VaultEntry;
  busy: boolean;
  onSubmit: (entry: VaultEntry) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<VaultEntry>(initial);
  const ready = draft.label.trim().length > 0;

  const field = (name: keyof VaultEntry) => ({
    value: draft[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((current) => ({ ...current, [name]: e.target.value })),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onSubmit({ ...draft, label: draft.label.trim() });
      }}
      className="rounded-2xl border border-outline-variant/60 bg-surface p-4 flex flex-col gap-3"
    >
      <label className="block">
        <span className="block text-xs font-medium text-on-surface-variant mb-1">
          {t("vault.field_label", "Label")}
        </span>
        <input
          {...field("label")}
          className="w-full px-3 py-2 rounded-[14px] bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-on-surface-variant mb-1">
          {t("vault.field_username", "Username")}
        </span>
        <input
          {...field("username")}
          autoComplete="off"
          className="w-full px-3 py-2 rounded-[14px] bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-on-surface-variant mb-1">
          {t("vault.field_password", "Password")}
        </span>
        <input
          {...field("password")}
          autoComplete="off"
          className="w-full px-3 py-2 rounded-[14px] bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface font-mono"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-on-surface-variant mb-1">
          {t("vault.field_url", "Web address")}
        </span>
        <input
          {...field("url")}
          inputMode="url"
          className="w-full px-3 py-2 rounded-[14px] bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-on-surface-variant mb-1">
          {t("vault.field_notes", "Notes")}
        </span>
        <textarea
          {...field("notes")}
          rows={3}
          maxLength={2000}
          className="w-full px-3 py-2 rounded-[14px] bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface resize-y"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!ready || busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[14px] bg-primary text-on-primary font-medium text-sm hover:opacity-90 disabled:opacity-60 min-h-[44px]"
        >
          <Check className="w-4 h-4" />
          {t("vault.save", "Save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-[14px] border border-outline text-on-surface font-medium text-sm hover:bg-surface-variant min-h-[44px]"
        >
          {t("actions.cancel", "Cancel")}
        </button>
      </div>
    </form>
  );
}
