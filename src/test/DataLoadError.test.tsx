import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataLoadError } from '../components/ui/DataLoadError';

describe('DataLoadError', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders the label in the heading', () => {
    render(<DataLoadError label="the dashboard" />);
    expect(screen.getByText("Couldn't load the dashboard")).toBeInTheDocument();
  });

  it('calls a provided onRetry when Reload is clicked', () => {
    const onRetry = vi.fn();
    render(<DataLoadError label="contacts" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('falls back to a full page reload when no onRetry is given', () => {
    render(<DataLoadError label="history" />);

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
