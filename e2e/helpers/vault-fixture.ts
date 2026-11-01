/**
 * The credential vault's E2E fixture (#1967, ADR 0051).
 *
 * `scripts/seed-emulator.ts` seals `VAULT_ENTRY` under `VAULT_PASSPHRASE` with
 * this fixed salt and a deliberately low iteration count, so the journey's
 * unlock costs milliseconds instead of the ADR's 600,000. The spec imports the
 * same passphrase, so it types the one the fixture was sealed with.
 *
 * Nothing here is a secret: it is a passphrase for a fixture in a throwaway
 * emulator database, not the team's real one.
 */
export const VAULT_PASSPHRASE = 'e2e-vault-passphrase';

/** 16 bytes, 0x00..0x0f — fixed so the salt never has to be read back. */
export const VAULT_SALT_BASE64 = 'AAECAwQFBgcICQoLDA0ODw==';

export const VAULT_ITERATIONS = 1_000;

export const VAULT_ENTRY = {
  label: 'Ministry inbox',
  username: 'cisa@example.org',
  password: 'hunter2',
  url: 'https://mail.example.org',
  notes: 'Recovery codes are in the safe.',
};
