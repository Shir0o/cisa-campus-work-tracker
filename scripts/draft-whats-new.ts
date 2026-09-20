// THE single drafting entry point for a release record (issue #1021).
//
// Writes one markdown file in content/whats-new/ for the given --version: the
// announcement bullets plus a starting set of Release Nudge `lines` a human
// edits. The diff range is taken from the newest *already-authored* whats-new
// release below the target, so a draft always covers the commits not yet
// announced — not the unreleased commits sitting on top of the newest tag.
//
// The retired draft-release-notes.ts used to draft the nudge separately.
//
// Usage:
//   npx tsx scripts/draft-whats-new.ts --version 1.6.0
//   npx tsx scripts/draft-whats-new.ts --version 1.6.0 --date 2026-09-17
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  parseGitCommitsToDraft,
  resolveDraftRangeBase,
} from '../src/scripts/compile-whats-new';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content/whats-new');

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readAuthoredVersions(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
      const match = /^version:\s*(.+)$/m.exec(raw);
      return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
    })
    .filter(Boolean);
}

/** The tag's author date (YYYY-MM-DD), else today. */
function resolveDate(version: string): string {
  const fromArg = argValue('--date');
  if (fromArg) return fromArg;
  try {
    const date = execSync(`git log -1 --format=%cs v${version}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch {
    // No tag yet (pre-release draft): fall through to today.
  }
  return new Date().toISOString().slice(0, 10);
}

export function runDraft() {
  const version = argValue('--version');
  if (!version) {
    console.error('Missing required --version (e.g. --version 1.6.0).');
    process.exit(1);
  }

  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const base = resolveDraftRangeBase(readAuthoredVersions(), version);
  const tag = (v: string) => (/^v/.test(v) ? v : `v${v}`);
  const range = base ? `${tag(base)}..${tag(version)}` : tag(version);

  let commitLines: string[] = [];
  try {
    const gitLog = execSync(`git log ${range} --oneline`, { encoding: 'utf8' });
    commitLines = gitLog
      .split('\n')
      .map((l) => l.replace(/^[a-f0-9]+\s+/, '').trim())
      .filter(Boolean);
  } catch (e) {
    console.warn(`Could not read git log for range '${range}':`, e);
  }

  const date = resolveDate(version);
  const targetFile = path.join(CONTENT_DIR, `${date}-v${version}.md`);

  if (fs.existsSync(targetFile)) {
    console.error(`Target file ${targetFile} already exists! Not overwriting.`);
    process.exit(1);
  }

  const draft = parseGitCommitsToDraft(commitLines, { version, date });
  fs.writeFileSync(targetFile, draft, 'utf-8');
  console.log(`Drafted What's New for v${version} (range ${range}) -> ${targetFile}`);
}

if (process.argv[1] && process.argv[1].endsWith('draft-whats-new.ts')) {
  runDraft();
}