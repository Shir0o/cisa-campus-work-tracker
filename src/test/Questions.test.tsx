// Questions for the team, as its own page (#646/#647).
//
// The bug this page exists to kill: in the old Messages channel the composer
// pinned to the bottom looked like every other "reply" box but called addAsk,
// so an answer typed into it became a brand-new question — filed, for a
// full-timer, under whichever trainee the picker had auto-selected. These tests
// pin the two properties that make that impossible: answering goes through
// addAskReply, and nothing on the page accepts typing until you open something.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Questions from '../views/Questions';
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
  onSnapshot: (_q: unknown, cb: (snap: unknown) => void) => {
    cb({
      docs: [
        { id: 't1', data: () => ({ displayName: 'Zion Park', role: 'manager', approved: true }) },
        { id: 't2', data: () => ({ displayName: 'Ana Lei', role: 'manager', approved: true }) },
      ],
    });
    return () => {};
  },
  addDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

let mockAuth: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const QUESTIONS: AskMessage[] = [
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
    parentId: 'q2',
    owner: 't2',
    from: 'ft1',
    fromName: 'Mei Lin',
    kind: 'comment',
    body: 'Start with something about their day.',
    at: '2026-08-25T11:30:00.000Z',
    reactions: [],
  },
];

function renderPage(opts: { initialEntries?: Array<string | { pathname: string; state?: unknown }> } = {}) {
  mockNavigate.mockClear();
  return render(
    <MemoryRouter initialEntries={opts.initialEntries ?? ['/questions']}>
      <Questions />
    </MemoryRouter>,
  );
}

describe('Questions for the team page (#646)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
    mockAuth = { user: { uid: 'ft1', displayName: 'Mei Lin' }, role: 'admin', impersonateTarget: null };
    vi.spyOn(asksLib, 'subscribeAsks').mockImplementation((cb: (m: AskMessage[]) => void) => {
      cb(QUESTIONS);
      return () => {};
    });
  });
  describe('the trap is gone', () => {
    it('has no composer at all until "Ask the team" is opened', () => {
      renderPage();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /ask the team/i }));
      expect(screen.getByPlaceholderText(/what do you want to ask/i)).toBeInTheDocument();
    });

    it('answering a question calls addAskReply, never addAsk', async () => {
      const reply = vi.spyOn(asksLib, 'addAskReply').mockResolvedValue(undefined);
      const ask = vi.spyOn(asksLib, 'addAsk').mockResolvedValue(undefined);
      const askFor = vi.spyOn(asksLib, 'addAskFor').mockResolvedValue(undefined);
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /answer zion/i }));
      fireEvent.change(screen.getByLabelText(/your answer to zion/i), {
        target: { value: "Ask what they're studying first." },
      });
      fireEvent.click(screen.getByRole('button', { name: /send answer/i }));

      await waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
      expect(reply).toHaveBeenCalledWith(
        'q1',
        { from: 'ft1', fromName: 'Mei Lin', body: "Ask what they're studying first." },
        't1',
        't1',
      );
      expect(ask).not.toHaveBeenCalled();
      expect(askFor).not.toHaveBeenCalled();
    });

    it('does not pre-select who asked it, so a stray send cannot file under a trainee', async () => {
      const askFor = vi.spyOn(asksLib, 'addAskFor').mockResolvedValue(undefined);
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /ask the team/i }));
      fireEvent.click(screen.getByRole('button', { name: /someone asked me/i }));
      fireEvent.change(screen.getByPlaceholderText(/in their words/i), {
        target: { value: 'Recorded in the corridor.' },
      });

      // Nobody is picked, so the action is unavailable.
      const write = screen.getByRole('button', { name: /write it down/i });
      expect(write).toBeDisabled();
      fireEvent.click(write);
      expect(askFor).not.toHaveBeenCalled();

      // Pick someone, and only then does it go.
      fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
      fireEvent.click(screen.getByRole('button', { name: /write it down/i }));
      await waitFor(() => expect(askFor).toHaveBeenCalledTimes(1));
      expect(askFor).toHaveBeenCalledWith(
        expect.objectContaining({ askerId: 't2', askerName: 'Ana Lei', takenBy: 'ft1' }),
      );
    });

    it('defaults a full-timer to their own question, not to recording someone else\'s', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /ask the team/i }));
      expect(screen.getByPlaceholderText(/what do you want to ask/i)).toBeInTheDocument();
      expect(screen.queryByText(/who asked it/i)).not.toBeInTheDocument();
    });
  });

  describe('the board', () => {
    it('shows a full-timer every question, with waiting and answered marks', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /^All/ }));
      expect(screen.getByText('How do you approach people at the club table?')).toBeInTheDocument();
      expect(screen.getByText('What should I do during campus quiet hour?')).toBeInTheDocument();
      expect(screen.getByText('1 answer')).toBeInTheDocument();
    });

    it('opens on Waiting for a full-timer, hiding what is already answered', () => {
      renderPage();
      expect(screen.getByText('How do you approach people at the club table?')).toBeInTheDocument();
      expect(screen.queryByText('What should I do during campus quiet hour?')).not.toBeInTheDocument();
    });

    it('carries the origin mark through from the old channel (#611)', () => {
      renderPage();
      // Mei recorded this one herself, so askOrigin renders it in second person.
      expect(screen.getByText(/Asked in person · written down by you/i)).toBeInTheDocument();
    });

    it('renders an answer already on a question', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /^Answered/ }));
      expect(screen.getByText('Start with something about their day.')).toBeInTheDocument();
    });
  });

  describe('a trainee', () => {
    beforeEach(() => {
      mockAuth = { user: { uid: 't1', displayName: 'Zion Park' }, role: 'manager', impersonateTarget: null };
      vi.spyOn(asksLib, 'subscribeAsks').mockImplementation((cb: (m: AskMessage[]) => void) => {
        cb(QUESTIONS);
        return () => {};
      });
    });

    it("reads the whole team's archive, not just their own questions (#645)", () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /^All/ }));
      expect(screen.getByText('How do you approach people at the club table?')).toBeInTheDocument();
      expect(screen.getByText('What should I do during campus quiet hour?')).toBeInTheDocument();
      // …including the answers a full-timer gave on someone else's question.
      expect(screen.getByText('Start with something about their day.')).toBeInTheDocument();
    });

    it('can add to their own question but never answers someone else\'s (#645)', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /^All/ }));
      expect(screen.getByRole('button', { name: /add to your question/i })).toBeInTheDocument();
      // Ana's question is read-only for a fellow trainee.
      expect(screen.queryByRole('button', { name: /answer ana/i })).not.toBeInTheDocument();
      expect(screen.getByText('A full-timer will answer this.')).toBeInTheDocument();
    });

    it('gets no "Someone asked me" mode — only a full-timer records in person', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /ask the team/i }));
      expect(screen.queryByRole('button', { name: /someone asked me/i })).not.toBeInTheDocument();
    });

    it('asks with addAsk under their own name', async () => {
      const ask = vi.spyOn(asksLib, 'addAsk').mockResolvedValue(undefined);
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /ask the team/i }));
      fireEvent.change(screen.getByPlaceholderText(/what do you want to ask/i), {
        target: { value: 'Is it okay to text a student first?' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Ask the team$/ }));

      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      expect(ask).toHaveBeenCalledWith({
        from: 't1',
        fromName: 'Zion Park',
        body: 'Is it okay to text a student first?',
      });
    });
  });

  describe('deleting a question', () => {
    it('a full-timer deletes any question, behind an inline confirm', async () => {
      const del = vi.spyOn(asksLib, 'deleteAsk').mockResolvedValue(undefined);
      renderPage();

      // q1 ("How do you approach people…") is on the default Waiting view.
      fireEvent.click(screen.getByRole('button', { name: 'Delete this question' }));
      // Confirming is a step, not a click-through — nothing deleted yet.
      expect(screen.getByText(/delete this question\?/i)).toBeInTheDocument();
      expect(del).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));
      await waitFor(() => expect(del).toHaveBeenCalledWith('q1'));
      expect(await screen.findByText('Question deleted.')).toBeInTheDocument();
    });

    it('"Keep it" backs out without deleting', () => {
      const del = vi.spyOn(asksLib, 'deleteAsk').mockResolvedValue(undefined);
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Delete this question' }));
      fireEvent.click(screen.getByRole('button', { name: /keep it/i }));

      expect(screen.queryByText(/delete this question\?/i)).not.toBeInTheDocument();
      expect(del).not.toHaveBeenCalled();
    });

    it('a trainee gets the control on their own question only', () => {
      mockAuth = { user: { uid: 't1', displayName: 'Zion Park' }, role: 'manager', impersonateTarget: null };
      vi.spyOn(asksLib, 'subscribeAsks').mockImplementation((cb: (m: AskMessage[]) => void) => {
        cb(QUESTIONS);
        return () => {};
      });
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /^All/ }));

      // Their own question (q1) — deletable. Ana's (q2) — not.
      const controls = screen.getAllByRole('button', { name: 'Delete this question' });
      expect(controls).toHaveLength(1);
    });
  });

  it('binds writes to the real account during role simulation (#603)', async () => {
    mockAuth = {
      user: { uid: 'ft1', displayName: 'Mei Lin' },
      role: 'admin',
      impersonateTarget: { name: 'Zion Park' },
    };
    vi.spyOn(asksLib, 'subscribeAsks').mockImplementation((cb: (m: AskMessage[]) => void) => {
      cb(QUESTIONS);
      return () => {};
    });
    const reply = vi.spyOn(asksLib, 'addAskReply').mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /answer zion/i }));
    fireEvent.change(screen.getByLabelText(/your answer to zion/i), { target: { value: 'Like this.' } });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));

    await waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    // uid stays the authenticated one so the rules pass; only the display name is simulated.
    expect(reply).toHaveBeenCalledWith(
      'q1',
      { from: 'ft1', fromName: 'Zion Park', body: 'Like this.' },
      't1',
      't1',
    );
  });


  describe('deep-link from My Day (#646)', () => {
    it('opens the focused card composer when location.state carries focusQuestionId', () => {
      renderPage({
        initialEntries: [
          { pathname: '/questions', state: { focusQuestionId: 'q1' } },
        ],
      });

      // q1 is on the default Waiting view; the focus must auto-open its composer
      // and the "Answer" button must no longer be the only affordance.
      expect(screen.getByLabelText(/your answer to zion/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Answer Zion/ })).toBeNull();
    });

    it('opens the focused card composer when the URL carries ?focus=qId', () => {
      renderPage({ initialEntries: ['/questions?focus=q1'] });

      expect(screen.getByLabelText(/your answer to zion/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Answer Zion/ })).toBeNull();
    });

    it('clears the focus on close so the next render shows the default view', () => {
      renderPage({
        initialEntries: [
          { pathname: '/questions', state: { focusQuestionId: 'q1' } },
        ],
      });

      // Open is verified above; cancelling should clear the focus.
      fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));

      expect(mockNavigate).toHaveBeenCalledWith('/questions', { replace: true });
      expect(screen.queryByLabelText(/your answer to zion/i)).toBeNull();
      expect(screen.getByRole('button', { name: /^Answer Zion/ })).toBeInTheDocument();
    });
  });
});
