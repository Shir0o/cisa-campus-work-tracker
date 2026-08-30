/**
 * Shared diff helpers for the regression guards.
 *
 * Both `scripts/check-hardcoded-ui-strings.ts` and
 * `scripts/check-hardcoded-colors.ts` walk the same `git diff --unified=0`
 * output against the same base ref. Centralising the helpers keeps the two
 * guards in lockstep — any change to how the base is resolved, how the diff
 * is fetched, or how the post-image line numbers are tracked happens once.
 */
import { execSync } from 'node:child_process';

export function getBaseRef(): { ref: string; branch: string } {
  const branch = process.env.GITHUB_BASE_REF || 'main';
  if (process.argv[2]) {
    return { ref: process.argv[2], branch };
  }
  return { ref: `origin/${branch}`, branch };
}

export function ensureBaseRef(base: string, baseBranch: string): void {
  try {
    execSync(`git rev-parse --verify ${base}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return;
  } catch {
    // Shallow checkout: fetch just the base branch so a PR diff is available.
    execSync(`git fetch --no-tags --depth=1 origin ${baseBranch}:refs/remotes/origin/${baseBranch}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }
}

export function getChangedFiles(base: string): string[] {
  const cmd = `git diff --name-only --diff-filter=ACM ${base}...HEAD`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    // Local fallback: compare against the previous commit when no remote base exists.
    try {
      const out = execSync('git diff --name-only --diff-filter=ACM HEAD~1', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
}

export type DiffHit = {
  file: string;
  line: number;
  text: string;
};

/**
 * Walk a `git diff --unified=0` output and return one entry per added line,
 * carrying the post-image line number so callers can report it.
 */
export function parseUnifiedDiff(diff: string): DiffHit[] {
  const hits: DiffHit[] = [];
  let currentLine = 0;
  for (const rawLine of diff.split('\n')) {
    if (rawLine.startsWith('@@')) {
      const match = rawLine.match(/\+(\d+)(?:,\d+)?/);
      if (match) currentLine = Number(match[1]) - 1;
      continue;
    }
    if (!rawLine.startsWith('+')) continue;
    currentLine++;
    hits.push({ file: '', line: currentLine, text: rawLine.slice(1) });
  }
  return hits;
}