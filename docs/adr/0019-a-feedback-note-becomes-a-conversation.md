# 0019: A Feedback Note becomes a conversation, and its thread mirrors the issue

## Status

Accepted (supersedes decisions 2 and 7 of [0017](0017-feedback-outcomes-are-canned-and-ride-the-issue-close.md))

## Context

[0017](0017-feedback-outcomes-are-canned-and-ride-the-issue-close.md) decision 6 gave the submitter a place and a ping: a list of their own Notes on `/feedback`, which is "already `viewer` and therefore already reachable by everyone who can submit". The list was built. It has never worked for a single person it was built for.

Two things made it a blank page rather than a list. `firestore.rules` allowed `list, get` on `feedback` only `if isAdmin()`, so a viewer, operator or manager querying `where userId == uid` got `permission-denied`; and no composite index on `(userId, createdAt)` was ever declared, so the same query would have failed `failed-precondition` anyway. Both errors landed in a `console.error` whose only other effect was to leave `pastNotes` empty, and the section was gated on `pastNotes.length > 0` — so it rendered nothing at all. Meanwhile the webhook faithfully pushed "What came of your note" notifications linking to `/feedback`, where every non-Full-timer found a composer and no notes. `src/test/firestore.rules.test.ts` had no feedback cases, so nothing was going to catch it.

Repairing that is not controversial. What reopened the decision is that the loop was also asked to carry questions in both directions — the submitter asking about their own Note, and the team asking them something.

0017 had closed that deliberately. Decision 7 sent clarification out of band, "in person, by text, or in `/messages` — which already accepts a `ChatAttachment` of `type: 'feedback'`", and the alternatives section rejected letting a Note become a conversation. But `/messages`'s feedback attachment tab is `adminOnly`, so that path only ever ran downward: a Full-timer can attach a Note and message its author, and the author has no way to attach their own. `/questions` cannot help either — the `asks` rules require `isManager()` to create, and the rule's own comment says other roles "can never create", while feedback is open to every approved user. The `already-there` canned sentence ends "Ask someone on the team and we'll show you where it lives", which is a call to action with no button behind it.

The other thing that changed is the cost of writing to a submitter. 0017 decision 2 fixed the words forever because "anything richer costs a keystroke", and rejected drawing copy from What's New because nothing links an issue to a release. But the maintainer's normal workflow is a pull request that closes the issue, and a PR *is* linked to its issue by the close itself. A model can read that PR. The keystroke that made rich copy unaffordable is gone.

Looking at the repository settled the shape of the risk. Issue #977 — closed by a PR, the common case — has zero issue comments: a PR saying "Closes #977" produces a cross-reference on the timeline, never an `issue_comment`, so a comment mirror alone would have had nothing to relay at the moment that matters most. And every comment on #946 and #906 is authored by `Shir0o` with `authorAssociation: OWNER`, because the triage agent posts under the maintainer's own account — so a `user.type === 'Bot'` filter would have filtered nothing, and what would have reached a Community user is #946's 1,969-character `## Agent Brief **Category:** bug`, and #906's `Superseded by #917`.

## Decision

1. **A submitter reads their own Notes.** `feedback` `get`/`list` becomes `isAdmin() || (isApprovedUser() && isOwner(resource.data.userId))`, with the `(userId, createdAt)` index declared. `list` is evaluated per candidate document, so a query filtered to the caller succeeds and an unfiltered one is refused. `status` and `githubIssueUrl` consequently reach the author's client; 0017 decision 1's split between the team's vocabulary and the submitter's survives as a rule about what is *rendered*, not about what is readable. Eleven rules cases now cover this, including the unfiltered list.

2. **`/feedback` stops being a composer and becomes Your notes.** The note button is the only way to submit. The page is where a Note comes back to you: what came of it, and its Follow-ups.

3. **A Note carries Follow-ups, in both directions.** This reverses 0017 decision 7. "Follow-up" is the name, because *thread*, *message*, *question* and *ask* each already name something else here.

4. **Firestore is the store; GitHub is the mirror.** Follow-ups live in `feedback/{id}/replies` and are written only by the server, so that no Follow-up can exist without mirroring and no relayed comment can arrive unlaundered. Clients read; they never write. A Note with no linked issue still has a working thread — it simply has not mirrored, and starts to if a Full-timer links an issue later.

5. **Everything coming down is laundered by a model.** This reverses 0017 decision 2: words reaching a submitter are no longer fixed. A comment carrying the triage marker is dropped before a model sees it — a pure, tested predicate, not a model judgement — and the rest is restated in at most two sentences with issue references, code and error text forbidden. A comment the model finds to be internal bookkeeping is dropped. Dropping is always safe, because of decision 7.

6. **Going up, a submitter is not named.** A Follow-up posted to the issue reads "Reporter replied:" and carries no name or email; the issue already has its `reporter:<first>-<last-initial>` label from [0018](0018-feedback-reporter-attribution.md). The reply box says plainly that replies are posted to a public issue tracker, because someone typing into what looks like a private app has no way to know that.

7. **The close message is written from the closing PR, and the canned sentence is the floor.** On a `shipped` close the server resolves the merged PR from the issue timeline and writes one or two sentences from its title and body. No linked PR, no usable description, a timeout, or any failure falls back to the canned sentence. 0017's best property — a thin message that always arrives — is preserved as the fallback rather than the ceiling.

8. **A Follow-up never changes `status` or `outcome`.** One from a submitter sets `awaitingReply`, which shows in `/admin/feedback` and notifies the Full-timers with the author excluded, following [0007](0007-thread-mentions-and-stakeholder-notifications.md). Making a reply reopen the issue was rejected outright: the `reopened` branch deletes `outcome`, so a reply would have retracted the answer the submitter had just read.

9. **`notifiedOutcome` survives the reopen clear.** A re-close pings only when the outcome differs from what the submitter was last told, so bookkeeping churn is silent and a genuinely changed answer still arrives.

10. **The owner reads the loop raw.** A relayed comment on the owner's own Note is stored raw, with the restatement beside it, and the close message shows the canned line. Switching into the existing owner view renders exactly what a submitter sees. The owner is resolved by looking up `users/{uid}.email`, since 0018 stopped storing email on new Notes.

11. **The model stays `gemini-3.5-flash`.** Restating a comment in two sentences is the easiest thing asked of a model in this codebase, and `server.test.ts` mocks `generateContent` wholesale, so a model change would pass CI green with no signal. Moving all six call sites to 3.8 Flash belongs in its own change, together with a translation-cache flush — `sha256(lang:text)` carries no model component, so a migration would otherwise leave the Spanish corpus permanently split between two models.

## Consequences

- **The `issue_comment` event must be enabled on the repository webhook.** Without it the thread is one-way: Follow-ups still reach the issue, and nothing said on the issue reaches the submitter. This is a repository setting, outside the code, and the feature is half-inert until it is set.
- **A submitter's words become public.** Their Follow-ups are posted to a public issue tracker. The notice in the reply box is the whole mitigation; the alternative was an app-only thread, which was rejected in favour of the maintainer being able to answer from where they already work.
- **The laundering is safety-critical and only partly verifiable.** The triage-marker drop is a pure function with tests over the real #946 and #906 bodies. The model's own obedience is not tested, because `generateContent` is mocked in every server test — a bad restatement would ship green. The prompts are asserted for their prohibitions, which is a check on the instruction, not on the output.
- **A comment that says something real can still be dropped**, if the model judges it bookkeeping. That is the deliberate direction to fail in.
- **The relay costs one model call per relayed comment and one per shipped close.** At this volume that is cents a month; the sites that would feel a model change are translation and smart-import, not this one.
- Legacy `screenshot` and `userEmail` values on older Notes are now readable by their own authors, which they were not before. They are the author's own data; no new party gains access.
- `navTrail` calls `/feedback` "Your notes" rather than "Send feedback", and the page's visual design is deliberately left plain for a separate design pass.

## Alternatives considered

**Mirror a projection instead of opening the collection.** Have the webhook write outcomes into a per-user surface and leave `feedback` admin-only. A real boundary rather than a rendered one, but it duplicates the truth, has to replay the reopen clear, and can drift. The Note is the submitter's own words about themselves; there is no third party in it.

**Keep the thread app-only.** Satisfies 0017's safety objection completely and keeps submitter prose off a public repository. Rejected because the maintainer would then have to be in `/admin/feedback` to answer, when they are almost always in the tracker.

**Relay human comments raw and drop only bot comments.** One field check. Rejected on evidence: on this repository every comment is authored by a human OWNER account, so the filter is a no-op, and the majority of comments are internal shorthand naming issue numbers a submitter cannot open.

**Relay nothing downward and rely on the close summary alone.** The cheapest safe option, and it covers the moment that matters. Rejected because it leaves a mid-flight question from a submitter unanswerable, which is the gap that reopened this decision.

**Auto-create an issue on the first Follow-up** so every threaded Note can mirror. Rejected: it turns a person's question into a public issue they did not ask for, and it fails outright when `GITHUB_TOKEN` is unset.

**Widen `asks` so `/questions` could carry Follow-ups.** Rejected: `/questions` is defined as Trainees asking Full-timers something that is not about one person, and widening its create rule would change what that destination means for every role.

**Let a reply reopen the issue.** Natural-looking, and wrong: the `reopened` branch deletes `outcome`, so the submitter's answer would vanish from their own card the moment they asked about it.
