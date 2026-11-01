# Application Shell & Navigation Layout (`src/components/layout`)

## Overview
Global navigation bars, navigation rail, mobile navigation drawer, impersonation banners, and global search palettes.

## Interface
- `GlobalSearch` (`GlobalSearch.tsx`)
- `ImpersonateBar` (`ImpersonateBar.tsx`)
- `ImpersonateModal` (`ImpersonateModal.tsx`)
- `ImpRow` (`ImpersonatePicker.tsx`)
- `ImpersonatePicker` (`ImpersonatePicker.tsx`)
- `MobileNav` (`MobileNav.tsx`)
- `NavChromeStripProps` (`NavChromeStrip.tsx`)
- `NavChromeStrip` (`NavChromeStrip.tsx`)
- `NavRailProps` (`NavRail.tsx`)
- `NavRail` (`NavRail.tsx`)
- `NtfFeedItem` (`NotificationCenter.tsx`)
- `groupNotificationsIntoStacks` (`NotificationCenter.tsx`)
- `NotificationCenter` (`NotificationCenter.tsx`)
- `OwnerViewBanner` (`OwnerViewBanner.tsx`)
- `PageWidth` (`PageContainer.tsx`)

## Invariants
- Code within this directory adheres to strict TypeScript typing and project ESLint rules.

## Side Effects
- [GlobalSearch.tsx] const unsub = onSnapshot(
- [GlobalSearch.tsx] ? onSnapshot(collectionGroup(db, 'interactions'), (snap) => onDocs(snap.docs), onError)
- [GlobalSearch.tsx] const unsub = onSnapshot(
- [GlobalSearch.tsx] const unsub = onSnapshot(
- [GlobalSearch.tsx] run: () => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key)),
- [GlobalSearch.tsx] run: () => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key)),
- [GlobalSearch.tsx] onClick={() => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key))}
- [GlobalSearch.tsx] onClick={() => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key))}

## Verification
- Run: `npm test`
