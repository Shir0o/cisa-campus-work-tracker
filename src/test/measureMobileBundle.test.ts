import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  categorizeAsset,
  formatBytes,
  measureMobileBundle,
  formatMobileMarkdown,
  HERMES_BYTECODE_BUDGET_BYTES,
  TOTAL_ASSETS_BUDGET_BYTES,
} from '../../scripts/measure-mobile-bundle';

describe('measure-mobile-bundle', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('categorizeAsset', () => {
    it('categorizes font files as fonts', () => {
      expect(categorizeAsset('assets/font.ttf', 'ttf')).toBe('fonts');
      expect(categorizeAsset('assets/Lexend.otf', 'otf')).toBe('fonts');
    });

    it('categorizes vector icons as icons', () => {
      expect(categorizeAsset('assets/vector-icons/Feather.ttf', 'ttf')).toBe('icons');
      expect(categorizeAsset('assets/icons/search.png', 'png')).toBe('icons');
    });

    it('categorizes images as images', () => {
      expect(categorizeAsset('assets/avatar.png', 'png')).toBe('images');
      expect(categorizeAsset('assets/hero.webp', 'webp')).toBe('images');
    });

    it('categorizes unrecognized formats as other', () => {
      expect(categorizeAsset('assets/data.bin', 'bin')).toBe('other');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes, kilobytes, and megabytes', () => {
      expect(formatBytes(500)).toBe('500.00 B');
      expect(formatBytes(2048)).toBe('2.00 KB');
      expect(formatBytes(1048576 * 2.5)).toBe('2.50 MB');
    });
  });

  describe('measureMobileBundle', () => {
    it('throws when dist directory does not exist', () => {
      expect(() => measureMobileBundle('/non/existent/path')).toThrow(
        /Mobile distribution directory not found/
      );
    });

    it('analyzes android and ios bytecode and assets', () => {
      // Mock Android bundle
      const androidDir = path.join(tempDir, '_expo/static/js/android');
      fs.mkdirSync(androidDir, { recursive: true });
      fs.writeFileSync(path.join(androidDir, 'entry-12345678.hbc'), Buffer.alloc(1024 * 100)); // 100 KB

      // Mock iOS bundle
      const iosDir = path.join(tempDir, '_expo/static/js/ios');
      fs.mkdirSync(iosDir, { recursive: true });
      fs.writeFileSync(path.join(iosDir, 'entry-87654321.hbc'), Buffer.alloc(1024 * 120)); // 120 KB

      // Mock assets
      const assetsDir = path.join(tempDir, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'Lexend.ttf'), Buffer.alloc(1024 * 50));
      fs.writeFileSync(path.join(assetsDir, 'icon.png'), Buffer.alloc(1024 * 10));

      const scorecard = measureMobileBundle(tempDir);

      expect(scorecard.android).toBeDefined();
      expect(scorecard.android?.rawBytes).toBe(1024 * 100);
      expect(scorecard.ios).toBeDefined();
      expect(scorecard.ios?.rawBytes).toBe(1024 * 120);

      expect(scorecard.totalAssetsRawBytes).toBe(1024 * 60);
      expect(scorecard.budgetStatus).toBe('PASS');
    });

    it('flags FAIL when bytecode exceeds budget', () => {
      const androidDir = path.join(tempDir, '_expo/static/js/android');
      fs.mkdirSync(androidDir, { recursive: true });
      // Write file larger than 16 MB budget
      fs.writeFileSync(
        path.join(androidDir, 'entry-huge.hbc'),
        Buffer.alloc(HERMES_BYTECODE_BUDGET_BYTES + 1024)
      );

      const scorecard = measureMobileBundle(tempDir);
      expect(scorecard.budgetStatus).toBe('FAIL');
    });

    it('calculates deltas against baseline', () => {
      const androidDir = path.join(tempDir, '_expo/static/js/android');
      fs.mkdirSync(androidDir, { recursive: true });
      fs.writeFileSync(path.join(androidDir, 'entry-current.hbc'), Buffer.alloc(1024 * 200));

      const baselinePath = path.join(tempDir, 'mobile-baseline.json');
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          androidRawBytes: 1024 * 100, // Was 100 KB, now 200 KB -> +100 KB (regression)
          iosRawBytes: 0,
          assetsRawBytes: 0,
        })
      );

      const scorecard = measureMobileBundle(tempDir, { baselinePath });
      expect(scorecard.deltas).toBeDefined();
      expect(scorecard.deltas?.androidRawDelta).toBe(1024 * 100);
      expect(scorecard.deltas?.status).toBe('REGRESSION');
    });
  });

  describe('formatMobileMarkdown', () => {
    it('generates a clean markdown table', () => {
      const markdown = formatMobileMarkdown({
        timestamp: '2026-10-20T00:00:00.000Z',
        distDir: '/tmp',
        android: {
          platform: 'android',
          bundleFile: 'entry-123.hbc',
          rawBytes: 13 * 1024 * 1024,
          gzipBytes: 5 * 1024 * 1024,
          brotliBytes: 4 * 1024 * 1024,
        },
        ios: {
          platform: 'ios',
          bundleFile: 'entry-456.hbc',
          rawBytes: 13 * 1024 * 1024,
          gzipBytes: 5 * 1024 * 1024,
          brotliBytes: 4 * 1024 * 1024,
        },
        assets: [
          { category: 'fonts', count: 10, rawBytes: 2 * 1024 * 1024, gzipBytes: 1.5 * 1024 * 1024 },
          { category: 'images', count: 5, rawBytes: 500 * 1024, gzipBytes: 450 * 1024 },
        ],
        totalAssetsRawBytes: 2.5 * 1024 * 1024,
        totalAssetsGzipBytes: 1.95 * 1024 * 1024,
        totalPackageRawBytes: 28.5 * 1024 * 1024,
        totalPackageGzipBytes: 11.95 * 1024 * 1024,
        budgetStatus: 'PASS',
      });

      expect(markdown).toContain('📱 Mobile Bundle & Hermes Bytecode Scorecard');
      expect(markdown).toContain('Android Hermes Bytecode');
      expect(markdown).toContain('iOS Hermes Bytecode');
      expect(markdown).toContain('PASS');
    });
  });
});
