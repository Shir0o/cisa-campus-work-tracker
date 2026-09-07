import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BibleStudyEditor from '../views/BibleStudyEditor';
import * as bibleData from '../lib/data/bibleStudy';
import * as auth from '../components/AuthProvider';
import type { Meeting } from '../lib/bibleStudy';

vi.mock('../lib/data/bibleStudy', () => ({
  subscribeMeeting: vi.fn(),
  subscribeEntryPoints: vi.fn(),
  saveMeeting: vi.fn().mockResolvedValue('meeting-123'),
  setMeetingPublished: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('BibleStudyEditor view', () => {
  const mockUser = { uid: 'u-admin-1' };

  const MEETING: Meeting = {
    id: 'meeting-1',
    studyId: 'romans-fall26',
    title: 'Initial Meeting',
    date: '2026-09-01',
    published: false,
    md: '## Section 1\n- Point 1\n\n## Section 2\n- Point 2',
    sections: [
      { id: 'sec-1', title: 'Section 1', points: [{ before: 'Point 1' }] },
      { id: 'sec-2', title: 'Section 2', points: [{ before: 'Point 2' }] },
    ],
  };

  function renderAt(path = '/bible-study/meeting-1') {
    // The unsaved-changes guard operates on the real history, so these tests
    // run against BrowserRouter rather than MemoryRouter.
    window.history.replaceState(null, '', path);
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/bible-study/:meetingId" element={<BibleStudyEditor />} />
          <Route path="/bible-study" element={<div>Weeks index</div>} />
        </Routes>
      </BrowserRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.useAuth).mockReturnValue({
      user: mockUser,
      isAdmin: true,
    } as ReturnType<typeof auth.useAuth>);
    vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
      cb(MEETING);
      return () => {};
    });
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb([]);
      return () => {};
    });
  });

  it('renders authoring panes, loads the addressed meeting, and allows selecting sections', async () => {
    renderAt();

    expect(await screen.findByDisplayValue('Initial Meeting')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Present mode')).toBeInTheDocument();

    // Click section in the left gutter
    const secButtons = screen.getAllByText('Section 2');
    fireEvent.click(secButtons[0]);

    // Save draft — it targets the addressed meeting, never a new document
    const saveBtn = screen.getByRole('button', { name: /Save draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', studyId: 'romans-fall26' }),
        mockUser.uid,
      );
    });
  });

  it('handles toolbar insertions into markdown textarea', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');

    const blankBtn = screen.getByRole('button', { name: /Blank/i });
    fireEvent.click(blankBtn);

    const questionBtn = screen.getByRole('button', { name: /Question/i });
    fireEvent.click(questionBtn);

    const passageBtn = screen.getByRole('button', { name: /Passage/i });
    fireEvent.click(passageBtn);

    const discussBtn = screen.getByRole('button', { name: /Discuss/i });
    fireEvent.click(discussBtn);

    const activityBtn = screen.getByRole('button', { name: /Activity/i });
    fireEvent.click(activityBtn);

    const addSecBtn = screen.getByRole('button', { name: /\+ Add section/i });
    fireEvent.click(addSecBtn);
  });

  it('toggles publish state and preview theme', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');

    // Toggle publish
    const pubBtn = screen.getByRole('button', { name: /Publish/i });
    fireEvent.click(pubBtn);

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', published: true }),
        mockUser.uid,
      );
    });

    // Toggle theme
    const lightBtn = screen.getByRole('button', { name: /Light/i });
    fireEvent.click(lightBtn);

    const darkBtn = screen.getByRole('button', { name: /Dark/i });
    fireEvent.click(darkBtn);
  });

  it('shows a handled state for a week that does not exist', async () => {
    vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
      cb(null);
      return () => {};
    });

    renderAt('/bible-study/missing-week');

    expect(await screen.findByText("This week doesn't exist.")).toBeInTheDocument();
    expect(screen.getByText('All weeks')).toBeInTheDocument();
  });

  it('shows that it has unsaved changes without requiring a leave attempt', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('does not prompt when leaving with no unsaved changes', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');

    fireEvent.click(screen.getByText('All weeks'));

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    expect(await screen.findByText('Weeks index')).toBeInTheDocument();
  });

  it('asks before leaving with unsaved changes; staying keeps the changes intact', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    fireEvent.click(screen.getByText('All weeks'));
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Stay here/i }));

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Edited title')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/bible-study/meeting-1');
    expect(bibleData.saveMeeting).not.toHaveBeenCalled();
  });

  it('discarding leaves without saving', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    fireEvent.click(screen.getByText('All weeks'));
    fireEvent.click(await screen.findByRole('button', { name: /Discard and open/i }));

    expect(await screen.findByText('Weeks index')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/bible-study');
    expect(bibleData.saveMeeting).not.toHaveBeenCalled();
  });
  it('saving and leaving actually saves before navigating', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    fireEvent.click(screen.getByText('All weeks'));
    fireEvent.click(await screen.findByRole('button', { name: /Save, then open/i }));

    // Coverage-instrumented runs are slow; give the async navigation room.
    await waitFor(
      () => expect(bibleData.saveMeeting).toHaveBeenCalled(),
      { timeout: 5000 },
    );
    expect(await screen.findByText('Weeks index', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
