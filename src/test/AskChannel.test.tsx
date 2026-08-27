import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AskChannelRow,
  AskMsg,
  AskMsgPlain,
  AskThreadPane,
  AskChannel,
  ASK_CONV_ID
} from '../components/messages/AskChannel';
import * as asksLib from '../lib/asks';
import { AskMessage } from '../lib/asks';

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  sendNotification: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE' },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: (q: any, cb: (snap: any) => void) => {
    cb({
      docs: [
        {
          id: 'u_trainee_1',
          data: () => ({ displayName: 'Zion Park', role: 'operator', approved: true }),
        },
        {
          id: 'u_trainee_2',
          data: () => ({ displayName: 'Ana Lei', role: 'manager', approved: true }),
        },
      ],
    });
    return () => {};
  },
  addDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

describe('AskChannel Components (#563)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const mockQuestions: AskMessage[] = [
    {
      id: 'q1',
      parentId: null,
      owner: 't1',
      from: 't1',
      fromName: 'Zion Park',
      takenBy: 'ft1',
      takenByName: 'Mei Lin',
      kind: 'question',
      body: 'How do you approach people at the club table?',
      at: '2026-08-25T10:00:00.000Z',
      reactions: [],
    },
    {
      id: 'q2',
      parentId: null,
      owner: 't2',
      from: 't2',
      fromName: 'Ana Lei',
      kind: 'question',
      body: 'What should I do during campus quiet hour?',
      at: '2026-08-25T11:00:00.000Z',
      reactions: [],
    },
    {
      id: 'r1',
      parentId: 'q1',
      owner: 't1',
      from: 'ft1',
      fromName: 'Mei Lin',
      kind: 'comment',
      body: 'Start with something about their day.',
      at: '2026-08-25T10:30:00.000Z',
      reactions: [],
    },
  ];

  describe('AskChannelRow', () => {
    it('renders channel row title and waiting subtitle for full-timers', () => {
      const handleClick = vi.fn();
      render(
        <AskChannelRow
          me="ft1"
          role="admin"
          isFullTimer={true}
          active={false}
          onClick={handleClick}
          asks={mockQuestions}
        />
      );

      expect(screen.getByText('Questions for the team')).toBeInTheDocument();
      // q1 is answered by ft1, q2 is unanswered -> 1 waiting
      expect(screen.getByText('1 waiting on an answer')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Questions for the team'));
      expect(handleClick).toHaveBeenCalled();
    });

    it('renders subtitle for trainees', () => {
      render(
        <AskChannelRow
          me="t1"
          role="operator"
          isFullTimer={false}
          active={true}
          onClick={vi.fn()}
          asks={mockQuestions}
        />
      );

      expect(screen.getByText('Your questions to the team')).toBeInTheDocument();
    });
  });

  describe('AskMsg and AskMsgPlain', () => {
    it('renders question with in-person takenBy attribution', () => {
      render(
        <AskMsg
          m={mockQuestions[0]}
          allAsks={mockQuestions}
          me="ft1"
          open={false}
          onOpen={vi.fn()}
        />
      );

      expect(screen.getByText('Zion Park')).toBeInTheDocument();
      expect(screen.getByText('How do you approach people at the club table?')).toBeInTheDocument();
      expect(screen.getByText(/Asked in person · written down by Mei/)).toBeInTheDocument();
      expect(screen.getByText('1 answer')).toBeInTheDocument();
    });

    it('renders plain message and replies properly', () => {
      render(<AskMsgPlain m={mockQuestions[0]} />);
      expect(screen.getByText('written down by Mei')).toBeInTheDocument();
    });
  });

  describe('AskThreadPane', () => {
    it('allows full-timers to answer question and triggers onToast', async () => {
      const addReplySpy = vi.spyOn(asksLib, 'addAskReply').mockResolvedValue(undefined as any);
      const onToast = vi.fn();
      const onClose = vi.fn();

      render(
        <AskThreadPane
          id="q1"
          allAsks={mockQuestions}
          me="ft1"
          meName="Mei Lin"
          isFullTimer={true}
          onClose={onClose}
          onToast={onToast}
        />
      );

      expect(screen.getByText('The answers')).toBeInTheDocument();
      expect(screen.getByText('Start with something about their day.')).toBeInTheDocument();

      const textarea = screen.getByPlaceholderText(/Answer Zion the way you'd say it out loud./);
      fireEvent.change(textarea, { target: { value: 'Also bring snacks!' } });

      // Send via Cmd+Enter
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

      await waitFor(() => {
        expect(addReplySpy).toHaveBeenCalledWith(
          'q1',
          { from: 'ft1', fromName: 'Mei Lin', body: 'Also bring snacks!' },
          't1',
          't1'
        );
        expect(onToast).toHaveBeenCalledWith('Answered Zion.');
      });
    });
  });

  describe('AskChannel main view', () => {
    it('allows full-timer to record in-person question on behalf of a trainee', async () => {
      const addAskForSpy = vi.spyOn(asksLib, 'addAskFor').mockResolvedValue(undefined as any);
      const onToast = vi.fn();

      // Mock subscribeAsks to return mockQuestions
      vi.spyOn(asksLib, 'subscribeAsks').mockImplementation((cb: any) => {
        cb(mockQuestions);
        return () => {};
      });

      render(
        <AskChannel
          me="ft1"
          meName="Mei Lin"
          role="admin"
          isFullTimer={true}
          isMobile={false}
          onToast={onToast}
        />
      );

      expect(screen.getByText('Questions for the team')).toBeInTheDocument();
      expect(screen.getByText('Someone asked me')).toBeInTheDocument();
      expect(screen.getByText('My own question')).toBeInTheDocument();

      // "Who asked it?" should show trainees
      expect(screen.getByText('Zion')).toBeInTheDocument();
      expect(screen.getByText('Ana')).toBeInTheDocument();

      // Select Ana
      fireEvent.click(screen.getByText('Ana'));

      const composerInput = screen.getByPlaceholderText('In their words, as close as you can remember…');
      fireEvent.change(composerInput, { target: { value: 'Can we borrow the projector for Friday?' } });

      fireEvent.keyDown(composerInput, { key: 'Enter', metaKey: true });

      await waitFor(() => {
        expect(addAskForSpy).toHaveBeenCalledWith({
          askerId: 'u_trainee_2',
          askerName: 'Ana Lei',
          takenBy: 'ft1',
          takenByName: 'Mei Lin',
          body: 'Can we borrow the projector for Friday?',
        });
        expect(onToast).toHaveBeenCalledWith('Written down for Ana — every full-timer can see it.');
      });
    });

    it('allows full-timer to switch to My own question mode and post', async () => {
      const addAskSpy = vi.spyOn(asksLib, 'addAsk').mockResolvedValue(undefined as any);
      const onToast = vi.fn();

      vi.spyOn(asksLib, 'subscribeAsks').mockImplementation((cb: any) => {
        cb(mockQuestions);
        return () => {};
      });

      render(
        <AskChannel
          me="ft1"
          meName="Mei Lin"
          role="admin"
          isFullTimer={true}
          isMobile={false}
          onToast={onToast}
        />
      );

      // Switch to "My own question"
      fireEvent.click(screen.getByText('My own question'));
      const input = screen.getByPlaceholderText('Ask the team something real…');
      fireEvent.change(input, { target: { value: 'When is staff retreat?' } });
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true });

      await waitFor(() => {
        expect(addAskSpy).toHaveBeenCalledWith({
          from: 'ft1',
          fromName: 'Mei Lin',
          body: 'When is staff retreat?',
        });
        expect(onToast).toHaveBeenCalledWith('Asked the team.');
      });
    });

    it('renders trainee view and allows trainee to post and open question thread', async () => {
      const onBack = vi.fn();
      const addAskSpy = vi.spyOn(asksLib, 'addAsk').mockResolvedValue(undefined as any);

      vi.spyOn(asksLib, 'subscribeAsks').mockImplementation((cb: any) => {
        cb(mockQuestions);
        return () => {};
      });

      render(
        <AskChannel
          me="t1"
          meName="Zion Park"
          role="manager"
          isFullTimer={false}
          isMobile={true}
          onBack={onBack}
        />
      );

      expect(screen.getByText('Questions for the team')).toBeInTheDocument();
      // Click back button
      const buttons = screen.getAllByRole('button');
      const backBtn = buttons.find((b) => b.className.includes('icon-btn'));
      if (backBtn) fireEvent.click(backBtn);
      expect(onBack).toHaveBeenCalled();

      // Post a trainee question
      const input = screen.getByPlaceholderText('Ask the team something real…');
      fireEvent.change(input, { target: { value: 'How to follow up after club rush?' } });
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true });

      await waitFor(() => {
        expect(addAskSpy).toHaveBeenCalledWith({
          from: 't1',
          fromName: 'Zion Park',
          body: 'How to follow up after club rush?',
        });
      });

      // Click on 1 answer button to open thread
      fireEvent.click(screen.getByText('1 answer'));
      expect(screen.getByText('The answers')).toBeInTheDocument();
    });

    it('tests pure ask helper functions', () => {
      expect(asksLib.askTakenBy(mockQuestions[0])).toEqual({ uid: 'ft1', name: 'Mei Lin' });
      expect(asksLib.askTakenBy(mockQuestions[1])).toBeNull();

      const visibleFt = asksLib.askVisibleFor(mockQuestions, 'ft1', true);
      expect(visibleFt.length).toBe(2);

      const visibleTrainee = asksLib.askVisibleFor(mockQuestions, 't1', false);
      expect(visibleTrainee.length).toBe(1);
      expect(visibleTrainee[0].id).toBe('q1');

      const unreadFt = asksLib.askUnreadFor(mockQuestions, 'ft1', true, () => false);
      expect(unreadFt).toBe(1); // q2 is unanswered

      const unreadTrainee = asksLib.askUnreadFor(mockQuestions, 't1', false, () => false);
      expect(unreadTrainee).toBe(1); // q1 has answer
    });
  });
});
