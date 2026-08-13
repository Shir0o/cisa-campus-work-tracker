import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

export interface GitHubIssueSummary {
  id: number;
  number: number;
  title: string;
  state: string;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  } | null;
  labels: Array<{
    id: number;
    name: string;
    color: string;
    description?: string | null;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  body: string | null;
  html_url: string;
  is_pull_request: boolean;
}

export async function fetchGitHubIssues(repo: string, token?: string): Promise<GitHubIssueSummary[]> {
  const issues: GitHubIssueSummary[] = [];
  let page = 1;
  const perPage = 100;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CISA-Campus-Work-Tracker-Issue-Sync',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  while (true) {
    const url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const text = await res.text();
      const authHint = (!token && res.status === 404)
        ? ' If this is a private repository, please set the GITHUB_TOKEN environment variable.'
        : '';
      throw new Error(`Failed to fetch issues from GitHub (${res.status} ${res.statusText}): ${text}.${authHint}`);
    }

    const data = (await res.json()) as any[];
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const item of data) {
      issues.push({
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state,
        user: item.user
          ? {
              login: item.user.login,
              avatar_url: item.user.avatar_url,
              html_url: item.user.html_url,
            }
          : null,
        labels: Array.isArray(item.labels)
          ? item.labels.map((l: any) => ({
              id: l.id,
              name: l.name,
              color: l.color,
              description: l.description || null,
            }))
          : [],
        assignees: Array.isArray(item.assignees)
          ? item.assignees.map((a: any) => ({
              login: a.login,
              avatar_url: a.avatar_url,
            }))
          : [],
        comments: item.comments || 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
        closed_at: item.closed_at || null,
        body: item.body || null,
        html_url: item.html_url,
        is_pull_request: Boolean(item.pull_request),
      });
    }

    if (data.length < perPage) {
      break;
    }

    page++;
  }

  return issues;
}

export function autoCommitAndPush(
  filePath: string,
  branch = 'main',
  execFn: (cmd: string, opts?: any) => any = execSync
): boolean {
  try {
    const relativePath = path.relative(process.cwd(), filePath);
    const status = (execFn(`git status --porcelain "${relativePath}"`, { encoding: 'utf8' }) || '').toString().trim();

    if (!status) {
      console.log(`No changes detected in ${relativePath}. Skipping commit and push.`);
      return false;
    }

    console.log(`Staging ${relativePath}...`);
    execFn(`git add "${relativePath}"`, { stdio: 'inherit' });

    try {
      execFn('git config user.name', { encoding: 'utf8' });
    } catch {
      execFn('git config user.name "github-actions[bot]"', { stdio: 'inherit' });
      execFn('git config user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'inherit' });
    }

    console.log(`Committing changes...`);
    execFn(`git commit -m "docs: sync github issues into ${relativePath} [skip ci]"`, { stdio: 'inherit' });

    console.log(`Pushing to ${branch}...`);
    execFn(`git push origin ${branch}`, { stdio: 'inherit' });
    console.log(`Successfully committed and pushed ${relativePath} to ${branch}.`);
    return true;
  } catch (err) {
    console.error('Error during auto-commit and push:', err);
    throw err;
  }
}

export async function syncIssuesToDocs(opts?: {
  repo?: string;
  token?: string;
  outputPath?: string;
  autoCommitPush?: boolean;
  branch?: string;
  execFn?: (cmd: string, opts?: any) => any;
}) {
  const repo =
    opts?.repo ||
    process.env.GITHUB_REPO ||
    process.env.VITE_GITHUB_REPO ||
    'Shir0o/cisa-campus-work-traker';
  const token = opts?.token || process.env.GITHUB_TOKEN;
  const outputPath = opts?.outputPath || path.join(process.cwd(), 'docs', 'issues.json');
  const autoCommitPush = opts?.autoCommitPush ?? false;
  const branch = opts?.branch || 'main';

  console.log(`Fetching GitHub issues for repository "${repo}"...`);
  const issues = await fetchGitHubIssues(repo, token);
  console.log(`Fetched ${issues.length} issues.`);

  const dir = path.dirname(outputPath);
  await fs.promises.mkdir(dir, { recursive: true });

  if (fs.existsSync(outputPath)) {
    console.log(`Removing existing issues file at ${outputPath}...`);
    await fs.promises.rm(outputPath, { force: true });
  }

  await fs.promises.writeFile(outputPath, JSON.stringify(issues, null, 2) + '\n', 'utf8');
  console.log(`Successfully written issues to ${outputPath}`);

  if (autoCommitPush) {
    autoCommitAndPush(outputPath, branch, opts?.execFn);
  }
}

// Execute CLI if run directly
const isDirectExecution =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('sync-github-issues.ts');

if (isDirectExecution) {
  syncIssuesToDocs({ autoCommitPush: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error syncing GitHub issues:', err);
      process.exit(1);
    });
}

