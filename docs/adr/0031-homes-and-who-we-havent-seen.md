# 0031: Homes are households that outlive their address, and Visits gains a second reading

## Status
Accepted

## Context

Visitation was tracked outside the app, in a spreadsheet: homes down column A, visit dates across row 1. `/visits` could not replace it. The page is a reverse-chronological log, and its one prompting surface — the "we haven't been round in a while" strip — excludes never-visited people deliberately: *"this strip is about letting a relationship lapse, not about working through everyone we've never seen"*. A home never visited could therefore appear nowhere.

Nothing in the model held a household. A visit carries `contactIds[]` and a free-text `where`, prefilled from `Contact.location` — a field the contact form stopped capturing some time ago, leaving an open TODO proposing a `visitAddress` on the Visit instead.

Five mockups of the new reading were built and compared on realistic data (37 people, 14 homes, a year of visits) rather than argued about.

## Decision

1. **Home is an entity: a household, not an address.** `{ label, members, … }`, labelled usually by the family's surname but free text, since a house sharing no one surname needs a name only the team would think of. It survives a move with its history, and goes **inactive** when the last person leaves rather than being deleted, so visits logged against it keep their meaning. This closes the `visitAddress` TODO: a visit's place comes from its Home.

2. **The reading is per person, not per home.** Going round does not mean you saw everyone — someone may be out of town. Rows are Homes, but each member carries their own time-since-seen. This is the single most consequential choice here and the most expensive to reverse.

3. **It runs continuously.** No term, no calendar year, no reset — paired with last-visited-ever so a faithful December does not read as a wall of gaps in January. A period was tried in both forms and discarded: a term makes the boundary arbitrary, a calendar year makes the page wrong every January.

4. **No cadence and no ranking.** No target interval, and the order is **always alphabetical** — homes by label, members by first name — with no sort control and no filters. A stable list is the point: gaps must be legible by visual weight, never by reordering or hiding. This is a real constraint on the design, not a default.

5. **Homes are suggested, never derived.** Co-visit history is the primary signal, because **a visit is to one house**: it may name several people, but never people from two households. Every logged visit naming two or more people is therefore direct evidence of a household, and the existing visit log carries most of the backfill already. Surname clustering covers the rest. Every suggestion is confirmed and editable before it saves — a wrong home is harder to notice than a missing one.

6. **One visit, one house stays a convention, not a rule.** Nothing at log time stops a visit naming two households. The signal only has to be good enough to *propose* a home, never to decide one, and a confirmation step already catches a bad proposal — whereas a picker that restricted the people you may tick would fight you on the rare evening you see two families. Occasional mixed visits are tolerated as noise.

7. **The overdue strip is retired** when this ships. Two lists ranking people by time-since-seen, one capped at four and excluding never-visited, is how people learn to trust neither.

8. **It is a second reading of `/visits`, behind a toggle**, opening on this reading and not remembering which was last used. Full-timers only, as the route already is; `homes` gets its own rules block, which spends none of the contacts ruleset's expression budget.

## Consequences

`Contact.location` stops being read once a visit's place comes from its Home, making `placeFor`'s fallback dead code. The field itself is left in place, to be removed alongside `role` (ADR 0030) in one cleanup.

Because being in a Home is what puts a person in this reading, someone who should not appear there simply has no Home — there is no per-person mute to maintain.

A person away for a season reads as a gap for as long as they are away; "away" is deliberately not modelled, on the grounds that a status nobody clears is worse than no status.
