import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MsgThreadPane } from '../components/messages/MsgThreadPane';
import { ChatRoom, ChatMessage } from '../types';

vi.mock('../../hooks/useTranslate', () => ({
  useTranslate: (text: string) => ({ translatedText: text, isTranslating: false }),
}));

vi.mock('../components/ui/ContactPill', () => ({
  default: ({ fallbackName, onOpenContact }: any) => (
    <button onClick={() => onOpenContact({ id: 'c1', name: fallbackName })}>
      {fallbackName}
    </button>
  ),
}));

describe('MsgThreadPane (#563)', () => {
  const mockRoom: ChatRoom = {
    id: 'room1',
    name: 'General Discussion',
    type: 'group',
    memberIds: ['u1', 'u2'],
    createdAt: '2026-08-25T10:00:00Z',
    createdById: 'u1',
    createdByName: 'Alice Walker',
  };

  const parentMsg: ChatMessage = {
    id: 'm1',
    roomId: 'room1',
    senderId: 'u1',
    senderName: 'Alice Walker',
    senderPhoto: 'https://example.com/photo.jpg',
    text: 'Hello @Bob, check this out!',
    timestamp: '2026-08-25T10:00:00Z',
    type: 'text',
    reactions: [{ emoji: '👍', by: 'u2' }],
    attachments: [
      { id: 'c1', type: 'contact', name: 'John Doe', subtitle: 'Student' },
      { id: 't1', type: 'todo', name: 'Follow up prayer' },
      { id: 'e1', type: 'event', name: 'Team Dinner' },
      { id: 'i1', type: 'interaction', name: 'Campus Walk' },
      { id: 'p1', type: 'prayer', name: 'Healing prayer' },
      { id: 'n1', type: 'note', name: 'Meeting notes' },
      { id: 'f1', type: 'feedback', name: 'App feedback' },
      { id: 'x1', type: 'other' as any, name: 'Other doc' },
    ],
  };

  const replyMsg1: ChatMessage = {
    id: 'r1',
    roomId: 'room1',
    parentId: 'm1',
    senderId: 'u2',
    senderName: 'Bob Builder',
    text: 'Looks awesome @Alice!',
    timestamp: '2026-08-25T10:05:00Z',
    type: 'text',
    reactions: [{ emoji: '❤️', by: 'u1' }],
  };

  const deletedReply: ChatMessage = {
    id: 'r2',
    roomId: 'room1',
    parentId: 'm1',
    senderId: 'u1',
    senderName: 'Alice Walker',
    text: 'Oops deleted message',
    timestamp: '2026-08-25T10:06:00Z',
    type: 'text',
    deleted: { by: 'u1', at: '2026-08-25T10:07:00Z' },
  };

  const allMessages: ChatMessage[] = [parentMsg, replyMsg1, deletedReply];

  const defaultProps = {
    room: mockRoom,
    parentMsg,
    allMessages,
    effectiveUid: 'u1',
    isAdmin: true,
    onClose: vi.fn(),
    onReact: vi.fn(),
    onPin: vi.fn(),
    onRemoveAll: vi.fn(),
    onHide: vi.fn(),
    onTodo: vi.fn(),
    onOpenContact: vi.fn(),
    onSendReply: vi.fn().mockResolvedValue(undefined),
    roomMembers: [
      { uid: 'u1', displayName: 'Alice Walker' },
      { uid: 'u2', displayName: 'Bob Builder' },
    ],
    canPost: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders parent message, attachments, mentions, and replies', () => {
    render(<MsgThreadPane {...defaultProps} />);

    expect(screen.getByText('Thread')).toBeInTheDocument();
    expect(screen.getByText(/General Discussion/)).toBeInTheDocument();
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(screen.getByText('@Bob')).toBeInTheDocument();

    // Attachments rendered
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Follow up prayer')).toBeInTheDocument();
    expect(screen.getByText('Team Dinner')).toBeInTheDocument();
    expect(screen.getByText('Campus Walk')).toBeInTheDocument();
    expect(screen.getByText('Healing prayer')).toBeInTheDocument();
    expect(screen.getByText('Meeting notes')).toBeInTheDocument();
    expect(screen.getByText('App feedback')).toBeInTheDocument();
    expect(screen.getByText('Other doc')).toBeInTheDocument();

    // Reply rendered
    expect(screen.getByText(/Looks awesome/)).toBeInTheDocument();
    expect(screen.getByText('@Alice')).toBeInTheDocument();
    // Deleted message tombstone
    expect(screen.getByText('You took this message back.')).toBeInTheDocument();
  });

  it('handles clicking contact pill attachment', () => {
    render(<MsgThreadPane {...defaultProps} />);
    fireEvent.click(screen.getByText('John Doe'));
    expect(defaultProps.onOpenContact).toHaveBeenCalledWith({ id: 'c1', name: 'John Doe' });
  });

  it('handles sending a reply via composer button and Cmd+Enter', async () => {
    render(<MsgThreadPane {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Reply to Alice…');
    fireEvent.change(textarea, { target: { value: 'Got your message!' } });

    // Send via button
    const sendButtons = screen.getAllByRole('button');
    const sendBtn = sendButtons.find((b) => b.className.includes('msgs-send'));
    expect(sendBtn).toBeInTheDocument();
    fireEvent.click(sendBtn!);

    await waitFor(() => {
      expect(defaultProps.onSendReply).toHaveBeenCalledWith('Got your message!');
    });

    // Test send via Cmd+Enter
    fireEvent.change(textarea, { target: { value: 'Second reply' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(defaultProps.onSendReply).toHaveBeenCalledWith('Second reply');
    });
  });

  it('handles reactions and pinning', () => {
    render(<MsgThreadPane {...defaultProps} />);

    const reactButtons = screen.getAllByTitle('React');
    if (reactButtons.length > 0) {
      fireEvent.click(reactButtons[0]);
      expect(defaultProps.onReact).toHaveBeenCalled();
    }

    const pinButtons = screen.getAllByTitle(/Pin/);
    if (pinButtons.length > 0) {
      fireEvent.click(pinButtons[0]);
      expect(defaultProps.onPin).toHaveBeenCalled();
    }
  });

  it('handles message menu actions: Hide, To-do, and Take back for everyone', async () => {
    render(<MsgThreadPane {...defaultProps} />);

    const moreButtons = screen.getAllByTitle('More');
    fireEvent.click(moreButtons[0]);

    expect(screen.getByText('Hide from my view')).toBeInTheDocument();
    expect(screen.getByText('Make a to-do')).toBeInTheDocument();
    expect(screen.getByText('Take back for everyone')).toBeInTheDocument();

    // Click Hide
    fireEvent.click(screen.getByText('Hide from my view'));
    expect(defaultProps.onHide).toHaveBeenCalledWith(parentMsg.id);

    // Open menu again for Todo
    fireEvent.click(moreButtons[0]);
    fireEvent.click(screen.getByText('Make a to-do'));
    expect(defaultProps.onTodo).toHaveBeenCalledWith(parentMsg);

    // Open menu again for Take back for everyone
    fireEvent.click(moreButtons[0]);
    fireEvent.click(screen.getByText('Take back for everyone'));
    expect(screen.getByText('Take this back for everyone?')).toBeInTheDocument();

    // Test keep it
    fireEvent.click(screen.getByText('Keep it'));
    expect(screen.queryByText('Take this back for everyone?')).toBeNull();

    // Since menu is still open, click Take back for everyone
    fireEvent.click(screen.getByText('Take back for everyone'));
    fireEvent.click(screen.getByText('Yes, remove it'));
    expect(defaultProps.onRemoveAll).toHaveBeenCalledWith(parentMsg);
  });

  it('handles closing the pane', () => {
    render(<MsgThreadPane {...defaultProps} />);
    const allButtons = screen.getAllByRole('button');
    const headerClose = allButtons.find((b) => b.className.includes('icon-btn'));
    expect(headerClose).toBeInTheDocument();
    fireEvent.click(headerClose!);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('displays read-only state when canPost is false', () => {
    render(<MsgThreadPane {...defaultProps} canPost={false} />);
    expect(screen.getByText("This one's an announcement — replies go to the team directly.")).toBeInTheDocument();
  });
});
