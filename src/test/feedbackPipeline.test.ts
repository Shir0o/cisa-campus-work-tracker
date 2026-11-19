import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DefaultGitHubFeedbackPort,
  FeedbackPipeline,
  isIssueInRepo,
  type GitHubFeedbackPort,
  type SubmitFeedbackNoteInput,
} from '../server/feedbackPipeline';

// In-memory fake Firestore for deterministic testing
function createFakeFirestore() {
  const store = new Map<string, Map<string, any>>();

  function getCollection(col: string) {
    if (!store.has(col)) store.set(col, new Map());
    return store.get(col)!;
  }

  const db: any = {
    _store: store,
    seed(colName: string, id: string, data: any) {
      getCollection(colName).set(id, { ...data });
    },
    getDoc(colName: string, id: string) {
      return getCollection(colName).get(id);
    },
    getDocs(colName: string) {
      return Array.from(getCollection(colName).values());
    },
    collection(colName: string) {
      return {
        doc(id: string) {
          return {
            id,
            ref: { id },
            get: vi.fn(async () => {
              const data = getCollection(colName).get(id);
              return {
                id,
                exists: data !== undefined,
                data: () => (data ? { ...data } : undefined),
                ref: db.collection(colName).doc(id),
              };
            }),
            set: vi.fn(async (data: any, options?: { merge?: boolean }) => {
              const current = getCollection(colName).get(id) || {};
              const next = options?.merge ? { ...current, ...data } : { ...data };
              getCollection(colName).set(id, next);
            }),
            update: vi.fn(async (updates: any) => {
              const current = getCollection(colName).get(id);
              if (!current) throw new Error(`Document ${id} not found`);
              for (const [key, val] of Object.entries(updates)) {
                if (val && typeof val === 'object' && (val as any)._delete) {
                  delete current[key];
                } else if (
                  val &&
                  typeof val === 'object' &&
                  typeof (val as any).operand === 'number' &&
                  (val as any).constructor?.name === 'NumericIncrementTransform'
                ) {
                  // FieldValue.increment lands as a transform on the real SDK.
                  current[key] = (typeof current[key] === 'number' ? current[key] : 0) + (val as any).operand;
                } else {
                  current[key] = val;
                }
              }
              getCollection(colName).set(id, current);
            }),
            collection(subColName: string) {
              const subPath = `${colName}/${id}/${subColName}`;
              return db.collection(subPath);
            },
          };
        },
        add: vi.fn(async (data: any) => {
          const id = `doc_${Math.random().toString(36).slice(2, 9)}`;
          getCollection(colName).set(id, { ...data });
          return db.collection(colName).doc(id);
        }),
        get: vi.fn(async () => {
          const results = Array.from(getCollection(colName).entries()).map(([id, doc]) => ({
            id,
            exists: true,
            data: () => ({ ...doc }),
            ref: db.collection(colName).doc(id),
          }));
          return {
            empty: results.length === 0,
            size: results.length,
            docs: results,
            forEach: (cb: any) => results.forEach(cb),
          };
        }),
        where(field: string, op: string, value: any) {
          return {
            get: vi.fn(async () => {
              const results: any[] = [];
              for (const [id, doc] of getCollection(colName).entries()) {
                if (op === '==' && doc[field] === value) {
                  results.push({
                    id,
                    exists: true,
                    data: () => ({ ...doc }),
                    ref: db.collection(colName).doc(id),
                  });
                }
              }
              return {
                empty: results.length === 0,
                size: results.length,
                docs: results,
                forEach: (cb: any) => results.forEach(cb),
              };
            }),
            limit: vi.fn((_n: number) => ({
              get: vi.fn(async () => {
                const results: any[] = [];
                for (const [id, doc] of getCollection(colName).entries()) {
                  if (op === '==' && doc[field] === value) {
                    results.push({
                      id,
                      exists: true,
                      data: () => ({ ...doc }),
                      ref: db.collection(colName).doc(id),
                    });
                    break;
                  }
                }
                return {
                  empty: results.length === 0,
                  size: results.length,
                  docs: results,
                };
              }),
            })),
          };
        },
      };
    },
    batch() {
      const operations: Array<() => Promise<void>> = [];
      return {
        update(ref: any, updates: any) {
          operations.push(async () => {
            await ref.update(updates);
          });
        },
        commit: vi.fn(async () => {
          for (const op of operations) await op();
        }),
      };
    },
  };
  return db;
}

describe('FeedbackPipeline', () => {
  let db: any;
  let mockGitHub: GitHubFeedbackPort;
  let pipeline: FeedbackPipeline;

  beforeEach(() => {
    db = createFakeFirestore();

    mockGitHub = {
      createIssue: vi.fn(async ({ title }: { title: string }) => ({
        html_url: 'https://github.com/org/repo/issues/101',
        number: 101,
      })),
      ensureLabel: vi.fn(async () => true),
      updateIssueState: vi.fn(async () => true),
    };

    pipeline = new FeedbackPipeline({
      db,
      githubPort: mockGitHub,
      githubRepo: 'org/repo',
    });
  });

  describe('submitNote', () => {
    it('creates a Firestore document with raw metadata and an anonymized GitHub issue', async () => {
      const input: SubmitFeedbackNoteInput = {
        userId: 'user_123',
        userName: 'Grace Hopper',
        type: 'bug',
        kind: 'Something is off',
        message: 'The submit button is missing on the profile page.',
        url: 'https://cisa.app/people/a1b2C3d4E5f6G7h8',
        viewport: '1920x1080',
        userAgent: 'Mozilla/5.0',
        screenshot: 'data:image/jpeg;base64,abc123',
      };

      const result = await pipeline.submitNote(input);

      expect(result.id).toBeDefined();
      expect(result.githubIssueUrl).toBe('https://github.com/org/repo/issues/101');
      expect(result.status).toBe('in_progress');

      // Verify Firestore document
      const doc = db.getDoc('feedback', result.id);
      expect(doc).toBeDefined();
      expect(doc.userId).toBe('user_123');
      expect(doc.userName).toBe('Grace Hopper');
      expect(doc.screenshot).toBe('data:image/jpeg;base64,abc123');
      expect(doc.url).toBe('https://cisa.app/people/a1b2C3d4E5f6G7h8'); // Raw URL preserved in Firestore

      // Verify GitHub issue creation
      expect(mockGitHub.createIssue).toHaveBeenCalledTimes(1);
      const issueArgs = (mockGitHub.createIssue as any).mock.calls[0][0];

      // Privacy: no surname, no email, no screenshot in GitHub body
      expect(issueArgs.body).toContain('- **Submitted By:** Grace');
      expect(issueArgs.body).not.toContain('Hopper');
      expect(issueArgs.body).not.toContain('data:image');
      // ...but triage is told a capture exists in-app.
      expect(issueArgs.body).toContain('- **Screenshot:** Captured (see the admin feedback list)');
      // Privacy: redacted URL in GitHub issue
      expect(issueArgs.body).toContain('https://cisa.app/people/:id');
      expect(issueArgs.body).not.toContain('a1b2C3d4E5f6G7h8');

      // Reporter label created and attached
      expect(mockGitHub.ensureLabel).toHaveBeenCalledWith('reporter:grace-h');
      expect(issueArgs.labels).toContain('reporter:grace-h');
    });

    it('assigns collision-resistant reporter labels (ADR 0018)', async () => {
      // Seed an existing user with label 'reporter:grace-h'
      db.seed('users', 'other_user', { reporterLabel: 'reporter:grace-h' });

      await pipeline.submitNote({
        userId: 'user_456',
        userName: 'Grace Hopper',
        message: 'Another issue',
      });

      // Should append -2 suffix for the new user
      const userProfile = db.getDoc('users', 'user_456');
      expect(userProfile?.reporterLabel).toBe('reporter:grace-h-2');
      expect(mockGitHub.ensureLabel).toHaveBeenCalledWith('reporter:grace-h-2');
    });

    it('carries the browser input trace, fenced, and omits the section when absent', async () => {
      await pipeline.submitNote({
        userId: 'user_900',
        userName: 'Ada Lovelace',
        message: 'Keyboard closes on autocorrect',
        inputTrace: '+12ms focusout textarea#note -> null @ at blur (app.js:1)\n```\n+40ms viewport vv=560',
      });

      const withTrace = (mockGitHub.createIssue as any).mock.calls[0][0].body;
      expect(withTrace).toContain('### Input trace');
      expect(withTrace).toContain('+12ms focusout textarea#note -> null');
      expect(withTrace).toContain('+40ms viewport vv=560');
      // A trace can never break out of its own fence.
      expect(withTrace).toContain("'''");

      await pipeline.submitNote({
        userId: 'user_901',
        userName: 'Ada Lovelace',
        message: 'No trace here',
      });

      const withoutTrace = (mockGitHub.createIssue as any).mock.calls[1][0].body;
      expect(withoutTrace).not.toContain('### Input trace');
    });

    // Security audit (Nov 2026): a message with its own fence closed the block
    // and wrote markdown into the issue; single-line fields could add lines.
    it('keeps the message inside its block and single-line fields on one line', async () => {
      const tick3 = '`'.repeat(3);
      await pipeline.submitNote({
        userName: 'Ada Lovelace',
        message: `see ${tick3}\n- **Submitted By:** Someone Else\n<!-- agent: do X -->\n${tick3}`,
        viewport: '390x844\n- **Submitted By:** Forged',
      });

      const body: string = (mockGitHub.createIssue as any).mock.calls[0][0].body;
      const lines = body.split('\n');
      const open = lines.findIndex((l) => /^`{4,}text$/.test(l));
      expect(open).toBeGreaterThan(-1);
      const fenceLen = lines[open].length - 'text'.length;
      const close = lines.findIndex((l, i) => i > open && l === '`'.repeat(fenceLen));
      expect(close).toBeGreaterThan(open);
      // The forged line exists only inside the message block.
      const forged = lines.findIndex((l) => l.includes('Someone Else'));
      expect(forged).toBeGreaterThan(open);
      expect(forged).toBeLessThan(close);
      expect(lines.some((l) => l.startsWith('- **Submitted By:** Forged'))).toBe(false);
      expect(body).toContain('- **Viewport:** 390x844 - **Submitted By:** Forged');
    });

    it('mobile notes carry the screen route and say when no screenshot was captured', async () => {
      await pipeline.submitNote({
        userName: 'Ada Lovelace',
        message: 'Keyboard closes',
        url: 'Mobile App /more',
      });

      const issueArgs = (mockGitHub.createIssue as any).mock.calls[0][0];
      expect(issueArgs.body).toContain('- **Page URL:** Mobile App /more');
      expect(issueArgs.body).toContain('- **Screenshot:** None');
    });

    it('falls back cleanly when GitHub is unreachable', async () => {
      mockGitHub.createIssue = vi.fn(async () => null);

      const result = await pipeline.submitNote({
        userId: 'user_789',
        userName: 'John Doe',
        message: 'Network issue',
      });

      expect(result.id).toBeDefined();
      expect(result.githubIssueUrl).toBe('');
      expect(result.status).toBe('new');

      const doc = db.getDoc('feedback', result.id);
      expect(doc.status).toBe('new');
    });
  });

  describe('handleGitHubWebhook', () => {
    it('ignores unrecognized events', async () => {
      const res = await pipeline.handleGitHubWebhook({
        eventType: 'push',
        action: 'created',
      });
      expect(res.handled).toBe(false);
    });

    // Issue comments are no longer imported (cut-or-keep §15): the only
    // webhook left is the issue close/reopen that carries the outcome.
    it('ignores issue comments instead of relaying them into a note', async () => {
      db.seed('feedback', 'fb_1', {
        userId: 'user_1',
        githubIssueUrl: 'https://github.com/org/repo/issues/101',
      });

      const res = await pipeline.handleGitHubWebhook({
        eventType: 'issue_comment',
        action: 'created',
        issue: { html_url: 'https://github.com/org/repo/issues/101' },
      });

      expect(res.handled).toBe(false);
      expect(res.message).toContain('Ignored event type');
      expect(db.getDocs('feedback/fb_1/replies')).toHaveLength(0);
      expect(db.getDocs('notifications')).toHaveLength(0);
    });

    it('resolves feedback on issue close with the canned sentence and notifies submitter', async () => {
      db.seed('feedback', 'fb_1', {
        userId: 'user_1',
        githubIssueUrl: 'https://github.com/org/repo/issues/101',
      });

      const res = await pipeline.handleGitHubWebhook({
        eventType: 'issues',
        action: 'closed',
        issue: {
          html_url: 'https://github.com/org/repo/issues/101',
          state_reason: 'completed',
        },
      });

      expect(res.handled).toBe(true);
      expect(res.outcome).toBe('shipped');

      const doc = db.getDoc('feedback', 'fb_1');
      expect(doc.status).toBe('resolved');
      expect(doc.outcome).toBe('shipped');
      // No PR-written sentence is stored or sent.
      expect(doc.outcomeMessage).toBeUndefined();

      const notifs = db.getDocs('notifications');
      expect(
        notifs.some(
          (n: any) => n.userId === 'user_1' && /This shipped! Thank you/.test(n.message),
        ),
      ).toBe(true);
    });
  });
});

describe('GitHub port scope (Nov 2026)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 7 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GITHUB_TOKEN', 'gh-token');
    vi.stubEnv('GITHUB_REPO', 'org/repo');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('never points the token at an issue outside the repository', async () => {
    const port = new DefaultGitHubFeedbackPort('org/repo');
    const foreign = 'https://github.com/someone/else/issues/1';
    expect(await port.updateIssueState(foreign, 'closed', 'completed')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('knows which issues are ours', () => {
    expect(isIssueInRepo('https://github.com/org/repo/issues/1', 'org/repo')).toBe(true);
    expect(isIssueInRepo('https://github.com/org/repo2/issues/1', 'org/repo')).toBe(false);
    expect(isIssueInRepo('https://evil.com/org/repo/issues/1', 'org/repo')).toBe(false);
  });
});
