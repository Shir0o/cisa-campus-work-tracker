import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrateFeedbackToGithub } from '../../scripts/migrate-feedback-to-github';

type Doc = { id: string; data: () => any };

const makeDb = (docs: Doc[]) => {
  const updates: Array<{ id: string; patch: any }> = [];
  const db = {
    collection: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({
        forEach: (cb: (d: Doc) => void) => docs.forEach(cb),
      }),
      doc: vi.fn((id: string) => ({
        update: vi.fn(async (patch: any) => {
          updates.push({ id, patch });
        }),
      })),
    })),
  };
  return { db, updates };
};

describe('migrate-feedback-to-github script', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('GITHUB_TOKEN', 'gh-token');
    vi.stubEnv('GITHUB_REPO', 'org/repo');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ html_url: 'https://github.com/org/repo/issues/5', number: 5 }), { status: 201 })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('throws when GITHUB_TOKEN is missing', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    await expect(migrateFeedbackToGithub(makeDb([]).db as any)).rejects.toThrow('GITHUB_TOKEN');
  });

  it('throws when neither GITHUB_REPO nor VITE_GITHUB_REPO is set', async () => {
    vi.stubEnv('GITHUB_REPO', '');
    vi.stubEnv('VITE_GITHUB_REPO', '');
    await expect(migrateFeedbackToGithub(makeDb([]).db as any)).rejects.toThrow('GITHUB_REPO');
  });

  it('is a no-op when there is no unresolved, unlinked feedback', async () => {
    const { db } = makeDb([
      { id: 'f1', data: () => ({ githubIssueUrl: 'https://github.com/x/y/issues/1', status: 'new' }) },
      { id: 'f2', data: () => ({ status: 'resolved' }) },
    ]);
    await migrateFeedbackToGithub(db as any);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a GitHub issue and links the Firestore doc for unlinked feedback', async () => {
    const { db, updates } = makeDb([
      { id: 'f1', data: () => ({ message: 'Fix the search bar', kind: 'off', type: 'bug', userName: 'Ada', userEmail: 'ada@example.com' }) },
    ]);
    await migrateFeedbackToGithub(db as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/org/repo/issues');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title).toContain("Something's off");
    expect(body.title).toContain('Fix the search bar');
    expect(body.labels).toEqual(['bug', 'feedback']);

    expect(updates).toEqual([
      { id: 'f1', patch: { githubIssueUrl: 'https://github.com/org/repo/issues/5', status: 'in_progress' } },
    ]);
  });

  it('includes screenshot image markdown when item has a screenshot and APP_URL is configured', async () => {
    vi.stubEnv('APP_URL', 'https://app.example.com');
    const { db } = makeDb([
      { id: 'f-screen', data: () => ({ message: 'Screen test', screenshot: 'data:image/jpeg;base64,123', type: 'bug' }) },
    ]);
    await migrateFeedbackToGithub(db as any);

    const bodyStr = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).body;
    expect(bodyStr).toContain('![Feedback Screenshot](https://app.example.com/api/feedback/f-screen/screenshot)');
  });

  it('truncates long messages in the title', async () => {
    const longMsg = 'x'.repeat(120);
    const { db } = makeDb([{ id: 'f1', data: () => ({ message: longMsg, type: 'enhancement' }) }]);
    await migrateFeedbackToGithub(db as any);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.title).toMatch(/^\[Feedback\] enhancement: x{50}\.\.\.$/);
  });

  it('continues with the next item when a GitHub call fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ html_url: 'https://github.com/org/repo/issues/6', number: 6 }), { status: 201 })
    );
    const { db, updates } = makeDb([
      { id: 'f1', data: () => ({ message: 'first', type: 'bug' }) },
      { id: 'f2', data: () => ({ message: 'second', type: 'bug' }) },
    ]);
    await migrateFeedbackToGithub(db as any);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([
      { id: 'f2', patch: { githubIssueUrl: 'https://github.com/org/repo/issues/6', status: 'in_progress' } },
    ]);
  });
});
