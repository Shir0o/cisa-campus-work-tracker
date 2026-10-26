import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FeedbackPipeline,
  type GitHubFeedbackPort,
  type FeedbackAIPort,
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
  let mockAI: FeedbackAIPort;
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
      postComment: vi.fn(async () => 555),
      editComment: vi.fn(async () => true),
      fetchIssueTimeline: vi.fn(async () => [
        {
          event: 'cross-referenced',
          source: {
            issue: {
              pull_request: {
                url: 'https://api.github.com/repos/org/repo/pulls/42',
                merged_at: '2026-10-12T00:00:00Z',
              },
            },
          },
        },
      ]),
      fetchPullRequest: vi.fn(async () => ({ title: 'Fix bug', body: 'Fixed the issue' })),
    };

    mockAI = {
      launderComment: vi.fn(async (raw: string) => `Laundered: ${raw}`),
      summarizePRClose: vi.fn(async () => 'You can now view notifications directly.'),
    };

    pipeline = new FeedbackPipeline({
      db,
      githubPort: mockGitHub,
      aiPort: mockAI,
      ownerEmail: 'owner@example.com',
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

    it('mobile notes carry the screen route and say when no screenshot was captured', async () => {
      await pipeline.submitNote({
        userId: 'user_321',
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

  describe('updateNote', () => {
    it('throws error when feedback note does not exist', async () => {
      await expect(pipeline.updateNote({ id: 'missing_id', status: 'resolved' })).rejects.toThrow(
        'not found',
      );
    });

    it('updates Firestore and syncs state to GitHub issue', async () => {
      db.seed('feedback', 'fb_1', {
        status: 'in_progress',
        githubIssueUrl: 'https://github.com/org/repo/issues/101',
      });

      const res = await pipeline.updateNote({
        id: 'fb_1',
        status: 'resolved',
      });

      expect(res.updates.status).toBe('resolved');
      expect(mockGitHub.updateIssueState).toHaveBeenCalledWith(
        'https://github.com/org/repo/issues/101',
        'closed',
        'completed',
      );
    });
  });

  describe('addFollowUp & editFollowUp', () => {
    beforeEach(() => {
      db.seed('feedback', 'fb_1', {
        userId: 'submitter_uid',
        userName: 'Submitter Sam',
        githubIssueUrl: 'https://github.com/org/repo/issues/101',
      });
      db.seed('users', 'admin_uid', { role: 'admin' });
    });

    it('allows the submitter to add a follow-up, mirrors to GitHub, and sets awaitingReply', async () => {
      const res = await pipeline.addFollowUp({
        id: 'fb_1',
        body: 'Can someone clarify the timeline?',
        actor: { uid: 'submitter_uid', name: 'Submitter Sam' },
      });

      expect(res.mirroredToGitHub).toBe(true);
      expect(mockGitHub.postComment).toHaveBeenCalledWith(
        'https://github.com/org/repo/issues/101',
        expect.stringContaining('**Reporter replied:**\n\nCan someone clarify the timeline?'),
      );

      const note = db.getDoc('feedback', 'fb_1');
      expect(note.awaitingReply).toBe(true);

      // Fans out notification to Full-timers
      const notifs = db.getDocs('notifications');
      expect(notifs.some((n: any) => n.userId === 'admin_uid' && n.title === 'A follow-up on a note')).toBe(true);
    });

    it('records how many follow-ups a note holds, and whose was last', async () => {
      await pipeline.addFollowUp({
        id: 'fb_1',
        body: 'Any update on this?',
        actor: { uid: 'submitter_uid', name: 'Submitter Sam' },
      });

      const note = db.getDoc('feedback', 'fb_1');
      expect(note.replyCount).toBe(1);
      expect(note.lastReplyRole).toBe('submitter');
      expect(note.lastReplyAt).toBeTruthy();
    });

    it('counts the follow-ups a note already held before the field existed', async () => {
      // The seeded thread in the issue: two replies, no count on the Note. A
      // blind increment would report the newest reply as the whole thread.
      db.seed('feedback/fb_1/replies', 'reply_1', { authorRole: 'team', body: 'One' });
      db.seed('feedback/fb_1/replies', 'reply_2', { authorRole: 'team', body: 'Two' });

      await pipeline.addFollowUp({
        id: 'fb_1',
        body: 'Thank you',
        actor: { uid: 'submitter_uid' },
      });

      expect(db.getDoc('feedback', 'fb_1').replyCount).toBe(3);
    });

    it('increments a count it has already written, and the team has the last word', async () => {
      db.seed('feedback', 'fb_1', {
        userId: 'submitter_uid',
        userName: 'Submitter Sam',
        githubIssueUrl: 'https://github.com/org/repo/issues/101',
        replyCount: 2,
      });

      await pipeline.addFollowUp({
        id: 'fb_1',
        body: 'We shipped this.',
        actor: { uid: 'admin_uid', role: 'admin' },
      });

      const note = db.getDoc('feedback', 'fb_1');
      expect(note.replyCount).toBe(3);
      expect(note.lastReplyRole).toBe('team');
      expect(note.awaitingReply).toBe(false);
    });

    it('forbids an unrelated user from replying', async () => {
      await expect(
        pipeline.addFollowUp({
          id: 'fb_1',
          body: 'Impostor comment',
          actor: { uid: 'stranger_uid' },
        }),
      ).rejects.toThrow('Forbidden');
    });

    it('allows editing a submitter reply and updates mirrored GitHub comment', async () => {
      db.seed('feedback/fb_1/replies', 'reply_1', {
        authorRole: 'submitter',
        authorId: 'submitter_uid',
        body: 'Original text',
        githubCommentId: 555,
      });

      const res = await pipeline.editFollowUp({
        id: 'fb_1',
        replyId: 'reply_1',
        body: 'Updated text',
        actorUid: 'submitter_uid',
      });

      expect(res.mirroredToGitHub).toBe(true);
      expect(mockGitHub.editComment).toHaveBeenCalledWith(
        'https://github.com/org/repo/issues/101',
        555,
        expect.stringContaining('Updated text'),
      );
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

    it('relays laundered issue comments to replies and drops triage briefs (ADR 0019)', async () => {
      db.seed('feedback', 'fb_1', {
        userId: 'user_1',
        githubIssueUrl: 'https://github.com/org/repo/issues/101',
      });

      // 1. Triage comment should be dropped before AI laundering
      const triageRes = await pipeline.handleGitHubWebhook({
        eventType: 'issue_comment',
        action: 'created',
        issue: { html_url: 'https://github.com/org/repo/issues/101' },
        comment: {
          id: 111,
          body: 'generated by ai during triage\n## Agent Brief\nInvestigate layout.',
        },
      });
      expect(triageRes.relayedCount).toBe(0);
      expect(mockAI.launderComment).not.toHaveBeenCalled();

      // 2. Real developer comment is laundered and relayed
      const realRes = await pipeline.handleGitHubWebhook({
        eventType: 'issue_comment',
        action: 'created',
        issue: { html_url: 'https://github.com/org/repo/issues/101' },
        comment: {
          id: 222,
          body: 'We investigated and found the fix. Shipping soon!',
        },
      });
      expect(realRes.relayedCount).toBe(1);
      expect(mockAI.launderComment).toHaveBeenCalledWith(
        'We investigated and found the fix. Shipping soon!',
      );

      const replies = db.getDocs('feedback/fb_1/replies');
      expect(replies.length).toBe(1);
      expect(replies[0].body).toBe('Laundered: We investigated and found the fix. Shipping soon!');

      // The collapsed card counts this reply and marks it new from the Note
      // alone, so a relayed comment records itself there too.
      const note = db.getDoc('feedback', 'fb_1');
      expect(note.replyCount).toBe(1);
      expect(note.lastReplyRole).toBe('team');
      expect(note.lastReplyAt).toBeTruthy();
      expect(note.awaitingReply).toBe(false);

      // Notifies user
      const notifs = db.getDocs('notifications');
      expect(notifs.some((n: any) => n.userId === 'user_1' && n.title === 'A reply on your note')).toBe(true);
    });

    it('resolves feedback on issue close, uses PR summary for shipped outcome, and notifies submitter', async () => {
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
      expect(doc.outcomeMessage).toBe('You can now view notifications directly.');

      // Notifies user with PR summary
      const notifs = db.getDocs('notifications');
      expect(notifs.some((n: any) => n.userId === 'user_1' && n.message === 'You can now view notifications directly.')).toBe(true);
    });
  });
});
