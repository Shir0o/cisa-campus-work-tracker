import { FieldValue } from 'firebase-admin/firestore';
import { outcomeCopy, isStorableScreenshot, type FeedbackOutcome } from '../lib/feedbackKinds';
import { feedbackIssueSubmittedByLine, reporterLabelFromName } from '../lib/feedbackReporter';

// Maximum GitHub issue title length.
const GITHUB_TITLE_MAX = 512;

// Maximum screenshot string length (ADR 0018).
const FEEDBACK_MAX_SCREENSHOT_CHARS = 200000;

const REPORTER_LABEL_COLORS = [
  '0E8A16',
  '1D76DB',
  '5319E7',
  'B60205',
  'D93F0B',
  'FBCA04',
  '006B75',
  '0052CC',
];

export function reporterLabelColor(label: string): string {
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }
  return REPORTER_LABEL_COLORS[hash % REPORTER_LABEL_COLORS.length];
}

export function isOpaqueRecordId(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,}$/.test(token) && /[a-z]/.test(token) && /[A-Z]/.test(token);
}

export function redactRecordIds(url: string): string {
  if (typeof url !== 'string' || url === '') return url;
  return url.replace(/[A-Za-z0-9_-]+/g, (token) => (isOpaqueRecordId(token) ? ':id' : token));
}

/** True when the issue lives in the repository this app files to. Owner and
 *  repo names are compared case-insensitively, as GitHub does. */
export function isIssueInRepo(issueUrl: string, repo: string): boolean {
  const parsed = parseIssueUrl(issueUrl);
  if (!parsed || !repo) return false;
  return `${parsed.owner}/${parsed.repo}`.toLowerCase() === repo.toLowerCase();
}

export function parseIssueUrl(issueUrl: string): { owner: string; repo: string; issueNumber: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(issueUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') return null;

  const match = parsed.pathname.match(/^\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/issues\/(\d+)$/);
  if (!match) return null;
  if (match[1] === '.' || match[1] === '..' || match[2] === '.' || match[2] === '..') return null;
  return { owner: match[1], repo: match[2], issueNumber: match[3] };
}

export class FeedbackHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'FeedbackHttpError';
  }
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface GitHubFeedbackPort {
  createIssue(params: { title: string; body: string; labels: string[] }): Promise<{ html_url: string; number: number } | null>;
  ensureLabel(name: string): Promise<boolean>;
  updateIssueState(issueUrl: string, state: 'open' | 'closed', stateReason?: 'completed' | 'not_planned'): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Module Inputs & Outputs
// ---------------------------------------------------------------------------

export interface SubmitFeedbackNoteInput {
  userId?: string;
  userName?: string;
  userRole?: string;
  type?: string;
  kind?: string;
  message: string;
  url?: string;
  viewport?: string;
  userAgent?: string;
  /** The browser's focus/composition/viewport trace from `src/lib/inputTrace.ts`. */
  inputTrace?: string;
  screenshot?: unknown;
}

export interface SubmitFeedbackNoteResult {
  id: string;
  githubIssueUrl: string;
  status: string;
}

export interface WebhookProcessResult {
  handled: boolean;
  message?: string;
  outcome?: string;
  matchedDocsCount?: number;
  updates?: Record<string, unknown>;
}

export interface FeedbackPipelineOptions {
  db: any;
  githubPort?: GitHubFeedbackPort;
  githubRepo?: string;
}

// ---------------------------------------------------------------------------
// Deep Implementation
// ---------------------------------------------------------------------------

const GITHUB_SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'CISA-Campus-Work-Tracker-Server',
  };
}

async function githubApiFetch(
  segments: string[],
  init: RequestInit,
  search: '' | '?per_page=100' = '',
): Promise<Response | null> {
  if (segments.length === 0 || !segments.every((seg) => GITHUB_SAFE_SEGMENT.test(seg))) {
    console.warn('Refusing a GitHub API request with an unexpected path segment.');
    return null;
  }
  const path = segments.map((seg) => encodeURIComponent(seg)).join('/');
  return fetch(`https://api.github.com/${path}${search}`, init);
}

export async function ensureGitHubLabel(
  repo: string,
  token: string,
  label: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/labels`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'CISA-Campus-Work-Tracker-Server',
    },
    body: JSON.stringify({
      name: label,
      color: reporterLabelColor(label),
    }),
  });

  if (response.ok) return true;
  if (response.status === 422) {
    const text = await response.text();
    return text.includes('already_exists');
  }
  return false;
}

export class DefaultGitHubFeedbackPort implements GitHubFeedbackPort {
  private repo: string;
  constructor(repo: string) {
    this.repo = repo;
  }
  private get githubRepo(): string {
    return process.env.GITHUB_REPO || this.repo || process.env.VITE_GITHUB_REPO || 'Shir0o/cisa-campus-work-tracker';
  }
  private get token() {
    return process.env.GITHUB_TOKEN;
  }
  /** Parse an issue URL, refusing any issue outside this app's repository:
   *  the token must never be pointed at someone else's issues (Nov 2026). */
  private ownIssue(issueUrl: string): { owner: string; repo: string; issueNumber: string } | null {
    const parsed = parseIssueUrl(issueUrl);
    if (!parsed) return null;
    if (!isIssueInRepo(issueUrl, this.githubRepo)) {
      console.warn('Refusing a GitHub call for an issue outside %s.', this.githubRepo);
      return null;
    }
    return parsed;
  }

  async createIssue(params: { title: string; body: string; labels: string[] }): Promise<{ html_url: string; number: number } | null> {
    const token = this.token;
    const repo = this.githubRepo;
    if (!token || !repo) {
      console.warn("GitHub credentials not fully configured; skipping auto GitHub issue creation.");
      return null;
    }
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: githubHeaders(token),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("GitHub API error creating issue: " + res.status + " - " + errorText);
        return null;
      }
      const data = await res.json();
      if (data?.html_url) {
        console.log('Auto-created GitHub issue: ' + data.html_url);
      }
      return data;
    } catch (err) {
      console.error("Failed to auto-create GitHub issue:", err);
      return null;
    }
  }

  async ensureLabel(name: string): Promise<boolean> {
    const token = this.token;
    const repo = this.githubRepo;
    if (!token || !repo) return false;
    return ensureGitHubLabel(repo, token, name);
  }

  async updateIssueState(issueUrl: string, state: 'open' | 'closed', reason?: 'completed' | 'not_planned'): Promise<boolean> {
    if (!issueUrl) return false;
    const token = this.token;
    if (!token) {
      console.warn("GITHUB_TOKEN not configured; skipping GitHub issue status sync.");
      return false;
    }
    const parsed = this.ownIssue(issueUrl);
    if (!parsed) {
      console.error("Invalid GitHub issue URL format for sync: %s", issueUrl);
      return false;
    }
    const { owner, repo, issueNumber } = parsed;
    try {
      const payload: any = { state };
      if (state === 'closed' && reason) {
        payload.state_reason = reason;
      }
      const res = await githubApiFetch(['repos', owner, repo, 'issues', issueNumber], {
        method: 'PATCH',
        headers: githubHeaders(token),
        body: JSON.stringify(payload),
      });
      if (!res) return false;
      if (!res.ok) {
        console.error("GitHub API error updating issue: %s - %s", res.status, await res.text());
        return false;
      }
      console.log("Successfully updated GitHub issue state to %s (%s) for %s", state, reason || 'no reason', issueUrl);
      return true;
    } catch (error) {
      console.error("Failed to update GitHub issue state for %s: %o", issueUrl, error);
      return false;
    }
  }
}

export class FeedbackPipeline {
  private db: any;
  private githubPort?: GitHubFeedbackPort;
  private githubRepo: string;

  constructor(options: FeedbackPipelineOptions) {
    this.db = options.db;
    this.githubRepo =
      options.githubRepo ||
      process.env.GITHUB_REPO ||
      process.env.VITE_GITHUB_REPO ||
      'Shir0o/cisa-campus-work-tracker';
    this.githubPort =
      options.githubPort !== undefined
        ? options.githubPort
        : new DefaultGitHubFeedbackPort(this.githubRepo);
  }

  // --- Reporter Label Resolution (ADR 0018) --------------------------------
  private async ensureReporterLabel(
    uid: string | null | undefined,
    userName: string | null | undefined,
  ): Promise<string | null> {
    const baseLabel = reporterLabelFromName(userName);
    if (!baseLabel) return null;
    if (!uid) return baseLabel;

    const userRef = this.db.collection('users').doc(uid);
    const userSnapshot = await userRef.get();
    const existingLabel = userSnapshot?.exists ? userSnapshot.data()?.reporterLabel : null;
    if (typeof existingLabel === 'string' && existingLabel.length > 0) return existingLabel;

    let candidate = baseLabel;
    let suffix = 2;

    while (true) {
      const claimed = await this.db.collection('users').where('reporterLabel', '==', candidate).get();
      const docs = Array.isArray(claimed?.docs) ? claimed.docs : [];
      const claimedByAnotherUser = docs.some((doc: any) => doc.id !== uid);
      const hasUnreadableClaim = docs.length === 0 && (claimed?.size ?? 0) > 0;

      if (claimedByAnotherUser || hasUnreadableClaim) {
        candidate = `${baseLabel}-${suffix}`;
        suffix += 1;
        continue;
      }
      break;
    }

    await userRef.set({ reporterLabel: candidate }, { merge: true });
    return candidate;
  }

  // --- Public Interface Methods --------------------------------------------

  /**
   * Submits a new Feedback Note. Persists full record in Firestore, generates
   * collision-resistant reporter label, sanitizes URLs, and files issue on GitHub.
   */
  async submitNote(input: SubmitFeedbackNoteInput): Promise<SubmitFeedbackNoteResult> {
    const {
      userId,
      userName,
      userRole,
      type = 'enhancement',
      kind,
      message,
      url,
      viewport,
      userAgent,
      inputTrace,
      screenshot,
    } = input;

    let reporterLabel: string | null = null;
    try {
      reporterLabel = await this.ensureReporterLabel(userId, userName);
    } catch (labelErr) {
      console.error('Failed to resolve reporter label:', labelErr);
    }

    const serverTimestamp = FieldValue?.serverTimestamp
      ? FieldValue.serverTimestamp()
      : new Date().toISOString();

    const feedbackData: any = {
      userId: userId || 'anonymous',
      userName: userName || 'Anonymous User',
      type: type || 'enhancement',
      kind: kind || 'thought',
      message: (message || '').trim(),
      status: 'new',
      createdAt: new Date().toISOString(),
      archived: false,
    };

    if (userRole) feedbackData.userRole = userRole;
    if (reporterLabel) feedbackData.reporterLabel = reporterLabel;
    if (url) feedbackData.url = url;
    if (userAgent) feedbackData.userAgent = userAgent;
    if (viewport) feedbackData.viewport = viewport;

    if (screenshot !== undefined && screenshot !== '') {
      if (isStorableScreenshot(screenshot)) {
        feedbackData.screenshot = screenshot;
      } else {
        console.warn(
          'Discarding unstorable feedback screenshot (type ' +
            typeof screenshot +
            ', length ' +
            (typeof screenshot === 'string' ? screenshot.length : 'n/a') +
            ').'
        );
      }
    }

    // 1. Save to Firestore
    const docRef = await this.db.collection('feedback').add(feedbackData);
    console.log('Saved feedback document to Firestore: ' + docRef.id);

    // 2. Best-effort create GitHub issue via port if configured
    let githubIssueUrl = '';
    if (this.githubPort) {
      try {
        const kindLabel = kind || type;
        const cleanMsg = (message || '').trim();
        const prefix = `[Feedback] ${String(kindLabel ?? '').replace(/[\r\n]+/g, ' ').slice(0, 40)}: `;
        const remaining = GITHUB_TITLE_MAX - prefix.length;
        const ellipsis = '…';
        const title =
          cleanMsg.length <= remaining
            ? prefix + cleanMsg
            : prefix + cleanMsg.slice(0, remaining - 1) + ellipsis;
        const fence = '```';
        // The message keeps its own backticks (people paste code), so its
        // fence is one longer than any backtick run inside it and the text can
        // never close the block early to write markdown into the issue.
        const longestTickRun = Math.max(0, ...(cleanMsg.match(/`+/g) || []).map((run) => run.length));
        const messageFence = '`'.repeat(Math.max(3, longestTickRun + 1));
        // Single-line fields come from the client; a newline in one would let
        // it add lines (a fake "Submitted by", a hidden comment) to the issue.
        const oneLine = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, 300);
        // The reporter's own focus/composition/viewport events (#1735). The
        // tracer records no typed text; the fence is neutralised so a trace can
        // never break out of its block.
        const trace = (inputTrace || '')
          .replace(/```/g, "'''")
          .replace(/\u0000/g, '')
          .slice(0, 4000)
          .trim();

        // NOTE: screenshot is omitted from GitHub body (ADR 0018). URL has IDs redacted.
        const bodyLines = [
          '### Feedback Details',
          feedbackIssueSubmittedByLine(userName),
          `- **Type:** ${oneLine(type || 'enhancement')}`,
          `- **Kind:** ${oneLine(kindLabel)}`,
          `- **Date:** ${new Date().toLocaleString()}`,
          `- **Page URL:** ${oneLine(redactRecordIds(url || '')) || 'N/A'}`,
          `- **Viewport:** ${oneLine(viewport) || 'N/A'}`,
          `- **User Agent:** ${oneLine(userAgent) || 'N/A'}`,
          // The image itself stays in-app; this only tells triage one exists.
          `- **Screenshot:** ${feedbackData.screenshot ? 'Captured (see the admin feedback list)' : 'None'}`,
          '',
          '### Message',
          `${messageFence}text`,
          cleanMsg,
          messageFence,
          ...(trace ? ['', '### Input trace', `${fence}text`, trace, fence] : []),
          '',
          '---',
          '*Created automatically from CISA Campus Work Tracker user feedback.*',
        ];
        const body = bodyLines.join('\n');

        const labels: string[] = [type || 'enhancement', 'feedback'];
        if (reporterLabel) {
          try {
            const labelReady = await this.githubPort.ensureLabel(reporterLabel);
            if (labelReady) labels.push(reporterLabel);
          } catch (labelErr) {
            console.error('Failed to create reporter label:', labelErr);
          }
        }

        const issueResult = await this.githubPort.createIssue({ title, body, labels });
        if (issueResult?.html_url) {
          githubIssueUrl = issueResult.html_url;
          await docRef.update({
            githubIssueUrl,
            status: 'in_progress',
          });
        }
      } catch (ghErr) {
        console.error('Failed to auto-create GitHub issue:', ghErr);
      }
    }

    return {
      id: docRef.id,
      githubIssueUrl,
      status: githubIssueUrl ? 'in_progress' : 'new',
    };
  }

  /**
   * Handles GitHub webhook callbacks (issues).
   */
  async handleGitHubWebhook(payload: {
    eventType: string;
    action: string;
    issue?: any;
  }): Promise<WebhookProcessResult> {
    const { eventType, action, issue } = payload;
    if (eventType !== 'issues') {
      return { handled: false, message: `Ignored event type: ${eventType}` };
    }

    if (!issue || !issue.html_url) {
      throw new FeedbackHttpError(400, 'Invalid issues event payload.');
    }

    const issueUrl = issue.html_url;
    const snapshot = await this.db
      .collection('feedback')
      .where('githubIssueUrl', '==', issueUrl)
      .get();

    if (snapshot.empty) {
      console.log('GitHub Webhook: No feedback doc found matching issue URL: ' + issueUrl);
      return { handled: true, message: 'No matching feedback document found.', matchedDocsCount: 0 };
    }

    console.log(`GitHub Webhook: Found ${snapshot.size} feedback documents matching issue URL: ${issueUrl}`);

    // --- issues closed / reopened ------------------------------------------
    const updates: any = {};
    let outcome: FeedbackOutcome | undefined;

    if (action === 'closed') {
      updates.status = 'resolved';
      const hasAlreadyExistsLabel =
        Array.isArray(issue.labels) &&
        issue.labels.some(
          (l: any) => (typeof l === 'string' ? l : l?.name) === 'already-exists',
        );

      if (hasAlreadyExistsLabel) {
        outcome = 'already-there';
      } else if (issue.state_reason === 'not_planned') {
        outcome = 'not-planned';
      } else {
        outcome = 'shipped';
      }
      updates.outcome = outcome;
    } else if (action === 'reopened') {
      const deleteField = FieldValue?.delete ? FieldValue.delete() : { _delete: true };
      updates.status = 'in_progress';
      updates.archived = false;
      updates.outcome = deleteField;
    } else {
      return { handled: true, message: `Ignored action: ${action}`, matchedDocsCount: snapshot.size };
    }

    const batch = this.db.batch();
    snapshot.forEach((doc: any) => {
      batch.update(doc.ref, updates);
    });
    await batch.commit();

    if (outcome) {
      // One fixed sentence is the answer. Nothing a pull request wrote stands
      // in for it (cut-or-keep §15).
      const canned = outcomeCopy(outcome);
      const serverTimestamp = FieldValue?.serverTimestamp
        ? FieldValue.serverTimestamp()
        : new Date().toISOString();

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        const alreadyTold = data.notifiedOutcome === outcome;
        if (!alreadyTold) await docSnap.ref.update({ notifiedOutcome: outcome });

        if (alreadyTold) {
          console.log(`GitHub Webhook: ${docSnap.id} already told about "${outcome}"; no second ping.`);
          continue;
        }

        if (data.userId && data.userId !== 'anonymous') {
          try {
            await this.db.collection('notifications').add({
              userId: data.userId,
              title: 'What came of your note',
              message: canned,
              type: 'info',
              tone: 'accent',
              read: false,
              link: '/feedback',
              createdAt: serverTimestamp,
            });
          } catch (notifErr) {
            console.error(`Failed to create notification for feedback submitter ${data.userId}:`, notifErr);
          }
        }
      }
    }

    console.log("GitHub Webhook: Successfully updated feedback doc(s) for issue %s with updates: %o", issueUrl, updates);
    return { handled: true, matchedDocsCount: snapshot.size, updates, outcome };
  }
}
