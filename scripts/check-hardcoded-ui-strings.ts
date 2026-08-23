/**
 * i18n regression guard (#477).
 *
 * Scans only lines added in the current diff for raw English UI strings in
 * JSX text or common UI attributes. Existing hardcoded strings are intentionally
 * not flagged; this prevents new ones from being introduced without a t() key.
 */
import { execSync } from 'node:child_process';

const UI_ATTRIBUTES = new Set(['placeholder', 'aria-label', 'title', 'alt', 'label']);

function execOrThrow(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
}

function ensureBaseRef(base: string, baseBranch: string): void {
  try {
    execSync(`git rev-parse --verify ${base}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return;
  } catch {
    // Shallow checkout: fetch just the base branch so a PR diff is available.
    execSync(`git fetch --no-tags --depth=1 origin ${baseBranch}:refs/remotes/origin/${baseBranch}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }
}

function getChangedFiles(base: string): string[] {
  const cmd = `git diff --name-only --diff-filter=ACM ${base}...HEAD`;
  try {
    const out = execOrThrow(cmd);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    // Local fallback: compare against the previous commit when no remote base exists.
    try {
      const out = execOrThrow('git diff --name-only --diff-filter=ACM HEAD~1');
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
}

function getBaseRef(): { ref: string; branch: string } {
  const branch = process.env.GITHUB_BASE_REF || 'main';
  if (process.argv[2]) {
    return { ref: process.argv[2], branch };
  }
  return { ref: `origin/${branch}`, branch };
}

function looksLikeEnglishText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 2) return false;
  // Allow obvious non-translatable values.
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^[\d\s().+\-/]+$/.test(trimmed)) return false;
  // Require at least one alphabetic word with 3+ letters.
  return /[A-Za-z]{3,}/.test(trimmed);
}

function findViolations(line: string, file: string, lineNo: number): string[] {
  const violations: string[] = [];

  // JSX text: >Visible text<
  const textPattern = />\s*([^<>{}]+?)\s*</g;
  let textMatch: RegExpExecArray | null;
  while ((textMatch = textPattern.exec(line)) !== null) {
    const text = textMatch[1];
    if (looksLikeEnglishText(text) && !text.startsWith('{') && !text.includes('${')) {
      violations.push(`${file}:${lineNo}: JSX text "${text.trim()}"`);
    }
  }

  // UI attributes: placeholder="...", aria-label="...", title="...", alt="...", label="..."
  const attrPattern = /\b(placeholder|aria-label|title|alt|label)="([^"]*)"/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrPattern.exec(line)) !== null) {
    const attr = attrMatch[1];
    if (!UI_ATTRIBUTES.has(attr)) continue;
    const value = attrMatch[2];
    if (looksLikeEnglishText(value)) {
      violations.push(`${file}:${lineNo}: ${attr}="${value}"`);
    }
  }

  return violations;
}

function run(): void {
  const { ref: base, branch } = getBaseRef();
  ensureBaseRef(base, branch);
  const changedFiles = getChangedFiles(base);
  const targetFiles = changedFiles.filter(
    (f) => (f.startsWith('src/') || f.startsWith('apps/mobile/src/')) && /\.tsx?$/.test(f),
  );

  if (targetFiles.length === 0) {
    console.log('No web/mobile source files changed; skipping i18n hardcoded string check.');
    return;
  }

  const allViolations: string[] = [];
  for (const file of targetFiles) {
    const diff = execSync(`git diff --unified=0 ${base}...HEAD -- ${file}`, { encoding: 'utf8' });
    let currentLine = 0;
    for (const rawLine of diff.split('\n')) {
      if (rawLine.startsWith('@@')) {
        const match = rawLine.match(/\+(\d+)(?:,\d+)?/);
        if (match) currentLine = Number(match[1]) - 1;
        continue;
      }
      if (!rawLine.startsWith('+')) continue;
      currentLine++;
      const added = rawLine.slice(1);
      allViolations.push(...findViolations(added, file, currentLine));
    }
  }

  if (allViolations.length > 0) {
    console.error('Hardcoded user-facing UI strings detected in this diff. Use t() with en/es dictionary keys instead.\n');
    for (const v of allViolations) console.error(`  ${v}`);
    process.exit(1);
  }

  console.log('No new hardcoded UI strings detected.');
}

run();
