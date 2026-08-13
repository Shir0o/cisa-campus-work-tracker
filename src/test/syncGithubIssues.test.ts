import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchGitHubIssues, syncIssuesToDocs, autoCommitAndPush } from '../../scripts/sync-github-issues';
import * as childProcess from 'node:child_process';

describe('sync-github-issues script', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchGitHubIssues', () => {
    it('fetches and maps issues correctly from GitHub REST API', async () => {
      const mockApiIssues = [
        {
          id: 101,
          number: 1,
          title: 'First issue',
          state: 'open',
          user: {
            login: 'alice',
            avatar_url: 'https://github.com/alice.png',
            html_url: 'https://github.com/alice',
          },
          labels: [{ id: 10, name: 'bug', color: 'ff0000', description: 'Bug report' }],
          assignees: [{ login: 'bob', avatar_url: 'https://github.com/bob.png' }],
          comments: 3,
          created_at: '2026-08-01T10:00:00Z',
          updated_at: '2026-08-02T10:00:00Z',
          closed_at: null,
          body: 'This is issue #1 description',
          html_url: 'https://github.com/owner/repo/issues/1',
        },
        {
          id: 102,
          number: 2,
          title: 'A pull request',
          state: 'closed',
          user: {
            login: 'charlie',
            avatar_url: 'https://github.com/charlie.png',
            html_url: 'https://github.com/charlie',
          },
          labels: [],
          assignees: [],
          comments: 0,
          created_at: '2026-08-03T10:00:00Z',
          updated_at: '2026-08-04T10:00:00Z',
          closed_at: '2026-08-04T10:00:00Z',
          body: 'PR description',
          html_url: 'https://github.com/owner/repo/pull/2',
          pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/2' },
        },
      ];

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockApiIssues), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      globalThis.fetch = fetchMock;

      const issues = await fetchGitHubIssues('owner/repo', 'test-token');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues?state=open&per_page=100&page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github+json',
          }),
        })
      );

      expect(issues).toHaveLength(2);

      // Verify regular issue mapping
      expect(issues[0]).toEqual({
        id: 101,
        number: 1,
        title: 'First issue',
        state: 'open',
        user: {
          login: 'alice',
          avatar_url: 'https://github.com/alice.png',
          html_url: 'https://github.com/alice',
        },
        labels: [{ id: 10, name: 'bug', color: 'ff0000', description: 'Bug report' }],
        assignees: [{ login: 'bob', avatar_url: 'https://github.com/bob.png' }],
        comments: 3,
        created_at: '2026-08-01T10:00:00Z',
        updated_at: '2026-08-02T10:00:00Z',
        closed_at: null,
        body: 'This is issue #1 description',
        html_url: 'https://github.com/owner/repo/issues/1',
        is_pull_request: false,
      });

      // Verify PR issue mapping
      expect(issues[1].is_pull_request).toBe(true);
    });

    it('paginates correctly across multiple API pages', async () => {
      // Return 100 items on page 1, 1 item on page 2
      const page1Data = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        number: i + 1,
        title: `Issue ${i + 1}`,
        state: 'open',
        user: null,
        labels: [],
        assignees: [],
        comments: 0,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
        closed_at: null,
        body: null,
        html_url: `https://github.com/owner/repo/issues/${i + 1}`,
      }));

      const page2Data = [
        {
          id: 101,
          number: 101,
          title: 'Issue 101',
          state: 'open',
          user: null,
          labels: [],
          assignees: [],
          comments: 0,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
          closed_at: null,
          body: null,
          html_url: 'https://github.com/owner/repo/issues/101',
        },
      ];

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(page1Data), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(page2Data), { status: 200 })
        );

      globalThis.fetch = fetchMock;

      const issues = await fetchGitHubIssues('owner/repo');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(issues).toHaveLength(101);
    });

    it('throws error when GitHub API returns a non-200 status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      );

      await expect(fetchGitHubIssues('owner/unknown-repo')).rejects.toThrow(
        'Failed to fetch issues from GitHub (404 Not Found): Not Found. If this is a private repository, please set the GITHUB_TOKEN environment variable.'
      );
    });
  });

  describe('syncIssuesToDocs', () => {
    const testOutputDir = path.join(process.cwd(), 'tmp', 'test-docs');
    const testOutputPath = path.join(testOutputDir, 'issues.json');

    afterEach(() => {
      if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      }
    });

    it('creates missing output directory and writes formatted issues JSON', async () => {
      const mockIssues = [
        {
          id: 1,
          number: 1,
          title: 'Test Issue',
          state: 'open',
          user: null,
          labels: [],
          assignees: [],
          comments: 0,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
          closed_at: null,
          body: null,
          html_url: 'https://github.com/owner/repo/issues/1',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockIssues), { status: 200 })
      );

      await syncIssuesToDocs({
        repo: 'test-owner/test-repo',
        outputPath: testOutputPath,
      });

      expect(fs.existsSync(testOutputPath)).toBe(true);

      const writtenContent = fs.readFileSync(testOutputPath, 'utf8');
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Test Issue');
    });

    it('removes existing output file before writing fresh issues', async () => {
      fs.mkdirSync(testOutputDir, { recursive: true });
      fs.writeFileSync(testOutputPath, JSON.stringify([{ id: 999, title: 'Old Resolved Issue' }]));
      expect(fs.existsSync(testOutputPath)).toBe(true);

      const mockIssues = [
        {
          id: 201,
          number: 5,
          title: 'Fresh Active Issue',
          state: 'open',
          user: null,
          labels: [],
          assignees: [],
          comments: 0,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
          closed_at: null,
          body: null,
          html_url: 'https://github.com/owner/repo/issues/5',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockIssues), { status: 200 })
      );

      await syncIssuesToDocs({
        repo: 'test-owner/test-repo',
        outputPath: testOutputPath,
      });

      const writtenContent = fs.readFileSync(testOutputPath, 'utf8');
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Fresh Active Issue');
      expect(parsed[0].id).toBe(201);
    });

    it('triggers autoCommitAndPush when autoCommitPush is true', async () => {
      const execSyncSpy = vi.fn().mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.startsWith('git status')) {
          return ' M docs/issues.json';
        }
        return '';
      });

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      );

      await syncIssuesToDocs({
        repo: 'test-owner/test-repo',
        outputPath: testOutputPath,
        autoCommitPush: true,
        branch: 'main',
        execFn: execSyncSpy,
      });

      expect(execSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining('git status --porcelain'),
        expect.any(Object)
      );
      expect(execSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining('git add'),
        expect.any(Object)
      );
      expect(execSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining('git commit'),
        expect.any(Object)
      );
      expect(execSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining('git push origin main'),
        expect.any(Object)
      );
    });

    it('skips git commit and push when autoCommitAndPush detects no changes', async () => {
      const execSyncSpy = vi.fn().mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.startsWith('git status')) {
          return '';
        }
        return '';
      });

      const result = autoCommitAndPush(testOutputPath, 'main', execSyncSpy);
      expect(result).toBe(false);
      expect(execSyncSpy).toHaveBeenCalledTimes(1);
    });
  });
});

