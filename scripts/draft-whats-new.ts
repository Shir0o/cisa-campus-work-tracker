import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseGitCommitsToDraft } from '../src/scripts/compile-whats-new';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content/whats-new');

export function runDraft() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  // Find latest tag or take last 30 commits
  let commitLines: string[] = [];
  try {
    let gitLog = '';
    const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);

    if (tags.length > 0) {
      const latestTag = tags[0];
      gitLog = execSync(`git log ${latestTag}..HEAD --oneline`, { encoding: 'utf-8' });
    } else {
      gitLog = execSync('git log -n 30 --oneline', { encoding: 'utf-8' });
    }

    commitLines = gitLog
      .split('\n')
      .map((l) => l.replace(/^[a-f0-9]+\s+/, '').trim())
      .filter(Boolean);
  } catch (e) {
    console.warn("Could not read git commits:", e);
  }

  const today = new Date().toISOString().slice(0, 10);
  const version = process.argv[2] || '1.4.0';
  const targetFile = path.join(CONTENT_DIR, `${today}-v${version}.md`);

  if (fs.existsSync(targetFile)) {
    console.error(`Target file ${targetFile} already exists! Not overwriting.`);
    process.exit(1);
  }

  const draft = parseGitCommitsToDraft(commitLines, {
    version,
    date: today,
  });

  fs.writeFileSync(targetFile, draft, 'utf-8');
  console.log(`Drafted new What's New markdown to ${targetFile}`);
}

if (process.argv[1] && process.argv[1].endsWith('draft-whats-new.ts')) {
  runDraft();
}
