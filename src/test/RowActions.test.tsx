import React from 'react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RowActions } from '../components/ui/RowActions';
import { buildContactRowActions } from '../lib/rowActions';
import { useMediaQuery } from '../lib/useMediaQuery';
import type { Contact } from '../types';

vi.mock('../lib/useMediaQuery', () => ({
  useMediaQuery: vi.fn(),
}));

const contact: Contact = {
  id: 'c1',
  name: 'Lila Rose',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: '',
  initials: 'LR',
};

beforeEach(() => {
  vi.mocked(useMediaQuery).mockReturnValue(false);
});

describe('RowActions', () => {
  it('renders nothing when there are no actions', () => {
    const { container } = render(<RowActions items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  // #1843 — on a phone the trigger was a 28×28 box (`p-1.5` + a 16px glyph),
  // the smallest control on every person/visit/prayer/outreach row, and only
  // 12px from the floating note FAB on /outreach. It now reaches the 44px floor
  // on coarse pointers while the glyph keeps its size and its layout slot: the
  // 8px the box gains on each side is handed back as a negative margin, so no
  // row reflows. Fine pointers see exactly the old classes.
  it('grows the trigger to a 44px touch target on coarse pointers only', () => {
    render(<RowActions items={[{ id: 'a', label: 'A', onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: /more for this row/i });

    expect(trigger).toHaveClass('p-1.5');
    for (const cls of [
      'pointer-coarse:min-h-11',
      'pointer-coarse:min-w-11',
      'pointer-coarse:inline-flex',
      'pointer-coarse:items-center',
      'pointer-coarse:justify-center',
      'pointer-coarse:-m-2',
    ]) {
      expect(trigger).toHaveClass(cls);
    }

    // The glyph is untouched, and nothing sizes the button at 44px by default.
    expect(trigger.querySelector('svg')).toHaveClass('w-4', 'h-4');
    expect(trigger.className).not.toMatch(/(^|\s)(min-h-11|min-w-11|h-11|w-11)(\s|$)/);
  });

  it('opens the menu and runs an action', () => {
    const onOpen = vi.fn();
    const onFollowUp = vi.fn();
    render(
      <RowActions
        items={buildContactRowActions({
          contact,
          onOpen,
          onFollowUp,
          hide: ['todo', 'share'],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));
    expect(screen.getByRole('menuitem', { name: /Open Lila's page/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /I followed up/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /I followed up/i }));
    expect(onFollowUp).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on outside mousedown', () => {
    const onOpen = vi.fn();
    render(
      <RowActions
        items={buildContactRowActions({ contact, onOpen, hide: ['todo', 'share', 'followed'] })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));
    expect(screen.getByRole('menuitem', { name: /Open Lila's page/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));
    expect(screen.getByRole('menuitem', { name: /Open Lila's page/i })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('renders the mobile bottom sheet and runs an action', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const onOpen = vi.fn();
    render(
      <RowActions
        items={buildContactRowActions({ contact, onOpen, hide: ['todo', 'share', 'followed'] })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));
    expect(screen.getByRole('menuitem', { name: /Open Lila's page/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /Open Lila's page/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('renders disabled actions without running them', () => {
    const onOpen = vi.fn();
    render(
      <RowActions
        items={[
          {
            id: 'disabled',
            label: 'Disabled action',
            disabled: true,
            onSelect: onOpen,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Disabled action/i }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('buildContactRowActions', () => {
  it('returns the standard vocabulary in order', () => {
    const actions = buildContactRowActions({
      contact,
      onOpen: vi.fn(),
      onMakeTodo: vi.fn(),
      onShare: vi.fn(),
      canShare: true,
      onFollowUp: vi.fn(),
    });

    expect(actions.map((a) => a.id)).toEqual(['open', 'todo', 'share', 'followed']);
    expect(actions[0].label).toBe(`Open Lila's page`);
    expect(actions[1].label).toBe('Make a to-do');
    expect(actions[2].label).toBe('Share with a teammate');
    expect(actions[3].label).toBe('I followed up');
  });

  it('respects hide list and canShare false', () => {
    const actions = buildContactRowActions({
      contact,
      onOpen: vi.fn(),
      onShare: vi.fn(),
      canShare: false,
      hide: ['share', 'todo'],
    });

    expect(actions.map((a) => a.id)).toEqual(['open']);
  });

  it('omits actions whose handlers are missing', () => {
    const actions = buildContactRowActions({ contact });
    expect(actions.map((a) => a.id)).toEqual([]);
  });

});

describe('RowActions — the removal row (#715)', () => {
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 200, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  const viewportHeight = window.innerHeight;

  afterEach(() => {
    vi.restoreAllMocks();
    window.innerHeight = viewportHeight;
  });

  it('draws a separator above an item that asks for one', () => {
    render(
      <RowActions
        items={[
          { id: 'open', label: 'Open page', onSelect: vi.fn() },
          { id: 'remove', label: 'Remove from prayer list', danger: true, separated: true, onSelect: vi.fn() },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('flips the popover above the trigger when there is no room below', () => {
    // The prayer card's ⋯ sits low in a short window; a four-item menu opening
    // downwards would land past the fold (#715).
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLDivElement,
    ) {
      return this.getAttribute('role') === 'menu' ? rect(0, 160) : rect(560, 28);
    });
    window.innerHeight = 662;

    render(<RowActions items={[{ id: 'a', label: 'A', onSelect: vi.fn() }]} />);
    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));

    expect(screen.getByRole('menu').className).toContain('bottom-9');
    expect(screen.getByRole('menu').className).not.toContain('top-9');
  });

  it('re-measures when the page scrolls under an open menu', () => {
    let triggerTop = 80;
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLDivElement,
    ) {
      return this.getAttribute('role') === 'menu' ? rect(0, 160) : rect(triggerTop, 28);
    });
    window.innerHeight = 662;

    render(<RowActions items={[{ id: 'a', label: 'A', onSelect: vi.fn() }]} />);
    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));
    expect(screen.getByRole('menu').className).toContain('top-9');

    triggerTop = 560;
    fireEvent.scroll(window);
    expect(screen.getByRole('menu').className).toContain('bottom-9');
  });

  it('keeps the popover below the trigger when there is room', () => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLDivElement,
    ) {
      return this.getAttribute('role') === 'menu' ? rect(0, 160) : rect(80, 28);
    });
    window.innerHeight = 662;

    render(<RowActions items={[{ id: 'a', label: 'A', onSelect: vi.fn() }]} />);
    fireEvent.click(screen.getByRole('button', { name: /more for this row/i }));

    expect(screen.getByRole('menu').className).toContain('top-9');
  });
});
