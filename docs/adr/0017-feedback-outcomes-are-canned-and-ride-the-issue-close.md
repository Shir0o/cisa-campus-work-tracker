# 0017: A Feedback Note's outcome is canned, rides the issue close, and no human ever writes to a submitter

## Status
Accepted

## Context

A user asked whether the app has a statistics page ([#961](https://github.com/Shir0o/cisa-campus-work-tracker/issues/961)). The answer is interesting on its own, but the question exposed something structural: nothing would ever tell him.

The feedback loop is half-built. A Feedback Note is written to Firestore and an issue is opened from it (`server.ts`'s `POST /api/feedback`). A Full-timer can move its status or archive it at `/admin/feedback`. When the issue closes, a webhook writes `status: 'resolved'` back onto the Note, and a close as `not_planned` additionally sets `archived: true`. Every arrow in that loop points inward. `SubmitFeedback.tsx` touches `userId` exactly once, to write it — there is no view of your own Notes, no notification, and no email. The submitter's state changes in a database and no human is told.

There is also no way to ask a submitter a question. The conversation happens on an issue the submitter is not on, and his identity there is a plaintext email address on a public repository.

Three things are wanted at once and cannot all be maximised: a response the user finds meaningful, no new authoring load on the maintainer, and assurance the user actually trusts. A fully automatic message can only ever say "the issue behind your Note was closed". Anything richer costs a keystroke, and the question is only where that keystroke goes.

Two of the three outcomes turn out to be free. GitHub's `state_reason` already distinguishes `completed` from `not_planned`, the Note already carries `githubIssueUrl`, and the webhook already fires. Only "we already have that — here it is" — which is precisely what #961 wanted — has no signal in a close event.

## Decision

1. **Outcome is a field of its own, beside `status`.** `status` (`new` / `in_progress` / `resolved`) answers *where is this in our pipeline* and belongs to the team. **Outcome** (`shipped` / `not-planned` / `already-there`) answers *what became of my Note* and belongs to the submitter. They are set at different moments by different concerns, and collapsing them would make every future pipeline state a thing that must be explained to a user.

2. **The words are canned, per outcome, forever.** Three fixed sentences. Nobody writes prose to a submitter, ever, and there is no reply box on the admin surface.

3. **One label is the entire manual act.** `already-exists`, applied at close, read by the webhook. It is one click in a UI the maintainer is already in at the moment they are already there — not a second pass and not a new screen. *Which* feature, said in words, is deliberately not solved in the app; that happens in person, by text, or in `/messages`.

4. **Closure no longer speaks for the team.** The webhook sets the outcome; the outcome is what the submitter reads. Reopening clears it and says nothing further — a retraction ping teaches people to distrust the first one, and reopens are usually bookkeeping rather than news.

5. **`not_planned` is a visible outcome, not an archive.** Archiving is a filing action. "We are not doing this" is the outcome most worth explaining, and it was the one disappearing fastest and quietest.

6. **The submitter gets both a place and a ping.** The place is a list under the composer on `/feedback`, which is already `viewer` and therefore already reachable by everyone who can submit. The ping rides the existing `notifications` collection. The ping is the part that does the work: a page nobody visits assures nobody.

7. **Clarification is out of band.** In person, by text, or in `/messages` — which already accepts a `ChatAttachment` of `type: 'feedback'`. A Note stays a one-shot note; it does not become a thread.

## Consequences

- Notes with no `githubIssueUrl` can never be answered by this mechanism — those filed while `GITHUB_TOKEN` was unset, and everything predating the integration that `scripts/migrate-feedback-to-github.ts` exists to backfill. This is accepted; the admin list should show which Notes can never reach their author, so the silence is a known set rather than a surprise. Building a manual send path for them would reintroduce exactly the load this decision removes.
- The response is thin by construction. Three sentences cannot explain anything. The bet is that a thin message which always arrives beats a good one that arrives sometimes.
- The webhook matches Notes by `githubIssueUrl` and batch-updates every match, so Notes shared onto one issue all receive the same outcome.
- The canned sentences sit in the same notification stream as operational notifications about contacts and to-dos, which are a different register. That is a copy problem, not an architectural one.
- A separate, urgent problem was found and is being fixed elsewhere: the auto-created issue body carries the submitter's name and email in plaintext on a public repository. The issue body needs only the Firestore document id; the admin list already joins the rest.

## Alternatives considered

**Pipe the issue's closing comment through to the submitter.** Free whenever a comment happens to exist, and far better prose than anything canned. Rejected on safety rather than quality: the tracker's comments carry agent chatter, stack traces and internal shorthand, and there is no review step between a public issue and a named user. An unreviewed pipe of that shape is a leak waiting to happen, and one of those had already been found.

**Draw the words from the What's New entry for the release that shipped it.** The nicest text available, and already written. Rejected because nothing links an issue to a release — `content/whats-new/*.md` carries no issue references — so establishing the link is new manual work of exactly the kind being avoided.

**Let a Feedback Note become a conversation.** Makes responding and asking for clarification one mechanism, in-app, where the submitter already is. Rejected: it grows a second messaging system inside the feedback collection when `/messages` exists and already anticipates attaching a Note.

**Close-as-duplicate instead of the `already-exists` label.** Costs the same single action, but points at an issue, and a submitter cannot read issues.

**Grow `status` to six values.** Fewer fields, but permanently entangles a pipeline vocabulary with a user-facing one. See decision 1.
