import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WhoWeHaventSeen, { rollingMonths, sinceWords } from '../components/visits/WhoWeHaventSeen';
import type { Contact, Home, Visit } from '../types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}));
vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
}));

const home = (overrides: Partial<Home> = {}): Home => ({
  id: 'h1',
  label: 'the Oseis',
  members: ['c1', 'c2'],
  place: 'Whitman Hall',
  active: true,
  ...overrides,
});

const contact = (id: string, name: string): Contact => ({ id, name } as Contact);

const visit = (id: string, date: string, contactIds: string[]): Visit =>
  ({
    id,
    date,
    contactIds,
    contactNames: [],
    went: [],
    wentNames: [],
    where: '',
    purpose: '',
    how: '',
    followUp: '',
    photos: [],
    createdAt: '',
    createdById: '',
    createdByName: '',
  }) as Visit;

const baseProps = {
  homes: [] as Home[],
  contacts: [] as Contact[],
  visits: [] as Visit[],
  onLogVisit: vi.fn(),
  onManageHomes: vi.fn(),
};

describe('rollingMonths / sinceWords', () => {
  it('labels the twelve rolling months, oldest first', () => {
    expect(rollingMonths(new Date('2026-08-13T12:00:00'))).toEqual([
      'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
    ]);
  });

  it('says never, today, a day count, then months, then years', () => {
    expect(sinceWords(null)).toBe('never');
    expect(sinceWords(0)).toBe('today');
    expect(sinceWords(1)).toBe('yesterday');
    expect(sinceWords(12)).toBe('12d');
    expect(sinceWords(45)).toBe('1mo');
    expect(sinceWords(400)).toBe('1y');
  });
});

const todayISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('WhoWeHaventSeen', () => {
  it('invites the first home when the roster is empty', () => {
    render(<WhoWeHaventSeen {...baseProps} />);
    expect(screen.getByText(/No homes yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a home' }));
    expect(baseProps.onManageHomes).toHaveBeenCalled();
  });

  it('groups homes and members, marking the months someone was seen', () => {
    const homes = [home({ members: ['c1', 'c2'] })];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    const visits = [visit('v1', todayISO(), ['c1'])];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} visits={visits} />);

    expect(screen.getByText('the Oseis')).toBeInTheDocument();
    expect(screen.getByText('Whitman Hall')).toBeInTheDocument();
    expect(screen.getByText('Ama Osei')).toBeInTheDocument();
    expect(screen.getByText('Bo Chen')).toBeInTheDocument();
    // Ama was seen 3 days ago; Bo was never visited — reads as a gap.
    expect(screen.getByText('3d')).toBeInTheDocument();
    expect(screen.getByText('never')).toBeInTheDocument();
    // Exactly one seen-month mark: Ama's row. Bo's row is all gaps.
    expect(screen.getAllByText('', { selector: '[data-seen="true"]' })).toHaveLength(1);
  });

  it('flags a home nobody has ever been round to', () => {
    const homes = [home({ members: ['c1'] })];
    const contacts = [contact('c1', 'Ama Osei')];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} />);
    expect(screen.getByText('never been round')).toBeInTheDocument();
  });

  it('logs a visit from a person row, passing the home', () => {
    const onLogVisit = vi.fn();
    const homes = [home()];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    render(
      <WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} onLogVisit={onLogVisit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log a visit: Ama Osei' }));
    expect(onLogVisit).toHaveBeenCalledWith(homes[0]);
  });

  it('hides an inactive home and skips members whose contact is gone', () => {
    const homes = [
      home({ id: 'h1', members: ['c1', 'ghost'] }),
      home({ id: 'h2', label: 'the Chens', members: ['c2'], active: false }),
    ];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} />);
    expect(screen.getByText('the Oseis')).toBeInTheDocument();
    expect(screen.queryByText('the Chens')).not.toBeInTheDocument();
    expect(screen.queryByText('ghost')).not.toBeInTheDocument();
  });

  it('says nobody lives there yet for an empty home', () => {
    const homes = [home({ members: [] })];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} />);
    expect(screen.getByText('the Oseis')).toBeInTheDocument();
    expect(screen.getByText(/Nobody lives here yet/)).toBeInTheDocument();
  });
});
// The phone composition (#1857). On a 320px budget a single 13-column grid
// cannot hold a name, twelve months and "since" at once: the shell's `main`
// hides the overflow, so the "since" column simply fell off the right edge.
// These assertions pin the replacement geometry — one row per person, the
// value on the name's line, the twelve months as a strip beneath it — and the
// desktop grid it must leave alone.
describe('WhoWeHaventSeen — the compact reading fits a phone (#1857)', () => {
  const reading = {
    homes: [home({ members: ['c1', 'c2'] })],
    contacts: [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')],
    visits: [visit('v1', todayISO(), ['c1'])],
  };

  /** Every fixed width an element declares, in px — the class list covers
   *  Tailwind's arbitrary widths, the inline scan covers the rest. */
  const declaredWidths = (root: HTMLElement): number[] =>
    Array.from(root.querySelectorAll<HTMLElement>('*')).flatMap((el) => {
      const fromClasses = [...(el.getAttribute('class') ?? '').matchAll(/(?:^|\s)(?:min-)?w-\[(\d+)px\]/g)].map((m) =>
        Number(m[1]),
      );
      const inline = parseFloat(el.style.minWidth || el.style.width || '');
      return Number.isNaN(inline) ? fromClasses : [...fromClasses, inline];
    });

  it('gives each person a row of their own: name and since, then twelve dots', () => {
    render(<WhoWeHaventSeen {...baseProps} {...reading} compact />);

    const ama = screen.getByRole('button', { name: 'Log a visit: Ama Osei' });
    const [amaLineOne, amaStrip] = Array.from(ama.children);
    expect(ama.children).toHaveLength(2);
    expect(amaLineOne).toHaveTextContent('Ama Osei');
    expect(amaLineOne).toHaveTextContent('3d');
    expect(amaLineOne.querySelectorAll('[data-seen]')).toHaveLength(0);
    expect(amaStrip.querySelectorAll('[data-seen]')).toHaveLength(12);
    expect(amaStrip.querySelectorAll('[data-seen="true"]')).toHaveLength(1);

    const bo = screen.getByRole('button', { name: 'Log a visit: Bo Chen' });
    expect(bo).not.toBe(ama);
    expect(bo.children[0]).toHaveTextContent('Bo Chen');
    expect(bo.children[1].querySelectorAll('[data-seen]')).toHaveLength(12);
  });

  it('keeps a never-visited person as twelve gaps with never in the accent colour', () => {
    render(<WhoWeHaventSeen {...baseProps} {...reading} compact />);

    const bo = screen.getByRole('button', { name: 'Log a visit: Bo Chen' });
    expect(within(bo).getByText('never')).toHaveClass('text-accent');
    expect(bo.querySelectorAll('[data-seen="true"]')).toHaveLength(0);
    expect(bo.querySelectorAll('[data-seen="false"]')).toHaveLength(12);
  });

  it('drops the 640px floor and the horizontal scroller on the phone', () => {
    const { container } = render(<WhoWeHaventSeen {...baseProps} {...reading} compact />);

    expect(declaredWidths(container).filter((w) => w >= 640)).toEqual([]);
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
  });

  it('labels the strip every other month at the 11px floor, since above the values', () => {
    const { container } = render(<WhoWeHaventSeen {...baseProps} {...reading} compact />);

    const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-month]'));
    expect(cells).toHaveLength(12);
    // Twelve 11px labels need 276px of text (the widest, "May", is 23px), which
    // the 320px phone budget does not leave once "since" is placed. Every other
    // month stays, ending on the current one — never by shrinking the type.
    expect(cells.filter((c) => c.textContent).map((c) => c.textContent)).toEqual(
      rollingMonths().filter((_, i) => i % 2 === 1),
    );

    const caption = cells[0].parentElement as HTMLElement;
    expect(caption).toHaveClass('text-[11px]');
    expect(within(caption).getByText('since')).toBeInTheDocument();
    expect(within(caption).queryByText('person')).not.toBeInTheDocument();
  });

  it('leaves the desktop grid alone: person caption, twelve labels, its own width floor', () => {
    const { container } = render(<WhoWeHaventSeen {...baseProps} {...reading} />);

    expect(screen.getByText('person')).toBeInTheDocument();
    for (const month of rollingMonths()) {
      expect(within(container).getAllByText(month).length).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll('[data-month]')).toHaveLength(0);
    expect(declaredWidths(container).some((w) => w >= 640)).toBe(true);
  });
});
