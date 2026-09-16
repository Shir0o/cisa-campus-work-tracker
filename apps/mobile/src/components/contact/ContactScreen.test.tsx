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

jest.mock('../../lib/data/users', () => ({
  subscribeUsers: jest.fn((cb) => {
    cb([
      { uid: 'user1', displayName: 'Staffer', email: 'staffer@example.com', role: 'trainee' },
      { uid: 'u-collab', displayName: 'Partner Bob', email: 'bob@example.com', role: 'trainee' },
      { uid: 'u-avail', displayName: 'Helper Alice', email: 'alice@example.com', role: 'trainee' },
    ]);
    return () => {};
  }),
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

jest.mock('./AddCollaboratorSheet', () => {
  const { View, Button } = require('react-native');
  return {
    AddCollaboratorSheet: ({ visible, onAdd, onClose }: any) =>
      visible ? (
        <View testID="add-collaborator-sheet">
          <Button
            title="Add Partner Bob"
            onPress={() => {
              onAdd('u-collab', 'Partner Bob');
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
    createdBy: 'user1',
    founders: ['user1'],
    coCreators: ['user1'],
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
    carerNames: [],
    addInteraction: jest.fn(),
    addPrayer: jest.fn(),
    markPrayerAnswered: jest.fn(),
    postThreadMessage: jest.fn(),
    toggleReaction: jest.fn(),
    deleteInteraction: jest.fn(),
    addCollaborator: jest.fn().mockResolvedValue(undefined),
    removeCollaborator: jest.fn().mockResolvedValue(undefined),
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

  describe('Collaborator Management & Impersonation', () => {
    it('displays who else can see and add someone button when user can share', () => {
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          coCreators: ['user1', 'u-collab'],
        },
      });

      const { getByText, getByLabelText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      // Expand details
      fireEvent.press(getByText('Details, notes, how to reach them'));

      expect(getByText('Who else can see')).toBeTruthy();
      expect(getByText('Partner Bob')).toBeTruthy();
      expect(getByLabelText('Add someone…')).toBeTruthy();
    });

    it('opens AddCollaboratorSheet when pressing add someone and invokes addCollaborator', () => {
      const mockAddCollaborator = jest.fn().mockResolvedValue(undefined);
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        addCollaborator: mockAddCollaborator,
      });

      const { getByText, getByLabelText, getByTestId, queryByTestId } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      fireEvent.press(getByText('Details, notes, how to reach them'));
      fireEvent.press(getByLabelText('Add someone…'));

      expect(getByTestId('add-collaborator-sheet')).toBeTruthy();

      fireEvent.press(getByText('Add Partner Bob'));
      expect(mockAddCollaborator).toHaveBeenCalledWith('u-collab', 'Partner Bob');
      expect(queryByTestId('add-collaborator-sheet')).toBeNull();
    });

    it('confirms and calls removeCollaborator when removing an added collaborator', () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const mockRemoveCollaborator = jest.fn().mockResolvedValue(undefined);

      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          createdBy: 'user1',
          coCreators: ['user1', 'u-collab'],
        },
        removeCollaborator: mockRemoveCollaborator,
      });

      const { getByText, getByLabelText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      fireEvent.press(getByText('Details, notes, how to reach them'));

      // The remove button has accessibilityLabel="Remove access"
      const removeBtn = getByLabelText('Remove access');
      fireEvent.press(removeBtn);

      expect(alertSpy).toHaveBeenCalledWith(
        'Remove access',
        'Remove view access for Partner Bob?',
        expect.any(Array),
      );

      // Trigger the destructive remove action from the alert
      const buttons = alertSpy.mock.calls[0][2] as any[];
      const confirmAction = buttons.find((b) => b.text === 'Remove');
      confirmAction.onPress();

      expect(mockRemoveCollaborator).toHaveBeenCalledWith('u-collab', 'Partner Bob');
      alertSpy.mockRestore();
    });

    it('does not allow removing the original creator', () => {
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          createdBy: 'user1',
          coCreators: ['user1'], // only creator
        },
      });

      const { getByText, queryByLabelText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      fireEvent.press(getByText('Details, notes, how to reach them'));

      // No remove button for original creator
      expect(queryByLabelText('Remove access')).toBeNull();
    });

    it('shows founders distinctly from added collaborators and offers remove controls only where they apply (#1054)', () => {
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          createdBy: 'user1',
          founders: ['user1', 'u-collab'],
          coCreators: ['u-collab', 'u-avail'],
        },
      });

      const { getByText, getByLabelText, queryByLabelText, getAllByLabelText, getAllByText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      fireEvent.press(getByText('Details, notes, how to reach them'));

      // Founders are named as gospel partners; the added collaborator is not.
      expect(getAllByText('Gospel partner').length).toBe(2);
      expect(getByText('Helper Alice')).toBeTruthy();

      // user1 (a founder) sees the add-someone affordance.
      expect(getByLabelText('Add someone…')).toBeTruthy();

      // A founder offers no remove control on a peer founder, but the added
      // collaborator (Helper Alice) is removable by anyone with sharing rights.
      const removeBtns = getAllByLabelText('Remove access');
      expect(removeBtns.length).toBe(1);
    });

    it('only a Full-timer sees the remove control on a founder (#1054)', () => {
      (useAuth as jest.Mock).mockReturnValue({ uid: 'user-ft', user: { displayName: 'Full-timer' }, role: 'admin' });
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          createdBy: 'user1',
          founders: ['user1', 'u-collab'],
          coCreators: ['u-collab', 'u-avail'],
        },
      });

      const { getByText, getAllByLabelText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      fireEvent.press(getByText('Details, notes, how to reach them'));

      // A Full-timer may remove anyone: both founders and the added collaborator.
      expect(getAllByLabelText('Remove access').length).toBe(3);
    });

    it('disables sharing and editing when isImpersonating is true', () => {
      (useAuth as jest.Mock).mockReturnValue({
        uid: 'user1',
        user: { displayName: 'Staffer' },
        role: 'admin',
        isImpersonating: true,
      });

      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          coCreators: ['user1', 'u-collab'],
        },
      });

      const { getByText, queryByText, queryByLabelText } = render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      // Top-row Edit button should be hidden in impersonation mode
      expect(queryByText('Edit')).toBeNull();

      fireEvent.press(getByText('Details, notes, how to reach them'));

      // Edit details button inside disclosure should be hidden
      expect(queryByText('Edit details')).toBeNull();

      // Add someone button should be hidden
      expect(queryByLabelText('Add someone…')).toBeNull();

      // Remove button for collaborators should be hidden
      expect(queryByLabelText('Remove access')).toBeNull();
    });
  });

  // #1024: the person screen refuses a contact the reader has no tie to, and
  // cuts team-scope Full-timer discussion on the reader's effective role. The
  // two were pinned as a skipped repro in ContactScreen.visibility.test.tsx;
  // they live here now that there is a fix behind them.
  describe('Contact visibility (#1024)', () => {
    // Amy was added, owned and co-created by Full-timers only. Enoch the
    // trainee has no tie to her at all -- People already hides her from him.
    const amy = {
      ...mockContact,
      id: 'amy',
      name: 'Amy Nguyen',
      stage: 'Interested',
      createdBy: 'tony',
      createdByName: 'Tony',
      addedBy: 'tony',
      coCreators: ['tony', 'grace'],
    };

    const teamMessage: ThreadMessage = {
      id: 'm-team',
      interactionId: null,
      scope: 'team',
      from: 'tony',
      fromName: 'Tony Wang',
      kind: 'comment',
      body: 'FULLTIMER-ONLY-DISCUSSION',
      at: '2026-09-10T12:00:00.000Z',
      reactions: [],
    };
    const openMessage: ThreadMessage = {
      id: 'm-open',
      interactionId: null,
      from: 'grace',
      fromName: 'Grace Lee',
      kind: 'comment',
      body: 'ORDINARY-COMMENT',
      at: '2026-09-11T12:00:00.000Z',
      reactions: [],
    };

    it.each([
      ['A Full-timer using "See it as they do" on a trainee', true],
      ['A trainee signed in for real', false],
    ])('%s cannot open a person they have no tie to', (_label, isImpersonating) => {
      (useAuth as jest.Mock).mockReturnValue({
        uid: 'enoch',
        user: { displayName: 'Enoch' },
        role: 'manager',
        isImpersonating,
      });
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: amy,
        threadMessages: [teamMessage, openMessage],
      });

      const { queryByText } = render(
        <ThemeProvider>
          <ContactScreen contactId="amy" initialTab="alongside" />
        </ThemeProvider>,
      );

      expect(queryByText('Amy Nguyen')).toBeNull();
      expect(queryByText("You're not on this person.")).toBeTruthy();
      expect(queryByText('ORDINARY-COMMENT')).toBeNull();
      expect(queryByText('FULLTIMER-ONLY-DISCUSSION')).toBeNull();
    });

    it('hides team-scope discussion from a tied trainee, and keeps it for a full-timer', () => {
      const mine = {
        ...mockContact,
        id: 'mine',
        name: 'My Person',
        createdBy: 'enoch',
        addedBy: 'enoch',
        coCreators: ['enoch'],
      };

      (useAuth as jest.Mock).mockReturnValue({ uid: 'enoch', user: { displayName: 'Enoch' }, role: 'manager' });
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: mine,
        threadMessages: [teamMessage, openMessage],
      });

      const asTrainee = render(
        <ThemeProvider>
          <ContactScreen contactId="mine" initialTab="alongside" />
        </ThemeProvider>,
      );
      expect(asTrainee.getByText('My Person')).toBeTruthy();
      expect(asTrainee.getByText('ORDINARY-COMMENT')).toBeTruthy();
      expect(asTrainee.queryByText('FULLTIMER-ONLY-DISCUSSION')).toBeNull();

      (useAuth as jest.Mock).mockReturnValue({ uid: 'tony', user: { displayName: 'Tony' }, role: 'admin' });
      const asFullTimer = render(
        <ThemeProvider>
          <ContactScreen contactId="mine" initialTab="alongside" />
        </ThemeProvider>,
      );
      expect(asFullTimer.getByText('FULLTIMER-ONLY-DISCUSSION')).toBeTruthy();
    });
  });
});
