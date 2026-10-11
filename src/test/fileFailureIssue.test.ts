import { describe, it, expect } from 'vitest';
import {
  classifyWorkflow,
  issueTitle,
  issueSearchText,
  issueLabels,
  extractFailingTargets,
  buildCreationBody,
  buildCommentBody,
  parseNumberList,
  buildRunFromEnv,
  dryRunText,
  type FailureRun,
} from '../../scripts/file-failure-issue';

const webRun: FailureRun = {
  kind: 'web-e2e',
  workflowName: 'Web E2E (Playwright)',
  repo: 'Shir0o/cisa-campus-work-tracker',
  runNumber: '42',
  runAttempt: '2',
  runUrl: 'https://github.com/Shir0o/cisa-campus-work-tracker/actions/runs/42',
  commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
  commitMessage: 'feat: break the trainee journey',
  commitAuthor: 'Octo Cat',
  prNumbers: [123],
  failedJobs: ['E2E Playwright (shard 1/2, emulator)'],
  failingTargets: ['journeys/trainee.spec.ts'],
};

const ciRun: FailureRun = {
  kind: 'ci',
  workflowName: 'CI',
  repo: 'Shir0o/cisa-campus-work-tracker',
  runNumber: '7',
  runAttempt: '1',
  runUrl: 'https://github.com/Shir0o/cisa-campus-work-tracker/actions/runs/7',
  commitSha: '1234567abc',
  commitMessage: 'fix: something',
  commitAuthor: 'Jane Dev',
  prNumbers: [],
  failedJobs: ['Lint & Test'],
  failingTargets: [],
};

describe('file-failure-issue — workflow classification', () => {
  it('maps the three watched workflows', () => {
    expect(classifyWorkflow('CI')).toBe('ci');
    expect(classifyWorkflow('Web E2E (Playwright)')).toBe('web-e2e');
    expect(classifyWorkflow('Mobile E2E (Maestro)')).toBe('mobile-e2e');
  });

  it('ignores unwatched workflows', () => {
    expect(classifyWorkflow('Deploy Pages')).toBeNull();
    expect(classifyWorkflow('')).toBeNull();
  });
});

describe('file-failure-issue — issue identity', () => {
  it('keeps one title per workflow so the issues never collide', () => {
    expect(issueTitle('ci')).toBe('🚨 CI failure on main branch');
    expect(issueTitle('web-e2e')).toBe('🚨 Web E2E failure on main');
    expect(issueTitle('mobile-e2e')).toBe('🚨 Mobile E2E failure on main');
  });

  it('searches by the title text without the emoji', () => {
    expect(issueSearchText('ci')).toBe('CI failure on main branch');
    expect(issueSearchText('web-e2e')).toBe('Web E2E failure on main');
    expect(issueSearchText('mobile-e2e')).toBe('Mobile E2E failure on main');
  });

  it('preserves the CI labels and files e2e issues as agent-ready bugs', () => {
    expect(issueLabels('ci')).toEqual(['needs-triage', 'bug', 'github_actions']);
    expect(issueLabels('web-e2e')).toEqual(['bug', 'ready-for-agent']);
    expect(issueLabels('mobile-e2e')).toEqual(['bug', 'ready-for-agent']);
  });
});

describe('file-failure-issue — extractFailingTargets', () => {
  it('pulls Playwright spec paths out of the failed-run log', () => {
    const log = [
      'e2e-emulator (1/2, emulator)\tRun E2E tests\t2026-10-11T00:00:00Z\t  1) [chromium] › journeys/trainee.spec.ts:42:1 › Trainee journey › logs an interaction',
      'e2e-emulator (1/2, emulator)\tRun E2E tests\t2026-10-11T00:00:01Z\t  1 failed',
      'e2e-emulator (1/2, emulator)\tRun E2E tests\t2026-10-11T00:00:02Z\t    [chromium] › journeys/trainee.spec.ts:42:1 › Trainee journey',
      'e2e-emulator (2/2, emulator)\tRun E2E tests\t2026-10-11T00:00:03Z\t  1) [chromium] › journeys/full-timer.spec.ts:9:1 › move step',
    ].join('\n');
    expect(extractFailingTargets('web-e2e', log)).toEqual([
      'journeys/full-timer.spec.ts',
      'journeys/trainee.spec.ts',
    ]);
  });

  it('normalises absolute CI paths down to the repo-relative spec', () => {
    const log =
      '/home/runner/work/cisa/cisa/e2e/journeys/signup.spec.ts:1:1 › submits the form';
    expect(extractFailingTargets('web-e2e', log)).toEqual(['e2e/journeys/signup.spec.ts']);
  });

  it('pulls Maestro flow names and paths out of the failed-run log', () => {
    const log = [
      '[Failed] Launch the app',
      'Run ./.maestro/login-flow.yaml',
      '[Failed] Login flow',
    ].join('\n');
    const targets = extractFailingTargets('mobile-e2e', log);
    expect(targets).toContain('Launch the app');
    expect(targets).toContain('Login flow');
    expect(targets).toContain('./.maestro/login-flow.yaml');
  });

  it('returns nothing for CI runs or empty logs', () => {
    expect(extractFailingTargets('ci', 'anything')).toEqual([]);
    expect(extractFailingTargets('web-e2e', '')).toEqual([]);
  });

  it('deduplicates repeated hits', () => {
    const log = 'a.spec.ts:1:1\nb.spec.ts\nb.spec.ts:2:2';
    expect(extractFailingTargets('web-e2e', log)).toEqual(['a.spec.ts', 'b.spec.ts']);
  });
});

describe('file-failure-issue — buildCreationBody', () => {
  it('names the failing spec and the triggering PR for a web e2e run', () => {
    const body = buildCreationBody(webRun);
    expect(body).toContain('Web E2E (Playwright)');
    expect(body).toContain('Failing specs');
    expect(body).toContain('`journeys/trainee.spec.ts`');
    expect(body).toContain('[#123](https://github.com/Shir0o/cisa-campus-work-tracker/pull/123)');
    expect(body).toContain('Stop the line');
  });

  it('names failing flows for a mobile run', () => {
    const body = buildCreationBody({
      ...webRun,
      kind: 'mobile-e2e',
      workflowName: 'Mobile E2E (Maestro)',
      failingTargets: ['Login flow'],
    });
    expect(body).toContain('Failing flows');
    expect(body).toContain('`Login flow`');
  });

  it('falls back to the failed job names when no spec could be parsed', () => {
    const body = buildCreationBody({
      ...webRun,
      failingTargets: [],
      failedJobs: ['E2E Playwright (shard 1/2, emulator)'],
    });
    expect(body).toContain('Could not parse');
    expect(body).toContain('E2E Playwright (shard 1/2, emulator)');
  });

  it('preserves the legacy CI issue body', () => {
    const body = buildCreationBody(ciRun);
    expect(body).toContain('Continuous Integration failed on `main`');
    expect(body).toContain('A commit pushed to the `main` branch failed the CI workflow.');
    expect(body).toContain('Open a fix branch or revert the breaking commit.');
  });

  it('says so when there is no associated pull request', () => {
    const body = buildCreationBody({ ...webRun, prNumbers: [] });
    expect(body).toContain('No associated pull request');
  });
});

describe('file-failure-issue — buildCommentBody', () => {
  it('comments the new failing spec on a repeat web e2e failure', () => {
    const comment = buildCommentBody(webRun);
    expect(comment).toContain('Additional Web E2E (Playwright) failure on `main`');
    expect(comment).toContain('`journeys/trainee.spec.ts`');
    expect(comment).toContain('#42');
  });

  it('preserves the legacy CI repeat comment', () => {
    const comment = buildCommentBody(ciRun);
    expect(comment).toContain('### Additional CI failure on `main`');
  });
});

describe('file-failure-issue — env plumbing', () => {
  it('parses comma and newline separated PR numbers', () => {
    expect(parseNumberList('12,34\n56')).toEqual([12, 34, 56]);
    expect(parseNumberList('')).toEqual([]);
    expect(parseNumberList(undefined)).toEqual([]);
  });

  it('returns null for an unwatched workflow', () => {
    expect(buildRunFromEnv({ WORKFLOW_NAME: 'Deploy Pages' })).toBeNull();
  });

  it('reads failing specs from the failed log file', () => {
    const run = buildRunFromEnv({
      WORKFLOW_NAME: 'Web E2E (Playwright)',
      GH_REPO: 'o/r',
      RUN_NUMBER: '1',
      RUN_ATTEMPT: '1',
      RUN_URL: 'u',
      COMMIT_SHA: 'abc',
      COMMIT_MESSAGE: 'm',
      COMMIT_AUTHOR: 'a',
      PR_NUMBERS: '5',
      FAILED_JOBS: 'job 1',
      FAILED_LOG_TEXT: '› e2e/x.spec.ts:1:1 › fails',
    });
    expect(run?.kind).toBe('web-e2e');
    expect(run?.failingTargets).toEqual(['e2e/x.spec.ts']);
    expect(run?.prNumbers).toEqual([5]);
  });
});

describe('file-failure-issue — dry run', () => {
  it('prints the title, labels and both body variants without touching GitHub', () => {
    const text = dryRunText(webRun);
    expect(text).toContain('DRY RUN');
    expect(text).toContain(issueTitle('web-e2e'));
    expect(text).toContain('bug,ready-for-agent');
    expect(text).toContain('--- issue body (create) ---');
    expect(text).toContain('--- issue body (repeat failure comment) ---');
  });
});
