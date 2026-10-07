# 0040: A Home made by mistake can be removed, and one entered twice combined

## Status
Accepted — amends ADR 0031 §1

## Context

ADR 0031 made Homes permanent: a Home "goes inactive when the last person leaves rather than being deleted, so visits logged against it keep their meaning", and the rules say `allow delete: if false`. That reasoning is about a household that moves on. It says nothing about a Home that was never a household — a suggestion accepted by mistake, or the same family entered twice — and those are what actually pile up, because every Home starts life as a proposal someone confirmed.

## Decision

1. **A Home no visit was logged against can be deleted.** "Logged against" means a visit whose `homeId` is this Home. A Home built from co-visit history counts as unvisited, because those visits predate it and point nowhere. Deleting one therefore orphans nothing. Delete is immediate, with Undo.
2. **A Home entered twice is combined, not deleted.** The kept Home keeps its label and place, backfilling either from the combined-in Home only where it is empty (as Combine contacts does), takes the union of members, keeps both notes, and every visit whose `homeId` is the combined-in Home is repointed to it; the combined-in Home is then deleted, now orphaning nothing. Combining is confirmed against a preview, because it rewrites visits.
3. **A household that moves still goes inactive.** §1 of ADR 0031 stands for real households.

## Consequences

The "never visited" test cannot be expressed in Firestore rules (no queries), so it lives in the client. The rule becomes `allow delete: if isApprovedUser() && isAdmin()`: a Full-timer with a raw client could delete a visited Home, leaving visits with a dangling `homeId`. That is accepted because nothing reads `homeId` back today; if something starts to, this check has to move server-side first.
