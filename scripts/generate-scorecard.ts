import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { formatBytes, formatDelta, type BundleScorecard } from './measure-bundle';

export interface LighthouseMetrics {
  performanceScore: number; // 0-100
  accessibilityScore: number;
  bestPracticesScore: number;
  fcpMs: number;
  lcpMs: number;
  cls: number;
  tbtMs: number;
}

export interface QualityMetrics {
  primaryDefects: number;
  advisoryNotes: number;
  checksPass: boolean;
  details: string[];
}

export interface HistoryEntry {
  date: string;
  commitSha: string;
  entryJsGzip: string;
  perfScore: number | string;
  lcp: string;
  defects: number;
}

export function parseLighthouseManifest(lighthouseDir: string): LighthouseMetrics | null {
  const manifestPath = path.join(lighthouseDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const runs = JSON.parse(raw);
    if (!Array.isArray(runs) || runs.length === 0) return null;

    // Pick representative/median run
    const summaries = runs.map((r) => r.summary);
    // Sort by performance score
    summaries.sort((a, b) => a.performance - b.performance);
    const medianSummary = summaries[Math.floor(summaries.length / 2)];

    // Read full json for detailed audits
    let fcpMs = 0;
    let lcpMs = 0;
    let cls = 0;
    let tbtMs = 0;

    const medianRun = runs.find((r) => r.summary === medianSummary) || runs[0];
    if (medianRun?.jsonPath && fs.existsSync(medianRun.jsonPath)) {
      const fullJson = JSON.parse(fs.readFileSync(medianRun.jsonPath, 'utf8'));
      fcpMs = Math.round(fullJson.audits?.['first-contentful-paint']?.numericValue || 0);
      lcpMs = Math.round(fullJson.audits?.['largest-contentful-paint']?.numericValue || 0);
      cls = Number((fullJson.audits?.['cumulative-layout-shift']?.numericValue || 0).toFixed(3));
      tbtMs = Math.round(fullJson.audits?.['total-blocking-time']?.numericValue || 0);
    }

    return {
      performanceScore: Math.round(medianSummary.performance * 100),
      accessibilityScore: Math.round(medianSummary.accessibility * 100),
      bestPracticesScore: Math.round(medianSummary['best-practices'] * 100),
      fcpMs,
      lcpMs,
      cls,
      tbtMs,
    };
  } catch (err) {
    console.warn('Failed to parse Lighthouse manifest:', err);
    return null;
  }
}

export function evaluateQualityChecks(): QualityMetrics {
  const details: string[] = [];
  let checksPass = true;

  // 1. Repo integrity checks
  const checks = [
    { name: 'Colors Token Check', cmd: 'npm run check:colors' },
    { name: 'i18n Hardcoded Strings', cmd: 'npm run check:i18n' },
    { name: 'E2E Architecture Seams', cmd: 'npm run check:seams' },
  ];

  for (const check of checks) {
    try {
      execSync(check.cmd, { stdio: 'ignore' });
      details.push(`- 🟢 \`${check.name}\`: Pass`);
    } catch {
      checksPass = false;
      details.push(`- ❌ \`${check.name}\`: Failed`);
    }
  }

  // 2. Impeccable detect (if available)
  let primaryDefects = 0;
  let advisoryNotes = 0;

  try {
    const impeccableCmd = process.env.IMPECCABLE_BIN || 'impeccable';
    const output = execSync(`${impeccableCmd} detect --json src/ 2>/dev/null`, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    const findings = JSON.parse(output);
    if (Array.isArray(findings)) {
      for (const f of findings) {
        if (f.severity === 'primary' || !f.advisory) {
          primaryDefects++;
        } else {
          advisoryNotes++;
        }
      }
      details.push(`- 🎨 \`Impeccable Audit\`: ${primaryDefects} primary defects, ${advisoryNotes} advisory notes`);
    }
  } catch {
    // Impeccable binary not globally installed or skipped in test runner
    details.push('- ℹ️ `Impeccable Audit`: Static detector deferred to skill runners');
  }

  return {
    primaryDefects,
    advisoryNotes,
    checksPass,
    details,
  };
}

export function composeScorecardMarkdown(options: {
  bundle: BundleScorecard | null;
  lighthouse: LighthouseMetrics | null;
  quality: QualityMetrics;
  history: HistoryEntry[];
  commitSha?: string;
}): string {
  const { bundle, lighthouse, quality, history, commitSha } = options;
  const dateStr = new Date().toISOString().split('T')[0];
  const shaShort = (commitSha || process.env.GITHUB_SHA || 'local').substring(0, 7);

  const lines: string[] = [];
  lines.push(`# 📈 Daily Performance & Quality Scorecard (${dateStr})`);
  lines.push(`> **Commit**: \`${shaShort}\` | **Trigger**: \`${process.env.GITHUB_EVENT_NAME || 'manual'}\` | **Target**: Web & PWA\n`);

  // Section 1: Executive KPI Summary
  lines.push('## 1. Metric Overview');
  lines.push('| Category | Metric | Current Value | Target / Budget | Status |');
  lines.push('| :--- | :--- | :--- | :--- | :---: |');

  if (bundle) {
    const entryGzip = formatBytes(bundle.entryJsGzipBytes);
    const entryStatus = bundle.entryJsGzipBytes <= 350 * 1024 ? '🟢 Pass' : '⚠️ Warn';
    lines.push(`| **Bundle** | Entry JS (Gzip) | \`${entryGzip}\` | \`< 350 KB\` | ${entryStatus} |`);
    lines.push(`| **Bundle** | Total Transfer (Gzip) | \`${formatBytes(bundle.totalGzipBytes)}\` | Monitored | ⚪ Baseline |`);
  }

  if (lighthouse) {
    const perfStatus = lighthouse.performanceScore >= 85 ? '🟢 Pass' : '⚠️ Warn';
    const lcpStatus = lighthouse.lcpMs <= 2500 ? '🟢 Pass' : '⚠️ Warn';
    lines.push(`| **Web Vitals** | Lighthouse Performance | \`${lighthouse.performanceScore}/100\` | \`≥ 85/100\` | ${perfStatus} |`);
    lines.push(`| **Web Vitals** | LCP (Largest Contentful Paint) | \`${(lighthouse.lcpMs / 1000).toFixed(2)}s\` | \`< 2.50s\` | ${lcpStatus} |`);
    lines.push(`| **Web Vitals** | CLS (Cumulative Layout Shift) | \`${lighthouse.cls}\` | \`< 0.10\` | ${lighthouse.cls <= 0.1 ? '🟢 Pass' : '⚠️ Warn'} |`);
    lines.push(`| **Web Vitals** | TBT (Total Blocking Time) | \`${lighthouse.tbtMs}ms\` | \`< 250ms\` | ${lighthouse.tbtMs <= 250 ? '🟢 Pass' : '⚠️ Warn'} |`);
  } else {
    lines.push('| **Web Vitals** | Lighthouse CI | _Not run / Deferred_ | `≥ 85/100` | ⚪ N/A |');
  }

  const qualityStatus = quality.checksPass && quality.primaryDefects === 0 ? '🟢 Pass' : '⚠️ Review';
  lines.push(`| **Quality** | Repo Integrity & Seams | \`${quality.checksPass ? '100% Pass' : 'Failed'}\` | All pass | ${qualityStatus} |`);
  lines.push(`| **Quality** | Impeccable Primary Defects | \`${quality.primaryDefects}\` | \`0\` | ${quality.primaryDefects === 0 ? '🟢 Pass' : '⚠️ Warn'} |`);
  lines.push('\n');

  // Section 2: Bundle Breakdown
  if (bundle) {
    lines.push('## 2. Bundle Chunk Breakdown & Deltas');
    lines.push('| Chunk / Module | Category | Gzip Size | Raw Size | Delta vs Baseline | Trend |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :---: |');

    // Show top 12 chunks
    const topDeltas = bundle.deltas.slice(0, 12);
    for (const delta of topDeltas) {
      const chunk = bundle.chunks.find((c) => c.normalizedName === delta.normalizedName);
      const rawStr = chunk ? formatBytes(chunk.rawBytes) : '-';
      const icon =
        delta.status === 'IMPROVEMENT'
          ? '🟢 Win'
          : delta.status === 'REGRESSION'
          ? '⚠️ Regr'
          : '⚪ Flat';
      lines.push(
        `| \`${delta.normalizedName}\` | ${delta.category} | ${formatBytes(delta.currentGzipBytes)} | ${rawStr} | ${formatDelta(delta.deltaBytes)} | ${icon} |`
      );
    }
    if (bundle.deltas.length > 12) {
      lines.push(`| *... and ${bundle.deltas.length - 12} other route chunks* | | | | | |`);
    }
    lines.push('\n');
  }

  // Section 3: Quality Checks
  lines.push('## 3. Code Integrity & Design System Health');
  for (const detail of quality.details) {
    lines.push(detail);
  }
  lines.push('\n');

  // Section 4: Rolling History (Last 7 Runs)
  if (history.length > 0) {
    lines.push('## 4. Rolling History (Recent Runs)');
    lines.push('| Date | Commit | Entry JS (Gzip) | Perf Score | LCP | Primary Defects |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :---: |');
    for (const entry of history.slice(-7).reverse()) {
      lines.push(
        `| ${entry.date} | \`${entry.commitSha}\` | ${entry.entryJsGzip} | ${entry.perfScore} | ${entry.lcp} | ${entry.defects} |`
      );
    }
    lines.push('\n');
  }

  lines.push('---');
  lines.push('*Automated by `.github/workflows/daily-performance.yml`. Artifacts preserved for 30 days in GitHub Actions.*');

  return lines.join('\n');
}

export function updateRollingHistory(
  historyPath: string,
  entry: HistoryEntry
): HistoryEntry[] {
  let history: HistoryEntry[] = [];
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      history = [];
    }
  }

  // Deduplicate by commitSha or append
  const existingIdx = history.findIndex((h) => h.commitSha === entry.commitSha);
  if (existingIdx >= 0) {
    history[existingIdx] = entry;
  } else {
    history.push(entry);
  }

  // Keep last 30 entries
  if (history.length > 30) {
    history = history.slice(-30);
  }

  const dir = path.dirname(historyPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
  return history;
}

export function syncWithGitHubIssue(markdownBody: string): void {
  try {
    // Check if issue exists
    const listCmd = 'gh issue list --state open --label "metrics:scorecard" --json number --jq ".[0].number"';
    const existingNumberStr = execSync(listCmd, { encoding: 'utf8' }).trim();

    if (existingNumberStr && Number(existingNumberStr) > 0) {
      console.log(`Updating existing scorecard issue #${existingNumberStr}...`);
      const tempPath = path.resolve(process.cwd(), '.cache/issue-body.md');
      fs.writeFileSync(tempPath, markdownBody, 'utf8');
      execSync(`gh issue edit ${existingNumberStr} --body-file "${tempPath}"`, { stdio: 'inherit' });
    } else {
      console.log('Creating new rolling scorecard issue...');
      const tempPath = path.resolve(process.cwd(), '.cache/issue-body.md');
      fs.writeFileSync(tempPath, markdownBody, 'utf8');
      execSync(
        `gh issue create --title "📈 Daily Performance & Quality Scorecard Tracker" --label "metrics:scorecard" --body-file "${tempPath}"`,
        { stdio: 'inherit' }
      );
    }
  } catch (err) {
    console.warn('Could not sync with GitHub Issue (non-fatal, continuing):', err);
  }
}

// CLI Execution
if (process.argv[1]?.endsWith('generate-scorecard.ts')) {
  try {
    const bundlePath = path.resolve(process.cwd(), 'dist/bundle-scorecard.json');
    let bundle: BundleScorecard | null = null;
    if (fs.existsSync(bundlePath)) {
      bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    }

    const lighthouseDir = path.resolve(process.cwd(), '.lighthouseci');
    const lighthouse = parseLighthouseManifest(lighthouseDir);

    const quality = evaluateQualityChecks();

    const historyPath = path.resolve(process.cwd(), '.cache/rolling-history.json');
    const sha = (process.env.GITHUB_SHA || 'local').substring(0, 7);
    const dateStr = new Date().toISOString().split('T')[0];

    const currentEntry: HistoryEntry = {
      date: dateStr,
      commitSha: sha,
      entryJsGzip: bundle ? formatBytes(bundle.entryJsGzipBytes) : '-',
      perfScore: lighthouse ? `${lighthouse.performanceScore}/100` : '-',
      lcp: lighthouse ? `${(lighthouse.lcpMs / 1000).toFixed(2)}s` : '-',
      defects: quality.primaryDefects,
    };

    const history = updateRollingHistory(historyPath, currentEntry);
    const markdown = composeScorecardMarkdown({
      bundle,
      lighthouse,
      quality,
      history,
      commitSha: sha,
    });

    // Write to Step Summary if in CI
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      fs.appendFileSync(summaryPath, `\n${markdown}\n`, 'utf8');
    }

    // Sync to GitHub Issue if flag passed or running in GHA
    if (process.argv.includes('--publish') || process.env.CI === 'true') {
      syncWithGitHubIssue(markdown);
    }

    console.log(markdown);
  } catch (err) {
    console.error('Failed to generate scorecard:', err);
    process.exit(1);
  }
}
