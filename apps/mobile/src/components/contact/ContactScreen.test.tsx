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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../lib/data/todos', () => ({
  addTodo: jest.fn().mockResolvedValue('t1'),
}));

jest.mock('../ft/FtTodoSheet', () => {
  const { Text } = require('react-native');
  return {
    FtTodoSheet: ({ visible, initialTitle }: any) => (visible ? <Text testID="todo-sheet">{initialTitle}</Text> : null),
  };
});

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
    teamMembers: [],
    walkLabel: 'Alongside',
    inYourCare: true,
    carerNames: [],
    addInteraction: jest.fn(),
    addPrayer: jest.fn(),
    markPrayerAnswered: jest.fn(),
    postThreadMessage: jest.fn(),
    deleteThreadMessage: jest.fn(),
    editThreadMessage: jest.fn(),
    closeAsk: jest.fn(),
    deleteInteraction: jest.fn(),
    addCollaborator: jest.fn().mockResolvedValue(undefined),
    removeCollaborator: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ uid: 'user1', user: { displayName: 'Staffer' }, role: 'trainee' });
  });

  it('renders skeleton during initial loading state', async () => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      contact: null,
      loading: true,
    });

    const { getByTestId } = await render(
      <ThemeProvider>
        <ContactScreen contactId="contact1" initialTab="story" />
      </ThemeProvider>,
    );

    expect(getByTestId('contact-skeleton')).toBeTruthy();
  });

  it('transitions cleanly from loading state to loaded contact without hook order errors', async () => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      contact: null,
      loading: true,
    });

    const { getByTestId, queryByTestId, getByText, rerender } = await render(
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

    await rerender(
      <ThemeProvider>
        <ContactScreen contactId="contact1" initialTab="story" />
      </ThemeProvider>,
    );

    expect(queryByTestId('contact-skeleton')).toBeNull();
    expect(getByText('Sarah Connor')).toBeTruthy();
    expect(getByText('Interested')).toBeTruthy();
  });

  it('shows the combined-from note without an undo control (#1434)', async () => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      loading: false,
      contact: {
        ...mockContact,
        combinedFrom: {
          name: 'Jane Duplicate',
          at: '2026-10-01T10:00:00.000Z',
          byName: 'Admin Tony',
          combineRecordId: 'rec-1',
        },
      },
    });

    const { getByTestId, getByText, queryByText } = await render(
      <ThemeProvider>
        <ContactScreen contactId="contact1" initialTab="story" />
      </ThemeProvider>,
    );

    expect(getByTestId('combined-from')).toBeTruthy();
    expect(getByText(/Combined from Jane Duplicate/)).toBeTruthy();
    expect(queryByText(/Undo combine/i)).toBeNull();
  });

  it('renders empty/error state when contact is not found', async () => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      contact: null,
      loading: false,
      error: 'Contact not found',
    });

    const { getByText, queryByTestId } = await render(
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

      const renderStory = async (data: Partial<typeof baseLoadedData> = {}) => {
    (useContactDetailData as jest.Mock).mockReturnValue({
      ...baseLoadedData,
      ...data,
      interactions: data.interactions ?? [interaction],
    });
      return await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows Remove on own interactions and hides the card, then restores on Undo', async () => {
      const { getByText, queryByText } = await renderStory();

      expect(getByText('Coffee chat')).toBeTruthy();

      await fireEvent.press(getByText('Remove'));
      expect(queryByText('Coffee chat')).toBeNull();

      await fireEvent.press(getByText('Undo'));
      expect(getByText('Coffee chat')).toBeTruthy();
    });

    it('commits the delete only after the undo window expires', async () => {
      jest.useFakeTimers();
      const { getByText } = await renderStory();

      await fireEvent.press(getByText('Remove'));
      expect(baseLoadedData.deleteInteraction).not.toHaveBeenCalled();

      await act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(baseLoadedData.deleteInteraction).toHaveBeenCalledWith(interaction);
    });

    it('hides the remove affordance for a non-owner non-manager', async () => {
      (useAuth as jest.Mock).mockReturnValue({ uid: 'other-user', user: { displayName: 'Viewer' }, role: 'viewer' });
      const { getByText, queryByText } = await renderStory();

      expect(getByText('Coffee chat')).toBeTruthy();
      expect(queryByText('Remove')).toBeNull();
    });

    it('hides the remove affordance for visit-mirror interactions', async () => {
      const { queryByText } = await renderStory({
        interactions: [{ ...interaction, id: 'visit_abc' }],
      });

      expect(queryByText('Remove')).toBeNull();
    });

    it('asks for confirmation when the interaction has thread messages', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByText } = await renderStory({
        threadMessages: [{ id: 'm1', interactionId: 'int1', from: 'u1', fromName: 'S', kind: 'comment', body: 'x', at: '2026-08-01T00:00:00.000Z' }] as ThreadMessage[],
      });

      await fireEvent.press(getByText('Remove'));

      expect(alertSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('message'),
        expect.any(Array),
      );
      alertSpy.mockRestore();
    });

    it('removes after confirming the thread warning', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[1]?.onPress?.();
      });
      const { queryByText, getByText } = await renderStory({
        threadMessages: [{ id: 'm1', interactionId: 'int1', from: 'u1', fromName: 'S', kind: 'comment', body: 'x', at: '2026-08-01T00:00:00.000Z' }] as ThreadMessage[],
      });

      await fireEvent.press(getByText('Remove'));

      expect(queryByText('Coffee chat')).toBeNull();
      alertSpy.mockRestore();
    });
  });

  describe('Contact Editing Flow', () => {
    it('renders Edit button in top row for write roles', async () => {
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { getByText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      expect(getByText('Edit')).toBeTruthy();
    });

    it('hides Edit button for viewer role', async () => {
      (useAuth as jest.Mock).mockReturnValue({ uid: 'user_viewer', user: { displayName: 'Viewer' }, role: 'viewer' });
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { queryByText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      expect(queryByText('Edit')).toBeNull();
    });

    it('opens EditContactSheet from top row Edit button and handles save', async () => {
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { getByText, getByTestId, queryByTestId } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      expect(queryByTestId('edit-contact-sheet')).toBeNull();

      await fireEvent.press(getByText('Edit'));
      expect(getByTestId('edit-contact-sheet')).toBeTruthy();

      await fireEvent.press(getByText('Trigger Save'));
      expect(queryByTestId('edit-contact-sheet')).toBeNull();
      expect(getByText('Sarah Connor updated')).toBeTruthy();
    });

    it('renders Edit details button inside details disclosure for write roles and opens sheet', async () => {
      (useContactDetailData as jest.Mock).mockReturnValue(baseLoadedData);
      const { getByText, getByTestId, queryByTestId } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      // Expand details
      const detailsToggle = getByText('Details, notes, how to reach them');
      await fireEvent.press(detailsToggle);

      expect(getByText('Edit details')).toBeTruthy();

      await fireEvent.press(getByText('Edit details'));
      expect(getByTestId('edit-contact-sheet')).toBeTruthy();
    });
  });

  describe('Collaborator Management & Impersonation', () => {
    it('displays who else can see and add someone button when user can share', async () => {
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          coCreators: ['user1', 'u-collab'],
        },
      });

      const { getByText, getByLabelText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      // Expand details
      await fireEvent.press(getByText('Details, notes, how to reach them'));

      expect(getByText('Who else can see')).toBeTruthy();
      expect(getByText('Partner Bob')).toBeTruthy();
      expect(getByLabelText('Add someone…')).toBeTruthy();
    });

    it('opens AddCollaboratorSheet when pressing add someone and invokes addCollaborator', async () => {
      const mockAddCollaborator = jest.fn().mockResolvedValue(undefined);
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        addCollaborator: mockAddCollaborator,
      });

      const { getByText, getByLabelText, getByTestId, queryByTestId } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      await fireEvent.press(getByText('Details, notes, how to reach them'));
      await fireEvent.press(getByLabelText('Add someone…'));

      expect(getByTestId('add-collaborator-sheet')).toBeTruthy();

      await fireEvent.press(getByText('Add Partner Bob'));
      expect(mockAddCollaborator).toHaveBeenCalledWith('u-collab', 'Partner Bob');
      expect(queryByTestId('add-collaborator-sheet')).toBeNull();
    });

    it('confirms and calls removeCollaborator when removing an added collaborator', async () => {
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

      const { getByText, getByLabelText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      await fireEvent.press(getByText('Details, notes, how to reach them'));

      // The remove button has accessibilityLabel="Remove access"
      const removeBtn = getByLabelText('Remove access');
      await fireEvent.press(removeBtn);

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

    it('does not allow removing the original creator', async () => {
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          createdBy: 'user1',
          coCreators: ['user1'], // only creator
        },
      });

      const { getByText, queryByLabelText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      await fireEvent.press(getByText('Details, notes, how to reach them'));

      // No remove button for original creator
      expect(queryByLabelText('Remove access')).toBeNull();
    });

    it('shows founders distinctly from added collaborators and offers remove controls only where they apply (#1054)', async () => {
      (useContactDetailData as jest.Mock).mockReturnValue({
        ...baseLoadedData,
        contact: {
          ...mockContact,
          createdBy: 'user1',
          founders: ['user1', 'u-collab'],
          coCreators: ['u-collab', 'u-avail'],
        },
      });

      const { getByText, getByLabelText, queryByLabelText, getAllByLabelText, getAllByText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      await fireEvent.press(getByText('Details, notes, how to reach them'));

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

    it('only a Full-timer sees the remove control on a founder (#1054)', async () => {
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

      const { getByText, getAllByLabelText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      await fireEvent.press(getByText('Details, notes, how to reach them'));

      // A Full-timer may remove anyone: both founders and the added collaborator.
      expect(getAllByLabelText('Remove access').length).toBe(3);
    });

    it('disables sharing and editing when isImpersonating is true', async () => {
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

      const { getByText, queryByText, queryByLabelText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="story" />
        </ThemeProvider>,
      );

      // Top-row Edit button should be hidden in impersonation mode
      expect(queryByText('Edit')).toBeNull();

      await fireEvent.press(getByText('Details, notes, how to reach them'));

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
    };
    const openMessage: ThreadMessage = {
      id: 'm-open',
      interactionId: null,
      from: 'grace',
      fromName: 'Grace Lee',
      kind: 'comment',
      body: 'ORDINARY-COMMENT',
      at: '2026-09-11T12:00:00.000Z',
    };

    it.each([
      ['A Full-timer using "See it as they do" on a trainee', true],
      ['A trainee signed in for real', false],
    ])('%s cannot open a person they have no tie to', async (_label, isImpersonating) => {
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

      const { queryByText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="amy" initialTab="conversation" />
        </ThemeProvider>,
      );

      expect(queryByText('Amy Nguyen')).toBeNull();
      expect(queryByText("You're not on this person.")).toBeTruthy();
      expect(queryByText('ORDINARY-COMMENT')).toBeNull();
      expect(queryByText('FULLTIMER-ONLY-DISCUSSION')).toBeNull();
    });

    it('hides team-scope discussion from a tied trainee, and keeps it for a full-timer', async () => {
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

      const asTrainee = await render(
        <ThemeProvider>
          <ContactScreen contactId="mine" initialTab="conversation" />
        </ThemeProvider>,
      );
      expect(asTrainee.getByText('My Person')).toBeTruthy();
      expect(asTrainee.getByText('ORDINARY-COMMENT')).toBeTruthy();
      expect(asTrainee.queryByText('FULLTIMER-ONLY-DISCUSSION')).toBeNull();

      (useAuth as jest.Mock).mockReturnValue({ uid: 'tony', user: { displayName: 'Tony' }, role: 'admin' });
      const asFullTimer = await render(
        <ThemeProvider>
          <ContactScreen contactId="mine" initialTab="conversation" />
        </ThemeProvider>,
      );
      // Never in the Conversation list — only behind the Full-timers switch.
      expect(asFullTimer.queryByText('FULLTIMER-ONLY-DISCUSSION')).toBeNull();
      await fireEvent.press(asFullTimer.getByRole('tab', { name: /Full-timers/ }));
      expect(asFullTimer.getByText('FULLTIMER-ONLY-DISCUSSION')).toBeTruthy();
      expect(asFullTimer.queryByText('ORDINARY-COMMENT')).toBeNull();
    });
  });

  // ADR 0033 / #1261: the phone person screen in the one stream grammar.
  describe('the Conversation tab (#1261)', () => {
    const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const graceSays: ThreadMessage = {
      id: 'm-grace',
      interactionId: null,
      from: 'grace',
      fromName: 'Grace Liu',
      kind: 'comment',
      body: 'GRACE-OPEN',
      at: at(3),
    };
    const mine: ThreadMessage = {
      id: 'm-mine',
      interactionId: null,
      from: 'user1',
      fromName: 'Staffer',
      kind: 'comment',
      body: 'MINE',
      at: at(2),
    };
    const staffOnly: ThreadMessage = {
      id: 'm-team',
      interactionId: null,
      scope: 'team',
      from: 'tony',
      fromName: 'Tony Wang',
      kind: 'comment',
      body: 'STAFF-ONLY',
      at: at(1),
    };
    const onInteraction: ThreadMessage = {
      id: 'm-int',
      interactionId: 'int-coffee',
      from: 'grace',
      fromName: 'Grace Liu',
      kind: 'comment',
      body: 'ABOUT-THE-COFFEE',
      at: at(1),
    };
    const ask: ThreadMessage = {
      id: 'm-ask',
      interactionId: null,
      from: 'grace',
      fromName: 'Grace Liu',
      kind: 'nudge',
      body: 'Can someone text Sarah before Thursday?',
      at: at(30),
    };
    const coffee = {
      id: 'int-coffee',
      userId: 'user1',
      userName: 'Staffer',
      content: 'Coffee chat',
      dateTime: '2026-08-01T12:00:00.000Z',
      createdAt: '2026-08-01T11:00:00.000Z',
      type: 'chat',
    };
    const walk = { ...coffee, id: 'int-walk', content: 'Walk to class', dateTime: '2026-08-02T12:00:00.000Z' };

    const renderAs = async (
      auth: { uid: string; role: string; isImpersonating?: boolean },
      threadMessages: ThreadMessage[],
      initialTab: 'story' | 'conversation' = 'conversation',
      interactions: Interaction[] = [],
    ) => {
      (useAuth as jest.Mock).mockReturnValue({ user: { displayName: auth.uid }, ...auth });
      (useContactDetailData as jest.Mock).mockReturnValue({ ...baseLoadedData, threadMessages, interactions });
      return render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab={initialTab} />
        </ThemeProvider>,
      );
    };

    it('is called Conversation, not Alongside', async () => {
      const { getByRole, queryByText } = await renderAs({ uid: 'user1', role: 'manager' }, []);
      expect(getByRole('tab', { name: /Conversation/ })).toBeTruthy();
      expect(queryByText(/Alongside/)).toBeNull();
    });

    it('gives a Full-timer the Conversation / Full-timers switch, and a Trainee none', async () => {
      const ft = await renderAs({ uid: 'tony', role: 'admin' }, [graceSays, staffOnly]);
      expect(ft.getByRole('tab', { name: /Full-timers/ })).toBeTruthy();

      const trainee = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays, staffOnly]);
      expect(trainee.queryByRole('tab', { name: /Full-timers/ })).toBeNull();
    });

    it('a discussion deep link opens Conversation on the Full-timers side for a Full-timer, plain Conversation for anyone else (#1303)', async () => {
      (useAuth as jest.Mock).mockReturnValue({ user: { displayName: 'tony' }, uid: 'tony', role: 'admin' });
      (useContactDetailData as jest.Mock).mockReturnValue({ ...baseLoadedData, threadMessages: [graceSays, staffOnly], interactions: [] });
      const ft = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="conversation" initialStream="team" />
        </ThemeProvider>,
      );
      expect(ft.getByText('STAFF-ONLY')).toBeTruthy();
      expect(ft.queryByText('GRACE-OPEN')).toBeNull();
      await ft.unmount();

      (useAuth as jest.Mock).mockReturnValue({ user: { displayName: 'user1' }, uid: 'user1', role: 'manager' });
      const trainee = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="conversation" initialStream="team" />
        </ThemeProvider>,
      );
      expect(trainee.getByText('GRACE-OPEN')).toBeTruthy();
      expect(trainee.queryByText('STAFF-ONLY')).toBeNull();
      await trainee.unmount();
    });

    it('cuts the switch on the effective role, so "See it as they do" hides it', async () => {
      const { queryByRole } = await renderAs({ uid: 'user1', role: 'manager', isImpersonating: true }, [graceSays]);
      expect(queryByRole('tab', { name: /Full-timers/ })).toBeNull();
    });

    it('lists only the contact-level open stream — never staff-only messages or Interaction threads', async () => {
      const { getByText, queryByText } = await renderAs(
        { uid: 'tony', role: 'admin' },
        [graceSays, staffOnly, onInteraction],
        'conversation',
        [coffee],
      );
      expect(getByText('GRACE-OPEN')).toBeTruthy();
      expect(queryByText('STAFF-ONLY')).toBeNull();
      expect(queryByText('ABOUT-THE-COFFEE')).toBeNull();
      expect(getByText('Everyone tied to Sarah sees this.')).toBeTruthy();
    });

    it('shows the Full-timers stream behind a lock that says Trainees cannot see it', async () => {
      const { getByRole, getByText, queryByText, queryByRole } = await renderAs({ uid: 'tony', role: 'admin' }, [graceSays, staffOnly]);
      await fireEvent.press(getByRole('tab', { name: /Full-timers/ }));
      expect(getByText('STAFF-ONLY')).toBeTruthy();
      expect(queryByText('GRACE-OPEN')).toBeNull();
      expect(getByText("Only Full-timers see this — Trainees can't.")).toBeTruthy();
      // No kind chips on Full-timers.
      expect(queryByRole('button', { name: 'Ask a follow-up' })).toBeNull();
    });

    it('offers Comment, Question and Ask a follow-up on the Conversation composer, and posts the chosen kind', async () => {
      const post = jest.fn();
      (useAuth as jest.Mock).mockReturnValue({ uid: 'user1', user: { displayName: 'Staffer' }, role: 'manager' });
      (useContactDetailData as jest.Mock).mockReturnValue({ ...baseLoadedData, postThreadMessage: post });
      const { getByRole, getByLabelText } = await render(
        <ThemeProvider>
          <ContactScreen contactId="contact1" initialTab="conversation" />
        </ThemeProvider>,
      );
      await fireEvent.press(getByRole('button', { name: 'Ask a follow-up' }));
      await fireEvent.changeText(getByLabelText('Write to everyone tied to Sarah'), 'Text her Thursday');
      await fireEvent.press(getByRole('button', { name: 'Send' }));
      expect(post).toHaveBeenCalledWith({ interactionId: null, scope: null, kind: 'nudge', body: 'Text her Thursday', mentionedUserIds: [] });
    });

    it('names your own messages with your name, not "You"', async () => {
      const { getByText, queryByText } = await renderAs({ uid: 'user1', role: 'manager' }, [mine]);
      expect(getByText('Staffer')).toBeTruthy();
      expect(queryByText('You')).toBeNull();
    });

    describe('Story Threads', () => {
      it('carries a replies chip on an Interaction with replies, and "Think it through together" on one without', async () => {
        const { getByText, getByRole } = await renderAs(
          { uid: 'user1', role: 'manager' },
          [onInteraction],
          'story',
          [coffee, walk],
        );
        expect(getByText('1 reply')).toBeTruthy();
        expect(getByRole('button', { name: 'Think it through together' })).toBeTruthy();
      });

      it('opens the Interaction Thread as a pushed screen', async () => {
        const { getByText, getByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [onInteraction], 'story', [coffee, walk]);
        await fireEvent.press(getByText('1 reply'));
        expect(mockPush).toHaveBeenCalledWith('/contact/contact1/thread?interaction=int-coffee');
        await fireEvent.press(getByRole('button', { name: 'Think it through together' }));
        expect(mockPush).toHaveBeenCalledWith('/contact/contact1/thread?interaction=int-walk');
      });
    });

    describe('Follow-up asks', () => {
      it('shows the tag, how long it has been open, and both actions to the asker', async () => {
        const closeAsk = jest.fn();
        const own = { ...ask, from: 'user1', fromName: 'Staffer' };
        (useAuth as jest.Mock).mockReturnValue({ uid: 'user1', user: { displayName: 'Staffer' }, role: 'manager' });
        (useContactDetailData as jest.Mock).mockReturnValue({ ...baseLoadedData, threadMessages: [own], closeAsk });
        const { getByText, getByRole } = await render(
          <ThemeProvider>
            <ContactScreen contactId="contact1" initialTab="conversation" />
          </ThemeProvider>,
        );
        expect(getByText('Follow-up ask')).toBeTruthy();
        expect(getByText(/^Open (1 day|2 days)$/)).toBeTruthy();
        expect(getByRole('button', { name: 'Never mind' })).toBeTruthy();
        await fireEvent.press(getByRole('button', { name: 'I followed up' }));
        expect(closeAsk).toHaveBeenCalledWith(own);
      });

      it('offers anyone else tied only I followed up', async () => {
        const { getByRole, queryByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [ask]);
        expect(getByRole('button', { name: 'I followed up' })).toBeTruthy();
        expect(queryByRole('button', { name: 'Never mind' })).toBeNull();
      });

      it('offers no actions to someone who cannot write, or while seeing it as someone else', async () => {
        const viewer = await renderAs({ uid: 'v1', role: 'viewer' }, [ask]);
        expect(viewer.queryByRole('button', { name: 'I followed up' })).toBeNull();
        const seeing = await renderAs({ uid: 'user1', role: 'manager', isImpersonating: true }, [ask]);
        expect(seeing.queryByRole('button', { name: 'I followed up' })).toBeNull();
      });

      it('says who followed up once it is closed', async () => {
        const { getByText, queryByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [
          { ...ask, closedBy: 'tony', closedByName: 'Tony Wang', closedAt: at(1) },
        ]);
        expect(getByText(/Tony Wang followed up/)).toBeTruthy();
        expect(queryByRole('button', { name: 'I followed up' })).toBeNull();
      });
    });

    describe('long-press', () => {
      it('opens Reply in thread, Make a to-do and Copy text — and Delete only for the author', async () => {
        const { getByText, getByRole, queryByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays, mine]);

        await fireEvent(getByText('GRACE-OPEN'), 'longPress');
        expect(getByRole('button', { name: 'Reply in thread' })).toBeTruthy();
        expect(getByRole('button', { name: 'Make a to-do' })).toBeTruthy();
        expect(getByRole('button', { name: 'Copy text' })).toBeTruthy();
        expect(queryByRole('button', { name: 'Delete message' })).toBeNull();
      });

      it('lets the author delete their own message', async () => {
        const { getByText, getByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays, mine]);
        await fireEvent(getByText('MINE'), 'longPress');
        await fireEvent.press(getByRole('button', { name: 'Delete message' }));
        expect(baseLoadedData.deleteThreadMessage).toHaveBeenCalledWith(mine);
      });

      it('lets the author rewrite their own message, in place', async () => {
        const { getByText, getByRole, getByLabelText } = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays, mine]);
        await fireEvent(getByText('MINE'), 'longPress');
        await fireEvent.press(getByRole('button', { name: 'Edit' }));
        expect(getByLabelText('Edit message').props.value).toBe('MINE');
        await fireEvent.changeText(getByLabelText('Edit message'), 'MINE FIXED');
        await fireEvent.press(getByRole('button', { name: 'Save' }));
        expect(baseLoadedData.editThreadMessage).toHaveBeenCalledWith(mine, 'MINE FIXED');
      });

      it("does not offer Edit on someone else's message", async () => {
        const { getByText, queryByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays, mine]);
        await fireEvent(getByText('GRACE-OPEN'), 'longPress');
        expect(queryByRole('button', { name: 'Edit' })).toBeNull();
      });

      it("lets a Full-timer delete anyone's message", async () => {
        const { getByText, getByRole } = await renderAs({ uid: 'tony', role: 'admin' }, [graceSays]);
        await fireEvent(getByText('GRACE-OPEN'), 'longPress');
        expect(getByRole('button', { name: 'Delete message' })).toBeTruthy();
      });

      it('copies the text', async () => {
        const Clipboard = require('expo-clipboard');
        const { getByText, getByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays]);
        await fireEvent(getByText('GRACE-OPEN'), 'longPress');
        await fireEvent.press(getByRole('button', { name: 'Copy text' }));
        expect(Clipboard.setStringAsync).toHaveBeenCalledWith('GRACE-OPEN');
      });

      it('opens the Thread for Reply in thread', async () => {
        const { getByText, getByRole } = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays]);
        await fireEvent(getByText('GRACE-OPEN'), 'longPress');
        await fireEvent.press(getByRole('button', { name: 'Reply in thread' }));
        expect(mockPush).toHaveBeenCalledWith('/contact/contact1/thread?parent=m-grace');
      });

      it('opens the Full-timers Thread on its own stream', async () => {
        const { getByText, getByRole } = await renderAs({ uid: 'tony', role: 'admin' }, [staffOnly]);
        await fireEvent.press(getByRole('tab', { name: /Full-timers/ }));
        await fireEvent(getByText('STAFF-ONLY'), 'longPress');
        await fireEvent.press(getByRole('button', { name: 'Reply in thread' }));
        expect(mockPush).toHaveBeenCalledWith('/contact/contact1/thread?parent=m-team&stream=team');
      });

      it('starts a to-do from the message', async () => {
        const { getByText, getByRole, getByTestId } = await renderAs({ uid: 'user1', role: 'manager' }, [graceSays]);
        await fireEvent(getByText('GRACE-OPEN'), 'longPress');
        await fireEvent.press(getByRole('button', { name: 'Make a to-do' }));
        expect(getByTestId('todo-sheet').props.children).toBe('GRACE-OPEN');
      });
    });
  });
});
