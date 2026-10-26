/**
 * The Looking back diary in the reader's language (#1826).
 *
 * The stream's vocabulary is display-only: `humanize()` derives every verb and
 * detail from the persisted `activity.action` at render, so nothing written or
 * stored changes. These tests pin the two halves of that rule:
 *
 *  - with the Spanish translator, every catalogued action speaks Spanish and
 *    no English verb or app-composed detail survives;
 *  - with no translator (the default resolver the filter/count callers use),
 *    the English output is today's, byte for byte;
 *  - text a person wrote stays verbatim inside the app-authored frame.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, getCountFromServer } from 'firebase/firestore';
import React from 'react';
import { t } from '../lib/i18n';
import { relTime } from '../lib/utils';
import { LanguageProvider } from '../components/LanguageProvider';
import { humanize } from '../views/History';
import HistoryView from '../views/History';
import HistoryMobile from '../views/HistoryMobile';

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

// The reading-translation path is stubbed to pass text through, so these tests
// read the sentence the app itself composed: the Spanish frame must come from
// the dictionary, and the person's words must arrive untouched. (Translate
// still wraps the detail — see the view.)
vi.mock('../hooks/useTranslate', () => ({
  useTranslate: (text: string | null | undefined) => {
    const value = text ?? '';
    return { translatedText: value, originalText: value, isPending: false };
  },
}));

const es = (key: string, fallback?: string) => t(key, 'es', fallback);

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

// Every action `humanize` catalogues, with the lead each language owes it.
const VOCABULARY: { action: string; over?: Record<string, unknown>; en: string; es: string }[] = [
  {
    action: 'moved contact to stage "Believer"',
    over: { description: 'Moved from Seeker to Believer' },
    en: 'walked',
    es: 'caminó con',
  },
  { action: 'created a new contact', en: 'welcomed', es: 'recibió a' },
  { action: 'created contact', en: 'welcomed', es: 'recibió a' },
  { action: 'deleted contact', en: 'let go of', es: 'se despidió de' },
  {
    action: 'added a prayer burden for',
    over: { description: 'Visa renewal' },
    en: 'started praying for',
    es: 'empezó a orar por',
  },
  {
    action: 'edited a prayer burden for',
    over: { description: 'Final exams' },
    en: 'added to a prayer for',
    es: 'añadió a la oración por',
  },
  {
    action: 'marked a prayer burden as answered for',
    en: 'gave thanks for an answered prayer for',
    es: 'dio gracias por una oración contestada por',
  },
  {
    action: 'marked a prayer burden as ongoing for',
    en: 'updated a prayer for',
    es: 'actualizó la oración por',
  },
  {
    action: 'cleared a prayer for',
    over: { description: 'Visa renewal' },
    en: 'cleared a prayer for',
    es: 'dejó la oración por',
  },
  {
    action: 'logged a visit to',
    over: { description: 'Home in Camden' },
    en: 'went round to',
    es: 'pasó a ver a',
  },
  { action: 'edited a visit to', en: 'wrote more about a visit to', es: 'escribió más sobre la visita a' },
  { action: 'removed a visit to', en: 'removed a visit to', es: 'quitó la visita a' },
  { action: 'logged an interaction for', over: { type: 'call' }, en: 'called', es: 'llamó a' },
  { action: 'logged an interaction for', over: { type: 'email' }, en: 'emailed', es: 'escribió a' },
  { action: 'logged an interaction for', over: { type: 'event' }, en: 'met with', es: 'se reunió con' },
  {
    action: 'logged an interaction for',
    over: { type: 'comment' },
    en: 'left a note for',
    es: 'dejó una nota para',
  },
  {
    action: 'logged an interaction for',
    over: { type: 'create' },
    en: 'spent time with',
    es: 'pasó tiempo con',
  },
  { action: 'logged a batch interaction for', over: { type: 'event' }, en: 'met with', es: 'se reunió con' },
  {
    action: 'updated an interaction for',
    en: 'updated a conversation with',
    es: 'actualizó la conversación con',
  },
  { action: 'left a comment on', en: 'left a note for', es: 'dejó una nota para' },
  { action: 'added tag "leader" to', en: 'added a tag for', es: 'añadió una etiqueta a' },
  { action: 'removed tag "inactive" from', en: 'removed a tag from', es: 'quitó una etiqueta de' },
  {
    action: 'updated attendance for "Sunday Service" to Present for',
    en: 'noted who gathered at',
    es: 'anotó quiénes se reunieron en',
  },
  { action: 'submitted feedback', en: 'shared some feedback', es: 'compartió una sugerencia' },
  {
    action: 'transferred a person',
    over: { description: 'From Tony to Mei' },
    en: 'handed off',
    es: 'traspasó el cuidado a',
  },
  {
    action: 'updated phone number',
    over: { description: 'Changed phone' },
    en: 'updated details for',
    es: 'actualizó los datos de',
  },
];

describe('humanize — the diary’s vocabulary in the reader’s language (#1826)', () => {
  it('speaks Spanish when given the Spanish translator, and today’s English without one', () => {
    for (const entry of VOCABULARY) {
      const a = row(entry.action, entry.over);
      expect(humanize(a, es).lead, `${entry.action} (es)`).toBe(entry.es);
      expect(humanize(a).lead, `${entry.action} (en unchanged)`).toBe(entry.en);
    }
  });

  it('leaves no English verb standing in Spanish', () => {
    for (const entry of VOCABULARY) {
      const a = row(entry.action, entry.over);
      const spanish = humanize(a, es);
      expect(spanish.lead, entry.action).not.toBe(entry.en);
      expect(spanish.lead, entry.action).not.toMatch(/\b(walked|welcomed|emailed|called|met with)\b/);
    }
  });

  it('classifies every action into the same bucket in both languages', () => {
    for (const entry of VOCABULARY) {
      const a = row(entry.action, entry.over);
      expect(humanize(a, es).bucket, entry.action).toBe(humanize(a).bucket);
    }
  });

  it('keeps the stage-move tail and both detail shapes, with stored stage labels untouched', () => {
    const a = row('moved contact to stage "Believer"', {
      description: 'Moved from Seeker to Believer',
    });
    expect(humanize(a).tail).toBe('a step further');
    expect(humanize(a, es).tail).toBe('un paso más');

    expect(humanize(a).detail).toBe('A step forward — from Seeker toward Believer.');
    expect(humanize(a, es).detail).toBe('Un paso adelante: de Seeker hacia Believer.');

    const noFrom = row('moved contact to stage "Believer"', { description: '' });
    expect(humanize(noFrom).detail).toBe('A step forward — toward Believer.');
    expect(humanize(noFrom, es).detail).toBe('Un paso adelante: hacia Believer.');
  });

  it('renders the prayer status as its localized label, never the raw enum (#1826)', () => {
    const labels: Record<string, string> = {
      ongoing: 'En curso',
      unanswered: 'Archivada',
      pending: 'Sin marcar',
    };
    for (const [status, label] of Object.entries(labels)) {
      const h = humanize(row(`marked a prayer burden as ${status} for`), es);
      expect(h.detail, status).toBe(`Ahora marcada: ${label}.`);
      expect(h.detail, status).not.toMatch(new RegExp(status));
    }

    const answered = humanize(row('marked a prayer burden as answered for'), es);
    expect(answered.detail).toBe('Contestada, después de llevarla juntos.');
    expect(answered.detail).not.toMatch(/answered/);
  });

  it('keeps the answered and details details that carry no user text', () => {
    expect(humanize(row('marked a prayer burden as answered for')).detail).toBe(
      'Answered, after carrying it together.',
    );
    expect(humanize(row('updated phone number', { description: 'Changed phone' })).detail).toBe(
      'Tidied up their details.',
    );
    expect(humanize(row('updated phone number', { description: 'Changed phone' }), es).detail).toBe(
      'Ordenó sus datos.',
    );
  });

  it('frames a prayer the person wrote without changing their words', () => {
    const burden = 'Lord, keep Lila in her finals — and her family';
    const h = humanize(row('added a prayer burden for', { description: burden }), es);
    expect(h.detail).toBe(`Comenzó a llevar “${burden}”.`);

    const cleared = humanize(row('cleared a prayer for', { description: burden }), es);
    expect(cleared.detail).toBe(`Dejó “${burden}” en tus manos.`);

    // A `$&` in what a person wrote must arrive as written, not as a replace
    // pattern that swallows the frame.
    const dollar = humanize(row('added a prayer burden for', { description: 'Rent costs $& more' }), es);
    expect(dollar.detail).toBe('Comenzó a llevar “Rent costs $& more”.');
  });

  it('keeps a visit’s place as entered and frames it in both languages', () => {
    const a = row('logged a visit to', { description: 'Home in Camden' });
    expect(humanize(a).detail).toBe('At Home in Camden.');
    expect(humanize(a, es).detail).toBe('En Home in Camden.');
  });

  it('falls back to the stored verb for actions outside the catalogue, in both languages', () => {
    const a = row('archived a home group record');
    expect(humanize(a).lead).toBe('archived a home group record');
    expect(humanize(a, es).lead).toBe('archived a home group record');
  });
});

describe('relTime — the diary’s clock in the reader’s language (#1826)', () => {
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('speaks Spanish when given a Spanish locale', () => {
    expect(relTime(iso(0), 'es')).toBe('ahora mismo');
    expect(relTime(iso(5 * 60_000), 'es')).toBe('hace 5 minutos');
    expect(relTime(iso(3 * 60 * 60_000), 'es')).toBe('hace 3 horas');
    expect(relTime(iso(2 * 24 * 60 * 60_000), 'es')).toBe('hace 2 días');
  });

  it('localizes the older-than-a-week date', () => {
    const out = relTime('2020-06-03T00:00:00Z', 'es');
    expect(out).toContain('2020');
    expect(out).toContain('jun');
    expect(out).not.toContain('Jun');
  });

  it('leaves every caller that passes no language byte-identical', () => {
    expect(relTime(iso(0))).toBe('just now');
    expect(relTime(iso(5 * 60_000))).toBe('5m ago');
    expect(relTime(iso(3 * 60 * 60_000))).toBe('3h ago');
    expect(relTime(iso(2 * 24 * 60 * 60_000))).toBe('2d ago');
  });

  it('keeps English output for an explicit English locale', () => {
    expect(relTime(iso(0), 'en')).toBe('just now');
    expect(relTime(iso(5 * 60_000), 'en')).toBe('5m ago');
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

const renderStream = (language: 'en' | 'es') => {
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
    <LanguageProvider defaultLanguage={language}>
      <HistoryView />
    </LanguageProvider>,
  );
};

describe('Looking back — a Spanish page, a Spanish diary (#1826)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (getCountFromServer as any).mockResolvedValue({ data: () => ({ count: STREAM.length }) });
  });

  it('renders a Spanish lead for every bucket, the tail, and the app-composed details', async () => {
    renderStream('es');

    await waitFor(() => {
      expect(screen.getByText('Mirando atrás')).toBeInTheDocument();
      // steps
      expect(screen.getByText('caminó con')).toBeInTheDocument();
      expect(screen.getByText('un paso más')).toBeInTheDocument();
      expect(screen.getByText('recibió a')).toBeInTheDocument();
      // prayer
      expect(screen.getByText('actualizó la oración por')).toBeInTheDocument();
      expect(screen.getByText('Ahora marcada: En curso.')).toBeInTheDocument();
      expect(screen.getByText('empezó a orar por')).toBeInTheDocument();
      // talk
      expect(screen.getByText('llamó a')).toBeInTheDocument();
      // gather
      expect(screen.getByText('anotó quiénes se reunieron en')).toBeInTheDocument();
    });

    // The frame is Spanish; the detail is app-authored, not machine translation.
    expect(screen.getByText('Un paso adelante: de Seeker hacia Believer.')).toBeInTheDocument();
    // A prayer written by a person keeps their words inside the Spanish frame.
    expect(screen.getByText('Comenzó a llevar “Visa renewal”.')).toBeInTheDocument();
    // The desktop clock follows the page.
    expect(screen.getAllByText('hace 5 minutos').length).toBeGreaterThan(0);
  });

  it('leaves no English verb or app-composed detail in the Spanish stream', async () => {
    renderStream('es');

    await waitFor(() => {
      expect(screen.getByText('caminó con')).toBeInTheDocument();
    });

    for (const english of [
      'walked',
      'welcomed',
      'let go of',
      'started praying for',
      'updated a prayer for',
      'called',
      'met with',
      'noted who gathered at',
      'a step further',
    ]) {
      expect(screen.queryByText(english), english).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Now marked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^A step forward/)).not.toBeInTheDocument();
    expect(screen.queryByText(/5m ago/)).not.toBeInTheDocument();
  });

  it('keeps the English stream exactly as it reads today', async () => {
    renderStream('en');

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

// ── The phone renderer, which the issue measured at 375×812 ────────────

describe('Looking back on a phone — the bound diary, in Spanish (#1826)', () => {
  it('prints Spanish leads and the stage tail without any localization logic of its own', () => {
    const a = (action: string, over: Record<string, unknown> = {}) =>
      ({
        id: 'a1',
        user: 'Zion Adeyemi',
        action,
        target: 'Lila Mora',
        contactId: 'c1',
        type: 'edit',
        description: '',
        createdAt: fiveMinutesAgo(),
        ...over,
      }) as any;

    const rows = [
      {
        type: 'item' as const,
        key: 'k1',
        a: a('moved contact to stage "Believer"', {
          description: 'Moved from Seeker to Believer',
        }),
      },
      { type: 'item' as const, key: 'k2', a: a('started a prayer burden for', { action: 'added a prayer burden for', description: 'Visa renewal' }) },
    ];

    render(
      <LanguageProvider defaultLanguage="es">
        <HistoryMobile
          activities={rows.map((r) => r.a)}
          contacts={[]}
          filteredActivities={[]}
          rows={rows}
          peopleRemembered={1}
          kind="all"
          setKind={vi.fn()}
          who="all"
          setWho={vi.fn()}
          q=""
          setQ={vi.fn()}
          staff={[]}
          onOpenContact={vi.fn()}
          onClearFilters={vi.fn()}
          humanize={(row) => humanize(row as any, es)}
          dayInfo={() => ({ label: 'Hoy', sub: 'sábado' })}
          firstName={(name) => name.split(' ')[0]}
          hasMore={false}
          onShowOlder={vi.fn()}
          totalMoments={2}
        />
      </LanguageProvider>,
    );

    const lines = [...document.querySelectorAll('.hist-line')].map((el) => el.textContent);
    expect(lines[0]).toBe('Zion caminó con Lila Mora un paso más.');
    expect(lines[1]).toBe('Zion empezó a orar por Lila Mora.');
    expect(screen.getByText('Comenzó a llevar “Visa renewal”.')).toBeInTheDocument();
    expect(screen.queryByText(/walked/)).not.toBeInTheDocument();
  });
});
