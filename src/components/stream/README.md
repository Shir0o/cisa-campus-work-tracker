# Activity Stream & Unified Thread (`src/components/stream`)

## Overview
Unified activity stream components, timeline composers, and message thread adapters.

## Interface
- `StreamProps` (`Stream.tsx`)
- `Avatar` (`Stream.tsx`)
- `ThreadChip` (`Stream.tsx`)
- `Stream` (`Stream.tsx`)
- `StreamComposer` (`StreamComposer.tsx`)
- `ContactWriteContext` (`contactWriter.ts`)

## Invariants
## Side Effects
- [Stream.tsx] const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
- [Stream.tsx] void navigator.clipboard.writeText(m.body);

## Verification
- Run: `npm test`
