# Settings & Administration Panels (`src/components/settings`)

## Overview
System configuration cards, test account purging tools, and usage statistics dashboards.

## Interface
- `BnpbSyncCard` (`BnpbSyncCard.tsx`)
- `TestAccountPurgeModal` (`TestAccountPurgeModal.tsx`)
- `UsageStatsPanel` (`UsageStatsPanel.tsx`)

## Invariants
- [BnpbSyncCard.tsx] if (!res.ok) throw new Error(body?.error || 'request failed');

## Side Effects
- [BnpbSyncCard.tsx] const res = await fetch(path, {
- [BnpbSyncCard.tsx] await navigator.clipboard.writeText(token);

## Verification
- Run: `npm test`
