import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactHead, { type ContactHeaderModel, type ContactHeaderActions } from '../components/contact/ContactHead';
import type { Contact, Stage } from '../types';

describe('ContactHead', () => {
  const contact: Contact = {
    id: 'c1',
    name: 'Sarah Connor',
    email: 'sarah@example.com',
    phone: '555-0199',
    stage: 'Regular',
  } as Contact;

  const stages: Stage[] = [
    { id: 's1', label: 'First Contact', order: 0, color: 'blue' } as Stage,
    { id: 's2', label: 'Regular', order: 1, color: 'green' } as Stage,
  ];

  const defaultModel: ContactHeaderModel = {
    contact,
    currentContact: contact,
    stages,
    canMoveStage: true,
    currentStageIndex: 1,
    currentStageInfo: stages[1],
    sinceText: 'Last connected 2 days ago',
    carerNames: ['John'],
    role: 'admin',
    isAdmin: true,
    showDelete: true,
    showRelease: false,
    canEditKind: true,
    openPrayerCount: 2,
    canDelegate: true,
    conversationUnread: false,
  };

  const createActions = (): ContactHeaderActions => ({
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onCall: vi.fn(),
    onText: vi.fn(),
    onEmail: vi.fn(),
    onLogInteraction: vi.fn(),
    onStartPrayer: vi.fn(),
    onMoveStage: vi.fn(),
    onOpenMoveSheet: vi.fn(),
    onOpenAbout: vi.fn(),
    onOpenDelegate: vi.fn(),
    onChangeKind: vi.fn(),
    onChangeCreator: vi.fn(),
    onDelete: vi.fn(),
    onOpenPrayers: vi.fn(),
    onOpenConversation: vi.fn(),
  });

  it('renders header details using consolidated ContactHeaderModel', () => {
    const actions = createActions();
    render(
      <ContactHead
        model={defaultModel}
        actions={actions}
        isMobile={false}
        isEditing={false}
      />
    );

    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText(/Last connected 2 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/John/)).toBeInTheDocument();
  });

  it('triggers action callbacks from the consolidated actions model', () => {
    const actions = createActions();
    render(
      <ContactHead
        model={defaultModel}
        actions={actions}
        isMobile={false}
        isEditing={false}
      />
    );

    // Click close button
    const closeBtn = screen.getByLabelText(/close|done/i);
    fireEvent.click(closeBtn);
    expect(actions.onClose).toHaveBeenCalled();

    // Click name / about
    const nameBtn = screen.getByText('Sarah Connor');
    fireEvent.click(nameBtn);
    expect(actions.onOpenAbout).toHaveBeenCalled();
  });

  it('renders mobile layout correctly', () => {
    const actions = createActions();
    render(
      <ContactHead
        model={defaultModel}
        actions={actions}
        isMobile={true}
        isEditing={false}
      />
    );

    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
  });

  // #1671: Delegate moved from a header button into More actions, in both heads.
  it.each([false, true])('keeps Delegate behind More actions (isMobile=%s)', (isMobile) => {
    const actions = createActions();
    render(
      <ContactHead
        model={defaultModel}
        actions={actions}
        isMobile={isMobile}
        isEditing={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Delegate' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delegate' }));
    expect(actions.onOpenDelegate).toHaveBeenCalled();
  });

  // #1761: on a phone the More menu is a layer over the page, so Escape is
  // the menu's to answer — not the page's.
  it('announces the More trigger as a menu and reflects its open state', () => {
    render(
      <ContactHead model={defaultModel} actions={createActions()} isMobile={true} isEditing={false} />,
    );

    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes More actions on Escape and returns focus to its trigger', () => {
    const actions = createActions();
    render(<ContactHead model={defaultModel} actions={actions} isMobile={true} isEditing={false} />);

    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    expect(screen.getByText('Add prayer')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByText('Add prayer')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  // #1761: a 7px dot is not an accessible signal — the unread state has to be
  // in the Conversation button's name.
  it('names the unread state of the Conversation button on a phone', () => {
    render(
      <ContactHead
        model={{ ...defaultModel, conversationUnread: true }}
        actions={createActions()}
        isMobile={true}
        isEditing={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Conversation, New in Full-timers' }),
    ).toBeInTheDocument();
  });

  it('omits the Delegate item for a viewer who cannot share', () => {
    render(
      <ContactHead
        model={{ ...defaultModel, canDelegate: false, role: 'viewer', isAdmin: false }}
        actions={createActions()}
        isMobile={false}
        isEditing={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByText('Log interaction')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delegate' })).not.toBeInTheDocument();
  });
});
