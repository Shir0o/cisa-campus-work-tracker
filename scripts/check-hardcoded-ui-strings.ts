/**
 * i18n regression guards (#477, #1471).
 *
 * Two checks share this entry point, both run by `npm run check:i18n`:
 *
 *  1. Hardcoded-string guard — scans only lines added in the current diff for
 *     raw English UI strings in JSX text or common UI attributes. Existing
 *     hardcoded strings are intentionally not flagged; this prevents new ones
 *     from being introduced without a t() key.
 *  2. Mobile key guard — a full-tree scan of `apps/mobile/src` for static
 *     `t('mobile.…')` keys, failing when any key is absent from the phone
 *     locale files (en.json / es.json). This is the flight recorder for escape
 *     row 14 (#740 deleted `mobile.contact.how_we_met` while the sheet still
 *     used it). The scan is scoped to the `mobile.` namespace — the keys the
 *     app owns — mirroring the #1415 mobile jest guard; the legacy root
 *     dictionary (actions/common/…) predates this guard and is out of scope.
 *
 * Base helpers (`getBaseRef`, `ensureBaseRef`, `getChangedFiles`,
 * `parseUnifiedDiff`) are shared with the colour-token regression guard via
 * `scripts/_diff-base.ts`.
 */
/// <reference types="node" />
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Collect static `t('mobile.…')` / t("mobile.…") / t(`mobile.…`) keys used in a
 * source tree.
 *
 * Interpolated template keys (`t(\`mobile.board.audience_${audience}\`)`) are
 * skipped: their runtime value cannot be known statically. Test files are
 * skipped for the same reason the string guard skips them.
 */
export function collectUsedMobileKeys(root: string): string[] {
  const keys = new Set<string>();
  // Only `mobile.` string literals: the backreference requires the closing
  // quote to match, and the char class excludes `$`/`{`/`}`, so template
  // interpolation never matches.
  const pattern = /\bt\(\s*(['"`])(mobile\.[A-Za-z0-9_.]+)\1/g;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(pattern)) keys.add(m[2]);
      }
    }
  };
  walk(root);
  return [...keys].sort();
}

export function resolvesKey(dict: unknown, key: string): boolean {
  let cur: any = dict;
  for (const segment of key.split('.')) {
    if (cur && typeof cur === 'object' && segment in cur) cur = cur[segment];
    else return false;
  }
  return typeof cur === 'string';
}

export type MobileKeyViolation = { lang: string; key: string };

export function findMissingMobileKeys(
  usedKeys: string[],
  dictionaries: Record<string, unknown>,
): MobileKeyViolation[] {
  const missing: MobileKeyViolation[] = [];
  for (const [lang, dict] of Object.entries(dictionaries)) {
    for (const key of usedKeys) {
      if (!resolvesKey(dict, key)) missing.push({ lang, key });
    }
  }
  return missing;
}

const MOBILE_SRC_DIR = 'apps/mobile/src';
const MOBILE_LOCALE_FILES: Record<string, string> = {
  en: 'apps/mobile/src/locales/en.json',
  es: 'apps/mobile/src/locales/es.json',
};

export function checkMobileI18n(
  sourceDir: string = MOBILE_SRC_DIR,
  localeFiles: Record<string, string> = MOBILE_LOCALE_FILES,
): MobileKeyViolation[] {
  const usedKeys = collectUsedMobileKeys(sourceDir);
  const dictionaries: Record<string, unknown> = {};
  for (const [lang, file] of Object.entries(localeFiles)) {
    dictionaries[lang] = JSON.parse(readFileSync(file, 'utf8'));
  }
  return findMissingMobileKeys(usedKeys, dictionaries);
}

/**
 * Diff-scoped hardcoded-string guard. Returns the violations it found, logging
 * a skip notice when no web/mobile source changed.
 */
function checkHardcodedStrings(): string[] {
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
    return [];
  }

  const allViolations: string[] = [];
  for (const file of targetFiles) {
    const diff = execSync(`git diff --unified=0 ${base}...HEAD -- ${file}`, { encoding: 'utf8' });
    for (const hit of parseUnifiedDiff(diff)) {
      allViolations.push(...findViolations(hit.text, file, hit.line));
    }
  }
  return allViolations;
}

export function run(): void {
  let failed = false;

  const stringViolations = checkHardcodedStrings();
  if (stringViolations.length > 0) {
    console.error('Hardcoded user-facing UI strings detected in this diff. Use t() with en/es dictionary keys instead.\n');
    for (const v of stringViolations) console.error(`  ${v}`);
    failed = true;
  } else {
    console.log('No new hardcoded UI strings detected.');
  }

  const missingMobileKeys = checkMobileI18n();
  if (missingMobileKeys.length > 0) {
    console.error('Mobile t() keys missing from the phone locales. Add them to apps/mobile/src/locales/en.json and es.json.\n');
    for (const v of missingMobileKeys) console.error(`  ${v.lang}: ${v.key}`);
    failed = true;
  } else {
    console.log('All mobile t() keys resolve in the phone locales.');
  }

  if (failed) process.exit(1);
}

// Only run when invoked as a script; importing the module (e.g. in tests)
// must not trigger the CLI exit path.
const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith('check-hardcoded-ui-strings.ts');
if (invokedDirectly) {
  run();
}
