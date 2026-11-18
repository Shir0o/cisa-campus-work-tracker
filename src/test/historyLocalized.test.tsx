/**
 * The Looking back diary's vocabulary (#1826).
 *
 * The stream's vocabulary is display-only: `humanize()` derives every verb and
 * detail from the persisted `activity.action` at render, so nothing written or
 * stored changes. These tests pin that rule:
 *
 *  - every catalogued action reads as its English lead;
 *  - text a person wrote stays verbatim inside the app-authored frame.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, getCountFromServer } from 'firebase/firestore';
import React from 'react';
import { LanguageProvider } from '../components/LanguageProvider';
import { humanize } from '../views/History';
import HistoryView from '../views/History';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getCountFromServer: vi.fn(),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  Timestamp: class MockTimestamp {
    static now() {
      return new MockTimestamp();
    }
    toDate() {
      return new Date();
    }
  },
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-id' }),
  serverTimestamp: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  where: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE', CREATE: 'CREATE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

const row = (action: string, over: Record<string, unknown> = {}) =>
  ({
    id: 'a1',
    user: 'Zion Adeyemi',
    action,
    target: 'Lila Mora',
    contactId: 'c1',
    type: 'edit',
    createdAt: '2026-10-24T09:40:00.000Z',
    ...over,
  }) as any;

// Every action `humanize` catalogues, with the lead it owes.
const VOCABULARY: { action: string; over?: Record<string, unknown>; en: string }[] = [
  {
    action: 'moved contact to stage "Believer"',
    over: { description: 'Moved from Seeker to Believer' },
    en: 'walked',
  },
  { action: 'created a new contact', en: 'welcomed' },
  { action: 'created contact', en: 'welcomed' },
  { action: 'deleted contact', en: 'let go of' },
  {
    action: 'added a prayer burden for',
    over: { description: 'Visa renewal' },
    en: 'started praying for',
  },
  {
    action: 'edited a prayer burden for',
    over: { description: 'Final exams' },
    en: 'added to a prayer for',
  },
  {
    action: 'marked a prayer burden as answered for',
    en: 'gave thanks for an answered prayer for',
  },
  {
    action: 'marked a prayer burden as ongoing for',
    en: 'updated a prayer for',
  },
  {
    action: 'cleared a prayer for',
    over: { description: 'Visa renewal' },
    en: 'cleared a prayer for',
  },
  {
    action: 'logged a visit to',
    over: { description: 'Home in Camden' },
    en: 'went round to',
  },
  { action: 'edited a visit to', en: 'wrote more about a visit to' },
  { action: 'removed a visit to', en: 'removed a visit to' },
  { action: 'logged an interaction for', over: { type: 'call' }, en: 'called' },
  { action: 'logged an interaction for', over: { type: 'email' }, en: 'emailed' },
  { action: 'logged an interaction for', over: { type: 'event' }, en: 'met with' },
  {
    action: 'logged an interaction for',
    over: { type: 'comment' },
    en: 'left a note for',
  },
  {
    action: 'logged an interaction for',
    over: { type: 'create' },
    en: 'spent time with',
  },
  { action: 'logged a batch interaction for', over: { type: 'event' }, en: 'met with' },
  {
    action: 'updated an interaction for',
    en: 'updated an interaction with',
  },
  { action: 'left a comment on', en: 'left a note for' },
  { action: 'added tag "leader" to', en: 'added a tag for' },
  { action: 'removed tag "inactive" from', en: 'removed a tag from' },
  {
    action: 'updated attendance for "Sunday Service" to Present for',
    en: 'noted who gathered at',
  },
  { action: 'submitted feedback', en: 'shared some feedback' },
  {
    action: 'transferred a person',
    over: { description: 'From Tony to Mei' },
    en: 'handed off',
  },
  {
    action: 'updated phone number',
    over: { description: 'Changed phone' },
    en: 'updated details for',
  },
];

describe('humanize — the diary’s vocabulary (#1826)', () => {
  it('reads every catalogued action as its English lead', () => {
    for (const entry of VOCABULARY) {
      const a = row(entry.action, entry.over);
      expect(humanize(a).lead, entry.action).toBe(entry.en);
    }
  });

  it('keeps the stage-move tail and both detail shapes, with stored stage labels untouched', () => {
    const a = row('moved contact to stage "Believer"', {
      description: 'Moved from Seeker to Believer',
    });
    expect(humanize(a).tail).toBe('a step further');
    expect(humanize(a).detail).toBe('A step forward — from Seeker toward Believer.');

    const noFrom = row('moved contact to stage "Believer"', { description: '' });
    expect(humanize(noFrom).detail).toBe('A step forward — toward Believer.');
  });

  it('keeps the answered and details details that carry no user text', () => {
    expect(humanize(row('marked a prayer burden as answered for')).detail).toBe(
      'Answered, after carrying it together.',
    );
    expect(humanize(row('updated phone number', { description: 'Changed phone' })).detail).toBe(
      'Tidied up their details.',
    );
  });

  it('keeps a visit’s place as entered', () => {
    const a = row('logged a visit to', { description: 'Home in Camden' });
    expect(humanize(a).detail).toBe('At Home in Camden.');
  });

  it('falls back to the stored verb for actions outside the catalogue', () => {
    const a = row('archived a home group record');
    expect(humanize(a).lead).toBe('archived a home group record');
  });
});

// ── The stream itself, under the app's LanguageProvider ────────────────

const fiveMinutesAgo = () => new Date(Date.now() - 5 * 60_000).toISOString();

const STREAM = [
  {
    action: 'moved contact to stage "Believer"',
    targetName: 'Lila Mora',
    type: 'edit',
    description: 'Moved from Seeker to Believer',
  },
  {
    action: 'marked a prayer burden as ongoing for',
    targetName: 'Lila Mora',
    type: 'edit',
    description: '',
  },
  {
    action: 'added a prayer burden for',
    targetName: 'Lila Mora',
    type: 'edit',
    description: 'Visa renewal',
  },
  {
    action: 'logged an interaction for',
    targetName: 'Lila Mora',
    type: 'call',
    description: 'A quick word about work',
  },
  {
    action: 'updated attendance for "Sunday Service" to Present for',
    targetName: 'Sunday Service',
    targetType: 'event',
    type: 'edit',
    description: '',
  },
  {
    action: 'created a new contact',
    targetName: 'Caleb Mensah',
    type: 'create',
    description: '',
  },
];

const renderStream = () => {
  const docs = STREAM.map((entry, i) => ({
    id: `a${i}`,
    data: () => ({
      userName: 'Zion Adeyemi',
      userPhoto: '',
      targetType: 'contact',
      targetId: 'c1',
      createdAt: fiveMinutesAgo(),
      ...entry,
    }),
  }));
  vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
    if (ref?.path === 'contacts') {
      callback({ docs: [{ id: 'c1', data: () => ({ name: 'Lila Mora', stage: 'Believer' }) }], size: 1 });
    } else if (ref?.path === 'activities') {
      callback({ docs, size: docs.length });
    } else {
      callback({ docs: [], size: 0 });
    }
    return vi.fn();
  });
  return render(
    <LanguageProvider>
      <HistoryView />
    </LanguageProvider>,
  );
};

describe('Looking back — the English diary (#1826)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (getCountFromServer as any).mockResolvedValue({ data: () => ({ count: STREAM.length }) });
  });

  it('keeps the English stream exactly as it reads today', async () => {
    renderStream();

    await waitFor(() => {
      expect(screen.getByText('Looking back')).toBeInTheDocument();
      expect(screen.getByText('walked')).toBeInTheDocument();
    });

    expect(screen.getByText('a step further')).toBeInTheDocument();
    expect(screen.getByText('A step forward — from Seeker toward Believer.')).toBeInTheDocument();
    expect(screen.getByText('welcomed')).toBeInTheDocument();
    expect(screen.getByText('updated a prayer for')).toBeInTheDocument();
    expect(screen.getByText('called')).toBeInTheDocument();
    expect(screen.getByText('noted who gathered at')).toBeInTheDocument();
    expect(screen.getByText('started praying for')).toBeInTheDocument();
    expect(screen.getByText('Began carrying “Visa renewal”.')).toBeInTheDocument();
    expect(screen.getAllByText('5m ago').length).toBeGreaterThan(0);
  });
});
