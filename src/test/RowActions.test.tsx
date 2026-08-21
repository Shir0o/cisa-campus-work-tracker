import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RowActions } from '../components/ui/RowActions';
import { buildContactRowActions } from '../lib/rowActions';
import type { Contact } from '../types';

const contact: Contact = {
  id: 'c1',
  name: 'Lila Rose',
  role: 'student',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: '',
  initials: 'LR',
};

describe('RowActions', () => {
  it('renders nothing when there are no actions', () => {
    const { container } = render(<RowActions items={[]} />);
    expect(container.firstChild).toBeNull();
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

  it('closes on Escape', () => {
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
});
