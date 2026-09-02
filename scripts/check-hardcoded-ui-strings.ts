/**
 * i18n regression guard (#477).
 *
 * Scans only lines added in the current diff for raw English UI strings in
 * JSX text or common UI attributes. Existing hardcoded strings are intentionally
 * not flagged; this prevents new ones from being introduced without a t() key.
 *
 * Base helpers (`getBaseRef`, `ensureBaseRef`, `getChangedFiles`,
 * `parseUnifiedDiff`) are shared with the colour-token regression guard via
 * `scripts/_diff-base.ts`.
 */
import { execSync } from 'node:child_process';
import {
  getBaseRef,
  ensureBaseRef,
  getChangedFiles,
  parseUnifiedDiff,
} from './_diff-base';

const UI_ATTRIBUTES: Record<string, true> = {
  placeholder: true,
  'aria-label': true,
  title: true,
  alt: true,
  label: true,
};

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
    if (!UI_ATTRIBUTES[attr]) continue;
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
    (f) =>
      (f.startsWith('src/') || f.startsWith('apps/mobile/src/')) &&
      /\.tsx?$/.test(f) &&
      !/\.(test|spec)\.tsx?$/.test(f) &&
      !/\/test\//.test(f),
  );

  if (targetFiles.length === 0) {
    console.log('No web/mobile source files changed; skipping i18n hardcoded string check.');
    return;
  }

  const allViolations: string[] = [];
  for (const file of targetFiles) {
    const diff = execSync(`git diff --unified=0 ${base}...HEAD -- ${file}`, { encoding: 'utf8' });
    for (const hit of parseUnifiedDiff(diff)) {
      allViolations.push(...findViolations(hit.text, file, hit.line));
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