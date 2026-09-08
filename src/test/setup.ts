import '@testing-library/jest-dom';
import { vi } from 'vitest';
vi.mock('html2canvas-pro', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: () => 'data:image/png;base64,mock',
    width: 100,
    height: 100,
  }),
}));

// jsdom implements no object URLs, and the visit modal previews picked photos
// with them.
URL.createObjectURL = vi.fn(() => 'blob:preview');
URL.revokeObjectURL = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// The reader's snap deck mirrors the visible panel through an
// IntersectionObserver, and the Section index (and the editor's outline)
// navigate with scrollIntoView (#890). jsdom implements neither — no layout —
// so both get inert stubs here, the matchMedia precedent for this kind of
// global. The real browser supplies the truth on both.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
(window as unknown as Record<string, unknown>).IntersectionObserver = MockIntersectionObserver;
Element.prototype.scrollIntoView = () => {};

// The editor preview measures the pane with a ResizeObserver (#916). jsdom
// has no layout engine, so it gets the same inert stub treatment as
// IntersectionObserver above; the real browser supplies the truth.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(window as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver;
