/**
 * Version-consistency guard (#1020).
 *
 * The mobile app's version and build numbers are derived at config-evaluation
 * time, never committed. This guard fails the build if a version literal is
 * committed back into the static app config.
 * See docs/adr/0025-derived-mobile-app-version.md.
 *
 * Mirrors the regression-guard pattern of check-hardcoded-colors.ts /
 * check-hardcoded-ui-strings.ts: a thin CLI over pure logic in
 * scripts/version-rules.ts, with the logic unit-tested from src/test/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateVersionConsistency } from './version-rules';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = path.join(ROOT, 'apps/mobile/app.json');

function readStaticConfig(): unknown {
  return JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
}

function main(): void {
  const { failures } = evaluateVersionConsistency({
    staticConfig: readStaticConfig(),
  });

  for (const failure of failures) {
    console.error(`::error::${failure}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
  console.log('Version consistency OK: nothing version-like is committed.');
}

main();
