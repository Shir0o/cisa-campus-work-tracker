import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import ContactPill from '../components/ui/ContactPill';

const h = vi.hoisted(() => ({
  listeners: {} as Record<string, ((snap: any) => void)[]>,
  mockContacts: {} as Record<string, any>,
  mockStages: [] as any[],
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: any, col: string, id: string) => ({ __type: 'doc', col, id, path: `${col}/${id}` }),
  collection: (_db: any, col: string) => ({ __type: 'collection', col, path: col }),
  query: (ref: any) => ref,
  orderBy: () => ({}),
  getDoc: vi.fn(),
  onSnapshot: vi.fn((ref: any, onNext: any, onError?: any) => {
    const key = ref.__type === 'doc' ? `${ref.col}/${ref.id}` : ref.col;
    if (!h.listeners[key]) h.listeners[key] = [];
    h.listeners[key].push(onNext);

    if (ref.__type === 'doc') {
      const data = h.mockContacts[ref.id];
      onNext({
        id: ref.id,
        exists: () => !!data,
        data: () => data || {},
      });
    } else if (ref.col === 'stages') {
      onNext({
        docs: h.mockStages.map((s) => ({
          id: s.id,
          data: () => s,
        })),
      });
    }

    return () => {
      h.listeners[key] = (h.listeners[key] || []).filter((cb) => cb !== onNext);
    };
  }),
}));

describe('ContactPill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.listeners = {};
    h.mockContacts = {
      c1: {
        id: 'c1',
        name: 'Grace Hopper',
        stage: 'Interested',
        year: 'Junior',
        major: 'Computer Science',
        createdByName: 'Tony Wang',
        lastContactedDate: new Date().toISOString(),
      },
    };
    h.mockStages = [
      { id: 's1', label: 'Interested', color: 'bg-stage-amber-soft text-stage-amber' },
      { id: 's2', label: 'Believer', color: 'bg-stage-teal-soft text-stage-teal' },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders contact initials, name, and live stage chip', () => {
    render(<ContactPill contactId="c1" />);

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('GH')).toBeInTheDocument();
    expect(screen.getByText('Interested')).toBeInTheDocument();
  });

  it('updates live when contact stage or name changes in Firestore', () => {
    render(<ContactPill contactId="c1" />);
    expect(screen.getByText('Interested')).toBeInTheDocument();

    act(() => {
      h.mockContacts['c1'] = {
        ...h.mockContacts['c1'],
        stage: 'Believer',
      };
      const callbacks = h.listeners['contacts/c1'] || [];
      callbacks.forEach((cb) =>
        cb({
          id: 'c1',
          exists: () => true,
          data: () => h.mockContacts['c1'],
        })
      );
    });

    expect(screen.getByText('Believer')).toBeInTheDocument();
  });

  it('shows hover preview card with details on mouseEnter and closes on mouseLeave', () => {
    const onOpen = vi.fn();
    render(<ContactPill contactId="c1" onOpenContact={onOpen} />);

    const pillBtn = screen.getByRole('button', { name: /Grace Hopper/i });

    // Hover to show preview card
    fireEvent.mouseEnter(pillBtn);
    expect(screen.getByText('Junior · Computer Science')).toBeInTheDocument();
    expect(screen.getByText(/spoke today/i)).toBeInTheDocument();
    expect(screen.getByText(/Cared for by/i)).toBeInTheDocument();
    expect(screen.getByText('Tony Wang')).toBeInTheDocument();

    const openBtn = screen.getByRole('button', { name: /Open Grace's page/i });
    fireEvent.click(openBtn);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', name: 'Grace Hopper' }));

    // Mouse leave with timer delay
    fireEvent.mouseLeave(pillBtn);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Junior · Computer Science')).not.toBeInTheDocument();
  });

  it('handles focus and blur for preview card', () => {
    render(<ContactPill contactId="c1" />);
    const pillBtn = screen.getByRole('button', { name: /Grace Hopper/i });

    fireEvent.focus(pillBtn);
    expect(screen.getByText('Junior · Computer Science')).toBeInTheDocument();

    fireEvent.blur(pillBtn);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Junior · Computer Science')).not.toBeInTheDocument();
  });

  it('displays correct last touch formatting for yesterday and no recent contact', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    h.mockContacts['c1'] = {
      ...h.mockContacts['c1'],
      lastContactedDate: yesterday,
    };

    const { rerender } = render(<ContactPill contactId="c1" />);
    let pillBtn = screen.getByRole('button', { name: /Grace Hopper/i });
    fireEvent.mouseEnter(pillBtn);
    expect(screen.getByText('spoke yesterday')).toBeInTheDocument();

    act(() => {
      h.mockContacts['c1'] = {
        id: 'c1',
        name: 'Grace Hopper',
        lastContactedDate: undefined,
        lastSeen: undefined,
        createdByName: undefined,
        lastContactedBy: undefined,
        owner: undefined,
        year: undefined,
        major: undefined,
      };
      const callbacks = h.listeners['contacts/c1'] || [];
      callbacks.forEach((cb) =>
        cb({
          id: 'c1',
          exists: () => true,
          data: () => h.mockContacts['c1'],
        })
      );
    });

    rerender(<ContactPill contactId="c1" fallbackSubtitle="Freshman" hideStage={true} />);
    pillBtn = screen.getByRole('button', { name: /Grace Hopper/i });
    fireEvent.mouseEnter(pillBtn);
    expect(screen.getByText('no recent contact')).toBeInTheDocument();
    expect(screen.getByText('Freshman')).toBeInTheDocument();
  });

  it('displays correct last touch formatting for days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    h.mockContacts['c1'] = {
      ...h.mockContacts['c1'],
      lastContactedDate: twoDaysAgo,
    };

    render(<ContactPill contactId="c1" />);
    const pillBtn = screen.getByRole('button', { name: /Grace Hopper/i });
    fireEvent.mouseEnter(pillBtn);

    expect(screen.getByText('last spoke 2 days ago')).toBeInTheDocument();
  });

  it('handles touch device tap toggle and direct click', () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<ContactPill contactId="c1" />);
    const pillBtn = screen.getByRole('button', { name: /Grace Hopper/i });

    // Tap to open on touch
    fireEvent.click(pillBtn);
    expect(screen.getByText('Junior · Computer Science')).toBeInTheDocument();

    // Tap again to close
    fireEvent.click(pillBtn);
    expect(screen.queryByText('Junior · Computer Science')).not.toBeInTheDocument();

    window.matchMedia = origMatchMedia;
  });

  it('handles direct click to open contact on non-touch device', async () => {
    const onOpen = vi.fn();
    render(<ContactPill contactId="c1" onOpenContact={onOpen} />);
    const pillBtn = screen.getByRole('button', { name: /Grace Hopper/i });

    await act(async () => {
      fireEvent.click(pillBtn);
    });

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', name: 'Grace Hopper' }));
  });

  it('handles onOpenContact with getDoc fallback when contact is missing from listener snapshot', async () => {
    const onOpen = vi.fn();
    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      id: 'missing_id',
      data: () => ({ name: 'Fetched Contact', stage: 'Prospect' }),
    });

    render(<ContactPill contactId="missing_id" fallbackName="Fallback" onOpenContact={onOpen} />);
    const pillBtn = screen.getByRole('button', { name: /Fallback/i });

    await act(async () => {
      fireEvent.click(pillBtn);
    });

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'missing_id', name: 'Fetched Contact' }));
  });

  it('handles onOpenContact when getDoc fails and falls back to fallback object', async () => {
    const onOpen = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.getDoc as any).mockRejectedValueOnce(new Error('getDoc network error'));

    render(<ContactPill contactId="missing_id" fallbackName="Fallback Name" onOpenContact={onOpen} />);
    const pillBtn = screen.getByRole('button', { name: /Fallback Name/i });

    await act(async () => {
      fireEvent.click(pillBtn);
    });

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'missing_id', name: 'Fallback Name' }));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles snapshot listener errors gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.onSnapshot as any).mockImplementationOnce((_ref: any, _next: any, onError: any) => {
      if (typeof onError === 'function') {
        onError(new Error('snapshot failed'));
      }
      return vi.fn();
    });

    render(<ContactPill contactId="c_err" fallbackName="Err" />);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders fallback when contact is missing or deleted', () => {
    render(<ContactPill contactId="" fallbackName="Old Contact" />);
    expect(screen.getByText('Old Contact')).toBeInTheDocument();
  });
});
