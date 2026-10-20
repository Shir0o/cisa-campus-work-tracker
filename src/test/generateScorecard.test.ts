import { describe, it, expect } from 'vitest';
import {
  parseLighthouseManifest,
  composeScorecardMarkdown,
  updateRollingHistory,
  type LighthouseMetrics,
  type QualityMetrics,
  type HistoryEntry,
} from '../../scripts/generate-scorecard';
import type { BundleScorecard } from '../../scripts/measure-bundle';
import type { MobileBundleScorecard } from '../../scripts/measure-mobile-bundle';

describe('generate-scorecard', () => {
  describe('composeScorecardMarkdown', () => {
    const mockBundle: BundleScorecard = {
      timestamp: '2026-10-20T00:00:00Z',
      totalRawBytes: 2000000,
      totalGzipBytes: 500000,
      totalBrotliBytes: 400000,
      entryJsGzipBytes: 240000,
      entryCssGzipBytes: 45000,
      budgetStatus: 'PASS',
      chunks: [],
      deltas: [
        {
          normalizedName: 'index.js',
          category: 'app-entry',
          currentGzipBytes: 240000,
          baselineGzipBytes: 240000,
          deltaBytes: 0,
          status: 'STABLE',
        },
      ],
    };

    const mockLighthouse: LighthouseMetrics = {
      performanceScore: 92,
      accessibilityScore: 95,
      bestPracticesScore: 100,
      fcpMs: 800,
      lcpMs: 1600,
      cls: 0.02,
      tbtMs: 120,
    };

    const mockQuality: QualityMetrics = {
      primaryDefects: 0,
      advisoryNotes: 12,
      checksPass: true,
      details: ['- 🟢 `Colors Token Check`: Pass'],
    };

    const mockHistory: HistoryEntry[] = [
      {
        date: '2026-10-19',
        commitSha: 'abc1234',
        entryJsGzip: '238.00 KB',
        perfScore: '91/100',
        lcp: '1.70s',
        defects: 0,
      },
    ];

    it('renders a complete scorecard with all sections', () => {
      const md = composeScorecardMarkdown({
        bundle: mockBundle,
        lighthouse: mockLighthouse,
        quality: mockQuality,
        history: mockHistory,
        commitSha: 'fedcba9',
      });

      expect(md).toContain('# 📈 Daily Performance & Quality Scorecard');
      expect(md).toContain('`fedcba9`');
      expect(md).toContain('92/100');
      expect(md).toContain('1.60s');
      expect(md).toContain('## 2. Web Bundle Chunk Breakdown & Deltas');
      expect(md).toContain('## 3. Code Integrity & Design System Health');
      expect(md).toContain('## 4. Rolling History (Recent Runs)');
      expect(md).toContain('`abc1234`');
    });

    it('handles missing lighthouse gracefully', () => {
      const md = composeScorecardMarkdown({
        bundle: mockBundle,
        lighthouse: null,
        quality: mockQuality,
        history: [],
      });

      expect(md).toContain('Lighthouse CI');
      expect(md).toContain('Not run / Deferred');
    });

    it('renders mobile bundle and bytecode section when mobile metrics are present', () => {
      const mockMobile: MobileBundleScorecard = {
        timestamp: '2026-10-20T00:00:00Z',
        distDir: '/tmp/mobile-dist',
        android: {
          platform: 'android',
          bundleFile: 'entry-123.hbc',
          rawBytes: 13000000,
          gzipBytes: 5000000,
          brotliBytes: 4000000,
        },
        ios: {
          platform: 'ios',
          bundleFile: 'entry-456.hbc',
          rawBytes: 13000000,
          gzipBytes: 5000000,
          brotliBytes: 4000000,
        },
        assets: [
          { category: 'fonts', count: 12, rawBytes: 2000000, gzipBytes: 1500000 },
        ],
        totalAssetsRawBytes: 2000000,
        totalAssetsGzipBytes: 1500000,
        totalPackageRawBytes: 28000000,
        totalPackageGzipBytes: 11500000,
        budgetStatus: 'PASS',
      };

      const md = composeScorecardMarkdown({
        bundle: mockBundle,
        lighthouse: mockLighthouse,
        quality: mockQuality,
        history: mockHistory,
        mobile: mockMobile,
      });

      expect(md).toContain('**Target**: Web, PWA & Mobile');
      expect(md).toContain('Android Hermes Bytecode');
      expect(md).toContain('iOS Hermes Bytecode');
      expect(md).toContain('Mobile Bundle & Hermes Bytecode Breakdown');
    });
  });

  describe('updateRollingHistory', () => {
    it('appends and bounds rolling history', () => {
      const tempPath = '/tmp/test-history.json';
      const entry: HistoryEntry = {
        date: '2026-10-20',
        commitSha: 'sha9999',
        entryJsGzip: '240.00 KB',
        perfScore: '90/100',
        lcp: '1.50s',
        defects: 0,
      };

      const result = updateRollingHistory(tempPath, entry);
      expect(result.some((e) => e.commitSha === 'sha9999')).toBe(true);
    });
  });

  describe('parseLighthouseManifest', () => {
    it('returns null if directory does not exist', () => {
      expect(parseLighthouseManifest('/non/existent/path')).toBeNull();
    });
  });
});
