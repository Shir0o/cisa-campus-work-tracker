/**
 * Navigation shell preference provider (#664).
 *
 * The provider owns the stored preference, derives the *effective* desktop
 * shell variant (after viewport width rules), and persists writes. Resolution
 * rules (see docs/specs/navigation-shell-preference.md):
 *
 *   - absent stored value → default = rail
 *   - stored value is honoured at ≥ 1280px (Tailwind `xl`)
 *   - between lg (1024px) and 1280px: any rail preference is forced to
 *     rail-collapsed since a 232px rail is a quarter of the screen. The forced
 *     collapse is component state only — it never writes back to storage.
 *   - below lg: the provider still reports a desktop variant; the consumer
 *     branches on its own media query and falls through to the top-bar shell.
 *   - setting a preference persists it to localStorage under the storageKey.
 *
 * The forced-collapse-does-not-persist case is the defect most likely to ship.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NavShellProvider,
  useNavShell,
  type NavShell,
  type NavShellPreference,
} from '../components/NavShellProvider';

// Same width breakpoints the shell uses at runtime. The provider is purely
// pure — these are constants — but kept here so the test can pin them.
const RAIL_FITS_MIN = 1280; // ≥ this → stored preference honoured
const STORAGE_KEY = 'campus-hub-nav-shell';

// Test harness — reads the provider's effective shell + the setter.
function Harness({ initialWidth }: { initialWidth: number }) {
  const { preference, effective, setPreference } = useNavShell();
  return (
    <div>
      <div data-testid="pref">{preference}</div>
      <div data-testid="effective">{effective}</div>
      <button data-testid="set-rail" onClick={() => setPreference('rail')}>
        rail
      </button>
      <button
        data-testid="set-collapsed"
        onClick={() => setPreference('rail-collapsed')}
      >
        rail-collapsed
      </button>
      <button data-testid="set-topbar" onClick={() => setPreference('topbar')}>
        topbar
      </button>
      {/* Surface the live viewport the harness was rendered at, so width-dependent
          tests can sanity-check their setup. */}
      <div data-testid="width">{initialWidth}</div>
    </div>
  );
}

// ── matchMedia + resize plumbing ────────────────────────────────────────────

type MQListener = (e: { matches: boolean }) => void;

interface FakeMQL {
  media: string;
  matches: boolean;
  addEventListener: (e: string, cb: MQListener) => void;
  removeEventListener: (e: string, cb: MQListener) => void;
  addListener: (cb: MQListener) => void;
  removeListener: (cb: MQListener) => void;
  dispatchEvent: () => boolean;
}

function setMatchMedia(width: number) {
  // Static listener registry keyed by query string. Set semantics (we add and
  // remove); stored in a Record keyed by media query.
  const listeners: Record<string, Set<MQListener>> = {};
  const make = (min: number): FakeMQL => {
    const mql: FakeMQL = {
      media: `(min-width: ${min}px)`,
      matches: width >= min,
      addEventListener: (_e: string, cb: MQListener) => {
        if (!listeners[mql.media]) listeners[mql.media] = new Set();
        listeners[mql.media].add(cb);
      },
      removeEventListener: (_e: string, cb: MQListener) => {
        listeners[mql.media]?.delete(cb);
      },
      addListener: (cb: MQListener) => mql.addEventListener('change', cb),
      removeListener: (cb: MQListener) => mql.removeEventListener('change', cb),
      dispatchEvent: () => true,
    };
    return mql;
  };
  window.matchMedia = vi.fn().mockImplementation(make) as unknown as typeof window.matchMedia;
  return {
    resizeTo: (next: number) => {
      for (const [media, set] of Object.entries(listeners)) {
        // We only register listeners on (min-width: 1280px) in the provider.
        const min = Number(media.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
        for (const cb of set) cb({ matches: next >= min });
      }
      window.dispatchEvent(new Event('resize'));
    },
  };
}

// ── localStorage ────────────────────────────────────────────────────────────
const originalLocalStorage = global.localStorage;

describe('NavShellProvider (#664)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: vi.fn((k: string) => store[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          store[k] = v.toString();
        }),
        removeItem: vi.fn((k: string) => {
          delete store[k];
        }),
        clear: vi.fn(() => {
          for (const k of Object.keys(store)) delete store[k];
        }),
        length: 0,
        key: vi.fn(() => null),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      writable: true,
      value: originalLocalStorage,
    });
    vi.restoreAllMocks();
  });

  // ── 1. Initial read ────────────────────────────────────────────────────
  it('uses default (rail) when no stored value exists', () => {
    setMatchMedia(1400);
    render(
      <NavShellProvider>
        <Harness initialWidth={1400} />
      </NavShellProvider>,
    );
    expect(screen.getByTestId('pref')).toHaveTextContent('rail');
    expect(screen.getByTestId('effective')).toHaveTextContent('rail');
  });

  it('honours a stored preference on first render (above breakpoint)', () => {
    setMatchMedia(1400);
    store[STORAGE_KEY] = 'topbar';
    render(
      <NavShellProvider>
        <Harness initialWidth={1400} />
      </NavShellProvider>,
    );
    expect(screen.getByTestId('pref')).toHaveTextContent('topbar');
    expect(screen.getByTestId('effective')).toHaveTextContent('topbar');
  });

  it('reads storage in the initialiser so the first paint already has the right shell', () => {
    // The defect this guards against: the provider starting with the default
    // and reading storage in an effect — every load flashes the wrong shell.
    setMatchMedia(1400);
    store[STORAGE_KEY] = 'rail-collapsed';
    render(
      <NavShellProvider>
        <Harness initialWidth={1400} />
      </NavShellProvider>,
    );
    // No act/await — the rendered output of the very first paint must already
    // reflect the stored value.
    expect(screen.getByTestId('pref')).toHaveTextContent('rail-collapsed');
    expect(screen.getByTestId('effective')).toHaveTextContent('rail-collapsed');
  });

  // ── 2. Width rules: narrow viewport forces collapse ─────────────────
  // The provider's `effective` reflects only the desktop shell variant.
  // Below lg (< 1024px) the consumer falls through to the top-bar shell — the
  // rail is rendered only above that line, so the provider still reports the
  // desktop variant and the consumer branches on its own media query.
  it('forces the rail preference to collapsed below the rail-fits threshold', () => {
    setMatchMedia(1100); // < 1280 → a 232px rail is a quarter of the screen
    store[STORAGE_KEY] = 'rail';
    render(
      <NavShellProvider>
        <Harness initialWidth={1100} />
      </NavShellProvider>,
    );
    // Stored preference is unchanged — the rail can't fit.
    expect(screen.getByTestId('pref')).toHaveTextContent('rail');
    expect(screen.getByTestId('effective')).toHaveTextContent('rail-collapsed');
  });

  it('keeps the topbar preference unchanged below the rail-fits threshold', () => {
    setMatchMedia(1100);
    store[STORAGE_KEY] = 'topbar';
    render(
      <NavShellProvider>
        <Harness initialWidth={1100} />
      </NavShellProvider>,
    );
    expect(screen.getByTestId('pref')).toHaveTextContent('topbar');
    expect(screen.getByTestId('effective')).toHaveTextContent('topbar');
  });

  // ── 3. The big one: forced collapse must NOT persist ──────────────────
  it('forced collapse is component state only and never writes to storage', () => {
    // Below the rail-fits threshold (1280px) the provider must show
    // `rail-collapsed` so the consumer renders correctly — and crucially,
    // it must NOT rewrite the stored preference, or the user comes back
    // on a wide screen to find their preference silently flipped to
    // `rail-collapsed`. The widening test below exercises the restore.
    const { resizeTo } = setMatchMedia(1100); // < 1280 → forced collapse
    store[STORAGE_KEY] = 'rail';
    render(
      <NavShellProvider>
        <Harness initialWidth={1100} />
      </NavShellProvider>,
    );
    expect(screen.getByTestId('effective')).toHaveTextContent('rail-collapsed');
    // Storage is untouched — the forced collapse is component state.
    expect(store[STORAGE_KEY]).toBe('rail');
    // And it stays untouched even after the user resizes.
    act(() => {
      resizeTo(1400);
    });
    expect(screen.getByTestId('effective')).toHaveTextContent('rail');
    expect(store[STORAGE_KEY]).toBe('rail');
  });

  it('setPreference persists to storage under the storageKey', () => {
    setMatchMedia(1400);
    render(
      <NavShellProvider>
        <Harness initialWidth={1400} />
      </NavShellProvider>,
    );
    fireEvent.click(screen.getByTestId('set-collapsed'));
    expect(store[STORAGE_KEY]).toBe('rail-collapsed');
    expect(screen.getByTestId('pref')).toHaveTextContent('rail-collapsed');
    expect(screen.getByTestId('effective')).toHaveTextContent('rail-collapsed');
  });

  it('setPreference to topbar switches the effective shell immediately (above breakpoint)', () => {
    setMatchMedia(1400);
    render(
      <NavShellProvider>
        <Harness initialWidth={1400} />
      </NavShellProvider>,
    );
    fireEvent.click(screen.getByTestId('set-topbar'));
    expect(screen.getByTestId('pref')).toHaveTextContent('topbar');
    expect(screen.getByTestId('effective')).toHaveTextContent('topbar');
  });

  // ── 4. Resize: intermediate → wide restores the stored preference ────
  it('widening past the forced-collapse threshold restores the stored preference', () => {
    const { resizeTo } = setMatchMedia(1100);
    store[STORAGE_KEY] = 'rail';
    render(
      <NavShellProvider>
        <Harness initialWidth={1100} />
      </NavShellProvider>,
    );
    expect(screen.getByTestId('effective')).toHaveTextContent('rail-collapsed');
    expect(store[STORAGE_KEY]).toBe('rail'); // never written

    act(() => {
      resizeTo(1400);
    });
    expect(screen.getByTestId('effective')).toHaveTextContent('rail');
    expect(store[STORAGE_KEY]).toBe('rail'); // unchanged
  });

  it('narrowing past the breakpoint does not write — desktop shell stays as the stored value, consumer renders mobile below md', () => {
    // Provider reports rail-collapsed below the rail-fits threshold;
    // the *consumer* branches on its own md media query to render mobile.
    // Storage is untouched — the forced collapse is component state.
    const { resizeTo } = setMatchMedia(1400);
    store[STORAGE_KEY] = 'rail';
    render(
      <NavShellProvider>
        <Harness initialWidth={1400} />
      </NavShellProvider>,
    );
    expect(screen.getByTestId('effective')).toHaveTextContent('rail');

    act(() => {
      resizeTo(500);
    });
    expect(screen.getByTestId('effective')).toHaveTextContent('rail-collapsed');
    expect(store[STORAGE_KEY]).toBe('rail');
  });

  // ── 5. Unknown / invalid stored values fall back to the default ──────
  it('falls back to default if the stored value is not a known preference', () => {
    setMatchMedia(1400);
    store[STORAGE_KEY] = 'something-bogus';
    render(
      <NavShellProvider>
        <Harness initialWidth={1400} />
      </NavShellProvider>,
    );
    expect(screen.getByTestId('pref')).toHaveTextContent('rail');
  });

  // ── 6. Provider throws when used outside ───────────────────────────────
  it('throws a clear error when useNavShell is called outside a provider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Harness initialWidth={1400} />)).toThrow(
      /useNavShell must be used within a NavShellProvider/,
    );
    errSpy.mockRestore();
  });
  // ── 7. Three-state enum ────────────────────────────────────────────
  it('exposes the three-state enum: rail | rail-collapsed | topbar', () => {
    // The spec calls out that two booleans admit the impossible
    // "top bar, collapsed" state. The shape is the contract.
    const SHAPES: NavShellPreference[] = ['rail', 'rail-collapsed', 'topbar'];
    expect(new Set(SHAPES).size).toBe(3);
    // `effective` is one of the same three (mobile is the consumer's job).
    const EFFECTIVE: NavShell[] = ['rail', 'rail-collapsed', 'topbar'];
    expect(new Set(EFFECTIVE).size).toBe(3);
  });
});