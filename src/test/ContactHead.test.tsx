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
});
