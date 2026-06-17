import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { ActivityItem } from '../components/ActivityItem';
import { Activity, Contact } from '../types';

const mockContacts: Contact[] = [
  {
    id: 'contact-123',
    name: 'John Doe',
    role: 'Student',
    location: 'Campus',
    stage: 'lead',
    email: 'john@example.com',
    phone: '123-456-7890',
    lastSeen: 'Today',
    initials: 'JD',
    createdAt: '',
    updatedAt: '',
  },
];

describe('ActivityItem', () => {
  const defaultActivity: Activity = {
    id: 'act-1',
    user: 'Alice Admin',
    userPhoto: 'alice.jpg',
    action: 'logged an interaction for',
    type: 'call',
    target: 'John Doe',
    contactId: 'contact-123',
    time: '2 hours ago',
    description: 'Had a great phone conversation',
  };

  it('renders user details, action, time, and target correctly', () => {
    const onOpenContact = vi.fn();
    render(
      <ActivityItem
        activity={defaultActivity}
        contacts={mockContacts}
        onOpenContact={onOpenContact}
      />
    );

    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('called')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('"Had a great phone conversation"')).toBeInTheDocument();

    const img = screen.getByRole('img', { name: 'Alice Admin' });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('alice.jpg');
  });

  it('falls back to initials when userPhoto is missing', () => {
    const onOpenContact = vi.fn();
    const activityWithoutPhoto = { ...defaultActivity, userPhoto: undefined };
    render(
      <ActivityItem
        activity={activityWithoutPhoto}
        contacts={mockContacts}
        onOpenContact={onOpenContact}
      />
    );

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('triggers onOpenContact when contact target button is clicked', () => {
    const onOpenContact = vi.fn();
    render(
      <ActivityItem
        activity={defaultActivity}
        contacts={mockContacts}
        onOpenContact={onOpenContact}
      />
    );

    const btn = screen.getByRole('button', { name: 'John Doe' });
    fireEvent.click(btn);

    expect(onOpenContact).toHaveBeenCalledWith(mockContacts[0]);
  });

  it('does not trigger onOpenContact if contact does not exist in contacts list', () => {
    const onOpenContact = vi.fn();
    const activityWithUnknownContact = { ...defaultActivity, contactId: 'unknown-id' };
    render(
      <ActivityItem
        activity={activityWithUnknownContact}
        contacts={mockContacts}
        onOpenContact={onOpenContact}
      />
    );

    const btn = screen.getByRole('button', { name: 'John Doe' });
    fireEvent.click(btn);

    expect(onOpenContact).not.toHaveBeenCalled();
  });

  it('maps different logged interaction types to friendly text strings', () => {
    const types: Array<{ type: Activity['type']; expectedText: string }> = [
      { type: 'call', expectedText: 'called' },
      { type: 'email', expectedText: 'emailed' },
      { type: 'event', expectedText: 'had a meeting with' },
      { type: 'comment', expectedText: 'left a note for' },
      { type: 'create', expectedText: 'interacted with' }, // default interaction fallback
    ];

    types.forEach(({ type, expectedText }) => {
      const { container } = render(
        <ActivityItem
          activity={{ ...defaultActivity, type }}
          contacts={mockContacts}
          onOpenContact={vi.fn()}
        />
      );
      expect(screen.getByText(expectedText)).toBeInTheDocument();
      vi.clearAllMocks();
    });
  });

  it('renders edit field list from description when type is edit', () => {
    const editActivity: Activity = {
      id: 'act-edit',
      user: 'Alice Admin',
      action: 'updated details',
      type: 'edit',
      target: 'John Doe',
      contactId: 'contact-123',
      time: 'Just now',
      description: 'notes updated\nemail: test@test.com\nphone: 123',
    };

    render(
      <ActivityItem
        activity={editActivity}
        contacts={mockContacts}
        onOpenContact={vi.fn()}
      />
    );

    // split description "notes updated", "email", "phone" maps to "Notes, Email, Phone for"
    expect(screen.getByText('updated the Notes, Email, Phone for')).toBeInTheDocument();
    // Descriptions for edits are hidden
    expect(screen.queryByText(/"notes updated"/)).not.toBeInTheDocument();
  });

  it('handles hover state mouse enter and leave events', () => {
    const { container } = render(
      <ActivityItem
        activity={defaultActivity}
        contacts={mockContacts}
        onOpenContact={vi.fn()}
      />
    );

    const itemDiv = container.firstChild as HTMLElement;
    
    // Simulate mouse hover
    fireEvent.mouseEnter(itemDiv);
    fireEvent.mouseLeave(itemDiv);
  });
});
