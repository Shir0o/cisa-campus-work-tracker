# Cloudflare Pages Functions (`functions`)

## Overview
Subtree root directory hosting Cloudflare Pages Functions serverless edge endpoints for API gateway proxying (`/api/*`) and same-origin Firebase authentication helpers (`/__/*`).

## Subdirectories & Boundaries
- [api](./api/README.md): Cloudflare Pages API edge reverse-proxy forwarding client REST requests to backend services on GCP Cloud Run.
- [__](./__/README.md): Cloudflare Pages Firebase edge proxy and configuration endpoints resolving browser auth storage partitioning.
