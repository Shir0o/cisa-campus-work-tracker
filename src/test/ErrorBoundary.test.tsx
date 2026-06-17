import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';

const ProblemComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test boundary error');
  }
  return <div>No Error</div>;
};

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;
  const originalLocation = window.location;

  beforeEach(() => {
    // Suppress React boundary console errors during tests
    console.error = vi.fn();
    
    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    console.error = originalConsoleError;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('No Error')).toBeInTheDocument();
  });

  it('renders custom fallback UI when error is thrown and fallback is provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error Page</div>}>
        <ProblemComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom Error Page')).toBeInTheDocument();
  });

  it('renders default fallback UI when error is thrown and no fallback is provided', () => {
    render(
      <ErrorBoundary>
        <ProblemComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test boundary error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Application' })).toBeInTheDocument();
  });

  it('triggers window reload when "Reload Application" button is clicked', () => {
    render(
      <ErrorBoundary>
        <ProblemComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    
    const reloadBtn = screen.getByRole('button', { name: 'Reload Application' });
    fireEvent.click(reloadBtn);
    
    expect(window.location.reload).toHaveBeenCalled();
  });
});
