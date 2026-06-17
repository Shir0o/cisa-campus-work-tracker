import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test case (e.g. unmounting React components)
afterEach(() => {
  cleanup();
});

// Mock html2canvas-pro globally
vi.mock('html2canvas-pro', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: () => 'data:image/png;base64,mock',
    width: 100,
    height: 100,
  }),
}));

