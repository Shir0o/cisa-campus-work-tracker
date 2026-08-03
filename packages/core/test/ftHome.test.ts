import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  FT_SUMMARY_EMPTY,
  ftAssignees,
  ftCarryRows,
  ftCarrying,
  ftGoneQuiet,
  ftHomesOpen,
  ftInboxRows,
  ftInboxVisible,
  ftLastHeard,
  ftNextGathering,
  ftOpenPrayers,
  ftSummaryLine,
  ftTodos,
  ftWeekAhead,
  ftWeighsHeavy,
} from '../src/ftHome';
import type { InboxItem } from '../src/inbox';
import type { Leader } from '../src/myday';
import type {
  AppUser,
  Contact,
  Event,
  HospitalityOffer,
  PrayerRecord,
  PrayerRequest,
  Task,
} from '../src/types';

const NOW = new Date('2026-07-15T09:00:00Z').getTime(); // a Wednesday
const DAY_MS = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY_MS).toISOString();
// A bare yyyy-MM-dd N days out, the shape `duePresetToISO` writes.
const day = (offsetDays: number) => new Date(NOW + offsetDays * DAY_MS).toISOString().slice(0, 10);

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Rio Alvarez',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: 'Growing',
  lastSeen: iso(0),
  initials: 'RA',
  createdBy: 'me',
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Check in with Rio',
  priority: 'medium',
  status: 'pending',
  assigneeId: 'me',
  ...overrides,
});

const prayer = (overrides: Partial<PrayerRecord> = {}): PrayerRecord => ({
  id: 'p1',
  contactId: 'c1',
  date: iso(-3),
  burden: 'A job before graduation',
  status: 'pending',
  updatedAt: iso(-3),
  ...overrides,
});

const request = (overrides: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: 'r1',
  uid: 'u-student',
  name: 'Lila Chen',
  body: 'Midterms are wrecking me',
  status: 'open',
  createdAt: iso(-1),
  updatedAt: iso(-1),
  ...overrides,
});

const offer = (overrides: Partial<HospitalityOffer> = {}): HospitalityOffer => ({
  uid: 'u-community',
  name: 'Grace Okafor',
  availability: ['sunday'],
  seats: '3–4 students',
  note: '',
  updatedAt: iso(-2),
  ...overrides,
});

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Friday Night',
  date: day(2),
  order: 0,
  createdAt: iso(-30),
  ...overrides,
});

const inboxItem = (overrides: Partial<InboxItem> = {}): InboxItem => ({
  id: 'contact:c1',
  type: 'contact',
  at: iso(-1),
  contactId: 'c1',
  by: 'u2',
  ...overrides,
});

const leader = (days: number, overrides: Partial<Contact> = {}): Leader => ({
  contact: contact(overrides),
  days,
  note: '',
});

const NAMES = { u2: 'Jordan Park', u3: 'Ana Beltrán' };
const readNone = () => false;

// ── the header's summary line ───────────────────────────────────────────────

describe('ftSummaryLine', () => {
  it('joins every non-zero clause with a middot and ends with a period', () => {
    expect(ftSummaryLine({ needsYou: 3, fromTeam: 2, quiet: 4 })).toBe(
      '3 things need you today · 2 from the team · 4 people gone quiet.',
    );
  });

  it('drops the clauses whose count is zero', () => {
    expect(ftSummaryLine({ needsYou: 0, fromTeam: 2, quiet: 0 })).toBe('2 from the team.');
    expect(ftSummaryLine({ needsYou: 5, fromTeam: 0, quiet: 0 })).toBe(
      '5 things need you today.',
    );
  });

  it('says it in the singular for a count of one', () => {
    expect(ftSummaryLine({ needsYou: 1, fromTeam: 1, quiet: 1 })).toBe(
      '1 thing needs you today · 1 from the team · 1 person gone quiet.',
    );
  });

  it('offers the quiet day when nothing is waiting', () => {
    expect(ftSummaryLine({ needsYou: 0, fromTeam: 0, quiet: 0 })).toBe(FT_SUMMARY_EMPTY);
  });
});

// ── "Needs you today" ──────────────────────────────────────────────────────

describe('ftTodos', () => {
  it('puts overdue and due-today together, overdue first', () => {
    const { today } = ftTodos(
      [
        task({ id: 'now', dueDate: day(0) }),
        task({ id: 'late', dueDate: day(-3) }),
        task({ id: 'later', dueDate: day(-1) }),
      ],
      'me',
      NOW,
    );
    expect(today.map((t) => t.id)).toEqual(['late', 'later', 'now']);
  });

  it('holds the next six days back as later this week, soonest first', () => {
    const { today, laterThisWeek } = ftTodos(
      [task({ id: 'thu', dueDate: day(6) }), task({ id: 'tomorrow', dueDate: day(1) })],
      'me',
      NOW,
    );
    expect(today).toEqual([]);
    expect(laterThisWeek.map((t) => t.id)).toEqual(['tomorrow', 'thu']);
  });

  it('leaves undated and far-off to-dos out of both groups', () => {
    const split = ftTodos(
      [task({ id: 'undated', dueDate: null }), task({ id: 'far', dueDate: day(9) })],
      'me',
      NOW,
    );
    expect(split.today).toEqual([]);
    expect(split.laterThisWeek).toEqual([]);
  });

  it('ignores finished and canceled to-dos', () => {
    const split = ftTodos(
      [
        task({ id: 'done', dueDate: day(0), status: 'completed' }),
        task({ id: 'dropped', dueDate: day(0), status: 'canceled' }),
      ],
      'me',
      NOW,
    );
    expect(split.today).toEqual([]);
  });

  it("ignores someone else's to-dos", () => {
    const split = ftTodos([task({ id: 'theirs', dueDate: day(0), assigneeId: 'u2' })], 'me', NOW);
    expect(split.today).toEqual([]);
  });

  // Regression, same class as queue.ts's: a `dueDate` is a bare `yyyy-MM-dd`
  // written in LOCAL time, but `new Date('2026-07-15')` parses as UTC midnight
  // — the PREVIOUS day everywhere behind UTC.
  describe('bare yyyy-MM-dd due dates, in a behind-UTC timezone', () => {
    const realTZ = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/Los_Angeles';
    });
    afterAll(() => {
      process.env.TZ = realTZ;
    });

    const localNoon = new Date(2026, 6, 14, 12, 0, 0).getTime(); // Jul 14, local

    it('owes today only what is due on that local calendar day', () => {
      const split = ftTodos(
        [
          task({ id: 'today', dueDate: '2026-07-14' }),
          task({ id: 'tomorrow', dueDate: '2026-07-15' }),
          task({ id: 'late', dueDate: '2026-07-12' }),
        ],
        'me',
        localNoon,
      );
      expect(split.today.map((t) => t.id)).toEqual(['late', 'today']);
      expect(split.laterThisWeek.map((t) => t.id)).toEqual(['tomorrow']);
    });
  });
});

// ── "From the team" ────────────────────────────────────────────────────────

describe('ftInboxRows', () => {
  const ctx = { contacts: [contact()], nameByUid: NAMES, isRead: readNone };

  it('says who brought someone in, and whether you have looked', () => {
    const [row] = ftInboxRows([inboxItem()], ctx);
    expect(row.headline).toBe('Jordan brought in Rio');
    expect(row.sub).toBe('Waiting on a look from you');
    expect(row.reply).toBe('encourage');
    expect(row.replyKind).toBe('encouragement');
  });

  it('changes the line once the contact has been reviewed', () => {
    const [row] = ftInboxRows([inboxItem({ reviewed: true })], ctx);
    expect(row.sub).toBe("You've had a look");
  });

  it('says who logged time, and shows the note underneath', () => {
    const [row] = ftInboxRows(
      [inboxItem({ id: 'interaction:i1', type: 'interaction', body: 'Coffee after class' })],
      ctx,
    );
    expect(row.headline).toBe('Jordan logged time with Rio');
    expect(row.sub).toBe('Coffee after class');
    expect(row.reply).toBe('encourage');
  });

  it('offers a write-back on a question, not an encouragement', () => {
    const [row] = ftInboxRows(
      [inboxItem({ id: 'thread:m1', type: 'thread', by: 'u3', body: 'Should I keep going?' })],
      ctx,
    );
    expect(row.headline).toBe('Ana asked you something about Rio');
    expect(row.sub).toBe('Should I keep going?');
    expect(row.reply).toBe('write-back');
    expect(row.replyKind).toBe('comment');
  });

  it('falls back gently when the person or the contact is unknown', () => {
    const [row] = ftInboxRows([inboxItem({ by: 'ghost', contactId: 'gone' })], ctx);
    expect(row.headline).toBe('Someone brought in someone');
  });

  it('marks a row unread from the injected read state', () => {
    const rows = ftInboxRows([inboxItem({ id: 'a' }), inboxItem({ id: 'b' })], {
      ...ctx,
      isRead: (id) => id === 'a',
    });
    expect(rows.map((r) => r.unread)).toEqual([false, true]);
  });
});

describe('ftInboxVisible', () => {
  const rows = (n: number, unreadIds: string[] = []) =>
    ftInboxRows(
      Array.from({ length: n }, (_, i) => inboxItem({ id: `i${i}` })),
      {
        contacts: [contact()],
        nameByUid: NAMES,
        isRead: (id) => !unreadIds.includes(id),
      },
    );

  it('shows the unread ones first, up to three', () => {
    const visible = ftInboxVisible(rows(6, ['i0', 'i1', 'i2', 'i3', 'i4']), false);
    expect(visible.map((r) => r.item.id)).toEqual(['i0', 'i1', 'i2']);
  });

  it('shows only the unread ones — it does not pad the list out', () => {
    const visible = ftInboxVisible(rows(8, ['i2', 'i5']), false);
    expect(visible.map((r) => r.item.id)).toEqual(['i2', 'i5']);
  });

  it('falls back to the newest three when everything is scanned', () => {
    const visible = ftInboxVisible(rows(6), false);
    expect(visible.map((r) => r.item.id)).toEqual(['i0', 'i1', 'i2']);
  });

  it('opens up to twelve and no further', () => {
    expect(ftInboxVisible(rows(20), true)).toHaveLength(12);
  });

  it('shows everything when there is less than a screenful', () => {
    expect(ftInboxVisible(rows(2), false)).toHaveLength(2);
    expect(ftInboxVisible(rows(2), true)).toHaveLength(2);
  });
});

// ── "Gone quiet in your care" ──────────────────────────────────────────────

describe('ftGoneQuiet', () => {
  it('starts counting someone as quiet on the tenth day', () => {
    const quiet = ftGoneQuiet([leader(9, { id: 'a' }), leader(10, { id: 'b' })]);
    expect(quiet.map((l) => l.contact.id)).toEqual(['b']);
  });

  it('keeps the longest silence first, as deriveLeaders left it', () => {
    const quiet = ftGoneQuiet([leader(30, { id: 'a' }), leader(12, { id: 'b' })]);
    expect(quiet.map((l) => l.contact.id)).toEqual(['a', 'b']);
  });

  it('drops people with no touch and no created date rather than shouting', () => {
    expect(ftGoneQuiet([leader(Infinity, { id: 'a' })])).toEqual([]);
  });

  it('returns everyone quiet, not just the three the widget shows', () => {
    expect(ftGoneQuiet([leader(11), leader(12), leader(13), leader(14)])).toHaveLength(4);
  });

  it('honours a caller-supplied threshold', () => {
    expect(ftGoneQuiet([leader(5)], 3)).toHaveLength(1);
  });
});

describe('ftLastHeard', () => {
  // Regression for the design's Jul 26 item 2: the prototype fed a DAY COUNT to
  // a helper that wanted a date and printed "20661 days ago".
  it('reads a day count as words, never as a date', () => {
    expect(ftLastHeard(0)).toBe('today');
    expect(ftLastHeard(1)).toBe('yesterday');
    expect(ftLastHeard(12)).toBe('12 days ago');
  });

  it('stays vague when there is nothing to count from', () => {
    expect(ftLastHeard(Infinity)).toBe('a while ago');
  });
});

// ── "Prayers to carry" + the Carrying tile ─────────────────────────────────

describe('ftOpenPrayers', () => {
  it('leaves answered and archived prayers out', () => {
    const open = ftOpenPrayers([
      prayer({ id: 'a', status: 'answered' }),
      prayer({ id: 'b', status: 'unanswered' }),
      prayer({ id: 'c', status: 'pending' }),
    ]);
    expect(open.map((p) => p.id)).toEqual(['c']);
  });

  it('carries the heavy ones first', () => {
    const open = ftOpenPrayers([
      prayer({ id: 'pending', status: 'pending', date: iso(-1) }),
      prayer({ id: 'ongoing', status: 'ongoing', date: iso(-9) }),
    ]);
    expect(open.map((p) => p.id)).toEqual(['ongoing', 'pending']);
  });

  it('breaks a tie with the newest', () => {
    const open = ftOpenPrayers([
      prayer({ id: 'old', date: iso(-9) }),
      prayer({ id: 'new', date: iso(-1) }),
    ]);
    expect(open.map((p) => p.id)).toEqual(['new', 'old']);
  });
});

describe('ftWeighsHeavy', () => {
  it('is only true for a prayer still being carried', () => {
    expect(ftWeighsHeavy(prayer({ status: 'ongoing' }))).toBe(true);
    expect(ftWeighsHeavy(prayer({ status: 'pending' }))).toBe(false);
  });
});

describe('ftCarryRows', () => {
  it('flattens a logged prayer into a row that names who it is for', () => {
    expect(ftCarryRows([prayer()], [], [contact()])).toEqual([
      {
        id: 'prayer:p1',
        burden: 'A job before graduation',
        who: 'Rio',
        heavy: false,
        asked: false,
        contactId: 'c1',
        prayerId: 'p1',
      },
    ]);
  });

  it('puts a member who asked ahead of the prayers staff logged', () => {
    const rows = ftCarryRows([prayer()], [request()], [contact()]);
    expect(rows.map((r) => r.id)).toEqual(['ask:r1', 'prayer:p1']);
    expect(rows[0]).toMatchObject({ who: 'Lila', asked: true, requestId: 'r1' });
  });

  // A member is a user account, not a contact — there is no page to open.
  it('leaves an ask with no contact behind it', () => {
    expect(ftCarryRows([], [request()], [])[0].contactId).toBeNull();
  });

  it('leaves an answered ask out', () => {
    const rows = ftCarryRows([], [request({ status: 'answered' })], []);
    expect(rows).toEqual([]);
  });

  it('orders asks newest first', () => {
    const rows = ftCarryRows(
      [],
      [request(), request({ id: 'r2', name: 'Kofi Mensah', createdAt: iso(0) })],
      [],
    );
    expect(rows.map((r) => r.who)).toEqual(['Kofi', 'Lila']);
  });

  it('carries the heavy flag through from the prayer', () => {
    const rows = ftCarryRows([prayer({ status: 'ongoing' })], [], [contact()]);
    expect(rows[0].heavy).toBe(true);
  });

  it('prefixes ids so a prayer and a request can never collide', () => {
    const rows = ftCarryRows([prayer({ id: 'x' })], [request({ id: 'x' })], []);
    expect(rows.map((r) => r.id)).toEqual(['ask:x', 'prayer:x']);
  });

  it('leaves `who` null when the prayer has outlived its contact', () => {
    expect(ftCarryRows([prayer({ contactId: 'gone' })], [], [contact()])[0].who).toBeNull();
  });
});

describe('ftCarrying', () => {
  it('counts the rows and names the one on top', () => {
    const rows = ftCarryRows([prayer(), prayer({ id: 'p2' })], [], [contact()]);
    expect(ftCarrying(rows)).toEqual({
      count: 2,
      detail: 'Rio — A job before graduation',
    });
  });

  it('counts a member ask alongside the logged prayers', () => {
    const rows = ftCarryRows([prayer()], [request()], [contact()]);
    expect(ftCarrying(rows)).toEqual({
      count: 2,
      detail: 'Lila — Midterms are wrecking me',
    });
  });

  it('says so plainly when nothing is open', () => {
    expect(ftCarrying([])).toEqual({
      count: 0,
      detail: 'Nothing open right now',
    });
  });

  it('still reads when the prayer has outlived its contact', () => {
    const rows = ftCarryRows([prayer({ contactId: 'gone' })], [], [contact()]);
    expect(ftCarrying(rows)).toEqual({
      count: 1,
      detail: 'A job before graduation',
    });
  });
});

describe('ftHomesOpen', () => {
  it('lists the open homes, newest offer first', () => {
    const older = offer();
    const newer = offer({ uid: 'u2', name: 'Sam Reyes', updatedAt: iso(0) });
    expect(ftHomesOpen([older, newer]).map((o) => o.uid)).toEqual(['u2', 'u-community']);
  });

  it('drops an offer with no times left on it — that is a withdrawn one', () => {
    expect(ftHomesOpen([offer({ availability: [] })])).toEqual([]);
  });

  it('is empty when nobody has offered', () => {
    expect(ftHomesOpen([])).toEqual([]);
  });
});

// ── the calendar ───────────────────────────────────────────────────────────

describe('ftNextGathering', () => {
  it('says Today, Tomorrow, or the weekday', () => {
    expect(ftNextGathering([event({ date: day(0) })], NOW)?.when).toBe('Today');
    expect(ftNextGathering([event({ date: day(1) })], NOW)?.when).toBe('Tomorrow');
    expect(ftNextGathering([event({ date: day(3) })], NOW)?.when).toBe('Saturday');
  });

  it('takes the soonest one, and carries its name and place', () => {
    const next = ftNextGathering(
      [
        event({ id: 'later', date: day(4), name: 'Retreat' }),
        event({ id: 'sooner', date: day(1), name: 'Friday Night', location: 'Hillcrest' }),
      ],
      NOW,
    );
    expect(next).toEqual({
      id: 'sooner',
      when: 'Tomorrow',
      title: 'Friday Night',
      detail: 'Hillcrest',
    });
  });

  it('admits when a gathering has no place set', () => {
    expect(ftNextGathering([event({ location: '' })], NOW)?.detail).toBe('No location set');
  });

  it('is null when the week is empty, and ignores what has already happened', () => {
    expect(ftNextGathering([], NOW)).toBeNull();
    expect(ftNextGathering([event({ date: day(-2) })], NOW)).toBeNull();
    expect(ftNextGathering([event({ date: day(9) })], NOW)).toBeNull();
  });

  describe('in a behind-UTC timezone', () => {
    const realTZ = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/Los_Angeles';
    });
    afterAll(() => {
      process.env.TZ = realTZ;
    });

    const localNoon = new Date(2026, 6, 14, 12, 0, 0).getTime(); // Jul 14, local

    it('does not read a gathering dated tomorrow as today', () => {
      expect(ftNextGathering([event({ date: '2026-07-15' })], localNoon)?.when).toBe('Tomorrow');
      expect(ftNextGathering([event({ date: '2026-07-14' })], localNoon)?.when).toBe('Today');
    });
  });
});

describe('ftWeekAhead', () => {
  it('lines the week up soonest first', () => {
    const chips = ftWeekAhead(
      [
        event({ id: 'c', date: day(5) }),
        event({ id: 'a', date: day(0) }),
        event({ id: 'b', date: day(2) }),
      ],
      NOW,
    );
    expect(chips.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('shows at most five', () => {
    const many = Array.from({ length: 8 }, (_, i) => event({ id: `e${i}`, date: day(i % 7) }));
    expect(ftWeekAhead(many, NOW)).toHaveLength(5);
  });

  it('says the kind and the place under the name', () => {
    const [chip] = ftWeekAhead([event({ type: 'Weekly', location: 'Hillcrest' })], NOW);
    expect(chip.sub).toBe('Weekly · Hillcrest');
  });

  it('leaves the middot out when only one of the two is set', () => {
    expect(ftWeekAhead([event({ type: 'Weekly' })], NOW)[0].sub).toBe('Weekly');
    expect(ftWeekAhead([event({ location: 'Hillcrest' })], NOW)[0].sub).toBe('Hillcrest');
  });

  // Unlike the trainee queue's `queueDates`, which is one-off specials only: a
  // full-timer's week IS the recurring gatherings, and the recurrence generator
  // writes each occurrence as a real dated doc.
  it('includes a recurring gathering, unlike the trainee queue', () => {
    const chips = ftWeekAhead([event({ id: 'week3', parentEventId: 'e0', isRecurring: true })], NOW);
    expect(chips.map((c) => c.id)).toEqual(['week3']);
  });
});

describe('ftAssignees', () => {
  const user = (overrides: Partial<AppUser> = {}): AppUser => ({
    uid: 'u1',
    email: 'user@example.com',
    displayName: 'User One',
    role: 'manager',
    approved: true,
    ...overrides,
  });

  it('filters out cisa-* test accounts, unapproved users, viewers, and the current user', () => {
    const team: AppUser[] = [
      user({ uid: 'me', displayName: 'Current User' }),
      user({ uid: 'test1', email: 'cisa-ft@hub.com', displayName: 'cisa-ft' }),
      user({ uid: 'test2', email: 'regular@example.com', displayName: 'cisa-Trainee' }),
      user({ uid: 'unapproved', email: 'p@example.com', displayName: 'Pending', approved: false }),
      user({ uid: 'viewer', email: 'v@example.com', displayName: 'Viewer', role: 'viewer' }),
      user({ uid: 'valid1', email: 'b@example.com', displayName: 'Bob Smith' }),
      user({ uid: 'valid2', email: 'a@example.com', displayName: 'Alice Wong' }),
    ];

    const result = ftAssignees(team, 'me');
    expect(result.map((u) => u.uid)).toEqual(['valid2', 'valid1']);
    expect(result.map((u) => u.displayName)).toEqual(['Alice Wong', 'Bob Smith']);
  });
});
