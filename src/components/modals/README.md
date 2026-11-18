# Application Dialogs & Modal Sheets (`src/components/modals`)

## Overview
Popups, sliding action drawers, and modal sheets for contact creation, interaction logging, event scheduling, and attendee management.

## Interface
- `AddEventModal` (`AddEventModal.tsx`)
- `AttachDataModal` (`AttachDataModal.tsx`)
- `AttendanceSyncModalProps` (`AttendanceSyncModal.tsx`)
- `AttendanceSyncModal` (`AttendanceSyncModal.tsx`)
- `ChatDetailsModal` (`ChatDetailsModal.tsx`)
- `ContactDetailsModal` (`ContactDetailsModal.tsx`)
- `CreateChatModal` (`CreateChatModal.tsx`)
- `CreateRhythmModal` (`CreateRhythmModal.tsx`)
- `EditEventModal` (`EditEventModal.tsx`)
- `LogInteractionModal` (`LogInteractionModal.tsx`)
- `MovingUpAYearModal` (`MovingUpAYearModal.tsx`)
- `NewContactModal` (`NewContactModal.tsx`)
- `PickHeldModal` (`PickHeldModal.tsx`)

## Invariants
- [SmartImportModal.tsx] throw new Error(errorMsg);
- [SmartImportModal.tsx] throw new Error(resData.error || t('modals.smartImport.parse_failed'));
- [SmartImportModal.tsx] throw new Error(errorMsg);
- [SmartImportModal.tsx] throw new Error(resData.error || t('modals.smartImport.failed_to_save'));

## Side Effects
- [AddEventModal.tsx] await addDoc(collection(db, 'events'), {
- [AttachDataModal.tsx] unsubscribe = onSnapshot(q, (snap) => {
- [AttachDataModal.tsx] unsubscribe = onSnapshot(q, (snap) => {
- [AttachDataModal.tsx] unsubscribe = onSnapshot(q, (snap) => {
- [AttachDataModal.tsx] unsubscribe = onSnapshot(q, (snap) => {
- [AttachDataModal.tsx] unsubscribe = onSnapshot(q, (snap) => {
- [AttachDataModal.tsx] unsubscribe = onSnapshot(q, (snap) => {
- [AttachDataModal.tsx] unsubscribe = onSnapshot(q, (snap) => {

## Verification
- Run: `npm test`
