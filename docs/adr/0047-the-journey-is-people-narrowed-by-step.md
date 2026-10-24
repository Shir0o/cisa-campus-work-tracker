# 0047: The Journey is People narrowed by Step

## Status
Accepted

## Context

A teammate looking at the phone app suggested combining The Journey and People, because The Journey "is just the contact list, grouped." The written model said otherwise: **Local saints** left The Journey (ADR 0030, amended by #1349), so the two screens held different people. The code had never enforced that. The phone Journey placed every contact a person can see on a **Step**, with an "Unassigned" tab for the rest, so in practice the suggestion was already true.

The pain was navigation. A Trainee's ☰ drawer listed People and The Journey as neighbouring rows that both read as "my people"; a Full-timer had People as a tab and The Journey buried in More.

## Decision

1. **Everyone stands on a Step**, Local saints and **Our own** included. Someone on no Step yet is unplaced, not off The Journey. **The Day's Goal** is unchanged: it counts outreach and still leaves Local saints out.
2. **In the phone app, The Journey is not a screen.** People is the one door, for Trainees and Full-timers alike. Under its search sits a row of Step pills, *Everyone* first, then *Not on a step* (only while someone is unplaced), then each Step. *Everyone* is the old People; any other pill is the old Journey.
3. People always opens on *Everyone*. A remembered filter would quietly hide people and make the Directory look incomplete.
4. "Move a step" appears only while a Step pill is selected; *Everyone* rows stay compact.
5. Search narrows within the selected pill, and each pill's count becomes its number of matches, so a match on another Step is one tap away.
6. Every pill keeps People's order: *In your care* first, longest since you talked, then everyone else alphabetically.
7. Below Trainee, People shows *Everyone* with no pills and no Move, matching who may see The Journey.
8. The web app is not decided here; `/directory` and `/board` stay separate routes until it is.

## Considered options

Six were drawn on a canvas: two doors as today; one door with an *Everyone / By step* switch; two doors cross-linked, rows showing their Step; one list grouped into Step sections; Step pills as a filter (chosen); and The Journey behind a button in the People header. The switch added a control to learn for no gain over the pills. Cross-linking left both drawer rows in place. Grouped sections lost *In your care* at the top and grow into a long scroll. A header button kept The Journey as a sub-page and still meant two screens.

## Consequences

The Journey survives as a concept and as the Steps, but loses its phone screen and its rows in the Trainee drawer and the Full-timer's More. Anything that linked to it — the Full-timer home's *Needs you today* card — must point somewhere else.

**Amended 2026-10-24 by [#1787](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1787):** decision 2 was only half built. [#1799](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1799) deleted the Trainee's phone Journey and made People the one door, with its search and the Step pills beneath it, but the Full-timer's `/board` still drew a screen of its own at phone width — the last place The Journey survived as a phone screen, and the only one with no search. The phone `/board` is removed too: at phone width the route now lands on People, so "find a person across steps" is answered by the search there, and in the phone app by the Step pills, rather than by a field added to a board. `/board` stays a desktop surface, separate from `/directory`, until the web-app question in decision 8 is settled.
