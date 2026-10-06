# 0036. Hybrid tag clustering and rule-level confirmation for Combine tags

Date: 2026-10-05

## Status

Accepted. Fixed anchor list superseded by ADR 0039.

## Context

Prior to this decision, `Combine tags` (`planTagCombining` in `packages/core/src/tags.ts` and `src/lib/tags.ts`) relied on static regular expressions targeting specific format anomalies: season tag formats (e.g. `Fall '26`, `Fall2025` → `Fall 2026`) and club rush spellings (e.g. `club-rush` → `Club Rush`).

In practice, field workers enter variations of outreach and cohort tags that a static list cannot anticipate—such as table context suffixes (`BFA table`, `bfa-table`, `Club rush table`), punctuation differences, and small typos (`intersted`, `baptise`). Merging them required either constantly hardcoding new regex rules or manually editing individual contact records.

However, completely unsupervised tag rewriting risks false positives (unintentionally merging distinct ministry cohorts or user tags).

## Decision

1. **Hybrid Clustering Model**:
   - **Anchors**: Known canonical suggestions (`TAG_SUGGESTIONS`: `Saved`, `Baptized`, `Interested`, `Open`, `Club Rush`, `BFA`) and dynamic season patterns (`Spring/Summer/Fall/Winter YYYY`) serve as high-priority anchor targets.
   - **Context Suffix & Token Reduction**: Tags containing anchor terms along with context nouns/qualifiers (e.g. `table`, `booth`, `tent`, `day 1`) automatically normalize toward the anchor (e.g. `BFA table` → `BFA`).
   - **Corpus Frequency & Fuzzy Typo Detection**: For tag clusters across the contact directory, near-duplicates (normalized punctuation, lowercase token sets, small Levenshtein edit distance <= 1 on words > 4 chars) are grouped together. The target is resolved to the anchor if present, or to the highest-frequency representation across the directory, breaking ties with clean Title Case.
2. **Scope Boundaries**:
   - Single-contact live writes and sign-up forms continue to use conservative normalization (`normalizeTag`) to avoid accidental mutations during field data entry.
   - Dynamic directory-wide clustering runs in the `Combine tags` modal dry-run.
3. **Rule-Level User Confirmation**:
   - The `CombineTagsModal` groups proposed changes by rule/mapping (e.g. `[BFA table, bfa-table] → BFA`), providing individual toggles. Users can inspect affected contacts and exclude any specific cluster before committing batched updates to Firestore.

## Consequences

- Contacts tagged with table-specific variants (`BFA table`, etc.) can be consolidated into canonical tags in one click.
- No need to hand-code every variation in static regex tables going forward.
- Retains user sovereignty and prevents data corruption through dry-run rule toggles.
- Parity is maintained between `packages/core/src/tags.ts` and `src/lib/tags.ts`.
- Unchecked weak guesses reappear, still unchecked, on every visit. A remembered "Not the same tag" (mirroring **Not the same person**, ADR 0038) is deferred until weak guesses prove noisy.
