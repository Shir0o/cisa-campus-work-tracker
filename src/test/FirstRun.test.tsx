import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FirstRunCard from '../components/landing/FirstRunCard';
import {
  computeFirstRunSteps,
  evaluateFirstRun,
  FirstRunStore,
  FIRSTRUN_LS_KEY,
  getFrnCopy,
} from '../lib/firstRun';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('FirstRun logic (#335)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
  });

  describe('computeFirstRunSteps', () => {
    it('returns trainee checklist steps with correct completion states', () => {
      const incomplete = computeFirstRunSteps('trainee', {});
      expect(incomplete).toHaveLength(5);
      expect(incomplete.every((s) => !s.done)).toBe(true);

      const partial = computeFirstRunSteps('trainee', {
        contactsCount: 2,
        interactionsCount: 1,
        messagesCount: 0,
        prayersCount: 1,
        todosCompletedCount: 0,
      });
      expect(partial.find((s) => s.id === 'person')?.done).toBe(true);
      expect(partial.find((s) => s.id === 'convo')?.done).toBe(true);
      expect(partial.find((s) => s.id === 'ask')?.done).toBe(false);
      expect(partial.find((s) => s.id === 'pray')?.done).toBe(true);
      expect(partial.find((s) => s.id === 'follow')?.done).toBe(false);
    });

    it('returns full-timer (admin) checklist steps with correct completion states', () => {
      const steps = computeFirstRunSteps('admin', {
        interactionsCount: 5,
        todosCreatedCount: 2,
        docsCount: 1,
        prayersCount: 0,
        todosCompletedCount: 3,
      });
      expect(steps).toHaveLength(5);
      expect(steps.find((s) => s.id === 'convo')?.done).toBe(true);
      expect(steps.find((s) => s.id === 'todo')?.done).toBe(true);
      expect(steps.find((s) => s.id === 'learn')?.done).toBe(true);
      expect(steps.find((s) => s.id === 'pray')?.done).toBe(false);
      expect(steps.find((s) => s.id === 'follow')?.done).toBe(true);
    });

    it('returns student/community steps with correct completion states', () => {
      const studentSteps = computeFirstRunSteps('student', {
        messagesCount: 1,
        prayersCount: 2,
        feedbackCount: 0,
      });
      expect(studentSteps).toHaveLength(3);
      expect(studentSteps.find((s) => s.id === 'hello')?.done).toBe(true);
      expect(studentSteps.find((s) => s.id === 'pray')?.done).toBe(true);
      expect(studentSteps.find((s) => s.id === 'say')?.done).toBe(false);
    });
  });

  describe('FirstRunStore', () => {
    it('handles isAway, putAway, and bringBack in localStorage', () => {
      const key = 'fr:trainee:user123';
      expect(FirstRunStore.isAway(key)).toBe(false);

      FirstRunStore.putAway(key);
      expect(FirstRunStore.isAway(key)).toBe(true);
      expect(localStorage.getItem(FIRSTRUN_LS_KEY)).toContain(key);

      FirstRunStore.bringBack(key);
      expect(FirstRunStore.isAway(key)).toBe(false);
    });
  });

  describe('evaluateFirstRun & getFrnCopy', () => {
    it('returns correct copy per role', () => {
      expect(getFrnCopy('trainee').title).toBe('Your first week');
      expect(getFrnCopy('admin').title).toBe('Finding your feet');
      expect(getFrnCopy('student').title).toBe('Getting started');
      expect(getFrnCopy('community').title).toBe('Getting started');
    });

    it('evaluates visibility correctly (hidden when all done or dismissed)', () => {
      const allDone = evaluateFirstRun('student', 'u1', {
        messagesCount: 1,
        prayersCount: 1,
        feedbackCount: 1,
      });
      expect(allDone.isVisible).toBe(false);
      expect(allDone.doneCount).toBe(3);
      expect(allDone.totalCount).toBe(3);

      const inProgress = evaluateFirstRun('student', 'u1', {
        messagesCount: 1,
        prayersCount: 0,
        feedbackCount: 0,
      });
      expect(inProgress.isVisible).toBe(true);
      expect(inProgress.doneCount).toBe(1);
    });
  });

  describe('FirstRunCard component', () => {
    it('renders the checklist and handles navigation and put away', () => {
      const onDismiss = vi.fn();
      render(
        <MemoryRouter>
          <FirstRunCard
            role="trainee"
            userId="trainee-1"
            context={{
              contactsCount: 1,
              interactionsCount: 0,
              messagesCount: 0,
              prayersCount: 0,
              todosCompletedCount: 0,
            }}
            onDismiss={onDismiss}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText('Your first week')).toBeInTheDocument();
      expect(screen.getByText('1 of 5 complete')).toBeInTheDocument();
      expect(screen.getByText("Add someone you've met")).toBeInTheDocument();

      // Click "Show me" for an uncompleted step
      const showMeButtons = screen.getAllByRole('button', { name: /Show me/i });
      expect(showMeButtons.length).toBeGreaterThan(0);
      fireEvent.click(showMeButtons[0]);
      expect(mockNavigate).toHaveBeenCalled();

      // Click "Put this away"
      const putAwayBtn = screen.getByRole('button', { name: /Put this away/i });
      fireEvent.click(putAwayBtn);
      expect(onDismiss).toHaveBeenCalled();
      expect(screen.queryByText('Your first week')).not.toBeInTheDocument();
    });

    it('renders an accessible progress meter reflecting completion', () => {
      render(
        <MemoryRouter>
          <FirstRunCard
            role="trainee"
            userId="trainee-1"
            context={{
              contactsCount: 1,
              interactionsCount: 0,
              messagesCount: 0,
              prayersCount: 0,
              todosCompletedCount: 0,
            }}
          />
        </MemoryRouter>,
      );

      const meter = screen.getByRole('progressbar', { name: /getting started progress/i });
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax', '5');
      expect(meter).toHaveAttribute('aria-valuenow', '1');
    });

    it('renders again after FirstRunStore.bringBack restores a dismissed card', () => {
      FirstRunStore.putAway('fr:trainee:trainee-1');
      const view = render(
        <MemoryRouter>
          <FirstRunCard role="trainee" userId="trainee-1" context={{ contactsCount: 1 }} />
        </MemoryRouter>,
      );
      expect(view.container).toBeEmptyDOMElement();

      FirstRunStore.bringBack('fr:trainee:trainee-1');
      view.rerender(
        <MemoryRouter>
          <FirstRunCard role="trainee" userId="trainee-1" context={{ contactsCount: 1 }} />
        </MemoryRouter>,
      );
      expect(screen.getByText('Your first week')).toBeInTheDocument();
    });

    it('does not render if all steps are completed', () => {
      const { container } = render(
        <MemoryRouter>
          <FirstRunCard
            role="student"
            userId="student-1"
            context={{
              messagesCount: 1,
              prayersCount: 1,
              feedbackCount: 1,
            }}
          />
        </MemoryRouter>,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });
});
