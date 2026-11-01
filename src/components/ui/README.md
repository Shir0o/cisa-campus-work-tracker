# Base UI Design Primitives (`src/components/ui`)

## Overview
Atomic design system components including avatars, buttons, date pickers, switches, dropdowns, and skeleton loaders.

## Interface
- `ContactPillProps` (`ContactPill.tsx`)
- `ContactPill` (`ContactPill.tsx`)
- `DataLoadError` (`DataLoadError.tsx`)
- `DatePicker` (`DatePicker.tsx`)
- `GatheringMemberChip` (`GatheringMemberChip.tsx`)
- `KindChip` (`KindChip.tsx`)
- `KindFields` (`KindFields.tsx`)
- `avatarTint` (`PopupFrame.tsx`)
- `PopupSection` (`PopupFrame.tsx`)
- `PopupField` (`PopupFrame.tsx`)
- `PersonPill` (`PopupFrame.tsx`)
- `PopupFrameProps` (`PopupFrame.tsx`)
- `PopupFrame` (`PopupFrame.tsx`)
- `RowActionItem` (`RowActions.tsx`)
- `RowActions` (`RowActions.tsx`)

## Invariants
- Code within this directory adheres to strict TypeScript typing and project ESLint rules.

## Side Effects
- [ContactPill.tsx] const unsub = onSnapshot(
- [ContactPill.tsx] const unsub = onSnapshot(
- [ContactPill.tsx] const unsub = onSnapshot(
- [ContactPill.tsx] const snap: any = await getDoc(doc(db, 'contacts', contactId));

## Verification
- Run: `npm test`
