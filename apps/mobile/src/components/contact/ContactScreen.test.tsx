import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ContactScreen } from './ContactScreen';
import { useContactDetailData } from '../../lib/useContactDetailData';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: { displayName: 'Staffer' }, role: 'trainee' }),
}));

jest.mock('../../lib/useFtHomeData', () => ({
  prayerCardId: (id: string) => `pray:${id}`,
}));

jest.mock('../../lib/data/contacts', () => ({
  moveContactStage: jest.fn(),
}));

jest.mock('../../lib/messaging', () => ({
  openCall: jest.fn(),
  openEmail: jest.fn(),
  openMessage: jest.fn(),
}));

jest.mock('../../lib/useContactDetailData', () => ({
  useContactDetailData: jest.fn(),
}));

jest.mock('../../lib/queueState', () => ({
  useQueueState: () => ({
    handled: {},
    handledCount: 0,
    handle: jest.fn(),
    pushLater: jest.fn(),
  }),
}));

jest.mock('../log/LogSheet', () => ({
  LogSheet: () => null,
}));

jest.mock('./ContactPrayerSheet', () => ({
  ContactPrayerSheet: () => null,
}));

jest.mock('../journey/MoveStepSheet', () => ({
  MoveStepSheet: () => null,
}));

describe('ContactScreen', () => {
  const mockContact = {
    id: 'contact1',
    name: 'Sarah Connor',
    stage: 'Interested',
    phone: '555-1234',
    email: 'sarah@example.com',
    year: 'Sophomore',
    major: 'Computer Science',
    notes: 'Met at club table',
    createdAt: '2026-08-01T12:00:00.000Z',
    createdByName: 'Staffer',
  };

  const baseLoadedData = {
    contact: mockContact,
    stages: [
      { id: 'stage1', label: 'New' },
      { id: 'stage2', label: 'Interested' },
      { id: 'stage3', label: 'Established' },
    ],
    loading: false,
    error: null,
    interactions: [],
    interactionsLoading: false,
    prayers: [],
    prayersLoading: false,
    threadMessages: [],
    walkLabel: 'Alongside',
    inYourCare: true,
    addInteraction: jest.fn(),
    addPrayer: jest.fn(),
    markPrayerAnswered: jest.fn(),
    postThreadMessage: jest.fn(),
    toggleReaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders skeleton during initial loading state', () => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      contact: null,
      loading: true,
    });

    const { getByTestId } = render(
      <ThemeProvider>
        <ContactScreen contactId="contact1" initialTab="story" />
      </ThemeProvider>,
    );

    expect(getByTestId('contact-skeleton')).toBeTruthy();
  });

  it('transitions cleanly from loading state to loaded contact without hook order errors', () => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      contact: null,
      loading: true,
    });

    const { getByTestId, queryByTestId, getByText, rerender } = render(
      <ThemeProvider>
        <ContactScreen contactId="contact1" initialTab="story" />
      </ThemeProvider>,
    );

    expect(getByTestId('contact-skeleton')).toBeTruthy();

    // Transition to loaded state
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      contact: mockContact,
      loading: false,
    });

    rerender(
      <ThemeProvider>
        <ContactScreen contactId="contact1" initialTab="story" />
      </ThemeProvider>,
    );

    expect(queryByTestId('contact-skeleton')).toBeNull();
    expect(getByText('Sarah Connor')).toBeTruthy();
    expect(getByText('Interested')).toBeTruthy();
  });

  it('renders empty/error state when contact is not found', () => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      contact: null,
      loading: false,
      error: 'Contact not found',
    });

    const { getByText, queryByTestId } = render(
      <ThemeProvider>
        <ContactScreen contactId="contact_unknown" initialTab="story" />
      </ThemeProvider>,
    );

    expect(queryByTestId('contact-skeleton')).toBeNull();
    expect(getByText('Contact not found')).toBeTruthy();
  });
});
