# Activity Stream & Unified Thread (`src/components/stream`)

## Overview
Unified activity stream components, timeline composers, and message thread adapters.

## Interface
- `StreamProps` (`Stream.tsx`)
- `Avatar` (`Stream.tsx`)
- `ThreadChip` (`Stream.tsx`)
- `Stream` (`Stream.tsx`)
- `StreamComposer` (`StreamComposer.tsx`)
- `ChatStreamMessage` (`chatAdapter.ts`)
- `toStreamMessage` (`chatAdapter.ts`)
- `chatReadMark` (`chatAdapter.ts`)
- `announcementReadMark` (`chatAdapter.ts`)
- `chatAudienceNote` (`chatAdapter.ts`)
- `chatRoomSubtitle` (`chatAdapter.ts`)
- `ChatAdapterInput` (`chatAdapter.ts`)
- `ChatStreamAdapter` (`chatAdapter.ts`)
- `chatAdapter` (`chatAdapter.ts`)
- `ContactWriteContext` (`contactWriter.ts`)

## Invariants
- [chatAdapter.ts] if (!(await send(body, i.staged, null))) throw new Error("send failed");
- [followUpAdapter.ts] const MAX_BODY = 5000;
- [followUpAdapter.ts] if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);
- [followUpAdapter.ts] maxLength: MAX_BODY,

## Side Effects
- [Stream.tsx] const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
- [Stream.tsx] void navigator.clipboard.writeText(m.body);
- [followUpAdapter.ts] const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(payload) });

## Verification
- Run: `npm test`
