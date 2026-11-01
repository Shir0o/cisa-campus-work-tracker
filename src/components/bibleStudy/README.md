# Bible Study Components (`src/components/bibleStudy`)

## Overview
Interactive Bible study reading, section rendering, and presenter reader components.

## Interface
- `SectionBodyProps` (`SectionBody.tsx`)
- `StudyEmptyStateProps` (`StudyEmptyState.tsx`)
- `StudyReaderViewProps` (`StudyReaderView.tsx`)
- `ReaderTypeSize` (`StudyReaderView.tsx`)
- `useDocumentTitle` (`useDocumentTitle.ts`)
- `ResolvedStudy` (`useResolvedStudy.ts`)
- `STUDY_LOAD_DEADLINE_MS` (`useResolvedStudy.ts`)
- `useResolvedStudy` (`useResolvedStudy.ts`)

## Invariants
- [StudyReaderView.tsx] const PAGED_MIN_WIDTH = 768;
- [StudyReaderView.tsx] const PAGED_MIN_HEIGHT = 600;
- [StudyReaderView.tsx] setPaged(width >= PAGED_MIN_WIDTH && height >= PAGED_MIN_HEIGHT);

## Side Effects
- [StudyReaderView.tsx] const raw = window.localStorage.getItem(READER_TYPE_STORAGE_KEY);
- [StudyReaderView.tsx] window.localStorage.setItem(READER_TYPE_STORAGE_KEY, String(size));

## Verification
- Run: `npm test`
