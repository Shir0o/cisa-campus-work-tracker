# 0044: Deep Feedback Pipeline module with explicit ports and adapters

## Status

Accepted (extends [0017](0017-feedback-outcomes-are-canned-and-ride-the-issue-close.md), [0018](0018-feedback-reporter-attribution.md), [0019](0019-a-feedback-note-becomes-a-conversation.md))

## Context

[0017](0017-feedback-outcomes-are-canned-and-ride-the-issue-close.md), [0018](0018-feedback-reporter-attribution.md), and [0019](0019-a-feedback-note-becomes-a-conversation.md) established the feedback note lifecycle: anonymous/attributed note submissions, GitHub issue mirroring, outcome notifications, two-way follow-up conversations, and AI-laundered issue comments via Gemini.

As these capabilities were built, the system accumulated architectural shallowness across two dimensions:
1. **Shallow Helper Modules**: Functionality fragmented across four tiny modules (`src/lib/feedbackRelay.ts`, `src/lib/feedbackReporterStore.ts`, `src/lib/feedbackUrl.ts`, `src/lib/githubFeedbackLabels.ts`). Each presented an interface nearly as wide as its implementation, offering minimal leverage to callers while dispersing tightly coupled feedback domain logic across disparate files.
2. **Procedural Route Bloat in `server.ts`**: Express endpoints (`/api/feedback`, `/api/feedback/update`, `/api/feedback/reply`, `/api/feedback/reply/edit`, `/api/webhook/github`) grew to over 600 lines of procedural orchestration, entangled with a dozen private helper functions (`parseIssueUrl`, `githubApiFetch`, `launderIssueComment`, `postIssueComment`, `notifyFullTimers`, etc.). Network calls to GitHub, Gemini AI SDK invocations, and Firestore Admin database writes were tightly coupled into the HTTP route handlers, making localized testing cumbersome and forcing all verification to run through the heavyweight `server.test.ts` integration harness.

Applying the codebase design criteria (depth, clean seams, explicit ports/adapters, high leverage, and locality) indicated that feedback lifecycle orchestration should not live in the HTTP routing layer, nor be divided among shallow helpers. It belongs in a single deep server module behind well-defined seams.

## Decision

1. **Consolidate into `FeedbackPipeline` (`src/server/feedbackPipeline.ts`)**:
   Create a deep module that encapsulates all business rules, orchestration, SSRF validations, AI laundering, notification dispatch, and Firestore persistence for the feedback lifecycle.

2. **A High-Leverage, Cohesive Public Interface**:
   Expose five high-level entry points for Express route handlers:
   - `submitNote(req, res)`: Creates Firestore note, sets reporter attribution, creates GitHub issue, registers reporter label.
   - `updateNote(req, res)`: Synchronizes client-side edits to Firestore and updates GitHub issue title/body.
   - `addFollowUp(req, res)`: Records reporter follow-up in Firestore, posts mirrored comment to GitHub, notifies full-timers.
   - `editFollowUp(req, res)`: Edits existing follow-up and updates mirrored GitHub issue comment.
   - `handleGitHubWebhook(req, res)`: Processes GitHub webhooks (`issue_comment` and `issues`), performs triage filtering, runs Gemini comment laundering, resolves closing PR descriptions, updates Firestore outcomes, and dispatches in-app bell notifications.

3. **Explicit Seams with Invertible Ports and Adapters**:
   Define explicit ports for all out-of-process interactions:
   - `GitHubFeedbackPort`: abstracts issue creation, updating, commenting, label management, and PR resolution. Concrete default: `DefaultGitHubFeedbackPort`.
   - `FeedbackAIPort`: abstracts Gemini generative laundering (`launderComment`) and closing PR summarization (`generateCloseMessageFromPr`). Concrete default: `DefaultFeedbackAIPort`.
   Both default to production implementations using the real GitHub REST API and Gemini Generative AI SDK, but allow test harnesses to inject in-memory mocks without monkey-patching global `fetch` or SDK constructors.

4. **Retire Shallow Modules via the Deletion Test**:
   Remove the four shallow modules:
   - `src/lib/feedbackRelay.ts`
   - `src/lib/feedbackReporterStore.ts`
   - `src/lib/feedbackUrl.ts`
   - `src/lib/githubFeedbackLabels.ts`
   Their implementations (issue URL parsing with SSRF protections, reply formatting, label management) are absorbed directly into `FeedbackPipeline`. Utility script exports (`ensureGitHubLabel`) are re-exported from `src/server/feedbackPipeline.ts`.
   Client-only presentation types (`feedbackReporter.ts`, `feedbackKinds.ts`) remain intact on the client seam for UI rendering in `FeedbackList.tsx`.

5. **`server.ts` Becomes a Thin HTTP Routing Facade**:
   `server.ts` delegates directly to the module instance (`pipeline.submitNote(req, res)`, etc.) and formats exceptions via `pipeline.formatHttpError(err)`. Over 850 lines of procedural helper and routing logic are excised from `server.ts`.

6. **Targeted Contract Test Suite**:
   Create `src/test/feedbackPipeline.test.ts` to exercise domain transitions, error mappings (`FeedbackHttpError`), triage filters, SSRF path traversal rejections, and fallback outcomes directly against in-memory ports in under 1.5 seconds.

## Consequences

- **Locality**: All feedback business rules, GitHub mirroring conventions, AI prompt engineering, and SSRF defense policies live in a single, coherent file (`src/server/feedbackPipeline.ts`).
- **Leverage**: Callers (Express routes and automated scripts) interact with simple, self-contained methods without having to know the sequence of Firestore writes, GitHub labels, or notification formats required.
- **Testability**: Fast, localized unit and contract testing is unlocked via injectable ports, relieving `server.test.ts` from having to exercise every low-level permutation of the feedback flow.
- **Zero Regression**: Complete backward compatibility is maintained across all existing test suites (`server.test.ts`, `serverImports.test.ts`, `migrateFeedbackToGithub.test.ts`), and client-server boundaries remain strictly separated.
