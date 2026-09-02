import '@testing-library/jest-dom';
import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
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
