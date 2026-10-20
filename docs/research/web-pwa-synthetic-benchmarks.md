# Research: Web/PWA Synthetic Benchmarking and Bundle Tracking Tooling

> **Context**: Part of [#1677](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1677) (Daily performance & quality metrics pipeline).  
> **Resolves**: [#1678](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1678).  
> **Informs**: [#1680](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1680) (Scorecard schema & delta thresholds) and [#1681](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1681) (Daily performance GitHub Action).

---

## Executive Summary & Tooling Recommendation

To track daily performance, bundle health, and UI quality across the Web and PWA application without adding latency or flakiness to the primary PR gate (`.github/workflows/ci.yml`), the recommended architecture is an isolated scheduled workflow (`.github/workflows/daily-performance.yml`) combining three lightweight, deterministic tools:

1. **Bundle Budget & Chunk Deltas**:
   - **Tool**: A custom, zero-dependency Node/TypeScript script (`scripts/measure-bundle.ts`) coupled with conditional `rollup-plugin-visualizer` artifact generation.
   - **Why**: Zero-dep parsing of Vite's output (`dist/assets` or `.vite/manifest.json`) calculates raw, gzip, and brotli chunk sizes in under 100ms. It tracks exact byte deltas against a cached baseline, categorizes chunks according to `manualChunks` (`board-editor`, `firebase`, `lucide-icons`), outputs machine-readable JSON for scorecards, and fails when defined budgets are exceeded. `rollup-plugin-visualizer` runs conditionally (`ANALYZE=true`) to generate an interactive `stats.html` artifact for drill-down inspection.

2. **Synthetic Core Web Vitals & Audits**:
   - **Tool**: Lighthouse CI (`@lhci/cli`) using its built-in static web server (`staticDistDir: './dist'`, `isSinglePageApplication: true`) and 3-run median aggregation.
   - **Why**: Running against LHCI's built-in static server eliminates port contention, process race conditions, and dev-server compilation noise. Median evaluation (`numberOfRuns: 3`) filters out noisy-neighbor CPU fluctuations on shared GitHub Actions runners. Desktop emulation and headless flags (`--headless=new --no-sandbox`) deliver deterministic, repeatable LCP, FCP, CLS, and TBT metrics.

3. **Design System & Skill Quality Audits**:
   - **Tool**: Headless `impeccable detect --json` combined with in-repo token guards (`check:colors`, `check:i18n`, `check:seams`).
   - **Why**: `impeccable detect` executes a static AST scan across the entire frontend codebase in under 2 seconds. Exporting findings as structured JSON enables CI to classify primary violations (blocking defects) versus advisory notes, aggregate category scores, and track debt burndown over time.

4. **CI Isolation & Zero-Overhead Artifact Capture**:
   - The primary PR pipeline (`ci.yml`) remains untouched and fast.
   - The scheduled pipeline runs daily at off-peak hours (e.g. 03:00 UTC) on `main` and on-demand via `workflow_dispatch`.
   - Results are rendered directly into `$GITHUB_STEP_SUMMARY`, artifacts (`stats.html`, `.lighthouseci/`, `scorecard.json`) are uploaded via `actions/upload-artifact@v4` (retained for 30–90 days with zero third-party SaaS hosting costs), and rolling 7-day baselines are stored via `actions/cache`.

---

## 1. Bundle Budget & Chunk Size Delta Tracking (Vite 6+ / Vite 8 & React 19)

### 1.1 Current Architecture & Chunking Strategy
The project currently builds via Vite 8 (`vite@^8.3.3`) and React 19 (`react@^19.3.0`) with Tailwind CSS v4 (`@tailwindcss/vite`). In [vite.config.ts](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/add_performance_metrics_dashboard/vite.config.ts), manual chunks are partitioned into isolated bundles:
- `board-editor`: `@tiptap/*`, `prosemirror-*`, `yjs`, `y-protocols`, `y-prosemirror`, `lib0` (loaded lazily for the `/coordination` view).
- `firebase`: `firebase/*` SDK modules.
- `lucide-icons`: `lucide-react/*` icon assets.
- Entry chunk: Application core routing and main UI.

### 1.2 Tooling Evaluation

| Candidate Tool | Strengths | Limitations | Verdict |
| :--- | :--- | :--- | :--- |
| **`size-limit`** (`@size-limit/file`) | • Industry standard for package authoring.<br>• Built-in gzip/brotli calculations.<br>• Native failure thresholds. | • Requires wildcard matching (`dist/assets/*.js`) due to Vite content hashes.<br>• Black-box total size; lacks sub-module package attribution.<br>• Geared towards PR comment bots rather than daily time-series metrics. | **Secondary**: Useful for hard ceilings, but insufficient for detailed chunk delta attribution. |
| **`rollup-plugin-visualizer`** | • Official Rollup visualizer plugin.<br>• Generates visual interactive treemap (`stats.html`).<br>• Supports `template: "raw-data"` for JSON export of module graph.<br>• Accurately measures stat, parsed, gzip, and brotli. | • Adds build overhead when running on every commit.<br>• Raw JSON file is large (multiple MBs) and contains redundant AST metadata not needed for simple daily budgets. | **Adopt for Visual Artifacts**: Enable conditionally (`ANALYZE=true`) to upload `stats.html` as a CI artifact. |
| **Custom Vite Build Stats Script** (`scripts/measure-bundle.ts`) | • **Zero external dependencies**: Uses standard Node.js `node:fs`, `node:path`, `node:zlib`.<br>• Execution time < 100ms.<br>• Accurately maps chunks from `.vite/manifest.json` (`build.manifest: true`) or `dist/assets`.<br>• Computes exact raw, gzip, and brotli sizes.<br>• Directly diffs against cached daily baseline (`baseline.json`).<br>• Emits formatted Markdown tables and scorecard JSON schema. | • Requires maintaining ~120 lines of TypeScript in `scripts/`. | **Primary Choice**: Best fit for deterministic daily metrics, scorecard generation, and delta alerting. |

### 1.3 Recommended Implementation: Hybrid Approach

1. **Manifest & Visualizer Setup**:
   Update `vite.config.ts` to output a manifest and conditionally attach `rollup-plugin-visualizer`:
   ```ts
   // vite.config.ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import tailwindcss from '@tailwindcss/vite';
   import { visualizer } from 'rollup-plugin-visualizer';

   export default defineConfig({
     plugins: [
       react(),
       tailwindcss(),
       process.env.ANALYZE === 'true' &&
         visualizer({
           filename: 'dist/stats.html',
           open: false,
           gzipSize: true,
           brotliSize: true,
           template: 'treemap',
         }),
     ].filter(Boolean),
     build: {
       manifest: true, // Emits dist/.vite/manifest.json
       rollupOptions: {
         output: {
           manualChunks(id) {
             if (/node_modules\/(@tiptap\/|prosemirror-|tiptap-markdown\/|yjs\/|y-protocols\/|y-prosemirror\/|lib0\/)/.test(id)) {
               return 'board-editor';
             }
             if (id.includes('node_modules/firebase/')) {
               return 'firebase';
             }
             if (id.includes('node_modules/lucide-react/')) {
               return 'lucide-icons';
             }
           },
         },
       },
     },
   });
   ```

2. **Deterministic Measurement Script (`scripts/measure-bundle.ts`)**:
   The script reads `dist/assets`, evaluates Brotli and Gzip sizes using `node:zlib`, checks chunk sizes against defined budgets, compares against `.cache/bundle-baseline.json`, and outputs the results:
   ```ts
   import fs from 'node:fs';
   import path from 'node:path';
   import zlib from 'node:zlib';

   interface ChunkMetric {
     name: string;
     file: string;
     rawBytes: number;
     gzipBytes: number;
     brotliBytes: number;
     budgetBytes?: number;
     deltaBytes?: number;
   }

   export function measureAssets(distDir = 'dist/assets'): ChunkMetric[] {
     const files = fs.readdirSync(distDir);
     return files
       .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
       .map((file) => {
         const content = fs.readFileSync(path.join(distDir, file));
         return {
           name: file.replace(/-[A-Za-z0-9_-]+\.(js|css)$/, '.$1'),
           file,
           rawBytes: content.length,
           gzipBytes: zlib.gzipSync(content, { level: 9 }).length,
           brotliBytes: zlib.brotliCompressSync(content).length,
         };
       });
   }
   ```

3. **Delta Calculation & Budget Guard**:
   - Compare current `gzipBytes` against the baseline.
   - Threshold triggers:
     - Warning: Total JS bundle increases by `> 5 KB` (gzip) or an individual manual chunk increases by `> 3 KB`.
     - Failure: Any chunk exceeds its hard ceiling (e.g., initial entry chunk > `180 KB` gzip).

---

## 2. Headless Lighthouse CI (@lhci/cli) & Synthetic Web-Vitals

### 2.1 Architecture of `@lhci/cli` in GitHub Actions
Google's Lighthouse CI (`@lhci/cli`) is designed specifically for automated performance regression monitoring in CI pipelines. It executes headless Chromium, captures Core Web Vitals, and outputs structured JSON audit results (`lhr-*.json`).

### 2.2 Eliminating CI Flakiness: Root Causes & Solutions

Synthetic testing in GitHub Actions shared virtual machines (`ubuntu-latest`) is notorious for variance if misconfigured. The following architectural patterns eliminate false positives:

#### 1. Built-in Static Server vs Dev Server
- **Problem**: Launching a development server (`npm run dev`) or using `vite preview` via `startServerCommand` introduces startup race conditions, port collision, unoptimized bundles, and port-listening race conditions.
- **Solution**: Use LHCI's built-in static file server:
  ```json
  "staticDistDir": "./dist",
  "isSinglePageApplication": true
  ```
  LHCI starts an internal, zero-dependency static HTTP server pointing directly to the compiled production assets in `./dist`. The `isSinglePageApplication: true` directive instructs the server to route all URL paths back to `index.html`, supporting React Router without any 404 errors or external server processes.

#### 2. Multi-Run Median Aggregation (`numberOfRuns: 3` or `5`)
- **Problem**: GitHub Actions runners experience intermittent CPU throttling and noisy-neighbor hyperthread starvation. A single run can spike Largest Contentful Paint (LCP) by 800ms due to background OS tasks or garbage collection.
- **Solution**: Configure `numberOfRuns: 3` (or 5 for deep stability). LHCI executes 3 independent passes and selects the **median run** for assertions and reporting, eliminating outliers.

#### 3. Container-Safe Chromium Flags
- **Problem**: Ubuntu CI environments lack a display server and enforce strict sandbox restrictions.
- **Solution**: Pass flags to disable GPU acceleration and bypass sandbox constraints:
  ```json
  "chromeFlags": "--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage"
  ```

#### 4. Throttling Method Selection
- **Problem**: Standard mobile emulation uses simulated 4x CPU slowdown (`throttlingMethod: "simulate"`). On a constrained 2-core GitHub Actions runner, this multiplies host jitter, causing Total Blocking Time (TBT) to fluctuate widely.
- **Solution**: 
  - For predictable daily synthetic scoring, use **desktop emulation** or **devtools throttling** (`throttlingMethod: "devtools"`).
  - Use realistic CI assertion budgets that focus on regressions (e.g. LCP delta > 500ms) rather than hyper-tight absolute thresholds.

#### 5. Deterministic URL Targets
- Audit static, deterministic entry points that do not require external network requests:
  - Welcome / Login entry (`/`)
  - Build-time compiled documentation / Help Center (`/help` or `/privacy.html`)
  - PWA shell and manifest verification.

### 2.3 Concrete `lighthouserc.json` Configuration
Save this configuration at repo root (`lighthouserc.json`):

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./dist",
      "isSinglePageApplication": true,
      "numberOfRuns": 3,
      "url": [
        "http://localhost/",
        "http://localhost/support.html"
      ],
      "settings": {
        "chromeFlags": "--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
        "preset": "desktop",
        "throttlingMethod": "devtools",
        "skipAudits": [
          "uses-http2",
          "canonical"
        ]
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["warn", { "minScore": 0.90 }],
        "categories:seo": ["warn", { "minScore": 0.90 }],
        "categories:pwa": ["warn", { "minScore": 0.80 }],
        "first-contentful-paint": ["warn", { "maxNumericValue": 2000 }],
        "largest-contentful-paint": ["warn", { "maxNumericValue": 2800 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 300 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

### 2.4 Lighthouse CI vs Playwright Synthetic Web-Vitals Runner

| Dimension | Lighthouse CI (`@lhci/cli`) | Playwright Synthetic Runner |
| :--- | :--- | :--- |
| **Scope** | Comprehensive: Performance, A11y, Best Practices, SEO, PWA. | Pure Core Web Vitals & custom user interaction latency. |
| **Artifacts** | Full interactive HTML reports + JSON LHRs. | Raw numeric JSON logs or trace files. |
| **Authentication** | Complex (requires puppeteer script / cookies). | Trivial: Leverages existing seeded auth state and fixtures. |
| **Execution Time** | ~30–45s for 3 runs. | ~5–10s per page. |
| **Recommendation** | **Adopt as primary daily synthetic benchmark** for standardized scores and PWA/A11y tracking. | Complementary for deep authenticated user flow benchmarks (e.g. contact search latency). |

---

## 3. Impeccable Audits & Design System Checks Programmatically in CI

### 3.1 Headless Execution of `impeccable detect`
The `impeccable` CLI provides a static AST and pattern-matching scanner (`impeccable detect`) that evaluates UI components against `PRODUCT.md`, `DESIGN.md`, and design quality standards.

- **Speed**: Scans the entire `src/` directory in ~1.5 seconds.
- **Execution**:
  ```bash
  /Users/twang/.gemini/config/skills/impeccable/scripts/impeccable detect --json src/ > dist/impeccable-report.json || true
  ```
- **CLI Options**:
  - `--json`: Emits machine-readable JSON array of finding objects to `stdout` (human-readable summaries are routed to `stderr`).
  - `--quiet`: Emits only summary counts in text mode.
  - `--no-advisory`: Omits non-blocking advisory suggestions (e.g., punctuation or minor typography notes), reporting only actionable anti-patterns.
- **Exit Code Contract**:
  - `0`: Clean scan (0 primary anti-patterns; advisories may still be present).
  - `1`: Operational failure (invalid flags, missing files).
  - `2`: Primary anti-patterns detected.

### 3.2 Impeccable JSON Schema & Severity Model
Each entry in the JSON array contains:
```json
{
  "antipattern": "side-tab",
  "name": "Side-tab accent border",
  "description": "Visual indicator violates the design system hierarchy.",
  "severity": "advisory | warning | error",
  "category": "quality | slop | layout | type | color",
  "file": "/path/to/Component.tsx",
  "line": 42,
  "snippet": "border-l-4 border-accent",
  "advisory": false,
  "ignoreValue": "border-l-4"
}
```

### 3.3 Integrating In-Repo Design Token Checks
The repository already maintains custom diff-scoped regression guards in `scripts/`:
- `npm run check:colors` (`scripts/check-hardcoded-colors.ts`): Enforces that color values use design tokens rather than raw hex codes or untokenized Tailwind classes.
- `npm run check:i18n` (`scripts/check-hardcoded-ui-strings.ts`): Detects hardcoded UI strings lacking internationalization tokens.
- `npm run check:seams` (`scripts/check-seams.ts`): Validates architectural seams defined in `e2e/seams.json`.

**Full-Scan Mode for Daily Scorecard**:
While regular CI checks only git diffs, the daily workflow runs these guards across the entire codebase to compute the total count of unresolved token infractions. Tracking this daily number provides an automated debt burndown metric.

### 3.4 Programmatic Scorecard Generation Script
A small script (`scripts/audit-scorecard.ts`) reads `dist/impeccable-report.json`, counts primary defects by category, and produces a Markdown summary block:

```ts
import fs from 'node:fs';

interface Finding {
  antipattern: string;
  category: string;
  severity: string;
  advisory: boolean;
  file: string;
}

export function formatImpeccableSummary(reportPath: string): { score: number; markdown: string } {
  if (!fs.existsSync(reportPath)) {
    return { score: 20, markdown: 'No impeccable audit report found.' };
  }
  const findings: Finding[] = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const primary = findings.filter((f) => !f.advisory);
  const byCategory = primary.reduce<Record<string, number>>((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {});

  // Compute 0-20 Health Score (deduct 1 pt per primary defect, minimum 0)
  const score = Math.max(0, 20 - primary.length);

  const markdown = `
### 🎨 Design System & Code Quality Audit
- **Audit Health Score**: **${score}/20**
- **Primary Anti-Patterns**: ${primary.length}
- **Advisory Notes**: ${findings.length - primary.length}

| Category | Primary Defects | Status |
| :--- | :--- | :--- |
| **Quality / Slop** | ${byCategory['slop'] ?? 0} | ${(byCategory['slop'] ?? 0) === 0 ? '✅ Pass' : '⚠️ Review'} |
| **Theming / Tokens** | ${byCategory['color'] ?? 0} | ${(byCategory['color'] ?? 0) === 0 ? '✅ Pass' : '⚠️ Review'} |
| **Layout & A11y** | ${byCategory['layout'] ?? 0} | ${(byCategory['layout'] ?? 0) === 0 ? '✅ Pass' : '⚠️ Review'} |
`;

  return { score, markdown };
}
```

---

## 4. Daily CI Pipeline Architecture & Artifact Preservation

### 4.1 Isolation Principle: Protecting Regular CI
To adhere to repo cost and speed discipline:
- **`ci.yml` (Pull Requests & Pushes to `main`)**:
  - Remains strictly focused on unit tests, typecheck, lint, diff-scoped guards, and production build verification.
  - Zero synthetic Lighthouse runs or visualizer analysis to keep build times under 4 minutes.
- **`daily-performance.yml` (Scheduled Daily Workflow)**:
  - Runs once daily at **03:00 UTC** and manually via **`workflow_dispatch`**.
  - Runs against the tip of `main`.
  - Executes the full suite of synthetic benchmarks and quality audits.
  - Generates the daily scorecard, updates rolling baselines, and alerts on regressions.

### 4.2 Proposed Daily Workflow (`.github/workflows/daily-performance.yml`)

```yaml
name: Daily Performance & Quality Scorecard

on:
  schedule:
    - cron: '0 3 * * *' # Daily at 03:00 UTC
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  performance-audit:
    name: Synthetic Audits & Bundle Tracking
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install Dependencies
        run: npm ci

      # Restore previous baseline metrics for delta comparison
      - name: Restore Daily Performance Baseline
        uses: actions/cache@v4
        with:
          path: .cache/performance-baseline.json
          key: perf-baseline-${{ runner.os }}
          restore-keys: |
            perf-baseline-

      # 1. Build with Bundle Analysis
      - name: Build Application with Analysis
        run: ANALYZE=true npm run build

      # 2. Measure Bundle Sizes and Deltas
      - name: Analyze Bundle Budgets & Deltas
        id: bundle
        run: npx tsx scripts/measure-bundle.ts --baseline .cache/performance-baseline.json --output dist/bundle-metrics.json

      # 3. Run Headless Lighthouse CI
      - name: Run Lighthouse CI Synthetic Audits
        run: npx @lhci/cli autorun

      # 4. Run Impeccable Quality & Design Scan
      - name: Run Impeccable Design Audit
        run: |
          mkdir -p dist
          ./.gemini/skills/impeccable/scripts/impeccable detect --json src/ > dist/impeccable-report.json || true

      # 5. Compile Scorecard and Generate Markdown
      - name: Generate Daily Scorecard
        id: scorecard
        run: npx tsx scripts/compile-daily-scorecard.ts

      # 6. Post Summary to GitHub Job Summary
      - name: Publish Job Summary
        run: cat dist/daily-scorecard.md >> $GITHUB_STEP_SUMMARY

      # 7. Upload Diagnostic Artifacts (Stored for 30 days)
      - name: Upload Performance Artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: daily-performance-artifacts-${{ github.sha }}
          path: |
            dist/stats.html
            dist/bundle-metrics.json
            dist/impeccable-report.json
            dist/scorecard.json
            .lighthouseci/
          retention-days: 30

      # 8. Save Updated Baseline
      - name: Save Updated Performance Baseline
        uses: actions/cache/save@v4
        if: github.ref == 'refs/heads/main'
        with:
          path: .cache/performance-baseline.json
          key: perf-baseline-${{ runner.os }}-${{ github.run_id }}

      # 9. Alert on Threshold Breach
      - name: Alert on Performance Regression
        if: steps.scorecard.outputs.has_regression == 'true'
        run: npx tsx scripts/file-performance-regression.ts
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4.3 Artifact Preservation & Retention Strategy

1. **GitHub Job Summary (`$GITHUB_STEP_SUMMARY`)**:
   - The compiled `daily-scorecard.md` is appended to the job summary, providing an immediate, high-level dashboard in the GitHub Actions UI without downloading files.
2. **GitHub Actions Artifacts (`actions/upload-artifact@v4`)**:
   - `dist/stats.html`: Interactive Treemap showing exact bundle composition and node module sizes.
   - `.lighthouseci/`: Raw HTML and JSON Lighthouse audit results.
   - `dist/scorecard.json`: Machine-readable scorecard schema (for time-series ingestion or dashboards).
   - `retention-days: 30`: Automatically cleans up after 30 days to stay well within GitHub repository storage allowances.
3. **GitHub Actions Cache (`actions/cache`)**:
   - Stores `.cache/performance-baseline.json` across daily runs to track rolling 7-day micro-deltas (e.g., `+2.4 KB` bundle growth over the week).
4. **Automated Issue Alerting**:
   - Mirrors the existing `scripts/file-failure-issue.ts` pattern: If a critical threshold is breached (e.g. entry chunk exceeds budget or Lighthouse score falls below 0.80), the action opens or updates a single tracked issue labeled `bug` and `ready-for-agent`.

---

## 5. Primary Source Citations & References

1. **Vite Manifest & Build API**:
   - Vite Official Documentation: [Backend Integration & `build.manifest`](https://vite.dev/guide/backend-integration.html)
   - Vite Config Reference: [`build.rollupOptions` and manualChunks](https://vite.dev/config/build-options.html#build-rollupoptions)
2. **Rollup Plugin Visualizer**:
   - Upstream Repository: [btd/rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer)
   - Raw Data Template Documentation: `template: "raw-data"` for machine-readable JSON bundle metadata.
3. **Lighthouse CI (`@lhci/cli`)**:
   - Google Chrome Lighthouse CI Documentation: [Configuration Reference (`lighthouserc.json`)](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md)
   - Lighthouse CI Architecture & Static Serving: [Server & `staticDistDir` / `isSinglePageApplication`](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/getting-started.md)
   - Web.dev Guide: [Continuous integration with Lighthouse CI](https://web.dev/lighthouse-ci/)
4. **Node.js Compression APIs**:
   - Node.js Documentation: [zlib module (`brotliCompressSync`, `gzipSync`)](https://nodejs.org/api/zlib.html)
5. **Impeccable Skill**:
   - Local Skill Specification: `/Users/twang/.gemini/config/skills/impeccable/SKILL.md`
   - Audit Reference: `/Users/twang/.gemini/config/skills/impeccable/reference/audit.md`
   - CLI Detector Reference: `/Users/twang/.gemini/config/skills/impeccable/scripts/impeccable detect --help`
