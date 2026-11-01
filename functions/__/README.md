# Firebase Auth Helper Namespace (`functions/__`)

## Overview
Intermediate namespace grouping same-origin Firebase authentication reverse-proxy and initialization endpoints (`auth` and `firebase`) on Cloudflare Pages to prevent browser third-party storage partitioning.

## Subdirectories & Boundaries
- [auth](./auth/README.md): Transparent reverse-proxy handler for `/__/auth/*` routing to `sac-campus-hub.firebaseapp.com`.
- [firebase](./firebase/README.md): Configuration provider route serving `/__/firebase/init.json` with Firebase project options.
