/**
 * Seam-map guard (#1473).
 *
 *   tsx scripts/check-seams.ts            fail if a mapped path or guard glob matches no file
 *   tsx scripts/check-seams.ts --warn [base]
 *                                         print a ::warning:: per seam the diff touches
 *                                         without a guard spec; always exits 0
 *
 * The map is e2e/seams.json; the pure logic is scripts/seam-rules.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findDeadEntries, findUnguardedSeams, formatWarning, parseSeamMap } from './seam-rules';
import { ensureBaseRef } from './_diff-base';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = path.join(ROOT, 'e2e/seams.json');

function git(...args: string[]): string[] {
  const out = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

const map = parseSeamMap(fs.readFileSync(MAP_PATH, 'utf8'));
const argv = process.argv.slice(2);

if (argv[0] === '--warn') {
  // The base is `origin/main` locally; CI passes `HEAD^1` (the merge commit's base side).
  const branch = process.env.GITHUB_BASE_REF || 'main';
  const ref = argv[1] ?? `origin/${branch}`;
  ensureBaseRef(ref, branch);
  const changed = git('diff', '--name-only', `${ref}...HEAD`);
  const hits = findUnguardedSeams(map, changed);
  for (const hit of hits) console.log(formatWarning(hit));
  console.log(`check-seams: ${changed.length} changed file(s), ${hits.length} seam(s) without a guard change.`);
} else {
  const dead = findDeadEntries(map, git('ls-files'));
  if (dead.length > 0) {
    for (const d of dead) {
      console.error(`::error file=e2e/seams.json::Seam "${d.seam}" ${d.kind} matches no file: ${d.pattern}`);
    }
    process.exit(1);
  }
  console.log(`check-seams: all paths and guards in ${map.seams.length} seams match a file.`);
}
