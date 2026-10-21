/**
 * Shared diff helpers for the regression guards.
 *
 * Both `scripts/check-hardcoded-ui-strings.ts` and
 * `scripts/check-hardcoded-colors.ts` walk the same `git diff --unified=0`
 * output against the same base ref. Centralising the helpers keeps the two
 * guards in lockstep — any change to how the base is resolved, how the diff
 * is fetched, or how the post-image line numbers are tracked happens once.
 */
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';

const QUIET: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] };

function revExists(rev: string): boolean {
  try {
    execSync(`git rev-parse --verify --quiet ${rev}`, QUIET);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the ref to diff against. On a `pull_request` run, CI checks out
 * GitHub's merge commit, whose first parent is the base the PR was merged
 * into — diff against that rather than a re-fetched `origin/<base>`, which
 * may have moved past the shallow history and share no merge base with HEAD.
 */
export function getBaseRef(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): { ref: string; branch: string } {
  const branch = env.GITHUB_BASE_REF || 'main';
  if (argv[2]) {
    return { ref: argv[2], branch };
  }
  if (env.GITHUB_EVENT_NAME === 'pull_request' && revExists('HEAD^2')) {
    return { ref: 'HEAD^1', branch };
  }
  return { ref: `origin/${branch}`, branch };
}

export function ensureBaseRef(base: string, baseBranch: string): void {
  if (revExists(base)) return;
  try {
    // Shallow checkout: fetch just the base branch so a PR diff is available.
    execSync(`git fetch --no-tags --depth=1 origin ${baseBranch}:refs/remotes/origin/${baseBranch}`, QUIET);
  } catch {
    // No remote (or no network): the diff helpers fall back to HEAD~1.
  }
}

/**
 * Run `git diff <args> <base>...HEAD`, falling back to `HEAD~1` when the base
 * is missing or shares no merge base with HEAD. Never throws.
 */
function diffAgainstBase(base: string, args: string, pathspec = ''): string {
  try {
    return execSync(`git diff ${args} ${base}...HEAD ${pathspec}`, QUIET);
  } catch {
    // Local fallback: compare against the previous commit when no usable base exists.
    try {
      return execSync(`git diff ${args} HEAD~1 ${pathspec}`, QUIET);
    } catch {
      return '';
    }
  }
}

export function getChangedFiles(base: string): string[] {
  return diffAgainstBase(base, '--name-only --diff-filter=ACM')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getFileDiff(base: string, file: string): string {
  return diffAgainstBase(base, '--unified=0', `-- ${file}`);
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