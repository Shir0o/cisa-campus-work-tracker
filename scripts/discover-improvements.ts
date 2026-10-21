import fs from 'node:fs';
import path from 'node:path';
import { optimize } from 'svgo';
import type { BundleScorecard } from './measure-bundle';

export interface ImprovementCandidate {
  id: string;
  category: 'asset-optimization' | 'design-token-drift' | 'bundle-budget' | 'telemetry-regression';
  title: string;
  description: string;
  targetFiles: string[];
  estimatedSavings?: string;
  confidence: 'high' | 'medium' | 'low';
  canAutoMerge: boolean;
  instructions: string;
  recommendedSkill?: string;
  recommendedCadence?: 'weekly' | 'daily' | 'on-demand' | 'monthly';
  prerequisite?: string;
  localAgentCommand?: string;
}

export interface DiscoveryReport {
  timestamp: string;
  candidates: ImprovementCandidate[];
  summary: {
    totalCandidates: number;
    autoMergeable: number;
    requiresReview: number;
  };
}

const SVGO_SAFE_CONFIG = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupIds: false,
          mergePaths: false,
        },
      },
    },
    {
      name: 'prefixIds',
      active: true,
    },
  ],
};

/**
 * Scan SVG assets for safe lossless minification opportunities.
 */
export function discoverAssetImprovements(filePaths?: string[]): ImprovementCandidate[] {
  const candidates: ImprovementCandidate[] = [];
  const files = filePaths || findSvgFiles([
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'src'),
    path.resolve(process.cwd(), 'apps/mobile/assets'),
  ]);

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const original = fs.readFileSync(file, 'utf8');
      const result = optimize(original, SVGO_SAFE_CONFIG as any);
      const savings = original.length - result.data.length;

      // Only flag if savings are meaningful (> 20 bytes)
      if (savings > 20) {
        const relPath = path.relative(process.cwd(), file);
        candidates.push({
          id: `asset-svg-${path.basename(file, '.svg')}`,
          category: 'asset-optimization',
          title: `Optimize vector asset: ${relPath}`,
          description: `Lossless SVGO minification reduces size from ${original.length} B to ${result.data.length} B (-${savings} B).`,
          targetFiles: [file],
          estimatedSavings: `${savings} B`,
          confidence: 'high',
          canAutoMerge: true,
          instructions: `Apply lossless SVGO optimization preserving viewBox and dimensions to ${relPath}.`,
          recommendedSkill: 'none (deterministic script)',
          recommendedCadence: 'weekly',
          prerequisite: 'New SVG assets added or unminified paths found',
          localAgentCommand: 'npm run maintenance:run',
        });
      }
    } catch {
      // Ignore parse failures on non-SVG or malformed fixtures
    }
  }

  return candidates;
}

/**
 * Scan bundle scorecard for chunk budget violations or route split candidates.
 */
export function discoverBundleBudgetAnomalies(scorecard: BundleScorecard | null): ImprovementCandidate[] {
  const candidates: ImprovementCandidate[] = [];
  if (!scorecard) return candidates;

  const ENTRY_BUDGET_BYTES = 350 * 1024;
  const CHUNK_BUDGET_BYTES = 200 * 1024;

  if (scorecard.entryJsGzipBytes > ENTRY_BUDGET_BYTES) {
    candidates.push({
      id: 'bundle-entry-budget-exceeded',
      category: 'bundle-budget',
      title: 'App entry chunk exceeds 350 KB gzip budget',
      description: `Entry chunk is ${(scorecard.entryJsGzipBytes / 1024).toFixed(1)} KB (budget: 350 KB).`,
      targetFiles: ['src/App.tsx', 'src/routes.tsx'],
      confidence: 'high',
      canAutoMerge: false,
      instructions: 'Review top dependencies in index.js and identify vendor modules that can be lazy-loaded.',
      recommendedSkill: 'performance-and-web-vitals',
      recommendedCadence: 'weekly',
      prerequisite: 'dist/bundle-scorecard.json shows entryJsGzipBytes > 350KB',
      localAgentCommand: '/performance-and-web-vitals Lazy-load heavy route components or vendor dependencies in src/App.tsx',
    });
  }

  if (Array.isArray(scorecard.chunks)) {
    for (const chunk of scorecard.chunks) {
      if (chunk.category !== 'app-entry' && chunk.gzipBytes > CHUNK_BUDGET_BYTES) {
        candidates.push({
          id: `bundle-chunk-${chunk.name.replace(/[^a-zA-Z0-9]/g, '-')}`,
          category: 'bundle-budget',
          title: `Chunk ${chunk.name} exceeds 200 KB gzip budget`,
          description: `Chunk ${chunk.name} is ${(chunk.gzipBytes / 1024).toFixed(1)} KB gzip.`,
          targetFiles: [chunk.name],
          confidence: 'medium',
          canAutoMerge: false,
          instructions: `Inspect components included in ${chunk.name} for sub-route dynamic importing.`,
          recommendedSkill: 'performance-and-web-vitals',
          recommendedCadence: 'weekly',
          prerequisite: `Chunk ${chunk.name} exceeds 200 KB gzip threshold in dist/bundle-scorecard.json`,
          localAgentCommand: `/performance-and-web-vitals Split sub-components in ${chunk.name} using dynamic imports and React.lazy()`,
        });
      }
    }
  }

  return candidates;
}

/**
 * Scan for design token drift (hardcoded hex colors in src).
 */
export function discoverDesignTokenDrift(rootDir = process.cwd()): ImprovementCandidate[] {
  const candidates: ImprovementCandidate[] = [];
  const srcDir = path.resolve(rootDir, 'src');
  if (!fs.existsSync(srcDir)) return candidates;

  const hexRegex = /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/g;
  const flaggedFiles: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test' && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (hexRegex.test(content)) {
          flaggedFiles.push(path.relative(rootDir, fullPath));
        }
      }
    }
  }

  try {
    walk(srcDir);
  } catch {
    // Non-fatal
  }

  if (flaggedFiles.length > 0) {
    candidates.push({
      id: 'design-token-hardcoded-colors',
      category: 'design-token-drift',
      title: `Migrate hardcoded colors in ${flaggedFiles.length} file(s) to design tokens`,
      description: `Hardcoded hex colors detected in: ${flaggedFiles.slice(0, 3).join(', ')}${flaggedFiles.length > 3 ? '...' : ''}.`,
      targetFiles: flaggedFiles,
      confidence: 'medium',
      canAutoMerge: false,
      instructions: 'Replace hardcoded hex color literals with semantic Tailwind tokens or var(--...) tokens.',
      recommendedSkill: 'better-colors',
      recommendedCadence: 'weekly',
      prerequisite: 'Hex color regex match in src/**/*.tsx',
      localAgentCommand: '/better-colors Migrate hardcoded hex colors in target files to CSS custom properties from src/index.css',
    });
  }

  return candidates;
}

export function generateDiscoveryReport(candidates: ImprovementCandidate[]): DiscoveryReport {
  let autoMergeable = 0;
  let requiresReview = 0;

  for (const c of candidates) {
    if (c.canAutoMerge) {
      autoMergeable++;
    } else {
      requiresReview++;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    candidates,
    summary: {
      totalCandidates: candidates.length,
      autoMergeable,
      requiresReview,
    },
  };
}

function findSvgFiles(dirs: string[]): string[] {
  const svgFiles: string[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.svg')) {
          // If recursive supported entry.parentPath exists
          const parent = (entry as any).parentPath || dir;
          svgFiles.push(path.join(parent, entry.name));
        }
      }
    } catch {
      // Fallback simple readdir
      const names = fs.readdirSync(dir);
      for (const name of names) {
        if (name.endsWith('.svg')) {
          svgFiles.push(path.join(dir, name));
        }
      }
    }
  }

  return svgFiles;
}

// CLI Execution
if (process.argv[1]?.endsWith('discover-improvements.ts')) {
  try {
    console.log('🔍 Running automated micro-improvements discovery...');

    const assetCandidates = discoverAssetImprovements();
    const tokenCandidates = discoverDesignTokenDrift();

    let bundleScorecard: BundleScorecard | null = null;
    const scorecardPath = path.resolve(process.cwd(), 'dist/bundle-scorecard.json');
    if (fs.existsSync(scorecardPath)) {
      bundleScorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
    }
    const bundleCandidates = discoverBundleBudgetAnomalies(bundleScorecard);

    const allCandidates = [...assetCandidates, ...tokenCandidates, ...bundleCandidates];
    const report = generateDiscoveryReport(allCandidates);

    const cacheDir = path.resolve(process.cwd(), '.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const outputPath = path.join(cacheDir, 'improvement-candidates.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`\n📋 Discovery Summary: ${report.summary.totalCandidates} candidates found`);
    console.log(`   - 🟢 Auto-mergeable (lossless): ${report.summary.autoMergeable}`);
    console.log(`   - 🟡 Requires 1-click review: ${report.summary.requiresReview}`);
    console.log(`   - 📄 Manifest saved to: ${outputPath}\n`);

    if (allCandidates.length > 0) {
      console.log('Top Candidates & Agent Skills:');
      for (const c of allCandidates.slice(0, 5)) {
        console.log(`   • [${c.category}] ${c.title} (${c.canAutoMerge ? 'Auto-merge' : 'Review'})`);
        if (c.recommendedSkill) {
          console.log(`     Skill: ${c.recommendedSkill} (cadence: ${c.recommendedCadence || 'on-demand'})`);
          console.log(`     Command: ${c.localAgentCommand}`);
        }
      }
    }
  } catch (err) {
    console.error('Failed to run discovery:', err);
    process.exit(1);
  }
}
