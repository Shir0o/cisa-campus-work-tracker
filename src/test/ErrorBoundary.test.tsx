import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';

const ProblemComponent = ({ errorToThrow }: { errorToThrow: Error | null }) => {
  if (errorToThrow) {
    throw errorToThrow;
  }
  return <div>No Error</div>;
};

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    console.error = vi.fn();
    
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    console.error = originalConsoleError;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemComponent errorToThrow={null} />
      </ErrorBoundary>
    );
    expect(screen.getByText('No Error')).toBeInTheDocument();
  });

  it('renders custom fallback UI when error is thrown and fallback is provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error Page</div>}>
        <ProblemComponent errorToThrow={new Error('Test boundary error')} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom Error Page')).toBeInTheDocument();
  });

  it('renders default fallback UI when standard error is thrown', () => {
    render(
      <ErrorBoundary>
        <ProblemComponent errorToThrow={new Error('Test boundary error')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test boundary error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Application' })).toBeInTheDocument();
  });

  it('renders dynamic import fallback UI when chunk import fails', () => {
    sessionStorage.setItem('cisa_dynamic_import_reloaded', 'true');
    const chunkError = new TypeError(
      'Failed to fetch dynamically imported module: https://cisa-campus-work-tracker.pages.dev/assets/Messages-Bg_e6vmi.js'
    );

    render(
      <ErrorBoundary>
        <ProblemComponent errorToThrow={chunkError} />
      </ErrorBoundary>
    );

    expect(screen.getByText('A new version is available')).toBeInTheDocument();
    expect(
      screen.getByText('The application was updated while you were using it. Please reload to load the latest version.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update & Reload' })).toBeInTheDocument();
  });

  it('triggers window reload when "Update & Reload" button is clicked', () => {
    sessionStorage.setItem('cisa_dynamic_import_reloaded', 'true');
    const chunkError = new TypeError('Failed to fetch dynamically imported module: ...');

    render(
      <ErrorBoundary>
        <ProblemComponent errorToThrow={chunkError} />
      </ErrorBoundary>
    );
    
    const reloadBtn = screen.getByRole('button', { name: 'Update & Reload' });
    fireEvent.click(reloadBtn);
    
    expect(sessionStorage.getItem('cisa_dynamic_import_reloaded')).toBeNull();
    expect(window.location.reload).toHaveBeenCalled();
  });
});
