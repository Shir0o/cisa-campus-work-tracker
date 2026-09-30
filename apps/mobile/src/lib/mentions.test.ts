import {
  extractMentionCandidate,
  filterMentionCandidates,
  reconcileMentionedUsers,
  type MentionUser,
} from './mentions';

describe('mentions helper', () => {
  const users: MentionUser[] = [
    { uid: 'u1', name: 'Tony Wang', role: 'admin' },
    { uid: 'u2', name: 'Zion Park', role: 'manager' },
    { uid: 'u3', name: 'Rio Tan', role: 'admin' },
  ];

  it("extracts the query when the cursor is right after an '@'", () => {
    expect(extractMentionCandidate('Hello @', 7)).toEqual({ query: '', atIndex: 6 });
    expect(extractMentionCandidate('Hello @Zio', 10)).toEqual({ query: 'Zio', atIndex: 6 });
  });

  it('does not trigger detached, mid-word, or multiline', () => {
    expect(extractMentionCandidate('user@example.com', 16)).toBeNull();
    expect(extractMentionCandidate('Hello world', 11)).toBeNull();
    expect(extractMentionCandidate('@Zio\nmore', 9)).toBeNull();
  });

  it('filters by query, and to Full-timers only in team scope (ADR 0007)', () => {
    expect(filterMentionCandidates(users, 'on', false).map((u) => u.name)).toEqual(['Tony Wang', 'Zion Park']);
    expect(filterMentionCandidates(users, 'on', true).map((u) => u.name)).toEqual(['Tony Wang']);
  });

  it('reconciles picked mentions against the body, case-insensitively', () => {
    const selected = [
      { uid: 'u1', name: 'Tony Wang' },
      { uid: 'u2', name: 'Zion Park' },
    ];
    expect(reconcileMentionedUsers('Thanks @Tony Wang for the help!', selected)).toEqual(['u1']);
    expect(reconcileMentionedUsers('thanks @tony wang for the help!', selected)).toEqual(['u1']);
    expect(reconcileMentionedUsers('Thanks for the help!', selected)).toEqual([]);
  });
});
