import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      { id: 'sec-1', title: 'Section 1', content: [], points: [{ before: 'Point 1' }] },
      { id: 'sec-2', title: 'Section 2', content: [], points: [{ before: 'Point 2' }] },
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

    // Save — it targets the addressed meeting, never a new document
    const saveBtn = screen.getByRole('button', { name: /^Save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', studyId: 'romans-fall26' }),
        mockUser.uid,
      );
    });
  });

  it('saves with ⌘S / Ctrl+S while dirty and never publishes', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    fireEvent.keyDown(document, { key: 's', metaKey: true });

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', title: 'Edited title', published: false }),
        mockUser.uid,
      );
    });
  });

  it('⌘S with nothing unsaved saves nothing', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    fireEvent.keyDown(document, { key: 's', metaKey: true });

    // Give any wrongly-dispatched save room to fail the test.
    await vi.waitFor(
      () => expect(bibleData.saveMeeting).not.toHaveBeenCalled(),
      { timeout: 50, interval: 10 },
    );
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

    // The list inserters land their starter templates at the cursor.
    const numBtn = screen.getByRole('button', { name: /Numbered list/i });
    fireEvent.click(numBtn);

    const bulletBtn = screen.getByRole('button', { name: /Bullet list/i });
    fireEvent.click(bulletBtn);

    const md = (screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement).value;
    expect(md).toContain('1. ');
    expect(md).toContain('2. ');
    expect(md).toContain('3. ');
    expect(md).toContain('- ');
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

  afterEach(() => {
    // A failed assertion must not leak fake timers into the next test.
    vi.useRealTimers();
  });

  it('shows an honest save state: Saving…, then Saved · just now', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    // ⌘S exercises the same write path autosave uses; the state line reads
    // it the same way.
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });
    expect(screen.getByText('Saving…')).toBeInTheDocument();

    await screen.findByText('Saved · just now');
  });

  it('autosaves the body ~1.2s after typing stops, without any Save click', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText(/markdown/i), {
      target: { value: '## Section 1\n- Typed point' },
    });

    // Not yet: the body debounce is ~1.2s. The save chain is async, so the
    // advances await inside act to let the fired timer's promise settle.
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(bibleData.saveMeeting).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(100); });
    expect(bibleData.saveMeeting).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'meeting-1',
        md: '## Section 1\n- Typed point',
        // Derived Sections are written with the markdown, and publish is
        // never flipped by autosave.
        sections: expect.anything(),
        published: false,
      }),
      mockUser.uid,
    );
    vi.useRealTimers();
  });

  it('autosaves title and date on their own shorter ~0.8s debounce', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    await act(async () => { vi.advanceTimersByTime(800); });
    expect(bibleData.saveMeeting).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'meeting-1', title: 'Edited title', published: false }),
      mockUser.uid,
    );
    vi.useRealTimers();
  });

  it('shows "Couldn\'t save" when a write fails, and retries on the next edit', async () => {
    vi.mocked(bibleData.saveMeeting)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('meeting-123');
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });
    await screen.findByText("Couldn't save");

    // The next edit retries the write.
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title again' },
    });
    await screen.findByText('Saved · just now');
    expect(bibleData.saveMeeting).toHaveBeenCalledTimes(2);
  });

  it('never prompts about unsaved changes, even mid-debounce', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });
    // Navigation before the debounce fires — no prompt, and the pending edit
    // is flushed rather than dropped.
    fireEvent.click(screen.getByText('All weeks'));
    vi.useRealTimers();

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    expect(await screen.findByText('Weeks index')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/bible-study');
  });
});
