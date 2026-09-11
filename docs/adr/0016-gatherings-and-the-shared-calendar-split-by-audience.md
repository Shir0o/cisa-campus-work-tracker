# 0016: Gatherings and the shared calendar split by audience, and the gathering kind is retired

## Status
Accepted

## Context

Two questions came up together while rethinking the Gatherings page ([#957](https://github.com/Shir0o/cisa-campus-work-tracker/issues/957)), and they turned out to have one answer.

**Where does the schedule live?** The shared calendar (`src/lib/calendar/`) has been synced into this app one-way for some time. It carries a real recurrence engine — RRULE with `freq`, `interval`, `byday`, `until`, `count` and `exdates` — expands series into instances with a stable series id, and its own header states the boundary plainly: the calendar owns *when and where*, this app owns *who was there*. Meanwhile the Gatherings page was about to grow its own recurrence: a stored cadence, an extend-the-term action, a cancelled-week state and a series identity. Two recurrence engines, one of them weaker, reading from the same page.

The obvious conclusion was to let the calendar own the schedule. It was wrong, and the reason is the audience rather than the data. The calendar's readers are the team and the wider community — it exists to tell people what is on. Attendance is taken *of* students and contacts, who are not the calendar's audience and never see it. The two systems hold sets that barely intersect: a Gathering needing attendance does not need announcing, and an announced event is not something anyone takes a register for.

Sitting on top of that, the sync already classified some calendar events *as* Gatherings. A category-to-kind map decided which ones, seeded so that `social` and `workshop` events rendered as gatherings on the attendance page. That map lived in `localStorage` — per browser, so two Full-timers could disagree about what the team's gatherings were — and the value it mapped to was the gathering kind.

**Is the kind worth keeping?** Every Gathering carried a `type` drawn from a managed `gatheringTypes` collection with a Settings section and an editing modal. Against three Rhythms on two weekdays, the filter pills narrowed three rows to three rows. The subtitle it produced read "Weekly" under "Wednesday Bible Study". The warm one-line blurb attached to each kind was rendered by nothing — called only by its own tests, and mocked out in two of them. The seeded defaults described a Friday fellowship the team does not run, and because Gatherings referenced a kind by name, renaming one rewrote every Gathering carrying the old string.

## Decision

1. **The split is by audience, not by data.** This app tracks everything that needs attendance taken. The shared calendar tracks everything other people need to see. A record belongs to whichever question it answers, and neither system is the other's source of truth.

2. **A calendar event is never a Gathering.** The gathering branch of the sync is deleted: the category-to-kind map, its `localStorage` store, the gathering item type, and the merge that blended calendar events into the page's Gathering lists. The calendar continues to contribute context items and away/OOO, which is what the "Also on the calendar" section already exists for, gated as before.

3. **A Rhythm is a record in this app**, owning its name, cadence, location and roster, and generating its own occurrences. The recurrence the calendar carries is not borrowed, because the things it schedules are not the things attendance is taken for.

4. **The gathering kind is retired entirely** — the `type` field, the `gatheringTypes` collection, its Settings section, its editing modal and the filter pills. A Rhythm's name and cadence say what it is. Existing Gatherings keep whatever string they carry until it is dropped; nothing reads it.

5. **Publishing to the calendar stays possible and unbuilt.** Because this app owns cadence, location and roster, pushing occurrences out to the shared calendar later is a write rather than a reconciliation. Nothing in this decision assumes it will happen.

## Consequences

- The app keeps a recurrence implementation that duplicates capability the shared calendar already has. This is accepted deliberately: the duplication is in mechanism, not in purpose, and binding Gathering identity to an external system would make a week's identity change when someone upstream moves a date.
- A team that *does* want a gathering announced must put it in both places. That is a real cost, and the reason consequence above is worth revisiting if it starts to bite — the publish direction in decision 5 is the escape hatch.
- Deleting the kind removes the only filter on the page. With three Rhythms this is a simplification; a team running twenty would need something else, and that something should be built when the twenty exist rather than in anticipation.
- The `localStorage` category map disappears, taking with it a class of bug where two Full-timers saw different pages from the same data.
- `#776`'s story 28 — "the existing kind filters keep working over the new grouping" — is explicitly reversed. It was written to protect a feature that this ADR judges not worth protecting.
- ADR 0011 rejected binding a Bible Study Entry point to a Rhythm partly because a Rhythm was derived rather than stored. Decision 3 makes that premise false. The decision in 0011 stands for independent reasons and is annotated rather than reopened.

## Alternatives considered

**The calendar owns the schedule; the app attaches attendance to its instances.** Rejected on the audience argument above, and on durability: an instance id is composed from the series id and the date, so a week that moves gets a new identity and orphans its attendance. Pinning to series-id-plus-date instead would work, but the whole arrangement hands the schedule to a tool with no notion of a roster.

**Keep the category map, move it to Firestore.** Fixes the per-browser divergence without answering whether calendar events should be Gatherings at all. Once the audience line is drawn, the map has nothing left to decide.

**Keep the kind, fix its defaults and render the blurbs.** Rejected: a taxonomy earns its place by collapsing many things into few. Three Rhythms against four categories is the inverse.

**Keep the kind as free text without the managed collection.** A smaller version of the same problem — it preserves a field nothing reads in order to avoid deleting it.
