# Server Engines & Pipeline Services (`src/server`)

## Overview
Node.js server-side business engines for contact deduplication, tag combination, feedback synchronization, and test account purging.

## Interface
- `ContactEngineError` (`contactEngine.ts`)
- `MAX_TRANSACTION_WRITES` (`contactEngine.ts`)
- `COMBINE_CLAIM_TTL_MS` (`contactEngine.ts`)
- `BATCH_LIMIT` (`contactEngine.ts`)
- `ContactCombineEngineOptions` (`contactEngine.ts`)
- `ExpectedTimestamps` (`contactEngine.ts`)
- `PreviewCombineParams` (`contactEngine.ts`)
- `PreviewCombineResult` (`contactEngine.ts`)
- `ExecuteCombineParams` (`contactEngine.ts`)
- `ExecuteCombineResult` (`contactEngine.ts`)
- `PreviewUndoParams` (`contactEngine.ts`)
- `PreviewUndoResult` (`contactEngine.ts`)
- `ExecuteUndoParams` (`contactEngine.ts`)
- `ExecuteUndoResult` (`contactEngine.ts`)
- `ContactCombineRecord` (`contactEngine.ts`)

## Invariants
- [contactEngine.ts] export const MAX_TRANSACTION_WRITES = 500;
- [contactEngine.ts] export const BATCH_LIMIT = 400;
- [contactEngine.ts] export async function commitInBatches(db: any, ops: CombineWriteOp[], limit: number = BATCH_LIMIT) {
- [contactEngine.ts] throw new Error('ContactCombineEngine requires a Firestore db instance');
- [contactEngine.ts] throw new ContactEngineError(
- [contactEngine.ts] throw new ContactEngineError(400, 'keptId and combinedInId are required');
- [contactEngine.ts] throw new ContactEngineError(400, 'keptId and combinedInId must differ');
- [contactEngine.ts] throw new ContactEngineError(404, 'One or both contacts were not found');

## Side Effects
- [feedbackPipeline.ts] return fetch(`https://api.github.com/${path}${search}`, init);
- [feedbackPipeline.ts] const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {

## Verification
- Run: `npm test`
