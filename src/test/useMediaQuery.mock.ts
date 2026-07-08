import { vi } from 'vitest';
vi.mock('../lib/useMediaQuery', () => ({
  useMediaQuery: vi.fn().mockReturnValue(false),
}));
