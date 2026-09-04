import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  compileWhatsNewManifest,
  parseGitCommitsToDraft,
} from '../src/scripts/compile-whats-new';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content/whats-new');
const WEB_OUTPUT = path.join(ROOT, 'src/generated/whats-new.json');
const MOBILE_OUTPUT = path.join(ROOT, 'apps/mobile/assets/whats-new.json');

export function runCompile() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  let files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));

  // Fallback: If no markdown files exist, draft one from git commits
  if (files.length === 0) {
    console.log("No markdown files found in content/whats-new. Generating fallback from recent git commits...");
    let commitLines: string[] = [];
    try {
      const gitLog = execSync('git log -n 20 --oneline', { encoding: 'utf-8' });
      commitLines = gitLog
        .split('\n')
        .map((l) => l.replace(/^[a-f0-9]+\s+/, '').trim())
        .filter(Boolean);
    } catch (e) {
      console.warn("Could not read git commits for fallback:", e);
    }

    const today = new Date().toISOString().slice(0, 10);
    const fallbackDraft = parseGitCommitsToDraft(commitLines, {
      version: '1.0.0',
      date: today,
    });

    const fallbackPath = path.join(CONTENT_DIR, `${today}-v1.0.0.md`);
    fs.writeFileSync(fallbackPath, fallbackDraft, 'utf-8');
    files = [path.basename(fallbackPath)];
  }

  const markdownDocs = files.map((f) =>
    fs.readFileSync(path.join(CONTENT_DIR, f), 'utf-8')
  );

  const manifest = compileWhatsNewManifest(markdownDocs);

  // Write to web generated dir
  fs.mkdirSync(path.dirname(WEB_OUTPUT), { recursive: true });
  fs.writeFileSync(WEB_OUTPUT, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Wrote What's New manifest to ${WEB_OUTPUT}`);

  // Write to mobile assets dir
  fs.mkdirSync(path.dirname(MOBILE_OUTPUT), { recursive: true });
  fs.writeFileSync(MOBILE_OUTPUT, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Wrote What's New manifest to ${MOBILE_OUTPUT}`);
}

if (process.argv[1] && process.argv[1].endsWith('compile-whats-new.ts')) {
  runCompile();
}
