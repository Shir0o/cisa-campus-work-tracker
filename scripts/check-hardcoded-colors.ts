/**
 * Colour-token regression guard (#661, #669).
 *
 * Scans only lines added in the current diff for raw hex values and raw
 * Tailwind palette classes in component source. Existing hardcoded colours
 * are intentionally not flagged; this prevents new ones from being
 * introduced without going through a CSS custom property token.
 *
 * Mirrors the i18n regression guard (scripts/check-hardcoded-ui-strings.ts):
 * same diff-scoping approach, same npm-script / CI wiring pattern, and
 * shared base helpers via scripts/_diff-base.ts.
 *
 * The stylesheet (src/index.css) is excluded by file extension — only
 * `.ts` / `.tsx` source under `src/` and `apps/mobile/src/` is scanned, so
 * CSS custom-property definitions are never in scope. Test files are also
 * excluded: they legitimately exercise the patterns the guard is meant to
 * flag, and a guard that fails on its own tests is not runnable.
 */
/// <reference types="node" />
import { execSync } from 'node:child_process';
import {
  getBaseRef,
  ensureBaseRef,
  getChangedFiles,
  parseUnifiedDiff,
} from './_diff-base';

// 3, 4, 6, or 8 hex digits — matches the lengths CSS accepts.
const HEX_PATTERN = /#[0-9A-Fa-f]{3,8}\b/g;

// Tailwind palette utilities. The prefix list covers every utility that
// can carry a colour value; the colour list covers every built-in palette;
// the shade list covers every weight Tailwind ships. A new prefix/colour/
// shade that lands in Tailwind but is not added here is silent — drive
// updates from this single constant and the CI lint will not catch a miss,
// so review this table when bumping Tailwind.
const PALETTE_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'outline', 'fill', 'stroke',
  'from', 'to', 'via', 'shadow', 'divide', 'placeholder',
  'caret', 'accent', 'decoration',
];
const PALETTE_COLOURS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
];
const PALETTE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const PALETTE_PATTERN = new RegExp(
  `\\b(?:${PALETTE_PREFIXES.join('|')})-(?:${PALETTE_COLOURS.join('|')})-(?:${PALETTE_SHADES.join('|')})\\b`,
  'g',
);

export type ViolationKind = 'hex' | 'palette';

export type RawHit = {
  match: string;
  kind: ViolationKind;
};

/**
 * Find all raw colour matches on a single added line. Producer-side —
 * file/line context is added by the caller after parsing the diff.
 */
export function findRawHits(line: string): RawHit[] {
  const hits: RawHit[] = [];
  for (const match of line.matchAll(HEX_PATTERN)) {
    hits.push({ match: match[0], kind: 'hex' });
  }
  for (const match of line.matchAll(PALETTE_PATTERN)) {
    hits.push({ match: match[0], kind: 'palette' });
  }
  return hits;
}

export type Violation = RawHit & {
  file: string;
  line: number;
};

/**
 * Determine whether a single added line should be skipped because it is
 * wholly a comment. The hex regex is otherwise eager and would flag issue
 * references like `(#563)` in a `//` comment or in a JSX one.
 *
 * Lines that contain both code and a trailing comment (e.g.
 * `const c = '#ff0000'; // red`) are NOT skipped — the hex is still a
 * violation; the comment doesn't make it one.
 */
export function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    // JSX comments open with `{/*` — the same issue-reference false positive.
    trimmed.startsWith('{/*')
  );
}

export function isTargetFile(path: string): boolean {
  if (!(path.startsWith('src/') || path.startsWith('apps/mobile/src/'))) return false;
  if (!/\.tsx?$/.test(path)) return false;
  // Test files are excluded — they exercise the patterns the guard is
  // designed to flag. A guard that fails on its own tests is not runnable.
  if (/\.(test|spec)\.tsx?$/.test(path)) return false;
  return true;
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
    for (const raw of findRawHits(hit.text)) {
      violations.push({ file, line: hit.line, ...raw });
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