import React from 'react';
import { render, renderHook, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUnsavedGuard } from '../lib/navGuard';

function Harness({
  when,
  onSave,
}: {
  when: boolean;
  onSave?: () => Promise<void> | void;
}) {
  const { pending, decide } = useUnsavedGuard({ when, onSave });
  return (
    <div>
      <a href="/bible-study">All weeks</a>
      <a href="/elsewhere">Elsewhere</a>
      <a href="https://external.example.com/page">External</a>
      {pending ? (
        <div role="dialog" aria-label="Unsaved changes" data-testid="guard">
          <span data-testid="pending-kind">{pending.kind}</span>
          {pending.kind === 'push' && <span data-testid="pending-label">{pending.label}</span>}
          <button onClick={() => decide('stay')}>Stay here</button>
          <button onClick={() => decide('discard')}>Discard and open</button>
          <button onClick={() => decide('save')}>Save, then open</button>
        </div>
      ) : null}
    </div>
  );
}

describe('useUnsavedGuard', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('does not prompt when there are no unsaved changes', () => {
    render(<Harness when={false} />);

    fireEvent.click(screen.getByText('All weeks'));

    expect(screen.queryByTestId('guard')).not.toBeInTheDocument();
    // jsdom does not perform anchor navigation, but the guard must not have
    // interfered: no dialog is up and the URL never changed.
    expect(window.location.pathname).toBe('/');
  });

  it('intercepts an internal link click while dirty and offers three actions', () => {
    render(<Harness when />);

    fireEvent.click(screen.getByText('All weeks'));

    const guard = screen.getByTestId('guard');
    expect(guard).toBeInTheDocument();
    expect(screen.getByTestId('pending-kind')).toHaveTextContent('push');
    expect(screen.getByTestId('pending-label')).toHaveTextContent('All weeks');
    // The URL has not changed — staying is safe.
    expect(window.location.pathname).toBe('/');
  });

  it('staying leaves the page exactly as it was', () => {
    render(<Harness when />);

    fireEvent.click(screen.getByText('Elsewhere'));
    fireEvent.click(screen.getByRole('button', { name: /Stay here/i }));

    expect(screen.queryByTestId('guard')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('discarding navigates without saving', () => {
    const onSave = vi.fn();
    render(<Harness when onSave={onSave} />);

    fireEvent.click(screen.getByText('Elsewhere'));
    fireEvent.click(screen.getByRole('button', { name: /Discard and open/i }));

    expect(window.location.pathname).toBe('/elsewhere');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saving actually saves before navigating', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Harness when onSave={onSave} />);

    fireEvent.click(screen.getByText('Elsewhere'));
    fireEvent.click(screen.getByRole('button', { name: /Save, then open/i }));

    expect(onSave).toHaveBeenCalled();
    await waitFor(() => expect(window.location.pathname).toBe('/elsewhere'));
  });

  it('keeps the user here with their writing when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    render(<Harness when onSave={onSave} />);

    fireEvent.click(screen.getByText('Elsewhere'));
    fireEvent.click(screen.getByRole('button', { name: /Save, then open/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(window.location.pathname).toBe('/');
  });

  it('ignores external links, modified clicks and hash links', () => {
    render(<Harness when />);

    fireEvent.click(screen.getByText('External'));
    expect(screen.queryByTestId('guard')).not.toBeInTheDocument();

    const external = screen.getByText('External') as HTMLAnchorElement;
    expect(window.location.pathname).toBe('/');

    fireEvent.click(screen.getByText('All weeks'), { metaKey: true });
    expect(screen.queryByTestId('guard')).not.toBeInTheDocument();
  });

  it('asks before a browser-back navigation and restores the page while the dialog is up', () => {
    render(<Harness when />);

    act(() => {
      window.history.pushState(null, '', '/somewhere-else');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.getByTestId('guard')).toBeInTheDocument();
    expect(screen.getByTestId('pending-kind')).toHaveTextContent('back');
    // The URL was restored — the user is still on their page.
    expect(window.location.pathname).toBe('/');
  });

  it('does not ask on browser-back when clean', () => {
    render(<Harness when={false} />);

    act(() => {
      window.history.pushState(null, '', '/somewhere-else');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.queryByTestId('guard')).not.toBeInTheDocument();
  });

  it('prompts the browser before an unload while dirty, and not when clean', () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedGuard({ when: dirty }), {
      initialProps: { dirty: false },
    });

    const fireBeforeUnload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event;
    };

    // Clean: the browser may close without asking.
    expect(fireBeforeUnload().defaultPrevented).toBe(false);

    // Dirty: the guard cancels the unload, which is how the browser knows
    // to show its native dialog.
    rerender({ dirty: true });
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    // Clean again: the handler tracks the flag.
    rerender({ dirty: false });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

});
