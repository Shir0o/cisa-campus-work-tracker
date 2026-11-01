# Sync token is stored as a hash and shown once

The attendance app (`~/attd`) authenticates to `POST /api/attendance-sync` with an `x-sync-token` header. `server.ts` reads `settings/integrations.attdSyncToken` in the clear and compares it byte-for-byte (`syncTokensMatch`, `crypto.timingSafeEqual`), and Settings renders the same field back to a Full-timer with a reveal and copy control.

#1605 settled that this product does not keep secrets in the clear (ADR 0051). The vault's shape cannot be reused here: a passphrase-derived key needs a human to type the passphrase, and the server has to verify a request at 3am with nobody in the room. So the token takes the other shape available to a secret that is *verified* rather than *read*: store `attdSyncTokenHash`, the SHA-256 of the token, keep the plaintext only long enough to show it once at generation, and have the server compare digests.

## Considered Options

- **Leave it plaintext** — rejected: it is the exact defect #1605 was opened about, and it is the same field a rules-only boundary leaves readable to a console or a backup.
- **Encrypt with a server-held key (env/KMS)** — keeps reveal-and-copy working, but puts the key beside the data and needs a decrypt path the server exposes. Rejected for the same reason as in ADR 0051.
- **Passphrase model as in the vault** — impossible: no human is present when the header arrives, and the app that calls this cannot prompt for a vault passphrase.
- **Hash plus a separate "current token" ciphertext** — two representations of one secret, one of which can be decrypted. Rejected: it buys back the copy button at the cost of the property we are adding.

## Consequences

- **The token can no longer be re-displayed.** After the write, Settings shows the hash state ("Active · stored as a hash") and a **Rotate** control instead of reveal/copy. A Full-timer who loses their pasted copy rotates, which is the same recovery they had before minus the false comfort of re-reading it.
- **Migration is explicit, not silent.** If `attdSyncToken` is still present, the card offers **Activate hashed token**: it shows the current plaintext once (so it can be copied into `~/attd` if that copy has drifted), writes `attdSyncTokenHash`, then deletes `attdSyncToken`. Doing this silently on load would destroy the only copy of a token whose pasted twin nobody verified.
- **The server keeps both paths until migration is done.** `syncTokenFromSettings` gains a hash branch; the legacy plaintext branch and its `attdSyncToken` rules allowance are removed once no environment still holds a plaintext token. `firestore.rules` must accept `attdSyncTokenHash` in the `hasOnly` list and keep `attdSyncToken` only for the transition.
- **Comparison stays timing-safe**, now over equal-length digests, so the existing length-mismatch short-circuit is no longer load-bearing — but it is kept, because a malformed header must not throw.
- **Rotation is audited** in `credentialAudit` (`action: 'rotate'`, `credentialId: 'attd-sync-token'`), so the vault's log is the one place that answers "who changed the integration secret, when".
- **The pre-existing rules test** (`firestore.rules.test.ts:5065`) seeds `attdSyncToken` directly; it changes with the field name, and a case is added that an admin cannot write an arbitrary key into the document.
