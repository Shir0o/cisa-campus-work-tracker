/**
 * Draft a RELEASES entry for the in-app "What changed since you last opened
 * this" sheet (issue #546).
 *
 * The sheet's notes are AUTHORED — git subjects are not release notes — but a
 * person needs a starting point. This script reads the git log since the
 * newest release in packages/core/src/releases.ts, groups the commits by
 * conventional-commit type, and prints a draft entry a human edits before it
 * ships. It also prints the current app.json version so the version in the
 * entry can be bumped to match before an EAS build.
 *
 * Usage:
 *   npx tsx scripts/draft-release-notes.ts
 *   npx tsx scripts/draft-release-notes.ts --since 2026-08-01   # or a date/tag
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { RELEASES } from '../packages/core/src/releases.js';

const since = process.argv.includes('--since')
  ? process.argv[process.argv.indexOf('--since') + 1]
  : RELEASES[0]?.date;

const log = (() => {
  try {
    return execSync(
      `git log --pretty=format:"%s%n%b___" --since="${since}" --no-merges`,
      { encoding: 'utf8' },
    );
  } catch {
    return '';
  }
})();

const lines = log
  .split('___')
  .map((s) => s.split('\n').filter(Boolean)[0] ?? '')
  .filter((s) => s.length > 0 && !s.startsWith('docs(') && !s.startsWith('build(') && !s.startsWith('chore('));

const byType = (prefix: string) => lines.filter((l) => l.toLowerCase().startsWith(prefix));
const features = [...byType('feat('), ...byType('feat:')];
const fixes = [...byType('fix('), ...byType('fix:')];

console.log(`# Draft release notes (since ${since})`);
console.log(`# ${features.length + fixes.length} commits of note — EDIT before shipping.`);
console.log('');
console.log('## RELEASES entry');
console.log('```ts');
console.log('  {');
console.log(`    version: 'NEW',   // bump to match the build's app.json version`);
console.log(`    date: '${new Date().toISOString().slice(0, 10)}',`);
console.log("    roles: ['admin', 'manager', 'operator', 'viewer'],");
console.log('    lines: [');
for (const f of features.slice(0, 4)) {
  console.log(`      '${f.replace(/^feat[(:]/i, '').trim()}.',`);
}
for (const f of fixes.slice(0, 2)) {
  console.log(`      '${f.replace(/^fix[(:]/i, '').trim()}.',`);
}
console.log('    ],');
console.log('  },');
console.log('```');

try {
  const appJson = JSON.parse(readFileSync('apps/mobile/app.json', 'utf8'));
  console.log('');
  console.log(`Current app.json version: ${appJson.expo?.version ?? 'unknown'}`);
} catch {
  // Non-fatal — the mobile app may not be present.
}

console.log('');
console.log('Remember: git subjects are NOT release notes. Rewrite these as');
console.log('plain, sentence-case lines about what a full-timer at 9am can now do.');