/**
 * Colour-token regression guard (#661).
 *
 * Scans only lines added in the current diff for raw hex values and raw
 * Tailwind palette classes in component source. Existing hardcoded colours
 * are intentionally not flagged; this prevents new ones from being
 * introduced without going through a CSS custom property token.
 *
 * Mirrors the i18n regression guard (scripts/check-hardcoded-ui-strings.ts):
 * same diff-scoping approach, same npm-script / CI wiring pattern.
 *
 * The stylesheet (src/index.css) is excluded by file extension — only
 * `.ts` / `.tsx` source under `src/` and `apps/mobile/src/` is scanned, so
 * CSS custom-property definitions are never in scope. Test files are also
 * excluded: they legitimately exercise the patterns the guard is meant to
 * flag, and a guard that fails on its own tests is not runnable.
 */
import { execSync } from 'node:child_process';

// 3, 4, 6, or 8 hex digits — matches the lengths CSS accepts.
const HEX_PATTERN = /#[0-9A-Fa-f]{3,8}\b/g;

// Tailwind palette utilities. The prefix list covers every utility that
// can carry a colour value; the colour list covers every built-in palette.
// Matching is whole-word to avoid e.g. `bg-blueprint` (a custom class).
const PALETTE_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'outline', 'fill', 'stroke',
  'from', 'to', 'via', 'shadow', 'divide', 'placeholder',
  'caret', 'accent', 'decoration',
].join('|');
const PALETTE_COLOURS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
].join('|');
const PALETTE_PATTERN = new RegExp(
  `\\b(?:${PALETTE_PREFIXES})-(?:${PALETTE_COLOURS})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`,
  'g',
);

export type Violation = {
  file: string;
  line: number;
  match: string;
  kind: 'hex' | 'palette';
};

/**
 * Determine whether a single added line should be skipped because it is
 * wholly a comment. The hex regex is otherwise eager and would flag issue
 * references like `(#563)` in a `//` comment.
 *
 * Lines that contain both code and a trailing comment (e.g.
 * `const c = '#ff0000'; // red`) are NOT skipped — the hex is still a
 * violation; the comment doesn't make it one.
 */
export function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

/**
 * Find all raw colour violations on a single added line.
 */
export function findViolations(line: string): Violation[] {
  const violations: Violation[] = [];

  for (const match of line.matchAll(HEX_PATTERN)) {
    violations.push({ file: '', line: 0, match: match[0], kind: 'hex' });
  }

  for (const match of line.matchAll(PALETTE_PATTERN)) {
    violations.push({ file: '', line: 0, match: match[0], kind: 'palette' });
  }

  return violations;
}

export function isTargetFile(path: string): boolean {
  if (!(path.startsWith('src/') || path.startsWith('apps/mobile/src/'))) return false;
  if (!/\.tsx?$/.test(path)) return false;
  // Test files are excluded — they exercise the patterns the guard is
  // designed to flag. A guard that fails on its own tests is not runnable.
  if (/\.(test|spec)\.tsx?$/.test(path)) return false;
  return true;
}

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

/**
 * End-to-end check for one file: read its diff and emit violations, ignoring
 * comment lines. Each violation is annotated with the file it came from.
 */
export function checkFile(file: string, base: string): Violation[] {
  const diff = execSync(`git diff --unified=0 ${base}...HEAD -- ${file}`, {
    encoding: 'utf8',
  });
  const violations: Violation[] = [];
  for (const hit of parseUnifiedDiff(diff)) {
    if (isCommentLine(hit.text)) continue;
    for (const v of findViolations(hit.text)) {
      violations.push({ file, line: hit.line, match: v.match, kind: v.kind });
    }
  }
  return violations;
}

export function run(): void {
  const { ref: base, branch } = getBaseRef();
  ensureBaseRef(base, branch);
  const changedFiles = getChangedFiles(base);
  const targetFiles = changedFiles.filter(isTargetFile);

  if (targetFiles.length === 0) {
    console.log('No web/mobile source files changed; skipping colour-token regression check.');
    return;
  }

  const violations: Violation[] = [];
  for (const file of targetFiles) {
    violations.push(...checkFile(file, base));
  }

  if (violations.length > 0) {
    console.error(
      'Raw colour values detected in this diff. Use CSS custom property tokens (e.g. `bg-surface`, `text-on-surface`, `border-outline-variant`) instead.\n',
    );
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}: ${v.kind} "${v.match}"`);
    }
    process.exit(1);
  }

  console.log('No new raw colour values detected.');
}

// Only run when invoked as a script; importing the module (e.g. in tests)
// must not trigger the CLI exit path.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-hardcoded-colors.ts');
if (invokedDirectly) {
  run();
}