# Credential vault: ciphertext in Firestore, key derived from a passphrase the server never sees

**Credential vault** (#1605) is an admin-only place in the app for the team's shared logins — the ministry and service accounts that live in a shared Google Doc today and are meant to be retired. An entry is `label`, `username`, `password`, `url`, `notes`. Only a Full-timer may add, see or edit one; there is no cap on how many exist, and nothing here is shared with Trainees, Students, Community, or coordination-doc guest links (ADR 0023).

Firestore rules are the product's only boundary today, and they gate *reads*, not copies at rest. `admin`-only rules would still leave every password in the clear in the same database a console session, an export or a backup can dump — and the Sync Token already demonstrates that posture (`settings/integrations.attdSyncToken` is plaintext, masked in the UI only). So the entries are encrypted in the browser and only ciphertext is written: AES-256-GCM under a key derived by PBKDF2-SHA-256 (600,000 iterations, random 16-byte salt) from a passphrase the Full-timers share out of band. The passphrase is never stored, sent, or logged; the derived key lives in memory for the session and nowhere else.

Each entry is one encrypted JSON blob rather than one ciphertext per field, so there is no plaintext field left on the document to leak, index, or sort by. The salt, the iteration count and a check value live in one `credentialsMeta/current` document rather than on every entry: the passphrase is derived **once** per unlock (`credentialsMeta` → key → entries) instead of once per entry, which at 600,000 iterations is the difference between one pause and ten. The check value — a fixed string encrypted under the same key — distinguishes a wrong passphrase from an empty vault; the GCM tag on any entry would do it too, but the check value still works when the vault holds none. A rekey writes a new salt and rewrites every entry in one pass, so the meta and the entries are only ever consistent within a single write batch.

Losing the passphrase loses the entries. That is accepted, and it is the reason the ADR says out loud where it should also be written down: the passphrase belongs in the team's password manager, not only in this app.

## Considered Options

- **Plaintext under admin-only rules** — the Sync Token's posture. Cheapest, and the boundary is real for the app's own users, but it stores the passwords in the clear for every path that is not a rules-gated read: console, export, backup, a future server job. Rejected as the whole point of moving off the Google Doc is that the team wants one place *and* a smaller blast radius.
- **Server-side encryption with a key from env/KMS** — the server can decrypt, so nothing changes for the UI. Rejected: the key sits next to the data, and it adds a decrypt endpoint that any admin session can call, which re-creates a plaintext channel through the server and makes the encryption decorative.
- **Adopt 1Password/Bitwarden and link to it** — zero build, zero liability. Considered and declined by the maintainer: the reason the doc is being retired is that the team works inside this app, and a second tool is the doc again with a subscription.
- **One ciphertext per field** — more encrypted fields, more IVs to manage, and no benefit over encrypting the entry as a unit. Rejected.
- **Argon2id instead of PBKDF2** — better against GPU cracking, but it means shipping a WASM KDF. PBKDF2-SHA-256 is native to `crypto.subtle`, and 600,000 iterations is the OWASP baseline. Revisit if a dependency-free Argon2 lands.

## Consequences

- **Unlock is per session.** A page reload re-prompts for the passphrase; there is an explicit **Lock** that clears the key. Nothing is written to `localStorage`, `sessionStorage`, the URL, or the console.
- **Rules still gate every read and write** to `admin`. Encryption is defence in depth against at-rest exposure, not a replacement for the rules — a Full-timer's own session can read the ciphertext, and that is correct.
- **Rotation is client-side.** Changing the passphrase re-wraps every entry in one pass in the admin's browser; there is no server path to do it, so the tab has to stay open. At ten entries that is a fraction of a second; the design does not need to scale past a few hundred.
- **Reveal is a display event, not an access event.** Every entry is decrypted at unlock, so the audit log cannot claim more than it proves: it records *who looked, at what, when* — see below — not that an admin could not have looked unlogged. An admin holds both the passphrase and the data.
- **Audit log** is its own collection, `credentialAudit`, append-only from the client's point of view: rules allow `create` and deny `update`/`delete`, and each document carries `actorUid` (the *real* auth uid, never `effectiveUserId`), `credentialId`, `action` (`unlock`, `unlock-failed`, `reveal`, `copy`, `create`, `update`, `delete`, `rotate`), the field where one applies, and `createdAt` pinned to `request.time`. It is readable by admins only, like the vault.
- **Simulated roles cannot reach it.** The route gate uses the *effective* role (`getEffectiveRole`, ADR 0022), so a Full-timer previewing as a Trainee loses the door; the Firestore rules still answer to the real uid, which is why the door, not the rules, is what hides it.
- **Impersonation does not write the log.** `actorUid` is `user.uid`; `effectiveUserId` never enters this collection, or the log would name a Trainee for a Full-timer's reveal.
- **Restore depends on the passphrase, not the database.** Ciphertext restores fine; a backup plus a forgotten passphrase is worthless. This is the one operational consequence to tell whoever runs rotation.
- **1 MiB per entry** is Firestore's document ceiling, not a product limit. `notes` is capped in the UI well under it.
- **Ordering** is by `createdAt` because labels are encrypted and cannot be sorted server-side. Reordering by hand is out of scope.
- **No plaintext in the DOM until revealed**, and the revealed value clears on Lock. Copy goes through the clipboard, and both reveal and copy are audited.

## Update (#1969)

Read back against what shipped, the meta document carries one field this decision did not name. `credentialsMeta/current` also holds `schemaVersion` (currently `1`), and `firestore.rules` requires it on every write so a later format can tell an older vault apart instead of guessing. The `check` value is stored as a JSON string rather than a nested map, because the rules type that field as a string of at most 512 characters. Salt (base64, at most 128 characters), `iterations`, `check` and `schemaVersion` are all required, and both stamps are pinned to `request.time`, so a rekey rewrites the meta's `createdAt` as well as its `updatedAt`.
