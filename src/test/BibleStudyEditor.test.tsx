import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BibleStudyEditor from '../views/BibleStudyEditor';
import * as bibleData from '../lib/data/bibleStudy';
import * as auth from '../components/AuthProvider';

vi.mock('../lib/data/bibleStudy', () => ({
  subscribeStudyMeetings: vi.fn(),
  saveMeeting: vi.fn().mockResolvedValue('meeting-123'),
  setMeetingPublished: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('BibleStudyEditor view', () => {
  const mockUser = { uid: 'u-admin-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    (auth.useAuth as any).mockReturnValue({
      user: mockUser,
      isAdmin: true,
    });
    (bibleData.subscribeStudyMeetings as any).mockImplementation((_db: any, _studyId: string, cb: any) => {
      cb([
        {
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
        },
      ]);
      return () => {};
    });
  });

  it('renders authoring panes, loads meeting, and allows selecting sections', async () => {
    render(<BibleStudyEditor />);

    expect(await screen.findByText('Initial Meeting')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('QR Code Link')).toBeInTheDocument();

    // Click section in the left gutter
    const secButtons = screen.getAllByText('Section 2');
    fireEvent.click(secButtons[0]);

    // Save draft
    const saveBtn = screen.getByRole('button', { name: /Save draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalled();
    });
  });

  it('handles toolbar insertions into markdown textarea', async () => {
    render(<BibleStudyEditor />);

    await screen.findByText('Initial Meeting');

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
    render(<BibleStudyEditor />);

    await screen.findByText('Initial Meeting');

    // Toggle publish
    const pubBtn = screen.getByRole('button', { name: /Publish/i });
    fireEvent.click(pubBtn);

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ published: true }),
        mockUser.uid,
      );
    });

    // Toggle theme
    const lightBtn = screen.getByRole('button', { name: /Light/i });
    fireEvent.click(lightBtn);

    const darkBtn = screen.getByRole('button', { name: /Dark/i });
    fireEvent.click(darkBtn);
  });
});
