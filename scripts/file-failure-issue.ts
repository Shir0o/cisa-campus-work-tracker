/**
 * File or update a single GitHub issue when a workflow goes red on `main`.
 *
 * One issue per watched workflow, kept open until the workflow is green again;
 * repeat failures comment on the existing issue instead of opening a new one.
 * The issue title is the search key, so the CI issue and each e2e issue can
 * never collide with one another.
 *
 * Watched workflows:
 *   - `CI`                     → "🚨 CI failure on main branch" (legacy shape)
 *   - `Web E2E (Playwright)`   → "🚨 Web E2E failure on main"   (`bug`, `ready-for-agent`)
 *   - `Mobile E2E (Maestro)`   → "🚨 Mobile E2E failure on main" (`bug`, `ready-for-agent`)
 *
 * `--dry-run` prints the exact title, labels and both body variants without
 * touching GitHub — the local proof for the issue body format.
 */
/// <reference types="node" />
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export type FailureKind = 'ci' | 'web-e2e' | 'mobile-e2e';

export interface FailureRun {
  kind: FailureKind;
  workflowName: string;
  repo: string;
  runNumber: string;
  runAttempt: string;
  runUrl: string;
  commitSha: string;
  commitMessage: string;
  commitAuthor: string;
  prNumbers: number[];
  failedJobs: string[];
  failingTargets: string[];
}

const WORKFLOW_KINDS: Record<string, FailureKind> = {
  CI: 'ci',
  'Web E2E (Playwright)': 'web-e2e',
  'Mobile E2E (Maestro)': 'mobile-e2e',
};

const TITLES: Record<FailureKind, string> = {
  ci: '🚨 CI failure on main branch',
  'web-e2e': '🚨 Web E2E failure on main',
  'mobile-e2e': '🚨 Mobile E2E failure on main',
};

export function classifyWorkflow(name: string): FailureKind | null {
  return WORKFLOW_KINDS[name] ?? null;
}

export function issueTitle(kind: FailureKind): string {
  return TITLES[kind];
}

/** The `gh issue list --search` key: the title text without the emoji. */
export function issueSearchText(kind: FailureKind): string {
  return TITLES[kind].replace(/^🚨\s*/, '');
}

export function issueLabels(kind: FailureKind): string[] {
  return kind === 'ci'
    ? ['needs-triage', 'bug', 'github_actions']
    : ['bug', 'ready-for-agent'];
}

function targetNoun(kind: FailureKind): string {
  return kind === 'mobile-e2e' ? 'flows' : 'specs';
}

function normalizeSpecPath(path: string): string {
  const fromE2e = path.indexOf('e2e/');
  if (fromE2e >= 0) return path.slice(fromE2e);
  return path.replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Pull the failing spec/flow identifiers out of a run's failed-step log.
 * Best effort: the failed job names remain the fallback when nothing parses.
 */
export function extractFailingTargets(kind: FailureKind, logText: string): string[] {
  if (!logText || kind === 'ci') return [];
  const found = new Set<string>();
  if (kind === 'web-e2e') {
    for (const match of logText.matchAll(/[\w./\\-]+\.spec\.ts\b/g)) {
      found.add(normalizeSpecPath(match[0]));
    }
  } else {
    for (const match of logText.matchAll(/[\w./\\-]+\.maestro\/[\w./-]+\.ya?ml/g)) {
      found.add(match[0]);
    }
    for (const match of logText.matchAll(/\[Failed\]\s*([^\r\n]+)/g)) {
      const name = match[1].replace(/[\u200e\u200f]/g, '').trim();
      if (name) found.add(name);
    }
  }
  return [...found].sort();
}

function commitLink(run: FailureRun): string {
  const short = run.commitSha.slice(0, 7);
  return `[\`${short}\`](https://github.com/${run.repo}/commit/${run.commitSha})`;
}

function prReference(run: FailureRun): string {
  if (run.prNumbers.length === 0) {
    return 'No associated pull request (direct push to `main`).';
  }
  return run.prNumbers
    .map((n) => `[#${n}](https://github.com/${run.repo}/pull/${n})`)
    .join(', ');
}

function targetList(run: FailureRun): string {
  const noun = targetNoun(run.kind);
  if (run.failingTargets.length > 0) {
    return run.failingTargets.map((t) => `- \`${t}\``).join('\n');
  }
  if (run.failedJobs.length > 0) {
    const jobs = run.failedJobs.map((j) => `- \`${j}\``).join('\n');
    return `Could not parse individual ${noun} from the run log. Failed job(s):\n${jobs}`;
  }
  return `Could not parse individual ${noun} from the run log — see the [run logs](${run.runUrl}).`;
}

function buildCiCreationBody(run: FailureRun): string {
  return [
    '## 🚨 Continuous Integration failed on `main`',
    '',
    'A commit pushed to the `main` branch failed the CI workflow.',
    '',
    '### Details',
    `- **Workflow Run**: [#${run.runNumber}](${run.runUrl})`,
    `- **Commit**: ${commitLink(run)}`,
    `- **Author**: ${run.commitAuthor}`,
    '- **Commit Message**:',
    `> ${run.commitMessage}`,
    '',
    '### Next Steps',
    `1. Inspect the [failed run logs](${run.runUrl}) to identify the failing job and step.`,
    '2. Open a fix branch or revert the breaking commit.',
    '3. Close this issue once CI passes on `main`.',
    '',
  ].join('\n');
}

export function buildCreationBody(run: FailureRun): string {
  if (run.kind === 'ci') return buildCiCreationBody(run);
  const noun = targetNoun(run.kind);
  const singular = noun.slice(0, -1);
  return [
    `## 🚨 ${run.workflowName} failed on \`main\``,
    '',
    'An e2e run on `main` went red. **Stop the line**: while this issue is open, fix it before taking on feature work.',
    '',
    `### Failing ${noun}`,
    targetList(run),
    '',
    '### Trigger',
    `- **Workflow**: ${run.workflowName}`,
    `- **Run**: [#${run.runNumber} (Attempt ${run.runAttempt})](${run.runUrl})`,
    `- **Commit**: ${commitLink(run)}`,
    `- **Author**: ${run.commitAuthor}`,
    `- **Pull request**: ${prReference(run)}`,
    '- **Commit message**:',
    `> ${run.commitMessage}`,
    '',
    '### Next steps',
    `1. Inspect the [failed run logs](${run.runUrl}) for the failing ${noun} and stack traces.`,
    `2. If a ${singular} is a genuine flake, tag it \`@quarantine\` and file a follow-up — fixed or deleted within 7 days.`,
    `3. Close this issue once \`${run.workflowName}\` is green on \`main\`.`,
    '',
  ].join('\n');
}

export function buildCommentBody(run: FailureRun): string {
  if (run.kind === 'ci') {
    return [
      '### Additional CI failure on `main`',
      `- **Run**: [#${run.runNumber} (Attempt ${run.runAttempt})](${run.runUrl})`,
      `- **Commit**: \`${run.commitSha}\``,
      `- **Author**: ${run.commitAuthor}`,
      '- **Message**:',
      `> ${run.commitMessage}`,
      '',
    ].join('\n');
  }
  const noun = targetNoun(run.kind);
  const targets = run.failingTargets.length > 0
    ? run.failingTargets.map((t) => `  - \`${t}\``).join('\n')
    : `  - (could not parse individual ${noun} — see the [run logs](${run.runUrl}))`;
  return [
    `### Additional ${run.workflowName} failure on \`main\``,
    `- **Run**: [#${run.runNumber} (Attempt ${run.runAttempt})](${run.runUrl})`,
    `- **Commit**: \`${run.commitSha}\``,
    `- **Author**: ${run.commitAuthor}`,
    `- **Pull request**: ${prReference(run)}`,
    `- **Failing ${noun}**:`,
    targets,
    '- **Message**:',
    `> ${run.commitMessage}`,
    '',
  ].join('\n');
}

export function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseNumberList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function readFailedLog(env: Record<string, string | undefined>): string {
  if (env.FAILED_LOG_TEXT) return env.FAILED_LOG_TEXT;
  if (env.FAILED_LOG_FILE && fs.existsSync(env.FAILED_LOG_FILE)) {
    return fs.readFileSync(env.FAILED_LOG_FILE, 'utf8');
  }
  return '';
}

export function buildRunFromEnv(
  env: Record<string, string | undefined>,
): FailureRun | null {
  const workflowName = env.WORKFLOW_NAME ?? '';
  const kind = classifyWorkflow(workflowName);
  if (!kind) return null;
  return {
    kind,
    workflowName,
    repo: env.GH_REPO ?? '',
    runNumber: env.RUN_NUMBER ?? '',
    runAttempt: env.RUN_ATTEMPT ?? '',
    runUrl: env.RUN_URL ?? '',
    commitSha: env.COMMIT_SHA ?? '',
    commitMessage: env.COMMIT_MESSAGE ?? '',
    commitAuthor: env.COMMIT_AUTHOR ?? '',
    prNumbers: parseNumberList(env.PR_NUMBERS),
    failedJobs: parseList(env.FAILED_JOBS),
    failingTargets: extractFailingTargets(kind, readFailedLog(env)),
  };
}

export function dryRunText(run: FailureRun): string {
  return [
    '=== DRY RUN ===',
    `Workflow: ${run.workflowName} (${run.kind})`,
    `Title: ${issueTitle(run.kind)}`,
    `Labels: ${issueLabels(run.kind).join(',')}`,
    `Search: ${issueSearchText(run.kind)} in:title`,
    '',
    '--- issue body (create) ---',
    buildCreationBody(run),
    '',
    '--- issue body (repeat failure comment) ---',
    buildCommentBody(run),
    '',
  ].join('\n');
}

function ghText(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

export function main(
  argv: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): number {
  const dryRun = argv.includes('--dry-run');
  const run = buildRunFromEnv(env);
  if (!run) {
    console.log(
      `file-failure-issue: "${env.WORKFLOW_NAME ?? ''}" is not a watched workflow; nothing to do.`,
    );
    return 0;
  }
  if (dryRun) {
    console.log(dryRunText(run));
    return 0;
  }
  const existing = ghText([
    'issue', 'list',
    '--repo', run.repo,
    '--state', 'open',
    '--search', `${issueSearchText(run.kind)} in:title`,
    '--json', 'number',
    '--jq', '.[0].number',
  ]);
  if (existing) {
    ghText(['issue', 'comment', existing, '--repo', run.repo, '--body', buildCommentBody(run)]);
    console.log(`Commented on existing issue #${existing}.`);
  } else {
    ghText([
      'issue', 'create',
      '--repo', run.repo,
      '--title', issueTitle(run.kind),
      '--body', buildCreationBody(run),
      '--label', issueLabels(run.kind).join(','),
    ]);
    console.log('Created a new failure issue.');
  }
  return 0;
}

// Only run when invoked as a script; importing the module (e.g. in tests)
// must not trigger the CLI path.
const invokedDirectly = process.argv[1]?.endsWith('file-failure-issue.ts');
if (invokedDirectly) {
  process.exit(main());
}
