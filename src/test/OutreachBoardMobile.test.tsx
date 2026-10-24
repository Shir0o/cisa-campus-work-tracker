import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import OutreachBoardMobile from '../views/OutreachBoardMobile';
import { LanguageProvider } from '../components/LanguageProvider';

// jsdom does not implement Element.scrollTo (used by the tab auto-scroll effect).
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

const contact = (over: any = {}) => ({
  id: 'c1',
  name: 'Alice Smith',
  role: 'Student',
  year: 'Sophomore',
  major: 'Biology',
  location: 'Miller Hall',
  stage: 'First Contact',
  createdAt: new Date().toISOString(),
  ...over,
} as any);

const stage = (over: any = {}) => ({
  id: 'st1',
  label: 'First Contact',
  color: 'bg-board-amber',
  order: 1,
  ...over,
} as any);

const baseProps = {
  stages: [stage(), stage({ id: 'st2', label: 'Regular', order: 2 })],
  contacts: [] as any[],
  unmappedContacts: [] as any[],
  lastTouchByContact: new Map() as any,
  onOpenContact: vi.fn(),
  onMove: vi.fn().mockResolvedValue(undefined),
  onShapeJourney: vi.fn(),
  isAdmin: false,
  onAddContact: vi.fn(),
};

describe('OutreachBoardMobile', () => {
  it('renders stage tabs with contact counts', () => {
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} />);
    expect(screen.getByText('Stages')).toBeInTheDocument();
    expect(
      screen.getByText('1 student, moving from a first hello toward a church family.'),
    ).toBeInTheDocument();
    expect(screen.getByText('First Contact')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
  });

  it('opens a person with Enter or Space from the keyboard (#1763)', () => {
    const onOpenContact = vi.fn();
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} onOpenContact={onOpenContact} />);
    const card = screen.getByRole('button', { name: /Alice Smith/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));

    onOpenContact.mockClear();
    fireEvent.keyDown(card, { key: ' ' });
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('does not open the person when Enter is pressed on their Move button (#1763)', () => {
    const onOpenContact = vi.fn();
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} onOpenContact={onOpenContact} />);
    fireEvent.keyDown(screen.getByLabelText('Move Alice to another step'), { key: 'Enter' });
    expect(onOpenContact).not.toHaveBeenCalled();
  });

  it('exposes the steps as tabs and moves between them with arrow keys (#1763)', () => {
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Add to Regular');

    fireEvent.keyDown(screen.getAllByRole('tab')[1], { key: 'Home' });
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('does not change step on a mostly vertical swipe (#1763)', () => {
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} />);
    const panel = screen.getByRole('tabpanel');
    fireEvent.touchStart(panel, { touches: [{ clientX: 300, clientY: 600 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 230, clientY: 440 }] });
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.touchStart(panel, { touches: [{ clientX: 300, clientY: 600 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 190, clientY: 610 }] });
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('shows one empty message and no duplicate count (#1763)', () => {
    render(<OutreachBoardMobile {...baseProps} />);
    expect(screen.getByText('No one here just now.')).toBeInTheDocument();
    expect(screen.queryByText('No one at this step just now.')).not.toBeInTheDocument();
    expect(screen.queryByText('no one here yet')).not.toBeInTheDocument();
  });

  it('treats the move sheet as a modal dialog and closes it on Escape (#1763)', () => {
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} />);
    const trigger = screen.getByLabelText('Move Alice to another step');
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Where is Alice now?');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('localizes the stage chrome in Spanish (#1763)', () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <OutreachBoardMobile {...baseProps} contacts={[contact()]} />
      </LanguageProvider>,
    );
    expect(
      screen.getByText('1 estudiante, avanzando desde un primer saludo hacia una familia de iglesia.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/moving from a first hello/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mover a Alice a otro paso')).toBeInTheDocument();
  });

  it('adds an Unassigned tab when there are unmapped contacts', () => {
    render(<OutreachBoardMobile {...baseProps} unmappedContacts={[contact({ id: 'c9', stage: undefined })]} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows Shape the journey only for admins', () => {
    const onShapeJourney = vi.fn();
    const { rerender } = render(<OutreachBoardMobile {...baseProps} isAdmin onShapeJourney={onShapeJourney} />);
    const shape = screen.getByRole('button', { name: /Shape the journey/i });
    // The editor's trigger is a 44px phone target (#1788).
    expect(shape.className).toMatch(/(^|\s)min-h-11(\s|$)/);
    fireEvent.click(shape);
    expect(onShapeJourney).toHaveBeenCalled();

    rerender(<OutreachBoardMobile {...baseProps} isAdmin={false} />);
    expect(screen.queryByText('Shape the journey')).not.toBeInTheDocument();
  });

  it('renders contacts with their last-touch label and opens them on tap', () => {
    const onOpenContact = vi.fn();
    const lastTouchByContact = new Map([['c1', { ms: Date.now(), note: 'Coffee chat' }]]);
    render(
      <OutreachBoardMobile
        {...baseProps}
        contacts={[contact()]}
        lastTouchByContact={lastTouchByContact}
        onOpenContact={onOpenContact}
      />
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    // #730: location was removed from the card sub. #1345: it reads year · major,
    // never the stored role.
    expect(screen.getByText('Sophomore · Biology')).toBeInTheDocument();
    expect(screen.queryByText('Student')).not.toBeInTheDocument();
    expect(screen.getByText('Connected today')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('shows an overdue warning for stale contacts', () => {
    const lastTouchByContact = new Map([['c1', { ms: Date.now() - 10 * 86400000, note: '' }]]);
    render(
      <OutreachBoardMobile
        {...baseProps}
        contacts={[contact()]}
        lastTouchByContact={lastTouchByContact}
      />
    );
    expect(screen.getByText('Last connected 10 days ago')).toBeInTheDocument();
    expect(document.querySelector('.is-overdue')).not.toBeNull();
  });

  it('moves a contact to another stage from the move sheet', () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} onMove={onMove} />);
    fireEvent.click(screen.getByLabelText('Move Alice to another step'));
    expect(screen.getByText('Where is Alice now?')).toBeInTheDocument();
    const moveOptions = Array.from(document.querySelectorAll('.jrnm-move-opt'));
    const regular = moveOptions.find((el) => el.textContent?.includes('Regular'))!;
    fireEvent.click(regular);
    expect(onMove).toHaveBeenCalledWith('c1', 'Regular');
    expect(screen.queryByText('Where is Alice now?')).not.toBeInTheDocument();
  });

  it('adds a contact via the stage add button', () => {
    const onAddContact = vi.fn();
    render(<OutreachBoardMobile {...baseProps} contacts={[contact()]} onAddContact={onAddContact} />);
    fireEvent.click(screen.getByText('Welcome someone new'));
    expect(onAddContact).toHaveBeenCalledWith('First Contact');
  });

  it('shows the empty state for a stage with no contacts', () => {
    render(<OutreachBoardMobile {...baseProps} />);
    expect(screen.getByText('No one here just now.')).toBeInTheDocument();
  });

  // #1787: the phone Journey had no way to find a person across steps.
  describe('finding someone (#1787)', () => {
    const twoInFirst = () => [
      contact(),
      contact({ id: 'c2', name: 'Bob Park' }),
      contact({ id: 'c3', name: 'Cara Diaz', stage: 'Regular' }),
      contact({ id: 'c4', name: 'Dee Moss', stage: 'Regular' }),
    ];
    const searchField = () =>
      screen.getByRole('searchbox', { name: 'Find someone in this step' });

    it('narrows the current step to matches as you type', () => {
      render(<OutreachBoardMobile {...baseProps} contacts={twoInFirst()} />);
      fireEvent.change(searchField(), { target: { value: 'ali' } });

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.queryByText('Bob Park')).not.toBeInTheDocument();
      // A person on another step is not in this step's list either way.
      expect(screen.queryByText('Cara Diaz')).not.toBeInTheDocument();
    });

    it('reports a match in another step and selects that step on tap', () => {
      render(<OutreachBoardMobile {...baseProps} contacts={twoInFirst()} />);
      fireEvent.change(searchField(), { target: { value: 'cara' } });

      expect(screen.getByText('No one in this step matches “cara”.')).toBeInTheDocument();
      const hint = screen.getByRole('button', { name: '1 more in Regular' });
      // A cross-step match is one tap away, at the phone's 44px target.
      expect(hint.className).toMatch(/(^|\s)min-h-11(\s|$)/);

      fireEvent.click(hint);
      expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Cara Diaz')).toBeInTheDocument();
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    });

    it('has an accessible name and a 44px field, and clears without losing the step', () => {
      render(<OutreachBoardMobile {...baseProps} contacts={twoInFirst()} />);
      fireEvent.click(screen.getAllByRole('tab')[1]);

      const field = searchField();
      expect(field.className).toMatch(/(^|\s)min-h-11(\s|$)/);
      fireEvent.change(field, { target: { value: 'cara' } });
      expect(screen.getByText('Cara Diaz')).toBeInTheDocument();
      expect(screen.queryByText('Dee Moss')).not.toBeInTheDocument();

      const clear = screen.getByRole('button', { name: 'Clear search' });
      expect(clear.className).toMatch(/(^|\s)w-11(\s|$)/);
      fireEvent.click(clear);

      expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
      expect(searchField()).toHaveValue('');
      expect(searchField()).toHaveFocus();
      // The step's full list is back.
      expect(screen.getByText('Cara Diaz')).toBeInTheDocument();
      expect(screen.getByText('Dee Moss')).toBeInTheDocument();
    });

    it('announces the result count and the matches in other steps', () => {
      render(<OutreachBoardMobile {...baseProps} contacts={twoInFirst()} />);
      fireEvent.change(searchField(), { target: { value: 'cara' } });

      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('0 people');
      expect(status).toHaveTextContent('1 more in Regular');
    });

    it('speaks Spanish', () => {
      render(
        <LanguageProvider defaultLanguage="es">
          <OutreachBoardMobile {...baseProps} contacts={twoInFirst()} />
        </LanguageProvider>,
      );
      const field = screen.getByRole('searchbox', { name: 'Buscar a alguien en este paso' });
      fireEvent.change(field, { target: { value: 'cara' } });
      expect(screen.getByRole('button', { name: '1 más en Regular' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Borrar búsqueda' })).toBeInTheDocument();
    });
  });

  it('renders translated contact notes in Spanish mode when cached', async () => {
    const { setCachedTranslation } = await import('../lib/translator');

    setCachedTranslation('Coffee chat', 'Charla de café', 'es');

    const lastTouchByContact = new Map([['c1', { ms: Date.now(), note: 'Coffee chat' }]]);
    render(
      <LanguageProvider defaultLanguage="es">
        <OutreachBoardMobile
          {...baseProps}
          contacts={[contact()]}
          lastTouchByContact={lastTouchByContact}
        />
      </LanguageProvider>
    );

    expect(screen.getByText('Charla de café')).toBeInTheDocument();
    expect(screen.queryByText('Coffee chat')).not.toBeInTheDocument();
  });
});
