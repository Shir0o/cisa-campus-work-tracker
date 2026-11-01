# Application Component Library (`src/components`)

## Overview
Top-level directory grouping modular UI components, modals, shell navigation, and feature-specific component trees.

## Interface
- `ActivityItemProps` (`ActivityItem.tsx`)
- `ActivityItem` (`ActivityItem.tsx`)
- `AttendanceSyncPanel` (`AttendanceSyncPanel.tsx`)
- `AuthContextType` (`AuthProvider.tsx`)
- `AuthProvider` (`AuthProvider.tsx`)
- `useAuth` (`AuthProvider.tsx`)
- `ComposeKind` (`ComposeKindPicker.tsx`)
- `COMPOSE_KINDS` (`ComposeKindPicker.tsx`)
- `COMPOSE_ORDER` (`ComposeKindPicker.tsx`)
- `ComposeKindPicker` (`ComposeKindPicker.tsx`)
- `ErrorBoundary` (`ErrorBoundary.tsx`)
- `FeedbackFAB` (`FeedbackFAB.tsx`)
- `LanguageProvider` (`LanguageProvider.tsx`)
- `useLanguage` (`LanguageProvider.tsx`)
- `useI18n` (`LanguageProvider.tsx`)
- [bibleStudy](./bibleStudy/README.md): Interactive Bible study reading, section rendering, and presenter reader components.
- [common](./common/README.md): Shared application widgets including mention autocompletion and generic form controls.
- [contact](./contact/README.md): Contact stream feeds, composer, story views, and profile management sheets.
- [landing](./landing/README.md): Cockpit widgets and dashboard cards rendered on role home pages (My Day, Trainee Landing, Student Landing).
- [layout](./layout/README.md): Global navigation bars, navigation rail, mobile navigation drawer, impersonation banners, and global search palettes.
- [modals](./modals/README.md): Popups, sliding action drawers, and modal sheets for contact creation, visit logging, event scheduling, and attendee management.
- [notifications](./notifications/README.md): User permission prompts and banner components for native Web Push notifications.
- [settings](./settings/README.md): System configuration cards, test account purging tools, and usage statistics dashboards.
- [stream](./stream/README.md): Unified activity stream components, timeline composers, and message thread adapters.
- [todos](./todos/README.md): Interactive action item rows, priority pickers, and inline task composers.
- [ui](./ui/README.md): Atomic design system components including avatars, buttons, date pickers, switches, dropdowns, and skeleton loaders.
- [visits](./visits/README.md): Cards and dialog components detailing pastoral visits, prayer burdens, and unreached contacts.

## Invariants
- [AuthProvider.tsx] throw new Error(
- [AuthProvider.tsx] throw new Error('Sign-in was cancelled. Try again when you\'re ready.');
- [AuthProvider.tsx] if (!pendingMfa) throw new Error('No pending multi-factor sign-in.');
- [AuthProvider.tsx] if (!context) throw new Error('useAuth must be used within AuthProvider');
- [FeedbackFAB.tsx] throw new Error(`Server returned ${response.status} ${response.statusText}`);
- [NavShellProvider.tsx] const RAIL_FITS_MIN_WIDTH = 1280; // Tailwind `xl` — below this, the rail (232px) won't fit
- [NavShellProvider.tsx] const canFitRail = useMediaQuery(`(min-width: ${RAIL_FITS_MIN_WIDTH}px)`);
- [NavShellProvider.tsx] throw new Error('useNavShell must be used within a NavShellProvider');

## Side Effects
- [AuthProvider.tsx] const saved = localStorage.getItem(STORAGE_KEY_OWNER_VIEW);
- [AuthProvider.tsx] localStorage.setItem(STORAGE_KEY_OWNER_VIEW, nextRole);
- [AuthProvider.tsx] localStorage.removeItem(STORAGE_KEY_OWNER_VIEW);
- [AuthProvider.tsx] localStorage.removeItem(STORAGE_KEY_OWNER_VIEW);
- [AuthProvider.tsx] const userDoc = await getDoc(userDocRef);
- [AuthProvider.tsx] const inviteDoc = await getDoc(inviteRef);
- [AuthProvider.tsx] await setDoc(userDocRef, initialData);
- [AuthProvider.tsx] await deleteDoc(inviteRef);

## Verification
- Run: `npm test`
