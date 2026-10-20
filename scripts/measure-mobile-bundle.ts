import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface PlatformMetric {
  platform: 'android' | 'ios';
  bundleFile: string;
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
}

export interface AssetCategorySummary {
  category: 'fonts' | 'icons' | 'images' | 'other';
  count: number;
  rawBytes: number;
  gzipBytes: number;
}

export interface MobileBundleDelta {
  androidRawDelta?: number;
  iosRawDelta?: number;
  assetsRawDelta?: number;
  status: 'IMPROVEMENT' | 'STABLE' | 'REGRESSION';
}

export interface MobileBundleScorecard {
  timestamp: string;
  commitSha?: string;
  distDir: string;
  android?: PlatformMetric;
  ios?: PlatformMetric;
  assets: AssetCategorySummary[];
  totalAssetsRawBytes: number;
  totalAssetsGzipBytes: number;
  totalPackageRawBytes: number;
  totalPackageGzipBytes: number;
  budgetStatus: 'PASS' | 'WARN' | 'FAIL';
  deltas?: MobileBundleDelta;
}

export interface MobileBaseline {
  androidRawBytes?: number;
  iosRawBytes?: number;
  assetsRawBytes?: number;
}

export const HERMES_BYTECODE_BUDGET_BYTES = 16 * 1024 * 1024; // 16 MB raw
export const TOTAL_ASSETS_BUDGET_BYTES = 8 * 1024 * 1024; // 8 MB raw
export const DELTA_WARN_THRESHOLD_BYTES = 100 * 1024; // +100 KB
export const DELTA_IMPROVE_THRESHOLD_BYTES = -50 * 1024; // -50 KB

/**
 * Categorizes asset file into fonts, icons, images, or other.
 */
export function categorizeAsset(
  filePath: string,
  ext?: string
): 'fonts' | 'icons' | 'images' | 'other' {
  const extension = (ext || path.extname(filePath).replace(/^\./, '')).toLowerCase();
  const lowerPath = filePath.toLowerCase();

  if (['ttf', 'otf', 'woff', 'woff2'].includes(extension)) {
    if (lowerPath.includes('vector-icons') || lowerPath.includes('icon')) {
      return 'icons';
    }
    return 'fonts';
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) {
    if (lowerPath.includes('vector-icons') || lowerPath.includes('icon')) {
      return 'icons';
    }
    return 'images';
  }

  return 'other';
}

/**
 * Format bytes to readable units (B, KB, MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(2);
  return `${val} ${units[i]}`;
}

/**
 * Format delta bytes with signs and symbols.
 */
export function formatDelta(bytes: number | undefined): string {
  if (bytes === undefined || bytes === 0) return '0 B';
  const sign = bytes > 0 ? '+' : '';
  return `${sign}${formatBytes(bytes)}`;
}

/**
 * Scans mobile exported dist directory and measures Hermes bytecode & assets.
 */
export function measureMobileBundle(
  distDir: string,
  options: {
    baselinePath?: string;
    commitSha?: string;
  } = {}
): MobileBundleScorecard {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Mobile distribution directory not found: ${distDir}`);
  }

  const timestamp = new Date().toISOString();
  let androidMetric: PlatformMetric | undefined;
  let iosMetric: PlatformMetric | undefined;

  // 1. Scan Platform Bytecode in _expo/static/js
  const androidJsDir = path.join(distDir, '_expo/static/js/android');
  if (fs.existsSync(androidJsDir)) {
    const files = fs.readdirSync(androidJsDir);
    const bundleFile = files.find((f) => f.endsWith('.hbc') || f.endsWith('.js'));
    if (bundleFile) {
      const fullPath = path.join(androidJsDir, bundleFile);
      const content = fs.readFileSync(fullPath);
      androidMetric = {
        platform: 'android',
        bundleFile,
        rawBytes: content.length,
        gzipBytes: zlib.gzipSync(content, { level: 9 }).length,
        brotliBytes: zlib.brotliCompressSync(content).length,
      };
    }
  }

  const iosJsDir = path.join(distDir, '_expo/static/js/ios');
  if (fs.existsSync(iosJsDir)) {
    const files = fs.readdirSync(iosJsDir);
    const bundleFile = files.find((f) => f.endsWith('.hbc') || f.endsWith('.js'));
    if (bundleFile) {
      const fullPath = path.join(iosJsDir, bundleFile);
      const content = fs.readFileSync(fullPath);
      iosMetric = {
        platform: 'ios',
        bundleFile,
        rawBytes: content.length,
        gzipBytes: zlib.gzipSync(content, { level: 9 }).length,
        brotliBytes: zlib.brotliCompressSync(content).length,
      };
    }
  }

  // 2. Scan Assets
  const extMap = new Map<string, string>();
  const metadataPath = path.join(distDir, 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const androidAssets = meta.fileMetadata?.android?.assets || [];
      const iosAssets = meta.fileMetadata?.ios?.assets || [];
      for (const item of [...androidAssets, ...iosAssets]) {
        if (item.path && item.ext) {
          extMap.set(path.basename(item.path), item.ext);
        }
      }
    } catch {
      // Ignore invalid metadata
    }
  }

  const assetsDir = path.join(distDir, 'assets');
  const assetCounts: Record<string, { count: number; raw: number; gzip: number }> = {
    fonts: { count: 0, raw: 0, gzip: 0 },
    icons: { count: 0, raw: 0, gzip: 0 },
    images: { count: 0, raw: 0, gzip: 0 },
    other: { count: 0, raw: 0, gzip: 0 },
  };

  if (fs.existsSync(assetsDir)) {
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(full);
          const raw = content.length;
          const gzip = zlib.gzipSync(content, { level: 9 }).length;
          const ext = extMap.get(entry.name) || path.extname(entry.name).replace(/^\./, '');
          const category = categorizeAsset(entry.name, ext);
          assetCounts[category].count += 1;
          assetCounts[category].raw += raw;
          assetCounts[category].gzip += gzip;
        }
      }
    };
    scanDir(assetsDir);
  }

  const assetSummaries: AssetCategorySummary[] = (
    ['fonts', 'icons', 'images', 'other'] as const
  )
    .filter((cat) => assetCounts[cat].count > 0)
    .map((cat) => ({
      category: cat,
      count: assetCounts[cat].count,
      rawBytes: assetCounts[cat].raw,
      gzipBytes: assetCounts[cat].gzip,
    }));

  const totalAssetsRawBytes = assetSummaries.reduce((sum, a) => sum + a.rawBytes, 0);
  const totalAssetsGzipBytes = assetSummaries.reduce((sum, a) => sum + a.gzipBytes, 0);

  const totalPackageRawBytes =
    (androidMetric?.rawBytes || 0) +
    (iosMetric?.rawBytes || 0) +
    totalAssetsRawBytes;
  const totalPackageGzipBytes =
    (androidMetric?.gzipBytes || 0) +
    (iosMetric?.gzipBytes || 0) +
    totalAssetsGzipBytes;

  // 3. Evaluate Budget
  let budgetStatus: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
  if (
    (androidMetric && androidMetric.rawBytes > HERMES_BYTECODE_BUDGET_BYTES) ||
    (iosMetric && iosMetric.rawBytes > HERMES_BYTECODE_BUDGET_BYTES) ||
    totalAssetsRawBytes > TOTAL_ASSETS_BUDGET_BYTES
  ) {
    budgetStatus = 'FAIL';
  } else if (
    (androidMetric && androidMetric.rawBytes > HERMES_BYTECODE_BUDGET_BYTES * 0.9) ||
    (iosMetric && iosMetric.rawBytes > HERMES_BYTECODE_BUDGET_BYTES * 0.9)
  ) {
    budgetStatus = 'WARN';
  }

  // 4. Baseline Diffing
  let deltas: MobileBundleDelta | undefined;
  if (options.baselinePath && fs.existsSync(options.baselinePath)) {
    try {
      const baseline: MobileBaseline = JSON.parse(
        fs.readFileSync(options.baselinePath, 'utf8')
      );
      const androidRawDelta =
        androidMetric && baseline.androidRawBytes !== undefined
          ? androidMetric.rawBytes - baseline.androidRawBytes
          : undefined;
      const iosRawDelta =
        iosMetric && baseline.iosRawBytes !== undefined
          ? iosMetric.rawBytes - baseline.iosRawBytes
          : undefined;
      const assetsRawDelta =
        baseline.assetsRawBytes !== undefined
          ? totalAssetsRawBytes - baseline.assetsRawBytes
          : undefined;

      const maxDelta = Math.max(
        androidRawDelta || 0,
        iosRawDelta || 0,
        assetsRawDelta || 0
      );

      let deltaStatus: 'IMPROVEMENT' | 'STABLE' | 'REGRESSION' = 'STABLE';
      if (maxDelta >= DELTA_WARN_THRESHOLD_BYTES) {
        deltaStatus = 'REGRESSION';
      } else if (
        (androidRawDelta && androidRawDelta <= DELTA_IMPROVE_THRESHOLD_BYTES) ||
        (iosRawDelta && iosRawDelta <= DELTA_IMPROVE_THRESHOLD_BYTES)
      ) {
        deltaStatus = 'IMPROVEMENT';
      }

      deltas = {
        androidRawDelta,
        iosRawDelta,
        assetsRawDelta,
        status: deltaStatus,
      };
    } catch {
      // Ignore corrupted baseline
    }
  }

  return {
    timestamp,
    commitSha: options.commitSha,
    distDir,
    android: androidMetric,
    ios: iosMetric,
    assets: assetSummaries,
    totalAssetsRawBytes,
    totalAssetsGzipBytes,
    totalPackageRawBytes,
    totalPackageGzipBytes,
    budgetStatus,
    deltas,
  };
}

/**
 * Format mobile scorecard into Markdown table.
 */
export function formatMobileMarkdown(scorecard: MobileBundleScorecard): string {
  const statusEmoji =
    scorecard.budgetStatus === 'PASS'
      ? '🟢'
      : scorecard.budgetStatus === 'WARN'
        ? '🟡'
        : '🔴';

  const rows: string[] = [];

  if (scorecard.android) {
    rows.push(
      `| Android Hermes Bytecode | ${formatBytes(scorecard.android.rawBytes)} | ${formatBytes(scorecard.android.gzipBytes)} | ${formatDelta(scorecard.deltas?.androidRawDelta)} | < 16.00 MB |`
    );
  }

  if (scorecard.ios) {
    rows.push(
      `| iOS Hermes Bytecode | ${formatBytes(scorecard.ios.rawBytes)} | ${formatBytes(scorecard.ios.gzipBytes)} | ${formatDelta(scorecard.deltas?.iosRawDelta)} | < 16.00 MB |`
    );
  }

  for (const asset of scorecard.assets) {
    rows.push(
      `| Assets (${asset.category}, ${asset.count} files) | ${formatBytes(asset.rawBytes)} | ${formatBytes(asset.gzipBytes)} | - | Monitored |`
    );
  }

  rows.push(
    `| **Total Export Payload** | **${formatBytes(scorecard.totalPackageRawBytes)}** | **${formatBytes(scorecard.totalPackageGzipBytes)}** | ${formatDelta(scorecard.deltas?.assetsRawDelta)} | **< 24.00 MB** |`
  );

  return `### 📱 Mobile Bundle & Hermes Bytecode Scorecard (${statusEmoji} **${scorecard.budgetStatus}**)

| Component / Platform | Raw Size | Gzip Transfer | Delta vs Baseline | Budget Target |
| :--- | :--- | :--- | :--- | :---: |
${rows.join('\n')}
`;
}

/**
 * CLI Execution Entrypoint
 */
export function runCli(): void {
  const args = process.argv.slice(2);
  let distDir = path.resolve('apps/mobile/dist');
  let baselinePath = path.resolve('.cache/mobile-bundle-baseline.json');
  let outputJson = path.resolve('.cache/mobile-bundle-metrics.json');
  let outputMd: string | undefined;
  let saveBaseline = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dist-dir' && args[i + 1]) distDir = path.resolve(args[++i]);
    if (args[i] === '--baseline' && args[i + 1]) baselinePath = path.resolve(args[++i]);
    if (args[i] === '--output-json' && args[i + 1]) outputJson = path.resolve(args[++i]);
    if (args[i] === '--output-md' && args[i + 1]) outputMd = path.resolve(args[++i]);
    if (args[i] === '--save-baseline') saveBaseline = true;
  }

  const scorecard = measureMobileBundle(distDir, {
    baselinePath,
    commitSha: process.env.GITHUB_SHA || 'local',
  });

  // Ensure output directory exists
  const jsonDir = path.dirname(outputJson);
  if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir, { recursive: true });
  fs.writeFileSync(outputJson, JSON.stringify(scorecard, null, 2), 'utf8');

  if (saveBaseline) {
    const baselineData: MobileBaseline = {
      androidRawBytes: scorecard.android?.rawBytes,
      iosRawBytes: scorecard.ios?.rawBytes,
      assetsRawBytes: scorecard.totalAssetsRawBytes,
    };
    fs.writeFileSync(baselinePath, JSON.stringify(baselineData, null, 2), 'utf8');
  }

  const md = formatMobileMarkdown(scorecard);
  if (outputMd) {
    const mdDir = path.dirname(outputMd);
    if (!fs.existsSync(mdDir)) fs.mkdirSync(mdDir, { recursive: true });
    fs.writeFileSync(outputMd, md, 'utf8');
  }

  console.log(md);

  if (scorecard.budgetStatus === 'FAIL') {
    console.error('❌ Mobile bundle exceeded budget limits!');
    process.exit(1);
  }
}

// Only invoke CLI if executed directly
if (process.argv[1] && process.argv[1].endsWith('measure-mobile-bundle.ts')) {
  runCli();
}
