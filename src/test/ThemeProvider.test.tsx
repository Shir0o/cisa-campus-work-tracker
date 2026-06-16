import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ThemeProvider, useTheme } from '../components/ThemeProvider';

const ThemeTestComponent = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <div data-testid="theme-val">{theme}</div>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('system')}>Set System</button>
    </div>
  );
};

describe('ThemeProvider', () => {
  let mockMatchMedia: any;
  let mediaQueryListeners: any[] = [];
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    mediaQueryListeners = [];
    
    // Mock matchMedia
    mockMatchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event, callback) => {
        if (event === 'change') {
          mediaQueryListeners.push(callback);
        }
      }),
      removeEventListener: vi.fn((event, callback) => {
        if (event === 'change') {
          mediaQueryListeners = mediaQueryListeners.filter(l => l !== callback);
        }
      }),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: mockMatchMedia,
    });

    // Reset document element classes
    document.documentElement.className = '';
    
    // Reset localStorage
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { for (const key in store) delete store[key]; }),
      length: 0,
      key: vi.fn((index) => Object.keys(store)[index] || null),
    };
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it('renders children correctly', () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Child Content</div>
      </ThemeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('uses defaultTheme when no localStorage value exists', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeTestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme-val').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('loads cached theme from localStorage', () => {
    localStorage.setItem('vite-ui-theme', 'light');
    
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeTestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme-val').textContent).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('sets light theme class on document element', () => {
    render(
      <ThemeProvider defaultTheme="system">
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    const setLightBtn = screen.getByRole('button', { name: 'Set Light' });
    fireEvent.click(setLightBtn);

    expect(screen.getByTestId('theme-val').textContent).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith('vite-ui-theme', 'light');
  });

  it('sets dark theme class on document element', () => {
    render(
      <ThemeProvider defaultTheme="system">
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    const setDarkBtn = screen.getByRole('button', { name: 'Set Dark' });
    fireEvent.click(setDarkBtn);

    expect(screen.getByTestId('theme-val').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith('vite-ui-theme', 'dark');
  });

  it('handles system theme correctly when matches dark preferences', () => {
    mockMatchMedia.mockImplementation(query => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(
      <ThemeProvider defaultTheme="system">
        <ThemeTestComponent />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('handles system theme correctly when matches light preferences', () => {
    mockMatchMedia.mockImplementation(query => ({
      matches: false, // does not match dark
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(
      <ThemeProvider defaultTheme="system">
        <ThemeTestComponent />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('listens to prefers-color-scheme media query updates in system theme', () => {
    render(
      <ThemeProvider defaultTheme="system">
        <ThemeTestComponent />
      </ThemeProvider>
    );

    // Initial system preference is light (matches: false)
    expect(document.documentElement.classList.contains('light')).toBe(true);

    // Simulate change in system preferences to dark
    mockMatchMedia.mockImplementation(query => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    act(() => {
      mediaQueryListeners.forEach(listener => listener());
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('returns default initial state when useTheme is called outside a ThemeProvider', () => {
    let result: any;
    const BadComponent = () => {
      result = useTheme();
      return null;
    };
    
    render(<BadComponent />);
    expect(result).toEqual({
      theme: 'system',
      setTheme: expect.any(Function),
    });
  });
});
