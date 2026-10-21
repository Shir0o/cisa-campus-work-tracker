import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function getWorkflowPermissions(content: string): {
  hasTopLevelPermissions: boolean;
  jobsWithoutPermissions: string[];
} {
  const lines = content.split('\n');
  let hasTopLevelPermissions = false;
  let inJobs = false;
  let currentJob: string | null = null;
  const jobPermissions = new Map<string, boolean>();

  for (const line of lines) {
    // Ignore commented lines
    if (line.trim().startsWith('#')) continue;

    // Check top-level permissions (non-indented)
    if (/^permissions:\s*$/.test(line)) {
      hasTopLevelPermissions = true;
      continue;
    }

    // Check top-level jobs section
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }

    // Top-level key other than jobs
    if (/^[a-zA-Z0-9_-]+:\s*/.test(line)) {
      inJobs = false;
      currentJob = null;
      continue;
    }

    if (inJobs) {
      // 2-space indentation indicates a job definition
      const jobMatch = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
      if (jobMatch) {
        currentJob = jobMatch[1];
        jobPermissions.set(currentJob, false);
        continue;
      }

      // 4-space indentation permissions: under a job
      if (currentJob && /^    permissions:\s*$/.test(line)) {
        jobPermissions.set(currentJob, true);
        continue;
      }
    }
  }

  const jobsWithoutPermissions: string[] = [];
  for (const [job, hasPerms] of jobPermissions.entries()) {
    if (!hasPerms) {
      jobsWithoutPermissions.push(job);
    }
  }

  return {
    hasTopLevelPermissions,
    jobsWithoutPermissions,
  };
}

describe('GitHub Actions workflow permissions', () => {
  const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
  const files = fs
    .readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  it('ensures every active workflow defines top-level permissions or explicit job permissions', () => {
    const unhardenedWorkflows: Array<{ file: string; details: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');

      // Skip fully commented or disabled workflows (e.g. codeql.yml)
      const nonCommentLines = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
      if (nonCommentLines.length === 0) continue;

      const { hasTopLevelPermissions, jobsWithoutPermissions } =
        getWorkflowPermissions(content);

      if (!hasTopLevelPermissions && jobsWithoutPermissions.length > 0) {
        unhardenedWorkflows.push({
          file,
          details: `Missing top-level permissions and jobs lacking permissions: ${jobsWithoutPermissions.join(', ')}`,
        });
      }
    }

    expect(unhardenedWorkflows).toEqual([]);
  });
});
