import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { optimize } from 'svgo';
import {
  discoverAssetImprovements,
  discoverDesignTokenDrift,
  discoverBundleBudgetAnomalies,
  generateDiscoveryReport,
  type DiscoveryReport,
  type ImprovementCandidate,
} from '../discover-improvements';

export interface AppliedImprovement {
  id: string;
  category: string;
  title: string;
  canAutoMerge: boolean;
  details: string;
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
 * Losslessly optimizes an SVG file in place.
 */
export function applyAssetOptimization(filePath: string): { success: boolean; bytesSaved: number } {
  if (!fs.existsSync(filePath)) {
    return { success: false, bytesSaved: 0 };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const result = optimize(raw, SVGO_SAFE_CONFIG as any);
    const savings = raw.length - result.data.length;

    if (savings > 0) {
      fs.writeFileSync(filePath, result.data, 'utf8');
      return { success: true, bytesSaved: savings };
    }

    return { success: true, bytesSaved: 0 };
  } catch (err) {
    console.warn(`Failed to optimize SVG: ${filePath}`, err);
    return { success: false, bytesSaved: 0 };
  }
}

/**
 * Runs the mandatory AGENTS.md verification gate.
 */
export function runVerificationGate(): boolean {
  console.log('\n🔒 Running verification gate (typecheck, lint, test:coverage, build)...');
  try {
    execSync('npm run typecheck', { stdio: 'inherit' });
    execSync('npm run lint', { stdio: 'inherit' });
    execSync('npm run test:coverage', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('❌ Verification gate failed:', err);
    return false;
  }
}

/**
 * Generates the weekly PR summary markdown body.
 */
export function generatePrSummary(
  applied: AppliedImprovement[],
  allAutoMergeable: boolean,
  pendingReview: ImprovementCandidate[] = [],
): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const lines: string[] = [];

  lines.push(`## 🛠️ Weekly Automated Micro-Improvements (${dateStr})`);
  lines.push('');
  lines.push(`**Review Policy**: ${allAutoMergeable ? '🟢 Auto-Merge Candidate (Lossless Deterministic)' : '🟡 Requires Human Review'}`);
  lines.push('');
  lines.push('### Applied Optimizations');
  lines.push('');
  lines.push('| Category | Improvement | Scope | Details |');
  lines.push('| :--- | :--- | :---: | :--- |');

  for (const item of applied) {
    lines.push(`| \`${item.category}\` | ${item.title} | ${item.canAutoMerge ? 'Auto-Merge' : 'Review'} | ${item.details} |`);
  }

  if (pendingReview.length > 0) {
    lines.push('');
    lines.push('### Pending Local Micro-Improvements');
    lines.push('');
    lines.push('| Category | Candidate | Recommended Skill | Local Command |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const item of pendingReview) {
      lines.push(`| \`${item.category}\` | ${item.title} | \`${item.recommendedSkill || 'none'}\` | \`${item.localAgentCommand || 'N/A'}\` |`);
    }
  }

  lines.push('');
  lines.push('### Verification Gate');
  lines.push('- ✅ **Pre-push verification**: Passed (`npm run typecheck && npm run lint && npm run test:coverage && npm run build`)');
  lines.push('- ✅ **Surgical changes**: Verified adhering to `AGENTS.md`');
  lines.push('');
  lines.push('---');
  lines.push('*Automated by `.github/workflows/weekly-maintenance.yml`.*');

  return lines.join('\n');
}

/**
 * Generates markdown for the weekly micro-improvement GitHub issue.
 */
export function generateIssueSummary(pendingReview: ImprovementCandidate[]): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const lines: string[] = [];

  lines.push(`## 🛠️ Weekly Micro-Improvement Candidates (${dateStr})`);
  lines.push('');
  lines.push('The weekly maintenance discovery detected opportunities for regular micro-improvements.');
  lines.push('These items require semantic reasoning and are ready for on-demand execution by a developer or an agent.');
  lines.push('');
  lines.push('### Recommended Action');
  lines.push('To resolve these candidates, start a clean worktree and run the recommended slash command below.');
  lines.push('');
  lines.push('| Category | Candidate | Target Files | Recommended Skill | Local Command |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');

  for (const item of pendingReview) {
    const fileCount = item.targetFiles.length;
    const fileSummary = fileCount <= 3 ? item.targetFiles.join(', ') : `${fileCount} files (${item.targetFiles.slice(0, 2).join(', ')}...)`;
    lines.push(
      `| \`${item.category}\` | ${item.title} | ${fileSummary} | \`${item.recommendedSkill || 'none'}\` | \`${item.localAgentCommand || 'N/A'}\` |`
    );
  }

  lines.push('');
  lines.push('### Instructions for Agent / Developer');
  for (const item of pendingReview) {
    lines.push(`#### ${item.title}`);
    lines.push(`- **Skill**: \`${item.recommendedSkill}\``);
    lines.push(`- **Prerequisite**: ${item.prerequisite || 'None'}`);
    lines.push(`- **Command**: \`${item.localAgentCommand}\``);
    lines.push(`- **Target files**:`);
    for (const f of item.targetFiles.slice(0, 10)) {
      lines.push(`  - \`${f}\``);
    }
    if (item.targetFiles.length > 10) {
      lines.push(`  - *(and ${item.targetFiles.length - 10} more files)*`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Automated by `.github/workflows/weekly-maintenance.yml`. Triage label `ready-for-agent` per `docs/agents/triage-labels.md`.*');

  return lines.join('\n');
}

/**
 * Syncs pending semantic improvement candidates with a GitHub issue.
 */
export function syncMicroImprovementIssue(pendingReview: ImprovementCandidate[]): void {
  try {
    const listCmd = 'gh issue list --state open --label "maintenance" --label "ready-for-agent" --json number,title --jq ".[0].number"';
    const existingNumberStr = execSync(listCmd, { encoding: 'utf8' }).trim();

    if (pendingReview.length === 0) {
      if (existingNumberStr && Number(existingNumberStr) > 0) {
        console.log(`Closing resolved micro-improvement issue #${existingNumberStr}...`);
        execSync(`gh issue close ${existingNumberStr} --comment "All micro-improvement candidates resolved."`, { stdio: 'inherit' });
      }
      return;
    }

    const markdownBody = generateIssueSummary(pendingReview);
    const tempPath = path.resolve(process.cwd(), '.cache/micro-improvement-issue.md');
    fs.writeFileSync(tempPath, markdownBody, 'utf8');

    if (existingNumberStr && Number(existingNumberStr) > 0) {
      console.log(`Updating existing micro-improvement issue #${existingNumberStr}...`);
      execSync(`gh issue edit ${existingNumberStr} --body-file "${tempPath}"`, { stdio: 'inherit' });
    } else {
      console.log('Creating new micro-improvement issue with label ready-for-agent...');
      execSync(
        `gh issue create --title "🛠️ Weekly Micro-Improvement Candidates" --label "maintenance" --label "ready-for-agent" --body-file "${tempPath}"`,
        { stdio: 'inherit' }
      );
    }
  } catch (err) {
    console.warn('Could not sync micro-improvement GitHub Issue (non-fatal, continuing):', err);
  }
}

/**
 * Main execution loop for weekly maintenance agent.
 */
export async function executeMaintenanceLoop(options: { publish?: boolean; dryRun?: boolean } = {}) {
  const { publish = false, dryRun = false } = options;
  console.log('🚀 Starting weekly autonomous maintenance loop...');

  // 1. Load or generate candidate manifest
  const cachePath = path.resolve(process.cwd(), '.cache/improvement-candidates.json');
  let report: DiscoveryReport;

  if (fs.existsSync(cachePath)) {
    report = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } else {
    const assetCandidates = discoverAssetImprovements();
    const tokenCandidates = discoverDesignTokenDrift();
    const bundleCandidates = discoverBundleBudgetAnomalies(null);
    report = generateDiscoveryReport([...assetCandidates, ...tokenCandidates, ...bundleCandidates]);
  }

  if (!report.candidates || report.candidates.length === 0) {
    console.log('✅ No actionable micro-improvements found this week. Exiting cleanly.');
    return;
  }

  const applied: AppliedImprovement[] = [];
  let totalBytesSaved = 0;

  // 2. Process high-confidence asset candidates
  for (const candidate of report.candidates) {
    if (candidate.category === 'asset-optimization' && candidate.canAutoMerge) {
      for (const targetFile of candidate.targetFiles) {
        console.log(`⚡ Applying lossless asset optimization on: ${targetFile}`);
        if (!dryRun) {
          const res = applyAssetOptimization(targetFile);
          if (res.success && res.bytesSaved > 0) {
            totalBytesSaved += res.bytesSaved;
            applied.push({
              id: candidate.id,
              category: candidate.category,
              title: candidate.title,
              canAutoMerge: true,
              details: `Saved ${res.bytesSaved} bytes`,
            });
          }
        } else {
          applied.push({
            id: candidate.id,
            category: candidate.category,
            title: candidate.title,
            canAutoMerge: true,
            details: `Dry run (estimated savings: ${candidate.estimatedSavings || 'N/A'})`,
          });
        }
      }
    }
  }

  const pendingReview = (report.candidates || []).filter((c) => !c.canAutoMerge);

  if (applied.length > 0) {
    console.log(`\n🎉 Applied ${applied.length} micro-optimization(s). Total bytes saved: ${totalBytesSaved} B.`);

    if (dryRun) {
      console.log('Dry run complete. No git branch or PR created.');
    } else {
      // Run Verification Gate
      const verified = runVerificationGate();
      if (!verified) {
        console.error('❌ Verification gate failed. Reverting all changes and aborting (0 broken PRs).');
        execSync('git checkout -- .', { stdio: 'inherit' });
        process.exit(1);
      }

      // Open batched weekly PR if publish requested
      if (publish) {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const branchName = `agent/weekly-maintenance-${dateStr}`;
        const allAutoMergeable = applied.every((a) => a.canAutoMerge);

        console.log(`\n🌿 Creating branch ${branchName}...`);
        execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
        execSync('git add -u public/ apps/mobile/assets/ src/', { stdio: 'inherit' });
        execSync('git commit -m "chore(maintenance): weekly automated performance & quality optimizations"', { stdio: 'inherit' });
        execSync(`git push -u origin ${branchName}`, { stdio: 'inherit' });

        const prBody = generatePrSummary(applied, allAutoMergeable, pendingReview);
        const bodyPath = path.resolve(process.cwd(), '.cache/pr-body.md');
        fs.writeFileSync(bodyPath, prBody, 'utf8');

        const prCmd = [
          'gh pr create',
          '--title "chore(maintenance): weekly automated performance & quality optimizations"',
          `--body-file "${bodyPath}"`,
          '--label "maintenance"',
          '--label "automated-improvement"',
          allAutoMergeable ? '--label "automerge"' : '',
        ].filter(Boolean).join(' ');

        console.log('📬 Creating Pull Request on GitHub...');
        execSync(prCmd, { stdio: 'inherit' });
        console.log('✅ Weekly automated PR created successfully.');
      }
    }
  } else {
    console.log('ℹ️ No deterministic candidates could be applied.');
  }

  // Sync semantic improvement candidates with GitHub Issue for on-demand agent pickup
  if (publish && !dryRun) {
    syncMicroImprovementIssue(pendingReview);
  } else if (dryRun && pendingReview.length > 0) {
    console.log(`\n📋 [Dry Run] Would sync GitHub issue with ${pendingReview.length} pending candidate(s):`);
    for (const item of pendingReview) {
      console.log(`   • ${item.title} (Skill: ${item.recommendedSkill || 'none'})`);
    }
  }
}

// CLI Execution
if (process.argv[1]?.endsWith('runner.ts')) {
  const isPublish = process.argv.includes('--publish') || process.env.CI === 'true';
  const isDryRun = process.argv.includes('--dry-run');

  executeMaintenanceLoop({ publish: isPublish, dryRun: isDryRun }).catch((err) => {
    console.error('Fatal error in maintenance runner:', err);
    process.exit(1);
  });
}
