# 0029. TOTP multi-factor authentication (second factor)

Date: 2026-09-19

## Status

Accepted

## Context

The app stores sensitive campus-ministry contact and student data, and staff
(Full-timers and the owner) have team-wide read/write access. Today the only
things protecting a staff account are its email/password or Google credentials —
a leaked password is a full breach. The team asked to set up Firebase
Multi-Factor Authentication across the web app (`src/`) and the mobile app
(`apps/mobile/`, Expo using the JS `firebase/*` SDK).

Firebase's MFA feature offers two second-factor types through the same
`MultiFactorUser` API:

- **SMS (phone)**: the classic flow in Firebase's iOS/Android/web MFA guides.
- **TOTP (authenticator app)**: time-based one-time codes via
  `TotpMultiFactorGenerator`.

Three constraints drove the choice:

1. The mobile app uses the **JS SDK in React Native**, not
   `@react-native-firebase`. SMS/phone verification is not reliably supported
   there by the JS SDK; TOTP works identically on web and React Native.
2. SMS MFA on the web requires **reCAPTCHA**, which fights this project's
   same-origin `__/auth` Cloudflare reverse proxy and the
   storage-partitioned-browser handling already in `AuthProvider` (#557).
3. SMS costs money per message; TOTP is free.

A further reality: the **Firebase Auth emulator does not support TOTP MFA** (it
supports SMS only), so the TOTP flow cannot be exercised end-to-end in CI's
emulator-based tests. The logic is therefore written as pure/thin helpers that
are unit-tested with a mocked `firebase/auth`, and live TOTP is verified
manually against a real/QA project.

## Decision

We add **TOTP (authenticator-app) MFA** using the modular `firebase/auth` SDK,
on **both** the web and mobile apps.

1. **Enrollment type**: TOTP only (not SMS), because it works on both surfaces
   with the existing JS SDK, is free, and needs no reCAPTCHA.
2. **Enrollment**: users manage their factor under **Settings > Security**
   (web) and the mobile Settings screen. Enrollment requires a **verified
   email** (Firebase's hard requirement) and a **recent sign-in** (Firebase's
   `auth/requires-recent-login`), so the flow offers email verification and a
   reauth step (Google popup reauth on web; password reauth or "sign out and
   sign back in" on mobile, which has no popup reauth).
3. **Sign-in challenge**: both email/password and Google sign-in intercept the
   `auth/multi-factor-auth-required` error, hold the `MultiFactorResolver` as a
   pending challenge in `AuthProvider`, and present a 6-digit code step before
   auth state is set.
4. **Mandatory vs optional**: MFA is **mandatory for Full-timers (`admin`) and
   the owner**, optional (self-serve) for Trainees (`manager`), `operator`, and
   `viewer`.
5. **Enforcement**: client-side (UI gates), plus **server-side**: the
   `authorizeAdmin` middleware in `server.ts` rejects tokens whose
   `firebase.sign_in_second_factor` claim is absent, so admin endpoints stay
   honest even if the UI is bypassed. Roles remain Firestore-doc based; only the
   MFA check is claim-based.
6. **Shared logic**: all MFA logic lives in a `lib/mfa.ts` helper module
   mirrored verbatim between web (`src/lib/mfa.ts`) and mobile
   (`apps/mobile/src/lib/mfa.ts`), so both surfaces and the unit tests reuse one
   implementation.

## Consequences

- A leaked password no longer grants access to a Full-timer or the owner;
  recovery of a lost authenticator must go through the owner/Firebase console.
- Email/password staff who do not know their Firebase password are blocked at
  the reauth step; the owner must set/reset passwords externally (accounts are
  provisioned, not self-serve).
- The emulator cannot drive real TOTP, so automated tests use mocked
  `firebase/auth`; a manual QA pass against a real project verifies live
  enrollment and sign-in.
- Deployment requires the project to enable the **TOTP MFA provider** in
  Firebase config (via the console or `projectConfigManager().updateProjectConfig`
  / REST), a step outside the code.