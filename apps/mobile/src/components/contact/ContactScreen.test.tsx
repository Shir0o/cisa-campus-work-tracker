import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ContactScreen } from './ContactScreen';
import { useContactDetailData } from '../../lib/useContactDetailData';
import { useAuth } from '../../lib/AuthProvider';
import type { Interaction, ThreadMessage } from '@cisa/core';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: jest.fn(),
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

jest.mock('./EditContactSheet', () => {
  const { View, Button } = require('react-native');
  return {
    EditContactSheet: ({ visible, onSaved, onClose }: any) =>
      visible ? (
        <View testID="edit-contact-sheet">
          <Button
            title="Trigger Save"
            onPress={() => {
              onSaved('Sarah Connor');
              onClose();
            }}
          />
          <Button title="Close Sheet" onPress={onClose} />
        </View>
      ) : null,
  };
});

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
    interactions: [] as Interaction[],
    interactionsLoading: false,
    prayers: [],
    prayersLoading: false,
    threadMessages: [] as ThreadMessage[],
    walkLabel: 'Alongside',
    inYourCare: true,
    addInteraction: jest.fn(),
    addPrayer: jest.fn(),
    markPrayerAnswered: jest.fn(),
    postThreadMessage: jest.fn(),
    toggleReaction: jest.fn(),
    deleteInteraction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ uid: 'user1', user: { displayName: 'Staffer' }, role: 'trainee' });
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

  describe('removing interactions (#650)', () => {
    const interaction = {
      id: 'int1',
      userId: 'user1',
      userName: 'Staffer',
      content: 'Coffee chat',
      dateTime: '2026-08-01T12:00:00.000Z',
      createdAt: '2026-08-01T11:00:00.000Z',
      type: 'chat',
    };

      const renderStory = (data: Partial<typeof baseLoadedData> = {}) => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      ...data,
      interactions: data.interactions ?? [interaction],
    });
      return render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows Remove on own interactions and hides the card, then restores on Undo', () => {
      const { getByText, queryByText } = renderStory();

      expect(getByText('Coffee chat')).toBeTruthy();

      fireEvent.press(getByText('Remove'));
      expect(queryByText('Coffee chat')).toBeNull();

      fireEvent.press(getByText('Undo'));
      expect(getByText('Coffee chat')).toBeTruthy();
    });

    it('commits the delete only after the undo window expires', () => {
      jest.useFakeTimers();
      const { getByText } = renderStory();

      fireEvent.press(getByText('Remove'));
      expect(baseLoadedData.deleteInteraction).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(baseLoadedData.deleteInteraction).toHaveBeenCalledWith(interaction);
    });

    it('hides the remove affordance for a non-owner non-manager', () => {
      (useAuth as jest.Mock).mockReturnValue({ uid: 'other-user', user: { displayName: 'Viewer' }, role: 'viewer' });
      const { getByText, queryByText } = renderStory();

      expect(getByText('Coffee chat')).toBeTruthy();
      expect(queryByText('Remove')).toBeNull();
    });

    it('hides the remove affordance for visit-mirror interactions', () => {
      const { queryByText } = renderStory({
        interactions: [{ ...interaction, id: 'visit_abc' }],
      });

      expect(queryByText('Remove')).toBeNull();
    });

    it('asks for confirmation when the interaction has thread messages', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByText } = renderStory({
        threadMessages: [{ id: 'm1', interactionId: 'int1', from: 'u1', fromName: 'S', kind: 'comment', body: 'x', at: '2026-08-01T00:00:00.000Z', reactions: [] }] as ThreadMessage[],
      });

      fireEvent.press(getByText('Remove'));

      expect(alertSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('message'),
        expect.any(Array),
      );
      alertSpy.mockRestore();
    });

    it('removes after confirming the thread warning', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[1]?.onPress?.();
      });
      const { queryByText, getByText } = renderStory({
        threadMessages: [{ id: 'm1', interactionId: 'int1', from: 'u1', fromName: 'S', kind: 'comment', body: 'x', at: '2026-08-01T00:00:00.000Z', reactions: [] }] as ThreadMessage[],
      });

      fireEvent.press(getByText('Remove'));

      expect(queryByText('Coffee chat')).toBeNull();
      alertSpy.mockRestore();
    });
  });

  describe('Contact Editing Flow', () => {
    it('renders Edit button in top row for write roles', () => {
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { getByText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      expect(getByText('Edit')).toBeTruthy();
    });

    it('hides Edit button for viewer role', () => {
      (useAuth as jest.Mock).mockReturnValue({ uid: 'user_viewer', user: { displayName: 'Viewer' }, role: 'viewer' });
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { queryByText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      expect(queryByText('Edit')).toBeNull();
    });

    it('opens EditContactSheet from top row Edit button and handles save', () => {
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { getByText, getByTestId, queryByTestId } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      expect(queryByTestId('edit-contact-sheet')).toBeNull();

      fireEvent.press(getByText('Edit'));
      expect(getByTestId('edit-contact-sheet')).toBeTruthy();

      fireEvent.press(getByText('Trigger Save'));
      expect(queryByTestId('edit-contact-sheet')).toBeNull();
      expect(getByText('Sarah Connor updated')).toBeTruthy();
    });

    it('renders Edit details button inside details disclosure for write roles and opens sheet', () => {
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { getByText, getByTestId, queryByTestId } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      // Expand details
      const detailsToggle = getByText('Details, notes, how to reach them');
      fireEvent.press(detailsToggle);

      expect(getByText('Edit details')).toBeTruthy();

      fireEvent.press(getByText('Edit details'));
      expect(getByTestId('edit-contact-sheet')).toBeTruthy();
    });
  });
});
