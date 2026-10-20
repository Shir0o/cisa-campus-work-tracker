import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface ChunkMetric {
  name: string;
  normalizedName: string;
  category: string;
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  type: 'js' | 'css' | 'other';
}

export interface ChunkDelta {
  normalizedName: string;
  category: string;
  currentGzipBytes: number;
  baselineGzipBytes: number;
  deltaBytes: number;
  status: 'IMPROVEMENT' | 'STABLE' | 'REGRESSION';
}

export interface BundleScorecard {
  timestamp: string;
  commitSha?: string;
  totalRawBytes: number;
  totalGzipBytes: number;
  totalBrotliBytes: number;
  entryJsGzipBytes: number;
  entryCssGzipBytes: number;
  budgetStatus: 'PASS' | 'WARN' | 'FAIL';
  chunks: ChunkMetric[];
  deltas: ChunkDelta[];
}

export const ENTRY_JS_BUDGET_BYTES = 350 * 1024; // 350 KB Gzip
export const DELTA_WARN_THRESHOLD_BYTES = 5 * 1024; // +5 KB
export const DELTA_IMPROVE_THRESHOLD_BYTES = -1 * 1024; // -1 KB

/**
 * Strips Vite's random content-hash from asset filename for persistent cross-commit diffing.
 * Example: 'index-DBvu3Lav.js' -> 'index.js'
 */
export function normalizeChunkName(filename: string): string {
  return filename.replace(/-[A-Za-z0-9_-]{8}\.(js|css)$/, '.$1');
}

/**
 * Categorizes chunk based on its name and origin.
 */
export function categorizeChunk(normalizedName: string): string {
  if (normalizedName.startsWith('index.') && normalizedName.endsWith('.js')) return 'app-entry';
  if (normalizedName.startsWith('index.') && normalizedName.endsWith('.css')) return 'app-css';
  if (normalizedName.startsWith('firebase.')) return 'firebase';
  if (normalizedName.startsWith('board-editor.')) return 'board-editor';
  if (normalizedName.startsWith('lucide-icons.')) return 'lucide-icons';
  if (normalizedName.startsWith('html2canvas')) return 'html2canvas';
  if (normalizedName.startsWith('LanguageProvider.')) return 'language-i18n';
  if (normalizedName.startsWith('react.')) return 'react-vendor';
  return 'route-component';
}

/**
 * Scans assets directory and computes raw, Gzip, and Brotli byte sizes.
 */
export function measureAssets(assetsDir: string): ChunkMetric[] {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Assets directory not found: ${assetsDir}`);
  }

  const files = fs.readdirSync(assetsDir);
  const metrics: ChunkMetric[] = [];

  for (const file of files) {
    if (!file.endsWith('.js') && !file.endsWith('.css')) continue;

    const fullPath = path.join(assetsDir, file);
    const content = fs.readFileSync(fullPath);

    const rawBytes = content.length;
    const gzipBytes = zlib.gzipSync(content, { level: 9 }).length;
    const brotliBytes = zlib.brotliCompressSync(content).length;

    const normalizedName = normalizeChunkName(file);
    const category = categorizeChunk(normalizedName);
    const type = file.endsWith('.js') ? 'js' : 'css';

    metrics.push({
      name: file,
      normalizedName,
      category,
      rawBytes,
      gzipBytes,
      brotliBytes,
      type,
    });
  }

  // Sort descending by Gzip size
  return metrics.sort((a, b) => b.gzipBytes - a.gzipBytes);
}

/**
 * Compares current chunk metrics against baseline metrics.
 */
export function computeDeltas(
  current: ChunkMetric[],
  baselineMap: Record<string, number> = {}
): ChunkDelta[] {
  return current.map((chunk) => {
    const baselineGzipBytes = baselineMap[chunk.normalizedName] ?? chunk.gzipBytes;
    const deltaBytes = chunk.gzipBytes - baselineGzipBytes;

    let status: 'IMPROVEMENT' | 'STABLE' | 'REGRESSION' = 'STABLE';
    if (deltaBytes >= DELTA_WARN_THRESHOLD_BYTES) {
      status = 'REGRESSION';
    } else if (deltaBytes <= DELTA_IMPROVE_THRESHOLD_BYTES) {
      status = 'IMPROVEMENT';
    }

    return {
      normalizedName: chunk.normalizedName,
      category: chunk.category,
      currentGzipBytes: chunk.gzipBytes,
      baselineGzipBytes,
      deltaBytes,
      status,
    };
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const formatted = (bytes / Math.pow(k, i)).toFixed(2);
  return `${formatted} ${sizes[i]}`;
}

export function formatDelta(bytes: number): string {
  if (bytes === 0) return '0 B';
  const prefix = bytes > 0 ? '+' : '';
  return `${prefix}${formatBytes(bytes)}`;
}

/**
 * Formats scorecard as GitHub-flavored Markdown.
 */
export function generateMarkdownSummary(scorecard: BundleScorecard): string {
  const statusBadge =
    scorecard.budgetStatus === 'PASS'
      ? '🟢 **PASS**'
      : scorecard.budgetStatus === 'WARN'
      ? '⚠️ **WARNING**'
      : '❌ **FAIL**';

  const lines: string[] = [];
  lines.push(`### 📦 Bundle Size & Budget Scorecard (${statusBadge})\n`);
  lines.push(`- **Entry JS (Gzip)**: \`${formatBytes(scorecard.entryJsGzipBytes)}\` / Budget \`${formatBytes(ENTRY_JS_BUDGET_BYTES)}\``);
  lines.push(`- **Total JS/CSS (Gzip)**: \`${formatBytes(scorecard.totalGzipBytes)}\``);
  lines.push(`- **Total Raw Transfer**: \`${formatBytes(scorecard.totalRawBytes)}\` (Brotli: \`${formatBytes(scorecard.totalBrotliBytes)}\`)\n`);

  lines.push('| Chunk / Module | Category | Gzip Size | Raw Size | Delta vs Baseline | Status |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :---: |');

  for (const delta of scorecard.deltas) {
    const chunk = scorecard.chunks.find((c) => c.normalizedName === delta.normalizedName);
    const rawSizeStr = chunk ? formatBytes(chunk.rawBytes) : '-';
    const statusIcon =
      delta.status === 'IMPROVEMENT'
        ? '🟢 Win'
        : delta.status === 'REGRESSION'
        ? '⚠️ Regr'
        : '⚪ Flat';

    lines.push(
      `| \`${delta.normalizedName}\` | ${delta.category} | ${formatBytes(delta.currentGzipBytes)} | ${rawSizeStr} | ${formatDelta(delta.deltaBytes)} | ${statusIcon} |`
    );
  }

  return lines.join('\n');
}

// CLI entry point
export function runBundleMeasurement(options?: {
  assetsDir?: string;
  baselinePath?: string;
  outputPath?: string;
  summaryPath?: string;
}): BundleScorecard {
  const assetsDir = options?.assetsDir || path.resolve(process.cwd(), 'dist/assets');
  const baselinePath = options?.baselinePath || path.resolve(process.cwd(), '.cache/bundle-baseline.json');
  const outputPath = options?.outputPath || path.resolve(process.cwd(), 'dist/bundle-scorecard.json');
  const summaryPath = options?.summaryPath;

  const chunks = measureAssets(assetsDir);

  let baselineMap: Record<string, number> = {};
  if (fs.existsSync(baselinePath)) {
    try {
      baselineMap = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch {
      baselineMap = {};
    }
  }

  const deltas = computeDeltas(chunks, baselineMap);

  const totalRawBytes = chunks.reduce((acc, c) => acc + c.rawBytes, 0);
  const totalGzipBytes = chunks.reduce((acc, c) => acc + c.gzipBytes, 0);
  const totalBrotliBytes = chunks.reduce((acc, c) => acc + c.brotliBytes, 0);

  const entryJs = chunks.find((c) => c.category === 'app-entry')?.gzipBytes || 0;
  const entryCss = chunks.find((c) => c.category === 'app-css')?.gzipBytes || 0;

  let budgetStatus: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
  if (entryJs > ENTRY_JS_BUDGET_BYTES) {
    budgetStatus = 'WARN';
  }
  if (deltas.some((d) => d.status === 'REGRESSION')) {
    budgetStatus = 'WARN';
  }

  const scorecard: BundleScorecard = {
    timestamp: new Date().toISOString(),
    commitSha: process.env.GITHUB_SHA || undefined,
    totalRawBytes,
    totalGzipBytes,
    totalBrotliBytes,
    entryJsGzipBytes: entryJs,
    entryCssGzipBytes: entryCss,
    budgetStatus,
    chunks,
    deltas,
  };

  // Write output scorecard JSON
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(scorecard, null, 2), 'utf8');

  // Save new baseline
  const newBaseline: Record<string, number> = {};
  for (const chunk of chunks) {
    newBaseline[chunk.normalizedName] = chunk.gzipBytes;
  }
  const baselineDir = path.dirname(baselinePath);
  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }
  fs.writeFileSync(baselinePath, JSON.stringify(newBaseline, null, 2), 'utf8');

  const markdown = generateMarkdownSummary(scorecard);
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `\n${markdown}\n`, 'utf8');
  }

  return scorecard;
}

// Execute if run directly via tsx / node
if (process.argv[1]?.endsWith('measure-bundle.ts')) {
  try {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    const scorecard = runBundleMeasurement({ summaryPath });
    console.log(generateMarkdownSummary(scorecard));
  } catch (err) {
    console.error('Failed to measure bundle:', err);
    process.exit(1);
  }
}
