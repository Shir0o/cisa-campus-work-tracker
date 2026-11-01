# Firestore Security Specification: Campus Outreach Hub

This document outlines the security invariants and adversarial test cases for the Campus Outreach Hub Firestore rules.

## Data Invariants

1.  **Identity Integrity**: Users cannot assign themselves roles or approval status. 
2.  **Relational Membership**: Access to contacts and their sub-collections is restricted to approved team members.
3.  **Role Hierarchy**:
    *   `admin`: Full system control including user deletion.
    *   `manager`: User management, stage/event configuration, contact management.
    *   `operator`: Contact editing, interaction/comment creation.
    *   `viewer`: Read-only access to approved data.
4.  **Temporal Integrity**: All `createdAt` and `updatedAt` fields for interactions and comments must use `request.time`.
5.  **Schema Enforcement**: Every write must match the strict blueprint schema (no "Ghost Fields").
6.  **Vault Confidentiality**: `credentialsMeta`, `credentials` and `credentialAudit` are Full-timer only — every allowed read and write is gated by `isAdmin()`. The vault stores ciphertext only: an entry accepts `iv`, `ciphertext`, `createdAt` and `updatedAt` and nothing else, so a plaintext `label`, `username` or `password` is a ghost field, not a stored value. `credentialsMeta` is a singleton: writes are accepted only at `current`, and its keys are `salt`, `iterations`, `check`, `schemaVersion`, `createdAt` and `updatedAt`.
7.  **Vault Temporal Integrity**: A vault write stamps `updatedAt` from `request.time`, so an edit that omits or backdates it is denied; `credentials` stamps `createdAt` from `request.time` on create and freezes it on update, while `credentialsMeta` re-stamps both `createdAt` and `updatedAt` on every write, so a rekey rewrites its `createdAt` too. Entry ids must match `isValidId`, and the blob is bounded — `iv` at 64 characters, `ciphertext` at 700,000 — so an oversized write is refused rather than stored.
8.  **Audit Immutability**: `credentialAudit` is append-only. `create` carries `actorUid == request.auth.uid` (the real uid, never an impersonated one), an `action` from the fixed allowlist — `unlock`, `unlock-failed`, `reveal`, `copy`, `create`, `update`, `delete`, `rotate` — an optional `field` of at most 64 characters, and `createdAt == request.time`; the document id must match `isValidId`, and `credentialId` is a string of at most 128 characters. `update` and `delete` are denied for everyone, including a Full-timer.
9.  **Integration Secret Form**: `settings/integrations.attdSyncTokenHash` is a 64-character lowercase SHA-256 digest (ADR 0052), with `attdSyncUrl` a string of at most 512 characters. The legacy plaintext `attdSyncToken` — at most 256 characters, and never required — stays in the allowed key set only until the migration has run everywhere.

## The "Dirty Dozen" Adversarial Payloads

| ID | Attack Vector | Payload/Action | Expected Outcome |
|:---|:---|:---|:---|
| 1 | **Privilege Escalation** | User updates their own `role` to 'admin'. | PERMISSION_DENIED |
| 2 | **Identity Spoofing** | User creates profile with `approved: true` without active invitation. | PERMISSION_DENIED |
| 3 | **Ghost Field Injection** | `update` contact with `{ "role": "admin", "pwned": true }`. | PERMISSION_DENIED |
| 4 | **ID Poisoning** | `create` contact with document ID of 2KB junk characters. | PERMISSION_DENIED |
| 5 | **Timestamp Fraud** | `create` interaction with `createdAt: '2020-01-01'`. | PERMISSION_DENIED |
| 6 | **Resource Exhaustion** | `update` interaction `content` with a 1MB string. | PERMISSION_DENIED |
| 7 | **Unauthorized Deletion** | `operator` attempts to `delete` a contact. | PERMISSION_DENIED |
| 8 | **Cross-User Tampering** | User A attempts to `delete` User B's comment. | PERMISSION_DENIED |
| 9 | **Email Spoofing** | User with admin email but `email_verified: false` attempts admin write. | PERMISSION_DENIED |
| 10 | **Orphaned Write** | `create` interaction on a path `{contactId}` where ID is invalid junk. | PERMISSION_DENIED |
| 11 | **PII Scraping** | `viewer` attempts to `list` all users. | PERMISSION_DENIED |
| 12 | **Metadata Tampering** | User updates contact `lastSeen` but fails to update `updatedAt`. | PERMISSION_DENIED |
| 13 | **Vault Enumeration** | `manager` (Trainee) attempts to `list` `credentials`. | PERMISSION_DENIED |
| 14 | **Audit Tampering** | `admin` attempts to `update` an existing `credentialAudit` document. | PERMISSION_DENIED |
| 15 | **Plaintext Vault Write** | `admin` `create`s a `credentials` document carrying a `label` field. | PERMISSION_DENIED |

## Test Runner Implementation

The tests are implemented in `src/test/firestore.rules.test.ts` using `@firebase/rules-unit-testing`.
