# External Service Integrations (`src/services`)

## Overview
Client services integrating with external platforms including Google Sheets API and realtime chat providers.

## Interface
- `getDirectChatId` (`chat.ts`)
- `getOrCreateDirectChat` (`chat.ts`)
- `createGroupChat` (`chat.ts`)
- `createAnnouncementRoom` (`chat.ts`)
- `sendMessage` (`chat.ts`)
- `acknowledgeAnnouncement` (`chat.ts`)
- `markAnnouncementRead` (`chat.ts`)
- `inviteToGroup` (`chat.ts`)
- `leaveGroup` (`chat.ts`)
- `togglePinMessage` (`chat.ts`)
- `removeMessageForEveryone` (`chat.ts`)
- `deleteChatRoom` (`chat.ts`)
- `canRemoveConvForEveryone` (`chat.ts`)
- `convTopLevel` (`chat.ts`)
- `convReplies` (`chat.ts`)

## Invariants
- [sheetsService.ts] throw new Error(error.error?.message || 'Failed to fetch sheet data');

## Side Effects
- [chat.ts] const roomDoc = await getDoc(roomRef);
- [chat.ts] await setDoc(roomRef, {
- [chat.ts] const roomRef = await addDoc(collection(db, 'chatRooms'), {
- [chat.ts] await addDoc(collection(db, 'chatRooms', roomRef.id, 'messages'), {
- [chat.ts] void sendNotification({
- [chat.ts] const roomRef = await addDoc(collection(db, 'chatRooms'), roomData);
- [chat.ts] await addDoc(collection(db, 'chatRooms', roomRef.id, 'messages'), {
- [chat.ts] await addDoc(collection(db, 'chatRooms', roomRef.id, 'messages'), {

## Verification
- Run: `npm test`
