// Mirror parity (#1024 phase 2): the web app's feed-visibility predicate
// (src/lib/attention.ts) and the shared core one
// (packages/core/src/contactDetail.ts) must give the same answer, or a
// Trainee's Alongside thread reads differently on the two apps. The web app
// deliberately has no @cisa/core dependency, so the two copies cannot share an
// import; this corpus is the contract between them (the same shape as
// bibleStudyMirrorParity.test.ts).
import { describe, it, expect } from 'vitest';
import { feedVisibleThreads as webVisible } from '../lib/attention';
// Direct relative import into the workspace package -- resolved for tests only.
import { feedVisibleThreads as coreVisible } from '../../packages/core/src/contactDetail';
import type { ThreadMessageWithContact } from '../lib/threads';

const threads: ThreadMessageWithContact[] = [
  {
    id: 'open',
    contactId: 'c1',
    interactionId: null,
    from: 'u1',
    fromName: 'Amy',
    kind: 'note',
    body: 'An ordinary note.',
    at: '2026-09-01T00:00:00.000Z',
    reactions: [],
  },
  {
    id: 'team',
    contactId: 'c1',
    interactionId: null,
    scope: 'team',
    from: 'u2',
    fromName: 'Tony',
    kind: 'comment',
    body: 'Full-timer-only discussion.',
    at: '2026-09-02T00:00:00.000Z',
    reactions: [],
  },
  {
    id: 'interaction',
    contactId: 'c1',
    interactionId: 'i1',
    scope: null,
    from: 'u3',
    fromName: 'Grace',
    kind: 'comment',
    body: 'A note on one conversation.',
    at: '2026-09-03T00:00:00.000Z',
    reactions: [],
  },
];

const ROLES = ['admin', 'manager', 'operator', 'viewer', null, undefined] as const;

describe('feedVisibleThreads mirror parity (#1024)', () => {
  it('web and core agree for every role, including none', () => {
    for (const role of ROLES) {
      const web = webVisible(threads, role ?? undefined).map((m) => m.id);
      const core = coreVisible(threads, role).map((m) => m.id);
      expect(web).toEqual(core);
    }
  });

  it('cuts team scope for everyone but the full-timer', () => {
    expect(webVisible(threads, 'admin').map((m) => m.id)).toEqual(['open', 'team', 'interaction']);
    expect(webVisible(threads, 'manager').map((m) => m.id)).toEqual(['open', 'interaction']);
  });
});
