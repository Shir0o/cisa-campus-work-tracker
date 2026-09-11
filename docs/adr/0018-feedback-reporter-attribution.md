# 0018: Feedback-created GitHub issues use first-name attribution, no email, and no screenshots

## Status
Accepted

## Context

Feedback Notes submitted through CISA Campus Work Tracker are mirrored to GitHub issues. The public issues previously exposed the reporter's full name and email address in the issue body, carried no reporter label, and embedded an auto-captured screenshot served from the app. The repository is public, so those bodies published personal contact details. The app also stored the reporter's email on every new feedback document.

The team wants GitHub issues to remain attributable and filterable without publishing surnames or email addresses. Existing issues also need to be brought in line, and the screenshot capture flow should be removed entirely so future feedback does not collect or publish a screenshot.

## Decision

1. **Reporter labels are public and minimal.** A feedback-created issue receives a label of the form `reporter:<first-name>-<last-initial>`. If the reporter has no usable display name, the issue gets no reporter label. Anonymous reporters are not grouped under a shared anonymous label.

2. **Public issue bodies show first name only.** The body carries `- **Submitted By:** <first-name>` and no surname, email address, GitHub mention, assignee, or author change.

3. **Reporter labels are stable and collision-aware.** A private `reporterLabel` field is stored on the reporter's user profile and reused on later submissions. If a different user would claim the same label, numeric suffixes are appended: `-2`, `-3`, and so on. Historical backfill maps labels from the names already present on existing issues; labels that cannot be tied to a user identity may merge later.

4. **Label creation is fail-open.** Reporter labels use a deterministic colour and no description. The label is created before the issue, but a failed label create or assign never blocks the issue from being created.

5. **New feedback documents stop storing email.** Existing Firestore feedback documents keep their historical email values so admin lookup and historical context continue to work. The `userEmail` field becomes optional for new documents. The full `userName` remains private in Firestore and in the admin UI.

6. **Existing feedback issues are backfilled.** Issues with the `feedback` label or a `[Feedback]` title are scanned for an existing `Submitted By` line. The backfill strips surname and email, adds the reporter label, and skips issues with no parseable reporter. The backfill defaults to dry-run and requires explicit execution.

7. **Screenshots are removed from future feedback capture and from issue bodies.** Client capture, payload transport, Firestore writes, issue-body embeds, and the screenshot-serving endpoint are retired. Existing Firestore screenshots remain available only as legacy admin data and are not republished to GitHub.

8. **Git history is not rewritten.** Current tracked issue snapshots and current GitHub issue bodies are cleaned, but old Git blobs and any copies GitHub keeps internally, in notifications, or in forks are outside the purge.

## Consequences

- Public GitHub issues no longer expose email addresses or surnames, and reporter filtering is available through a stable label.
- Admins can still see full names and legacy emails privately in the app, so the privacy boundary is explicit rather than global.
- Removing email from new feedback documents means the admin UI must handle new documents without an email.
- Reporter labels expose the last initial publicly. That is the deliberate cost of keeping labels human-readable and collision-resistant.
- Historical backfill is best-effort. Two feedback-labelled issues with rewritten design bodies have no parseable reporter and remain unlabelled.
- Screen storage is removed from the capture path, but legacy screenshots already in Firestore are not deleted and may still be visible to admins.
- The current repository snapshots lose email in their current commit, but old commits still contain the previously published email addresses.
- GitHub internal edit history, prior notifications, forks, and third-party archives cannot be guaranteed clean after issue-body edits.

## Alternatives considered

**Make the reporter the GitHub issue author.** Rejected because it requires a different GitHub authentication architecture and would force every reporter to have a GitHub identity.

**Assign the issue to the reporter.** Rejected because most reporters are not GitHub collaborators and no GitHub username is collected.

**Use an `@mention` in the issue body.** Rejected because it requires storing and maintaining a GitHub handle for every reporter.

**Use a single `reporter:anonymous` label.** Rejected because the label cannot identify anyone and only adds label noise.

**Always use a first-name-only reporter label.** Rejected because two different reporters with the same first name would share a label; the last initial keeps the common case readable while reducing collisions.

**Rewrite Git history to remove old email snapshots.** Rejected because the disruption and force-push coordination outweigh the benefit; the current snapshots are cleaned instead.

**Keep screenshot capture and only stop embedding it in GitHub issues.** Rejected because the team asked to remove the capture path itself, and collecting a screenshot that is never used is unnecessary data collection.
