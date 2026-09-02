import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import OutreachBoardMobile from '../views/OutreachBoardMobile';

// jsdom does not implement Element.scrollTo (used by the tab auto-scroll effect).
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

const contact = (over: any = {}) => ({
  id: 'c1',
  name: 'Alice Smith',
  role: 'Student',
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
    expect(screen.getByText('1 students')).toBeInTheDocument();
    expect(screen.getByText('First Contact')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
  });

  it('adds an Unassigned tab when there are unmapped contacts', () => {
    render(<OutreachBoardMobile {...baseProps} unmappedContacts={[contact({ id: 'c9', stage: undefined })]} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows Shape the journey only for admins', () => {
    const onShapeJourney = vi.fn();
    const { rerender } = render(<OutreachBoardMobile {...baseProps} isAdmin onShapeJourney={onShapeJourney} />);
    fireEvent.click(screen.getByText('Shape the journey'));
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
    // #730: location was removed from the card sub — just the role remains.
    expect(screen.getByText('Student')).toBeInTheDocument();
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
    expect(screen.getByText('No one at this step just now.')).toBeInTheDocument();
  });

  it('renders translated contact notes in Spanish mode when cached', async () => {
    const { setCachedTranslation } = await import('../lib/translator');
    const { LanguageProvider } = await import('../components/LanguageProvider');

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
