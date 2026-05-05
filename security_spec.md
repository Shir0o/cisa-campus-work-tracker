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

## Test Runner Implementation

The tests are implemented in `src/test/firestore.rules.test.ts` using `@firebase/rules-unit-testing`.
