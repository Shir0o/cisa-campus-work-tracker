import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { SkeletonSection } from './SkeletonSection';
import { QueueSkeleton } from './QueueSkeleton';
import { MemberHomeSkeleton } from './MemberHomeSkeleton';
import { FtHomeSkeleton } from './FtHomeSkeleton';
import { ContactSkeleton } from './ContactSkeleton';
import { DocSkeleton } from './DocSkeleton';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

describe('SkeletonSection', () => {
  it('renders a label bar and a card of rows', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <SkeletonSection rows={2} />
      </ThemeProvider>,
    );
    expect(getByTestId('skeleton-section')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBe(7);
  });
});

describe('QueueSkeleton', () => {
  it('renders the queue chrome and one big card', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <QueueSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('queue-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThan(8);
  });
});

describe('MemberHomeSkeleton', () => {
  it('renders the head and widget sections', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <MemberHomeSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('member-home-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThan(15);
  });
});

describe('FtHomeSkeleton', () => {
  it('renders the greeting, quick tiles and widget sections', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <FtHomeSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('ft-home-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThan(15);
  });
});

describe('ContactSkeleton', () => {
  it('renders the hero card and rows', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <ContactSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('contact-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThan(10);
  });
});

describe('DocSkeleton', () => {
  it('renders the audience line and a card of document lines', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <DocSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('doc-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThan(4);
  });
});
