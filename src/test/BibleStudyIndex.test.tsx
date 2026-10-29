import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BibleStudyIndex from '../views/BibleStudyIndex';
import * as bibleData from '../lib/data/bibleStudy';
import * as auth from '../components/AuthProvider';
import type { EntryPoint, Meeting, Study } from '../lib/bibleStudy';

vi.mock('../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: vi.fn(),
  subscribeStudy: vi.fn(),
  subscribeStudies: vi.fn(),
  subscribeStudyMeetings: vi.fn(),
  saveMeeting: vi.fn().mockResolvedValue('romans-fall26-2026-10-28'),
  setMeetingPublished: vi.fn().mockResolvedValue(undefined),
  deleteMeeting: vi.fn().mockResolvedValue(undefined),
  createStudy: vi.fn().mockResolvedValue('romans-fall-2026'),
  createEntryPoint: vi.fn().mockResolvedValue('cisa-wednesday'),
  setActiveStudy: vi.fn().mockResolvedValue(undefined),
  deleteStudy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('BibleStudyIndex view', () => {
  const mockUser = { uid: 'u-admin-1' };

  const ENTRY_POINT: EntryPoint = {
    id: 'cisa-wednesday',
    slug: 'cisa-wednesday',
    name: 'Wednesday Bible Study',
    activeStudyId: 'romans-fall26',
  };
  const STUDY: Study = { id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' };

  // Newest first, as the data seam returns them. The newest week is a draft;
  // the newest published week is what a scan opens.
  const MEETINGS: Meeting[] = [
    {
      id: 'm-6',
      studyId: 'romans-fall26',
      title: 'Nothing between us',
      date: '2026-10-21',
      published: false,
      sections: [
        { id: 's1', title: 'A', content: [], points: [] },
        { id: 's2', title: 'B', content: [], points: [] },
        { id: 's3', title: 'C', content: [], points: [] },
        { id: 's4', title: 'D', content: [], points: [] },
      ],
    },
    {
      id: 'm-5',
      studyId: 'romans-fall26',
      title: 'Alive to God',
      date: '2026-10-14',
      published: true,
      sections: [
        { id: 's1', title: 'A', content: [], points: [] },
        { id: 's2', title: 'B', content: [], points: [] },
        { id: 's3', title: 'C', content: [], points: [] },
        { id: 's4', title: 'D', content: [], points: [] },
      ],
    },
    {
      id: 'm-4',
      studyId: 'romans-fall26',
      title: 'Peace that holds',
      date: '2026-10-07',
      published: true,
      sections: [{ id: 's1', title: 'A', content: [], points: [] }],
    },
  ];

  function renderIndex() {
    return render(
      <MemoryRouter initialEntries={['/bible-study']}>
        <Routes>
          <Route path="/bible-study" element={<BibleStudyIndex />} />
          <Route path="/bible-study/present" element={<div>Present mode</div>} />
          <Route path="/bible-study/:meetingId" element={<div>Editor opened</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  // At desktop width a week's title can appear twice — in its row and in the
  // rail's scan card — so row lookups go through the row element.
  function rowFor(title: string): HTMLButtonElement | undefined {
    return screen
      .getAllByText(title)
      .map((el) => el.closest('button'))
      .find((el): el is HTMLButtonElement => el !== null);
  }

  // The view picks its layout from `matchMedia`, not a CSS-only hide (#1860),
  // so each test says which width it means. Phone is the default because that
  // is where the duplicate statement and the clipped row were reported.
  function setViewport(width: 'phone' | 'desktop') {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: width === 'desktop',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  function weeksSection(): HTMLElement {
    const heading = screen.getByRole('heading', { name: /^Weeks/ });
    return heading.closest('section') as HTMLElement;
  }

  function scanCard(): HTMLElement {
    return screen.getByText('What a scan opens right now').parentElement as HTMLElement;
  }

  let meetingsCb: ((meetings: Meeting[]) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    setViewport('phone');
    meetingsCb = null;
    vi.mocked(auth.useAuth).mockReturnValue({
      user: mockUser,
      isAdmin: true,
    } as ReturnType<typeof auth.useAuth>);
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb([ENTRY_POINT]);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
      cb([STUDY]);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, _studyId, cb) => {
      cb(STUDY, false);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, _studyId, cb) => {
      meetingsCb = cb;
      cb(MEETINGS);
      return () => {};
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('names the page with a real heading (#1776)', () => {
    renderIndex();

    // There was no h1 at all: the first thing on a phone was the entry-point
    // card, and assistive tech never learned what the page is.
    expect(screen.getByRole('heading', { level: 1, name: 'Bible study' })).toBeInTheDocument();
  });

  it('lists the weeks newest first with date, section count and publish state', async () => {
    renderIndex();

    expect(await screen.findByText('Nothing between us')).toBeInTheDocument();
    expect(rowFor('Alive to God')).toBeInTheDocument();
    expect(rowFor('Peace that holds')).toBeInTheDocument();

    const draftRow = rowFor('Nothing between us');
    expect(draftRow?.textContent).toContain('4 sections');
    // The pill already says Draft, so the meta stops repeating it (#1860).
    expect(draftRow?.textContent).not.toContain('not published');
    expect(draftRow?.textContent).toContain('Draft');

    const liveRow = rowFor('Alive to God');
    expect(liveRow?.textContent).toContain('Live now');
    expect(liveRow?.textContent).not.toContain('published');

    // An older published week carries no pill, so its meta still says so.
    expect(rowFor('Peace that holds')?.textContent).toContain('published');
  });

  it('marks the newest published week as live, not the newest week', async () => {
    renderIndex();

    await screen.findByText('Nothing between us');

    const liveRow = rowFor('Alive to God');
    expect(liveRow?.textContent).toContain('Live now');

    const draftRow = rowFor('Nothing between us');
    expect(draftRow?.textContent).not.toContain('Live now');

    const olderRow = rowFor('Peace that holds');
    expect(olderRow?.textContent).not.toContain('Live now');
  });

  it('states what a scan opens on desktop, and why a newer draft is not showing', async () => {
    setViewport('desktop');
    renderIndex();

    expect(await screen.findByText('What a scan opens right now')).toBeInTheDocument();
    const panel = scanCard();
    expect(panel.textContent).toContain('Alive to God');
    expect(panel.textContent).toMatch(/Oct 14/);
    // The rail only summarises the live week now: the draft note lives in the
    // weeks section, once, at every width (#1860).
    expect(panel.textContent).not.toMatch(/is still a draft/);
    expect(weeksSection().textContent).toMatch(/Nothing between us is still a draft/);
  });

  // ── One statement of which week a scan opens (#1860) ──────────────────
  // The 375px screen said it twice (scan card + week row), clipped the row
  // meta mid-word, and put admin chrome above the week list. These pin the
  // consolidated behaviour; painted order is proven by a 375px screenshot.
  describe('one statement of which week a scan opens (#1860)', () => {
    it('phone: one statement of which week a scan opens (#1860)', async () => {
      setViewport('phone');
      renderIndex();

      await screen.findByText('Nothing between us');

      expect(screen.queryByText('What a scan opens right now')).not.toBeInTheDocument();
      expect(screen.getAllByText('Alive to God')).toHaveLength(1);
      expect(rowFor('Alive to God')?.textContent).toContain('Live now');
    });

    it('phone: the week row meta is not clipped and the pill carries the state (#1860)', async () => {
      setViewport('phone');
      renderIndex();

      await screen.findByText('Nothing between us');

      const liveRow = rowFor('Alive to God') as HTMLElement;
      const liveMeta = within(liveRow).getByText(/ · 4 sections$/);
      // Nothing truncated: the full date and section count are the text.
      expect(liveMeta.textContent).toMatch(/^\w{3}, Oct 14 · 4 sections$/);
      expect(liveMeta.className).not.toContain('truncate');
      // The pill already says the state, so the meta does not repeat it.
      expect(liveMeta.textContent).not.toContain('published');

      const draftRow = rowFor('Nothing between us') as HTMLElement;
      expect(within(draftRow).getByText(/ · 4 sections$/).textContent).not.toContain(
        'not published',
      );
      expect(draftRow.textContent).toContain('Draft');

      // An older published week carries no pill, so its meta still ends so.
      expect(within(rowFor('Peace that holds') as HTMLElement).getByText(/sections? · published$/)).toBeInTheDocument();
    });

    it('phone: the draft note sits in the weeks section once (#1860)', async () => {
      setViewport('phone');
      renderIndex();

      await screen.findByText('Nothing between us');

      const notes = screen.getAllByText(/is still a draft/);
      expect(notes).toHaveLength(1);
      expect(weeksSection().contains(notes[0])).toBe(true);
    });

    it('phone: the weeks section comes before the entry-point card (#1860)', async () => {
      setViewport('phone');
      renderIndex();

      await screen.findByText('Nothing between us');

      const weeks = weeksSection();
      const aside = screen.getByText('Entry point').closest('aside') as HTMLElement;
      // DOM order is the painted order: no `order-*` utility may re-sort them.
      expect(weeks.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(weeks.className).not.toContain('order-');
      expect(aside.className).not.toContain('order-');
    });

    it('phone: a study that never published says so in the weeks section (#1860)', async () => {
      vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, _studyId, cb) => {
        cb(MEETINGS.map((m) => ({ ...m, published: false })));
        return () => {};
      });
      renderIndex();

      const sentence = await screen.findByText(
        /Nothing yet — the study has never published a week/,
      );
      expect(screen.getAllByText(/Nothing yet — the study has never published a week/)).toHaveLength(
        1,
      );
      expect(weeksSection().contains(sentence)).toBe(true);
    });

    it('desktop: the rail states which week a scan opens, once (#1860)', async () => {
      setViewport('desktop');
      renderIndex();

      expect(await screen.findByText('What a scan opens right now')).toBeInTheDocument();
      const card = scanCard();
      expect(card.textContent).toContain('Alive to God');
      expect(card.textContent).toMatch(/Oct 14/);
      // The title is in the row and in the rail — that is the rail's job at
      // width — but the draft note is not repeated there.
      expect(screen.getAllByText('Alive to God')).toHaveLength(2);
      expect(screen.getAllByText(/is still a draft/)).toHaveLength(1);
      expect(card.textContent).not.toMatch(/is still a draft/);
    });
  });

  it('shows the entry point with its name, slug and active study, linking to present mode', async () => {    renderIndex();

    expect(await screen.findByText('Wednesday Bible Study')).toBeInTheDocument();
    const card = screen.getByText('/s/cisa-wednesday').closest('aside') as HTMLElement;
    expect(within(card).getByText('Romans · Fall 2026')).toBeInTheDocument();

    const showQr = screen.getByRole('link', { name: /Show QR/i });
    expect(showQr.getAttribute('href')).toBe('/bible-study/present?ep=cisa-wednesday');
  });

  it('starts a new week from the list and opens its editor', async () => {
    vi.mocked(bibleData.saveMeeting).mockResolvedValue('romans-fall26-2026-10-28');
    renderIndex();

    await screen.findByText('Nothing between us');

    fireEvent.click(screen.getByRole('button', { name: /New week/i }));

    await waitFor(
      () => {
        expect(bibleData.saveMeeting).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            studyId: 'romans-fall26',
            date: '2026-10-28',
            published: false,
            // A new week starts from the skeleton, never a copy of the
            // previous week's text.
            md: expect.stringContaining('## '),
          }),
          mockUser.uid,
        );
      },
      { timeout: 5000 },
    );
    const savedMd = vi.mocked(bibleData.saveMeeting).mock.calls[0][1].md as string;
    expect(savedMd).toMatch(/^(Question|Discuss|Activity): /m);
    expect(savedMd).not.toContain('Nothing between us');

    // Coverage-instrumented runs are slow; give the async navigation room.
    expect(await screen.findByText('Editor opened', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('says no study is active when nothing is running (#1860)', async () => {
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb([{ ...ENTRY_POINT, activeStudyId: null }]);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, _studyId, cb) => {
      cb([]);
      return () => {};
    });

    renderIndex();

    const sentence = await screen.findByText(
      /Nothing running right now — no study is active on this code/,
    );
    // Said once, in the weeks section — the phone no longer has a second card
    // to repeat it, and the desktop rail does not either.
    expect(screen.getAllByText(/Nothing running right now/)).toHaveLength(1);
    expect(weeksSection().contains(sentence)).toBe(true);
    expect(screen.getByRole('button', { name: /New week/i })).toBeDisabled();
  });

  it("opens the editor from a week's row", async () => {
    renderIndex();

    await screen.findByText('Nothing between us');
    fireEvent.click(screen.getByText('Peace that holds'));

    expect(await screen.findByText('Editor opened')).toBeInTheDocument();
  });

  describe('row actions', () => {
    it('offers duplicate, copy staff link, unpublish and delete for a published week', async () => {
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Alive to God' }));

      const menu = screen.getByRole('menu', { name: 'Actions for Alive to God' });
      expect(menu).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Duplicate into a new week' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy staff link' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Unpublish' })).toBeInTheDocument();
      // Refused for a published week, with the reason written where it can
      // be read — not an unexplained disabled control.
      const del = screen.getByRole('menuitem', { name: 'Delete' });
      expect(del).toBeDisabled();
      expect(screen.getByText(/Unpublish first — a published week may already be on someone's screen/)).toBeInTheDocument();
    });

    it('offers delete without unpublish for a draft week, and deleting removes it from the list', async () => {
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Nothing between us' }));

      expect(screen.queryByRole('menuitem', { name: 'Unpublish' })).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeEnabled();

      // Two deliberate steps: menu click, then confirm.
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
      fireEvent.click(await screen.findByRole('button', { name: /Delete week/i }));

      await waitFor(() => expect(bibleData.deleteMeeting).toHaveBeenCalledWith(expect.anything(), 'm-6'));

      // The subscription delivers the list without the deleted week; the
      // live mark moves to what a scan now opens.
      act(() => {
        meetingsCb?.(MEETINGS.filter((m) => m.id !== 'm-6'));
      });
      await waitFor(() => expect(screen.queryByText('Nothing between us')).not.toBeInTheDocument());
      expect(rowFor('Alive to God')?.textContent).toContain('Live now');
    });

    it('renders the menu through a portal so the list cannot clip it', async () => {
      // The weeks list container is overflow-hidden (rounded corners). An
      // absolutely-positioned menu inside it was invisible and unclickable
      // whenever the row sat near the container's bottom edge — the reported
      // "dropdown next to the pill is blocked". Portaling to body escapes.
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Peace that holds' }));

      const menu = screen.getByRole('menu', { name: 'Actions for Peace that holds' });
      // Not a descendant of the list container the rows live in.
      const listContainer = screen.getByText('Peace that holds').closest('div.overflow-hidden');
      expect(listContainer).not.toBeNull();
      expect(listContainer?.contains(menu)).toBe(false);
      // And it is fixed-positioned at the ⋮ that opened it, so it stays
      // pinned regardless of page scroll.
      expect(menu.className).toContain('fixed');
    });

    it('duplicates a week with its structure, leaving the source untouched', async () => {
      vi.mocked(bibleData.saveMeeting).mockResolvedValue('romans-fall26-2026-10-28');
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Peace that holds' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate into a new week' }));

      await waitFor(() => {
        expect(bibleData.saveMeeting).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            studyId: 'romans-fall26',
            date: '2026-10-28',
            title: 'Peace that holds',
            sections: MEETINGS[2].sections,
            published: false,
          }),
          mockUser.uid,
        );
      });
      // The source was not written to — no unpublish, no delete, one save.
      expect(bibleData.saveMeeting).toHaveBeenCalledTimes(1);
      expect(bibleData.setMeetingPublished).not.toHaveBeenCalled();
      expect(bibleData.deleteMeeting).not.toHaveBeenCalled();
      expect(rowFor('Peace that holds')).toBeInTheDocument();
    });

    it('copies the unlisted staff permalink for one week', async () => {
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Alive to God' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy staff link' }));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          'https://cisa-campus-work-tracker.pages.dev/study/romans-fall26/2026-10-14',
        );
      });
    });

    it('unpublishing is reflected immediately in what a scan opens', async () => {
      setViewport('desktop');
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Alive to God' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unpublish' }));

      await waitFor(() =>
        expect(bibleData.setMeetingPublished).toHaveBeenCalledWith(expect.anything(), 'm-5', false),
      );

      // The subscription delivers the change; the scan panel falls back to
      // the previous published week and the live mark moves with it.
      act(() => {
        meetingsCb?.(MEETINGS.map((m) => (m.id === 'm-5' ? { ...m, published: false } : m)));
      });
      await waitFor(() => {
        const panel = scanCard();
        expect(panel.textContent).toContain('Peace that holds');
        expect(panel.textContent).not.toContain('Alive to God');
      });
    });
  });

  // ── Starting a study (issue #822) ───────────────────────────────────────
  // The reported state: a fresh database, a disabled "New week" button, and
  // an instruction to run a seed script that needs a service-account key.

  describe('a database with nothing in it', () => {
    beforeEach(() => {
      vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
        cb([]);
        return () => {};
      });
    });

    it('offers a way to start a study instead of a terminal command', async () => {
      renderIndex();

      expect(await screen.findByRole('button', { name: 'Start a study' })).toBeInTheDocument();
      expect(screen.queryByText(/seed:bible-study/)).not.toBeInTheDocument();
    });

    it('creates the Study first, then the Entry point pointing at it', async () => {
      renderIndex();

      fireEvent.click(await screen.findByRole('button', { name: 'Start a study' }));
      fireEvent.change(screen.getByLabelText('Study title'), { target: { value: 'Romans' } });
      fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'Fall 2026' } });
      fireEvent.change(screen.getByLabelText('Entry point name'), {
        target: { value: 'Wednesday Bible Study' },
      });
      // The slug followed the name — the two can never disagree by default.
      expect(screen.getByLabelText('Code')).toHaveValue('wednesday-bible-study');
      fireEvent.click(screen.getByRole('button', { name: 'Start the study' }));

      await waitFor(() =>
        expect(bibleData.createStudy).toHaveBeenCalledWith(
          expect.anything(),
          { id: 'romans-fall-2026', title: 'Romans', term: 'Fall 2026' },
          'u-admin-1',
        ),
      );
      expect(bibleData.createEntryPoint).toHaveBeenCalledWith(
        expect.anything(),
        {
          slug: 'wednesday-bible-study',
          name: 'Wednesday Bible Study',
          activeStudyId: 'romans-fall-2026',
        },
        'u-admin-1',
      );
      // A code pointing at a Study that does not exist yet reads as "no study
      // active" to anyone scanning in between.
      expect(vi.mocked(bibleData.createStudy).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(bibleData.createEntryPoint).mock.invocationCallOrder[0],
      );
    });

    it('says what is wrong instead of writing an unwritable record', async () => {
      renderIndex();

      fireEvent.click(await screen.findByRole('button', { name: 'Start a study' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start the study' }));

      expect(await screen.findByText('Give the study a title.')).toBeInTheDocument();
      expect(bibleData.createStudy).not.toHaveBeenCalled();
    });

    it('keeps the writing when the save is refused', async () => {
      vi.mocked(bibleData.createStudy).mockRejectedValueOnce(new Error('permission-denied'));
      renderIndex();

      fireEvent.click(await screen.findByRole('button', { name: 'Start a study' }));
      fireEvent.change(screen.getByLabelText('Study title'), { target: { value: 'Romans' } });
      fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'Fall 2026' } });
      fireEvent.change(screen.getByLabelText('Entry point name'), {
        target: { value: 'Wednesday Bible Study' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Start the study' }));

      expect(await screen.findByText(/only a Full-timer can start a study/)).toBeInTheDocument();
      expect(screen.getByLabelText('Study title')).toHaveValue('Romans');
    });
  });

  it('a failed read is not reported as a database that was never set up', async () => {
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, _cb, onError) => {
      onError?.(new Error('permission-denied'));
      return () => {};
    });
    renderIndex();

    expect(await screen.findByText(/Couldn't load the entry point/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a study' })).not.toBeInTheDocument();
  });

  it('a new term repoints the code that is already printed, never replacing it', async () => {
    renderIndex();

    await screen.findByText('Nothing between us');
    fireEvent.click(screen.getByRole('button', { name: 'Start a new term' }));
    fireEvent.change(screen.getByLabelText('Study title'), { target: { value: 'Acts' } });
    fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'Spring 2027' } });
    // The slug is not up for editing — it is on the poster.
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the term' }));

    await waitFor(() =>
      expect(bibleData.setActiveStudy).toHaveBeenCalledWith(
        expect.anything(),
        'cisa-wednesday',
        'acts-spring-2027',
      ),
    );
    expect(bibleData.createEntryPoint).not.toHaveBeenCalled();
  });

  describe('term and entry point selection (#1932)', () => {
    const MARK_STUDY: Study = { id: 'mark-fall-2026', title: 'Mark', term: 'Fall 2026' };
    const MARK_MEETINGS: Meeting[] = [
      {
        id: 'mark-m1',
        studyId: 'mark-fall-2026',
        title: 'The Contents of the Gospel',
        date: '2026-09-09',
        published: true,
        sections: [{ id: 's1', title: 'Sec', content: [], points: [] }],
      },
    ];

    it('renders a term selector button when studies are available', async () => {
      vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
        cb([STUDY, MARK_STUDY]);
        return () => {};
      });
      renderIndex();

      const termBtn = await screen.findByRole('button', { name: /select study term/i });
      expect(termBtn).toBeInTheDocument();
      expect(within(termBtn).getByText('Romans · Fall 2026')).toBeInTheDocument();
    });

    it('switches to a different term when selected and updates meetings list', async () => {
      vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
        cb([STUDY, MARK_STUDY]);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, studyId, cb) => {
        if (studyId === 'mark-fall-2026') cb(MARK_STUDY, false);
        else cb(STUDY, false);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, studyId, cb) => {
        if (studyId === 'mark-fall-2026') cb(MARK_MEETINGS);
        else cb(MEETINGS);
        return () => {};
      });

      renderIndex();
      await screen.findByText('Nothing between us');

      const termBtn = screen.getByRole('button', { name: /select study term/i });
      fireEvent.click(termBtn);

      const markOption = await screen.findByRole('option', { name: /Mark · Fall 2026/ });
      fireEvent.click(markOption);

      expect(await screen.findByText('The Contents of the Gospel')).toBeInTheDocument();
      expect(screen.queryByText('Nothing between us')).not.toBeInTheDocument();
    });

    it('renders entry point switcher when multiple entry points exist', async () => {
      const EP_2: EntryPoint = {
        id: 'f26',
        slug: 'f26',
        name: 'F26',
        activeStudyId: 'mark-fall-2026',
      };
      vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
        cb([ENTRY_POINT, EP_2]);
        return () => {};
      });

      renderIndex();

      expect(await screen.findByRole('button', { name: 'F26' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Wednesday Bible Study' })).toBeInTheDocument();
    });

    it('allows setting current viewed term active on the selected entry point', async () => {
      vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
        cb([STUDY, MARK_STUDY]);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, studyId, cb) => {
        if (studyId === 'mark-fall-2026') cb(MARK_STUDY, false);
        else cb(STUDY, false);
        return () => {};
      });

      renderIndex();
      const termBtn = await screen.findByRole('button', { name: /select study term/i });
      fireEvent.click(termBtn);

      const markOption = await screen.findByRole('option', { name: /Mark · Fall 2026/ });
      fireEvent.click(markOption);

      const makeActiveBtn = await screen.findByRole('button', { name: /set this term active on \/s\/cisa-wednesday/i });
      fireEvent.click(makeActiveBtn);

      expect(bibleData.setActiveStudy).toHaveBeenCalledWith(
        expect.anything(),
        'cisa-wednesday',
        'mark-fall-2026',
      );
    });
  });

  describe('deleting a study term (#1937)', () => {
    const TEST_STUDY: Study = { id: 'test-study', title: 'Test Study', term: 'Fall 2026' };
    const DRAFT_MEETING: Meeting = {
      id: 'test-m1',
      studyId: 'test-study',
      title: 'Draft week',
      date: '2026-11-01',
      published: false,
      sections: [],
    };

    it('shows delete option and prompts confirmation modal', async () => {
      vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
        cb([STUDY, TEST_STUDY]);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, studyId, cb) => {
        if (studyId === 'test-study') cb(TEST_STUDY, false);
        else cb(STUDY, false);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, studyId, cb) => {
        if (studyId === 'test-study') cb([DRAFT_MEETING]);
        else cb(MEETINGS);
        return () => {};
      });

      renderIndex();
      // Select the test study
      const termBtn = await screen.findByRole('button', { name: /select study term/i });
      fireEvent.click(termBtn);
      const testOption = await screen.findByRole('option', { name: /Test Study · Fall 2026/ });
      fireEvent.click(testOption);

      // Open term menu again to click Delete this term...
      fireEvent.click(screen.getByRole('button', { name: /select study term/i }));
      const termMenu = screen.getByRole('listbox');
      const deleteItem = within(termMenu).getByRole('button', { name: /delete this term/i });
      fireEvent.click(deleteItem);

      // Confirmation dialog opens
      expect(screen.getByRole('dialog', { name: /delete study term/i })).toBeInTheDocument();
      expect(screen.getByText(/Delete "Test Study · Fall 2026"\?/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^delete term$/i })).toBeInTheDocument();

      // Click delete term
      fireEvent.click(screen.getByRole('button', { name: /^delete term$/i }));
      expect(bibleData.deleteStudy).toHaveBeenCalledWith(expect.anything(), 'test-study');
    });

    const openDeleteFromTermMenu = async () => {
      fireEvent.click(await screen.findByRole('button', { name: /select study term/i }));
      fireEvent.click(
        within(screen.getByRole('listbox')).getByRole('button', { name: /delete this term/i }),
      );
      return screen.getByRole('dialog', { name: /delete study term/i });
    };

    it('repoints the code to another term, then deletes the active term', async () => {
      // STUDY is active on ENTRY_POINT (activeStudyId: 'romans-fall26')
      vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
        cb([STUDY, TEST_STUDY]);
        return () => {};
      });
      renderIndex();

      const dialog = await openDeleteFromTermMenu();
      const next = within(dialog).getByLabelText(/\/s\/cisa-wednesday will show/i);
      expect(next).toHaveValue('test-study');

      fireEvent.click(within(dialog).getByRole('button', { name: /^delete term$/i }));
      await waitFor(() =>
        expect(bibleData.deleteStudy).toHaveBeenCalledWith(expect.anything(), 'romans-fall26'),
      );
      expect(bibleData.setActiveStudy).toHaveBeenCalledWith(
        expect.anything(),
        'cisa-wednesday',
        'test-study',
      );
      expect(vi.mocked(bibleData.setActiveStudy).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(bibleData.deleteStudy).mock.invocationCallOrder[0],
      );
    });

    it('leaves the code between terms when deleting the only term', async () => {
      vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
        cb([STUDY]);
        return () => {};
      });
      renderIndex();

      // The Entry point card no longer carries a delete link.
      await screen.findByRole('button', { name: /select study term/i });
      expect(screen.queryByRole('button', { name: /delete this term/i })).not.toBeInTheDocument();

      const dialog = await openDeleteFromTermMenu();
      expect(within(dialog).getByLabelText(/\/s\/cisa-wednesday will show/i)).toHaveValue('');

      fireEvent.click(within(dialog).getByRole('button', { name: /^delete term$/i }));
      await waitFor(() =>
        expect(bibleData.deleteStudy).toHaveBeenCalledWith(expect.anything(), 'romans-fall26'),
      );
      expect(bibleData.setActiveStudy).toHaveBeenCalledWith(expect.anything(), 'cisa-wednesday', null);
    });

    it('says published weeks will be unpublished and still allows deleting', async () => {
      vi.mocked(bibleData.subscribeStudies).mockImplementation((_db, cb) => {
        cb([STUDY, TEST_STUDY]);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, studyId, cb) => {
        if (studyId === 'test-study') cb(TEST_STUDY, false);
        else cb(STUDY, false);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, studyId, cb) => {
        if (studyId === 'test-study') cb([{ ...DRAFT_MEETING, published: true }]);
        else cb(MEETINGS);
        return () => {};
      });

      renderIndex();
      // Select test study
      const termBtn = await screen.findByRole('button', { name: /select study term/i });
      fireEvent.click(termBtn);
      const testOption = await screen.findByRole('option', { name: /Test Study · Fall 2026/ });
      fireEvent.click(testOption);

      const dialog = await openDeleteFromTermMenu();
      expect(within(dialog).getByText(/1 published week\(s\) will be unpublished/i)).toBeInTheDocument();
      // Not active on any code, so there is nothing to repoint.
      expect(within(dialog).queryByLabelText(/will show/i)).not.toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: /^delete term$/i }));
      await waitFor(() =>
        expect(bibleData.deleteStudy).toHaveBeenCalledWith(expect.anything(), 'test-study'),
      );
      expect(bibleData.setActiveStudy).not.toHaveBeenCalled();
    });
  });
});
