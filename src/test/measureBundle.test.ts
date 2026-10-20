import { describe, it, expect } from 'vitest';
import {
  normalizeChunkName,
  categorizeChunk,
  computeDeltas,
  formatBytes,
  formatDelta,
  generateMarkdownSummary,
  type ChunkMetric,
  type BundleScorecard,
} from '../../scripts/measure-bundle';

describe('measure-bundle', () => {
  describe('normalizeChunkName', () => {
    it('strips random content hashes from javascript files', () => {
      expect(normalizeChunkName('index-DBvu3Lav.js')).toBe('index.js');
      expect(normalizeChunkName('firebase-CZacCW-Z.js')).toBe('firebase.js');
      expect(normalizeChunkName('board-editor-BT4OivNa.js')).toBe('board-editor.js');
    });

    it('strips random content hashes from css files', () => {
      expect(normalizeChunkName('index-CqSCUWRW.css')).toBe('index.css');
    });

    it('leaves unhashed filenames unchanged', () => {
      expect(normalizeChunkName('index.js')).toBe('index.js');
      expect(normalizeChunkName('styles.css')).toBe('styles.css');
    });
  });

  describe('categorizeChunk', () => {
    it('identifies entry js and css', () => {
      expect(categorizeChunk('index.js')).toBe('app-entry');
      expect(categorizeChunk('index.css')).toBe('app-css');
    });

    it('identifies major vendor chunks', () => {
      expect(categorizeChunk('firebase.js')).toBe('firebase');
      expect(categorizeChunk('board-editor.js')).toBe('board-editor');
      expect(categorizeChunk('lucide-icons.js')).toBe('lucide-icons');
      expect(categorizeChunk('html2canvas-pro.esm.js')).toBe('html2canvas');
      expect(categorizeChunk('react.js')).toBe('react-vendor');
      expect(categorizeChunk('LanguageProvider.js')).toBe('language-i18n');
    });

    it('defaults unknown chunks to route-component', () => {
      expect(categorizeChunk('Settings.js')).toBe('route-component');
      expect(categorizeChunk('Attendance.js')).toBe('route-component');
    });
  });

  describe('computeDeltas', () => {
    const mockChunks: ChunkMetric[] = [
      {
        name: 'index-123456.js',
        normalizedName: 'index.js',
        category: 'app-entry',
        rawBytes: 800000,
        gzipBytes: 240000,
        brotliBytes: 200000,
        type: 'js',
      },
      {
        name: 'firebase-123456.js',
        normalizedName: 'firebase.js',
        category: 'firebase',
        rawBytes: 700000,
        gzipBytes: 210000,
        brotliBytes: 180000,
        type: 'js',
      },
      {
        name: 'feature-123456.js',
        normalizedName: 'feature.js',
        category: 'route-component',
        rawBytes: 50000,
        gzipBytes: 15000,
        brotliBytes: 12000,
        type: 'js',
      },
    ];

    it('marks chunks as STABLE when within threshold', () => {
      const baseline = {
        'index.js': 240500, // +500 B diff (below 5 KB)
        'firebase.js': 210000,
        'feature.js': 15000,
      };
      const deltas = computeDeltas(mockChunks, baseline);
      expect(deltas.every((d) => d.status === 'STABLE')).toBe(true);
    });

    it('flags REGRESSION when growth exceeds 5 KB', () => {
      const baseline = {
        'index.js': 230000, // +10,000 B (> 5 KB)
        'firebase.js': 210000,
        'feature.js': 15000,
      };
      const deltas = computeDeltas(mockChunks, baseline);
      const entryDelta = deltas.find((d) => d.normalizedName === 'index.js');
      expect(entryDelta?.status).toBe('REGRESSION');
      expect(entryDelta?.deltaBytes).toBe(10000);
    });

    it('flags IMPROVEMENT when chunk shrinks by at least 1 KB', () => {
      const baseline = {
        'index.js': 240000,
        'firebase.js': 212000, // current is 210000 -> -2,000 B
        'feature.js': 15000,
      };
      const deltas = computeDeltas(mockChunks, baseline);
      const fbDelta = deltas.find((d) => d.normalizedName === 'firebase.js');
      expect(fbDelta?.status).toBe('IMPROVEMENT');
      expect(fbDelta?.deltaBytes).toBe(-2000);
    });
  });

  describe('formatting helpers', () => {
    it('formats bytes nicely', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
    });

    it('formats deltas with +/- symbols', () => {
      expect(formatDelta(0)).toBe('0 B');
      expect(formatDelta(2048)).toBe('+2.00 KB');
      expect(formatDelta(-2048)).toBe('-2.00 KB');
    });
  });

  describe('generateMarkdownSummary', () => {
    it('creates a markdown table with budget pass indicator', () => {
      const mockScorecard: BundleScorecard = {
        timestamp: '2026-10-20T00:00:00Z',
        totalRawBytes: 1550000,
        totalGzipBytes: 465000,
        totalBrotliBytes: 392000,
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

      const md = generateMarkdownSummary(mockScorecard);
      expect(md).toContain('🟢 **PASS**');
      expect(md).toContain('`index.js`');
      expect(md).toContain('234.38 KB');
      expect(md).toContain('⚪ Flat');
    });

    it('creates a markdown table with warning indicator when budget exceeded', () => {
      const mockScorecard: BundleScorecard = {
        timestamp: '2026-10-20T00:00:00Z',
        totalRawBytes: 2000000,
        totalGzipBytes: 600000,
        totalBrotliBytes: 500000,
        entryJsGzipBytes: 400000, // Exceeds 350 KB
        entryCssGzipBytes: 45000,
        budgetStatus: 'WARN',
        chunks: [],
        deltas: [],
      };

      const md = generateMarkdownSummary(mockScorecard);
      expect(md).toContain('⚠️ **WARNING**');
    });
  });
});
