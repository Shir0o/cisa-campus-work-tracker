import dotenv from 'dotenv';
import {
  reporterLabelFromName,
  rewriteFeedbackIssueAttribution,
} from '../src/lib/feedbackReporter';
import { ensureGitHubLabel } from '../src/lib/githubFeedbackLabels';

dotenv.config();

export interface BackfillIssue {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  pull_request?: unknown;
}

export interface BackfillReport {
  selected: number;
  updated: number;
  skipped: number;
  failed: number;
  labels: string[];
  skippedIssues: number[];
}

export interface BackfillOptions {
  repo: string;
  token: string;
  execute?: boolean;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

const SUBMITTED_BY_NAME = /^(- \*\*Submitted By:\*\*)\s*(.+?)\s*(?:\([^)]*\))?\s*$/m;

export function parseSubmittedByName(body: string | null | undefined): string | null {
  const text = body ?? '';
  const match = text.match(SUBMITTED_BY_NAME);
  if (match === null) return null;
  const name = match[2].trim();
  return name.length > 0 ? name : null;
}

function hasFeedbackLabel(issue: BackfillIssue): boolean {
  return issue.labels.some((label) => label.name === 'feedback');
}

function hasFeedbackTitle(issue: BackfillIssue): boolean {
  return (issue.title ?? '').startsWith('[Feedback]');
}

async function fetchAllIssues(
  repo: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<BackfillIssue[]> {
  const issues: BackfillIssue[] = [];
  let page = 1;

  while (true) {
    const response = await fetchImpl(
      'https://api.github.com/repos/' + repo + '/issues?state=all&per_page=100&page=' + page,
      {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'CISA-Campus-Work-Tracker-Backfill',
        },
      },
    );

    if (response.ok === false) {
      const text = await response.text();
      throw new Error('Failed to fetch issues: ' + response.status + ' ' + text);
    }

    const data = (await response.json()) as BackfillIssue[];
    if (Array.isArray(data) === false || data.length === 0) break;

    for (const item of data) {
      if (item.pull_request) continue;
      issues.push(item);
    }

    if (data.length < 100) break;
    page += 1;
  }

  return issues;
}

export async function backfillFeedbackReporterLabels(
  options: BackfillOptions,
): Promise<BackfillReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? ((message: string) => console.log(message));
  const issues = await fetchAllIssues(options.repo, options.token, fetchImpl);
  const selected = issues.filter((issue) => hasFeedbackLabel(issue) || hasFeedbackTitle(issue));

  const report: BackfillReport = {
    selected: selected.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    labels: [],
    skippedIssues: [],
  };

  const fullNameToLabel = new Map<string, string>();
  const assignedLabels = new Set<string>();
  const readyLabels = new Set<string>();

  for (const issue of selected) {
    const fullName = parseSubmittedByName(issue.body);
    if (fullName === null) {
      report.skipped += 1;
      report.skippedIssues.push(issue.number);
      continue;
    }

    const fullNameKey = fullName.toLocaleLowerCase().replace(/\s+/g, ' ');
    let reporterLabel = fullNameToLabel.get(fullNameKey);

    if (reporterLabel === undefined) {
      const baseLabel = reporterLabelFromName(fullName);
      if (baseLabel === null) {
        report.skipped += 1;
        report.skippedIssues.push(issue.number);
        continue;
      }

      reporterLabel = baseLabel;
      let suffix = 2;
      while (assignedLabels.has(reporterLabel)) {
        reporterLabel = baseLabel + '-' + String(suffix);
        suffix += 1;
      }

      assignedLabels.add(reporterLabel);
      fullNameToLabel.set(fullNameKey, reporterLabel);
      report.labels.push(reporterLabel);
    }

    const currentBody = issue.body ?? '';
    const newBody = rewriteFeedbackIssueAttribution(currentBody);
    const bodyChanged = newBody !== currentBody;
    const labelMissing = issue.labels.some((label) => label.name === reporterLabel) === false;
    const plannedChange = bodyChanged || labelMissing;

    if (options.execute !== true) {
      if (plannedChange) report.updated += 1;
      continue;
    }

    try {
      if (bodyChanged) {
        const patchResponse = await fetchImpl(
          'https://api.github.com/repos/' + options.repo + '/issues/' + issue.number,
          {
            method: 'PATCH',
            headers: {
              Authorization: 'Bearer ' + options.token,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
              'User-Agent': 'CISA-Campus-Work-Tracker-Backfill',
            },
            body: JSON.stringify({ body: newBody }),
          },
        );
        if (patchResponse.ok === false) {
          const text = await patchResponse.text();
          throw new Error('Issue body update failed: ' + patchResponse.status + ' ' + text);
        }
      }

      if (labelMissing) {
        if (readyLabels.has(reporterLabel) === false) {
          const labelReady = await ensureGitHubLabel(options.repo, options.token, reporterLabel, fetchImpl);
          if (labelReady === false) throw new Error('Could not create reporter label ' + reporterLabel);
          readyLabels.add(reporterLabel);
        }

        const labelResponse = await fetchImpl(
          'https://api.github.com/repos/' + options.repo + '/issues/' + issue.number + '/labels',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + options.token,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
              'User-Agent': 'CISA-Campus-Work-Tracker-Backfill',
            },
            body: JSON.stringify({ labels: [reporterLabel] }),
          },
        );
        if (labelResponse.ok === false) {
          const text = await labelResponse.text();
          throw new Error('Issue label update failed: ' + labelResponse.status + ' ' + text);
        }
      }

      if (plannedChange) report.updated += 1;
    } catch (error: any) {
      report.failed += 1;
      log('Issue #' + issue.number + ' failed: ' + (error?.message ?? String(error)));
    }
  }

  log(
    'Backfill ' + (options.execute === true ? 'executed' : 'dry-run') + ': ' +
    report.selected + ' selected, ' + report.updated + ' updated, ' +
    report.skipped + ' skipped, ' + report.failed + ' failed.',
  );
  return report;
}

const isDirectExecution =
  import.meta.url === 'file://' + process.argv[1];

if (isDirectExecution) {
  const repo = process.env.GITHUB_REPO || process.env.VITE_GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const execute = process.argv.includes('--execute');

  if (repo === undefined || token === undefined) {
    console.error('GITHUB_REPO and GITHUB_TOKEN are required.');
    process.exit(1);
  }

  backfillFeedbackReporterLabels({ repo, token, execute })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('Backfill failed:', error);
      process.exit(1);
    });
}
