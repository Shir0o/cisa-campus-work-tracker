import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  discoverAssetImprovements,
  discoverBundleBudgetAnomalies,
  generateDiscoveryReport,
  type ImprovementCandidate,
} from '../../scripts/discover-improvements';

describe('discover-improvements', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('discoverAssetImprovements', () => {
    it('detects unoptimized SVGs with metadata and comments', () => {
      const svgPath = path.join(tempDir, 'sample.svg');
      const unoptimizedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator 25.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Inner graphic comment -->
  <rect x="0" y="0" width="100" height="100" fill="#ff0000" />
</svg>`;
      fs.writeFileSync(svgPath, unoptimizedSvg, 'utf8');

      const candidates = discoverAssetImprovements([svgPath]);
      expect(candidates.length).toBe(1);
      const c = candidates[0];
      expect(c.category).toBe('asset-optimization');
      expect(c.confidence).toBe('high');
      expect(c.canAutoMerge).toBe(true);
      expect(c.targetFiles).toContain(svgPath);
      expect(c.estimatedSavings).toBeDefined();
    });

    it('returns empty list for already optimized SVGs', () => {
      const svgPath = path.join(tempDir, 'optimized.svg');
      const optimizedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>`;
      fs.writeFileSync(svgPath, optimizedSvg, 'utf8');

      const candidates = discoverAssetImprovements([svgPath]);
      expect(candidates.length).toBe(0);
    });
  });

  describe('discoverBundleBudgetAnomalies', () => {
    it('flags chunks crossing threshold', () => {
      const mockBundleScorecard = {
        entryJsGzipBytes: 400 * 1024, // 400 KB > 350 KB budget
        entryJsRawBytes: 1200 * 1024,
        totalGzipBytes: 1500 * 1024,
        totalRawBytes: 4000 * 1024,
        chunks: [
          {
            name: 'index.js',
            rawBytes: 1200 * 1024,
            gzipBytes: 400 * 1024,
            category: 'app-entry',
          },
          {
            name: 'heavy-feature.js',
            rawBytes: 800 * 1024,
            gzipBytes: 250 * 1024, // 250 KB > 200 KB chunk threshold
            category: 'route-component',
          },
        ],
      };

      const candidates = discoverBundleBudgetAnomalies(mockBundleScorecard as any);
      expect(candidates.length).toBe(2);
      expect(candidates[0].category).toBe('bundle-budget');
      expect(candidates[0].canAutoMerge).toBe(false);
      expect(candidates[1].targetFiles).toContain('heavy-feature.js');
    });

    it('returns empty list when all chunks are under budget', () => {
      const mockBundleScorecard = {
        entryJsGzipBytes: 200 * 1024,
        entryJsRawBytes: 700 * 1024,
        totalGzipBytes: 1000 * 1024,
        totalRawBytes: 3000 * 1024,
        chunks: [
          {
            name: 'index.js',
            rawBytes: 700 * 1024,
            gzipBytes: 200 * 1024,
            category: 'app-entry',
          },
        ],
      };

      const candidates = discoverBundleBudgetAnomalies(mockBundleScorecard as any);
      expect(candidates.length).toBe(0);
    });
  });

  describe('generateDiscoveryReport', () => {
    it('aggregates candidates and summarizes counts', () => {
      const candidates: ImprovementCandidate[] = [
        {
          id: 'asset-1',
          category: 'asset-optimization',
          title: 'Optimize public/logo.svg',
          description: 'Save 42 bytes',
          targetFiles: ['public/logo.svg'],
          confidence: 'high',
          canAutoMerge: true,
          instructions: 'Run svgo',
        },
        {
          id: 'bundle-1',
          category: 'bundle-budget',
          title: 'Split heavy chunk',
          description: 'Chunk exceeds 200 KB',
          targetFiles: ['src/routes/Heavy.tsx'],
          confidence: 'medium',
          canAutoMerge: false,
          instructions: 'Use React.lazy',
        },
      ];

      const report = generateDiscoveryReport(candidates);
      expect(report.summary.totalCandidates).toBe(2);
      expect(report.summary.autoMergeable).toBe(1);
      expect(report.summary.requiresReview).toBe(1);
      expect(report.candidates).toEqual(candidates);
    });
  });
});
