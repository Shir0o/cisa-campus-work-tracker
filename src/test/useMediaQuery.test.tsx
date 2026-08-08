import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useMediaQuery } from '../lib/useMediaQuery';

function Harness({ query }: { query: string }) {
  const matches = useMediaQuery(query);
  return <div data-testid="mq">{String(matches)}</div>;
}

describe('useMediaQuery', () => {
  it('reports the initial matchMedia result', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any;
    render(<Harness query="(min-width: 768px)" />);
    expect(screen.getByTestId('mq')).toHaveTextContent('false');
  });

  it('updates state when matchMedia matches initially', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as any;
    render(<Harness query="(min-width: 768px)" />);
    expect(screen.getByTestId('mq')).toHaveTextContent('true');
  });

  it('reacts to resize events by re-reading matchMedia', () => {
    let matches = false;
    window.matchMedia = vi.fn().mockReturnValue({
      get matches() {
        return matches;
      },
    }) as any;

    render(<Harness query="(min-width: 768px)" />);
    expect(screen.getByTestId('mq')).toHaveTextContent('false');

    matches = true;
    fireEvent(window, new Event('resize'));
    expect(screen.getByTestId('mq')).toHaveTextContent('true');
  });

  it('unsubscribes from resize on unmount', () => {
    const removeEventListener = vi.fn();
    window.addEventListener = vi.fn();
    window.removeEventListener = removeEventListener;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any;

    const { unmount } = render(<Harness query="(max-width: 600px)" />);
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
