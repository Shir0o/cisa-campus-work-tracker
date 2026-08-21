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
  label: 'OPEN' | 'CLOSED';
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

export interface GitHubIssueIndex {
  number: number;
  title: string;
  state: string;
  labels: string[];
  body: string;
}

export function oneLineBody(body: string | null | undefined): string {
  return (body ?? '').replace(/\s+/g, ' ').trim();
}

export function buildIssueIndex(issues: GitHubIssueSummary[]): GitHubIssueIndex[] {
  return issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels.map((label) => label.name),
    body: oneLineBody(issue.body),
  }));
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
    const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=${perPage}&page=${page}`;
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
      // GitHub's /issues endpoint also returns pull requests. Keep the sync
      // file focused on actual issues only, so the count doesn't include PRs.
      if (item.pull_request) continue;

      issues.push({
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state,
        label: item.state === 'closed' ? 'CLOSED' : 'OPEN',
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
  filePath: string | string[],
  branch = 'main',
  execFn: (cmd: string, opts?: any) => any = execSync
): boolean {
  try {
    const filePaths = Array.isArray(filePath) ? filePath : [filePath];
    const relativePaths = filePaths.map((file) => path.relative(process.cwd(), file));
    const pathsForShell = relativePaths.map((relativePath) => `"${relativePath}"`).join(' ');
    const displayPaths = relativePaths.join(', ');

    console.log(`Switching to ${branch}...`);
    execFn(`git switch ${branch}`, { stdio: 'inherit' });

    const status = (execFn(`git status --porcelain ${pathsForShell}`, { encoding: 'utf8' }) || '').toString().trim();

    if (!status) {
      console.log(`No changes detected in ${displayPaths}. Skipping commit and push.`);
      return false;
    }

    console.log(`Staging ${displayPaths}...`);
    execFn(`git add ${pathsForShell}`, { stdio: 'inherit' });

    try {
      execFn('git config user.name', { encoding: 'utf8' });
    } catch {
      execFn('git config user.name "github-actions[bot]"', { stdio: 'inherit' });
      execFn('git config user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'inherit' });
    }

    console.log(`Committing changes...`);
    execFn(`git commit -m "docs: sync github issues into ${displayPaths} [skip ci]"`, { stdio: 'inherit' });

    console.log(`Pushing to ${branch}...`);
    execFn(`git push origin ${branch}`, { stdio: 'inherit' });
    console.log(`Successfully committed and pushed ${displayPaths} to ${branch}.`);
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
  indexOutputPath?: string;
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
  const indexOutputPath = opts?.indexOutputPath || path.join(path.dirname(outputPath), 'issues-index.json');
  const autoCommitPush = opts?.autoCommitPush ?? false;
  const branch = opts?.branch || 'main';
  const execFn = opts?.execFn || execSync;

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

  const issueIndex = buildIssueIndex(issues);
  if (fs.existsSync(indexOutputPath)) {
    console.log(`Removing existing issues index file at ${indexOutputPath}...`);
    await fs.promises.rm(indexOutputPath, { force: true });
  }

  await fs.promises.writeFile(indexOutputPath, JSON.stringify(issueIndex, null, 2) + '\n', 'utf8');
  console.log(`Successfully written issue index to ${indexOutputPath}`);

  if (autoCommitPush) {
    autoCommitAndPush([outputPath, indexOutputPath], branch, execFn);
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

