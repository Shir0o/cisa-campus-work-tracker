import fs from 'node:fs';
import path from 'node:path';
import {
  compileHelpManifest,
  type HelpLocale,
  type HelpSource,
} from '../src/scripts/compile-help';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content/help');
const OUTPUT = path.join(ROOT, 'src/generated/help.json');

const SOURCE_PATTERN = /^(.+)\.(en|es)\.md$/;

export function runCompile() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => SOURCE_PATTERN.test(f));

  const sources: HelpSource[] = files.map((file) => {
    const match = SOURCE_PATTERN.exec(file)!;
    return {
      slug: match[1],
      locale: match[2] as HelpLocale,
      raw: fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8'),
    };
  });

  const manifest = compileHelpManifest(sources);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Wrote Help manifest to ${OUTPUT}`);
}

if (process.argv[1] && process.argv[1].endsWith('compile-help.ts')) {
  runCompile();
}
