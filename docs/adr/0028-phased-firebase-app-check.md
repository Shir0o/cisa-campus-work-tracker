# 0028. Phased Firebase App Check with Dual-Platform Attestation and Monitoring-First Rollout

Date: 2026-09-19

## Status

Accepted

## Context

CISA Campus Work Tracker interacts directly from client applications (Web PWA hosted on Cloudflare Pages, and React Native mobile on iOS/Android) to Cloud Firestore, Cloud Storage, and Realtime Database in Firebase project `sac-campus-hub`. Without attestation, any actor with the exposed Firebase API configuration can query or manipulate backend endpoints subject only to Firestore security rules.

To safeguard backend resources against scraping and unauthorized API access, Firebase App Check provides request attestation. However, enabling enforcement immediately would break unupdated mobile builds, web users without new tokens, CI/E2E test pipelines, and local emulator/dev environments.

## Decision

1. **Dual-Platform Attestation**:
   - **Web**: Use `initializeAppCheck` from `firebase/app-check` with `ReCaptchaV3Provider` or `ReCaptchaEnterpriseProvider`.
   - **Native Mobile**: Integrate native attestation providers (DeviceCheck/App Attest on iOS, Play Integrity on Android).
   - **Local / QA / CI**: Automatically activate `CustomProvider` / debug tokens when `__DEV__`, emulator, or QA builds (`qa-db`) run, ensuring CI and E2E suites pass uninterrupted.

2. **Rollout Lifecycle**:
   - **Phase 1 (Implementation & Monitoring)**: Deploy App Check token exchange across Web and Mobile with backend services (Firestore, Storage, Realtime Database) in **Monitoring / Metrics-only** mode. Verify metrics in Firebase Console to observe valid token adoption.
   - **Phase 2 (Enforcement)**: Enforce App Check on Firebase services only after verified metrics demonstrate >99% legitimate token attestation.
