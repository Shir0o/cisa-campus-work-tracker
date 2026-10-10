import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LogVisitModal from '../components/modals/LogVisitModal';
import { useAuth } from '../components/AuthProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { addVisit, attachVisitPhotos, updateVisit } from '../lib/visits';
import { addTodo, updateTodo } from '../lib/todos';
import { addPrayerBurden, unhidePrayerContact } from '../lib/prayers';
import { uploadVisitPhotos } from '../lib/visitPhotos';
import { logActivity } from '../lib/firebase';
import { addDoc } from 'firebase/firestore';
import type { AppUser, Contact, Home, Visit } from '../types';

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));

vi.mock('../lib/useMediaQuery', () => ({ useMediaQuery: vi.fn(() => false) }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'c-new-123' }),
  serverTimestamp: vi.fn(),
}));

vi.mock('../lib/seasons', () => ({
  useSeason: () => ({
    autoId: 'fall',
    activeId: 'fall',
    active: { id: 'fall', label: 'Fall', tone: 'accent', blurb: '' },
    isAuto: true,
    clubRush: false,
    label: "Fall '26",
    tags: ['Fall 2026'],
    setSeason: vi.fn(),
    resetSeason: vi.fn(),
    toggleClubRush: vi.fn(),
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', WRITE: 'WRITE' },
  logActivity: vi.fn(),
}));

vi.mock('../lib/visits', () => ({
  addVisit: vi.fn(() => Promise.resolve('new-visit-id')),
  updateVisit: vi.fn(() => Promise.resolve()),
  attachVisitPhotos: vi.fn(() => Promise.resolve()),
  initialsOf: (name: string) => name.slice(0, 2).toUpperCase(),
}));

vi.mock('../lib/todos', () => ({ addTodo: vi.fn(() => Promise.resolve('task-1')), updateTodo: vi.fn(() => Promise.resolve()) }));
vi.mock('../lib/prayers', () => ({ addPrayerBurden: vi.fn(() => Promise.resolve('prayer-1')), unhidePrayerContact: vi.fn() }));
vi.mock('../lib/visitPhotos', () => ({
  MAX_PHOTOS_PER_VISIT: 12,
  uploadVisitPhotos: vi.fn(() => Promise.resolve([{ path: 'visits/x/1.jpg', url: 'u', name: 'room.jpg' }])),
}));

const contacts = [
  { id: 'c1', name: 'Ama Osei', location: 'Whitman Hall' },
  { id: 'c2', name: 'Bo Chen', location: 'Ridgewood House' },
] as Contact[];

// The place now comes from a Home, not from the contact's `location` (ADR
// 0031). A home holding Ama means her visit's where is offered from it.
const homes = [
  { id: 'h1', label: 'the Oseis', members: ['c1'], place: 'Whitman Hall', active: true },
  { id: 'h2', label: 'the Chens', members: ['c2'], place: 'Ridgewood House', active: true },
] as Home[];

const staff = [
  { uid: 'u1', displayName: 'Mei Tanaka' },
  { uid: 'u2', displayName: 'Jordan Park' },
] as AppUser[];

const baseProps = { isOpen: true, onClose: vi.fn(), contacts, staff, homes };

beforeEach(() => {
  vi.clearAllMocks();
  (useMediaQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { uid: 'u1', displayName: 'Mei Tanaka', photoURL: '' },
    effectiveUserId: 'u1',
  });
});

const pick = (name: string) => {
  const input = screen.queryByPlaceholderText('Start typing a name') || screen.getByPlaceholderText('Anyone else?');
  fireEvent.change(input, { target: { value: name } });
  const buttons = screen.getAllByRole('button', { name: new RegExp(name) });
  fireEvent.click(buttons[0]);
};

describe('LogVisitModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<LogVisitModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the no-people error only after Save, and saves nothing', () => {
    render(<LogVisitModal {...baseProps} />);
    expect(screen.queryByText('Pick at least one person.')).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: /Log the visit/ });
    expect(save).not.toBeDisabled();

    fireEvent.click(save);
    expect(screen.getByText('Pick at least one person.')).toBeInTheDocument();
    expect(addVisit).not.toHaveBeenCalled();
  });

  it('searches for a person, adds them, and offers their place as the where', async () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    await waitFor(() => expect(screen.getByLabelText('Where')).toHaveValue('Whitman Hall'));
    expect(screen.getByRole('button', { name: /Remove Ama Osei/ })).toBeInTheDocument();
    expect(screen.getByText('⌘↵ to save')).toBeInTheDocument();
  });

  it('offers no where when two people live in different places', async () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    fireEvent.change(screen.getByPlaceholderText('Anyone else?'), { target: { value: 'Bo' } });
    fireEvent.click(screen.getByRole('button', { name: /Bo Chen/ }));
    await waitFor(() => expect(screen.getByLabelText('Where')).toHaveValue(''));
  });

  it('shows localized saving state when submit is processing', async () => {
    let resolveSave: () => void = () => {};
    (addVisit as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => { resolveSave = () => resolve('new-visit-id'); }),
    );

    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));

    expect(screen.getByRole('button', { name: /Saving…/ })).toBeInTheDocument();
    expect(screen.queryByText('modals.saving')).not.toBeInTheDocument();

    resolveSave();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });

  it('logs the visit with everyone on it and records the activity', async () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    fireEvent.change(screen.getByLabelText('How it went'), {
      target: { value: 'Sat on the floor and talked.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));

    await waitFor(() => expect(addVisit).toHaveBeenCalled());
    const [input, by] = (addVisit as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(input).toMatchObject({
      contactIds: ['c1'],
      contactNames: ['Ama Osei'],
      went: ['u1'],
      wentNames: ['Mei Tanaka'],
      where: 'Whitman Hall',
      how: 'Sat on the floor and talked.',
      followUp: '',
    });
    expect(by).toMatchObject({ uid: 'u1', name: 'Mei Tanaka' });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'logged a visit to', targetType: 'contact', targetId: 'c1', type: 'event' }),
    );
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('turns a follow-up into a to-do for whoever went, due in a week', async () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    fireEvent.click(screen.getByRole('button', { name: 'Nothing to chase' }));
    fireEvent.change(screen.getByLabelText('What to follow up'), {
      target: { value: 'Ask after her mum on Friday' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));

    await waitFor(() => expect(addTodo).toHaveBeenCalled());
    const [todo] = (addTodo as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(todo).toMatchObject({ title: 'Ask after her mum on Friday', assigneeId: 'u1', contactId: 'c1' });
    expect(todo.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((addVisit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].followUpTaskId).toBe('task-1');
    // The follow-up links back to the visit it came from (issue #336).
    await waitFor(() => expect(updateTodo).toHaveBeenCalledWith('task-1', expect.objectContaining({ source: expect.objectContaining({ interactionId: 'new-visit-id' }) })));
  });

  it('starts a prayer for the first person seen and links it to the visit', async () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    fireEvent.change(screen.getByLabelText(/A prayer that came out of it/), {
      target: { value: 'Peace for her dad' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));

    await waitFor(() => {
      // The fourth argument is the team flag: a visit prayer is the contact's own.
      expect(addPrayerBurden).toHaveBeenCalledWith('c1', 'Peace for her dad', expect.anything(), false);
    });
    // A visit prayer is the contact's own; it must not surface the person on
    // "On our hearts" (#1406).
    expect(unhidePrayerContact).not.toHaveBeenCalled();
    const input = (addVisit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.prayerId).toBe('prayer-1');
    // Kept on the visit too, so the card can read it back without going looking.
    expect(input.prayerBurden).toBe('Peace for her dad');
  });

  it('shows what was picked as a thumbnail, not just a filename', async () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    const file = new File(['x'], 'room.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('visit-photo-input'), { target: { files: [file] } });

    const thumb = await screen.findByAltText('Photo attachment 1');
    expect(thumb).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument();
  });

  it('shows a photo already on the visit, and drops it when removed', () => {
    const visit = {
      id: 'v1',
      date: '2026-08-10',
      contactIds: ['c1'],
      contactNames: ['Ama Osei'],
      went: ['u1'],
      wentNames: ['Mei Tanaka'],
      where: 'Whitman Hall',
      purpose: '',
      how: 'A long chat.',
      followUp: '',
      photos: [{ path: 'visits/v1/1.jpg', url: 'https://example.test/1.jpg', name: 'room.jpg' }],
      createdAt: '',
      createdById: 'u1',
      createdByName: 'Mei Tanaka',
    } as Visit;

    render(<LogVisitModal {...baseProps} visit={visit} />);
    expect(screen.getByAltText('room.jpg')).toHaveAttribute('src', 'https://example.test/1.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Remove room.jpg' }));
    expect(screen.queryByAltText('room.jpg')).not.toBeInTheDocument();
  });

  it('uploads photos only after the visit has somewhere to put them', async () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    const file = new File(['x'], 'room.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('visit-photo-input'), { target: { files: [file] } });
    expect(screen.getByText('1 photo — add more')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));
    await waitFor(() => expect(uploadVisitPhotos).toHaveBeenCalledWith('new-visit-id', [file]));
    expect(attachVisitPhotos).toHaveBeenCalledWith('new-visit-id', [
      { path: 'visits/x/1.jpg', url: 'u', name: 'room.jpg' },
    ]);
  });

  it('opens an existing visit for editing without re-asking for a prayer', () => {
    const visit = {
      id: 'v1',
      date: '2026-08-10',
      contactIds: ['c1'],
      contactNames: ['Ama Osei'],
      went: ['u2'],
      wentNames: ['Jordan Park'],
      where: 'Whitman Hall, room 214',
      purpose: 'She has been quiet',
      how: 'A long chat.',
      followUp: 'Ask after her mum',
      photos: [],
      createdAt: '',
      createdById: 'u1',
      createdByName: 'Mei Tanaka',
    } as Visit;

    render(<LogVisitModal {...baseProps} visit={visit} />);
    expect(screen.getByText('Edit a visit')).toBeInTheDocument();
    expect(screen.getByLabelText('Where')).toHaveValue('Whitman Hall, room 214');
    expect(screen.getByLabelText('How it went')).toHaveValue('A long chat.');
    // The edit state drops the Afterwards section — follow-up and prayer — and
    // names its action Save changes (#1446).
    expect(screen.queryByLabelText('What to follow up')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/A prayer that came out of it/)).not.toBeInTheDocument();
    expect(screen.queryByText('Afterwards')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save changes/ })).toBeInTheDocument();
  });

  it('saves an edit against the visit it opened, carrying the old people through', async () => {
    const visit = {
      id: 'v1',
      date: '2026-08-10',
      contactIds: ['c1', 'c2'],
      contactNames: ['Ama Osei', 'Bo Chen'],
      went: ['u1'],
      wentNames: ['Mei Tanaka'],
      where: 'Whitman Hall',
      purpose: '',
      how: 'A long chat.',
      followUp: '',
      photos: [],
      createdAt: '',
      createdById: 'u1',
      createdByName: 'Mei Tanaka',
    } as Visit;

    render(<LogVisitModal {...baseProps} visit={visit} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove Bo Chen/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(updateVisit).toHaveBeenCalled());
    const [id, previousIds, input] = (updateVisit as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('v1');
    expect(previousIds).toEqual(['c1', 'c2']);
    expect(input.contactIds).toEqual(['c1']);
    expect(addTodo).not.toHaveBeenCalled();
    expect(addPrayerBurden).not.toHaveBeenCalled();
  });

  it('pre-picks the person the nudge strip sent in', async () => {
    render(<LogVisitModal {...baseProps} initialContactId="c2" />);
    expect(screen.getByRole('button', { name: /Remove Bo Chen/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Where')).toHaveValue('Ridgewood House'));
  });

  it('prefills a home\'s people and place from a gap, and logs with its home id', async () => {
    const homes = [
      { id: 'h1', label: 'the Oseis', members: ['c1', 'c2'], place: 'Whitman Hall', active: true },
    ] as Home[];
    render(<LogVisitModal {...baseProps} homes={homes} initialHomeId="h1" />);
    expect(screen.getByRole('button', { name: /Remove Ama Osei/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Bo Chen/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Where')).toHaveValue('Whitman Hall');
    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));
    await waitFor(() => expect(addVisit).toHaveBeenCalled());
    const [input] = (addVisit as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(input.contactIds).toEqual(['c1', 'c2']);
    expect(input.homeId).toBe('h1');
    expect(input.where).toBe('Whitman Hall');
  });

  it('still logs a visit that maps to no home', async () => {
    render(<LogVisitModal {...baseProps} homes={[]} />);
    pick('Ama');
    await waitFor(() => expect(screen.getByLabelText('Where')).toHaveValue(''));
    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));
    await waitFor(() => expect(addVisit).toHaveBeenCalled());
    const [input] = (addVisit as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(input.homeId).toBeNull();
  });

  it('filters out non-person accounts from who went list (#366, #367)', () => {
    const staffWithNonPersons = [
      { uid: 'u1', displayName: 'Mei Tanaka' },
      { uid: 'u2', displayName: 'Jordan Park' },
      { uid: 'u3', displayName: 'App Store Reviewer' },
      { uid: 'u4', displayName: 'cisa-admin' },
      { uid: 'u5', displayName: 'reviewer' },
    ] as AppUser[];

    render(<LogVisitModal {...baseProps} staff={staffWithNonPersons} />);
    expect(screen.getByRole('button', { name: 'Mei Tanaka' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jordan Park' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'App Store Reviewer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cisa-admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'reviewer' })).not.toBeInTheDocument();
  });

  it('allows adding a new contact inline from the search dropdown (#369)', async () => {
    render(<LogVisitModal {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText('Start typing a name'), { target: { value: 'Kofi Mensah' } });

    const addBtn = screen.getByRole('button', { name: /Add Kofi Mensah — someone new/ });
    expect(addBtn).toBeInTheDocument();
    expect(screen.getByText('starts a record')).toBeInTheDocument();

    fireEvent.click(addBtn);

    await waitFor(() => expect(addDoc).toHaveBeenCalled());
    const [_, data] = (addDoc as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(data).toMatchObject({
      name: 'Kofi Mensah',
      stage: 'Contact',
      createdBy: 'u1',
      createdByName: 'Mei Tanaka',
    });
    // #1345: not written down as a 'Contact'; the kind is a Full-timer's call.
    expect(data).not.toHaveProperty('role');
    expect(data.tags).toContain('Fall 2026');
    expect(data.tags).toContain('visit');

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'created a new contact',
        targetId: 'c-new-123',
        targetName: 'Kofi Mensah',
        targetType: 'contact',
        type: 'create',
      }),
    );

    // Chosen contact chip is rendered
    expect(await screen.findByRole('button', { name: /Remove Kofi Mensah/ })).toBeInTheDocument();
    expect(screen.getByText('⌘↵ to save')).toBeInTheDocument();
  });

  it('labels the dialog by its title and moves focus in and back out (#1446)', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<LogVisitModal {...baseProps} />);
    const dialog = screen.getByRole('dialog', { name: 'Log a visit' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes at once when nothing has been typed (#1446)', () => {
    render(<LogVisitModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('asks before discarding when something has been typed, and keeps it on cancel (#1446)', () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('alertdialog', { name: 'Discard this visit?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Ama Osei/ })).toBeInTheDocument();
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it('asks before discarding on Escape when something has been typed (#1446)', () => {
    render(<LogVisitModal {...baseProps} />);
    pick('Ama');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('alertdialog', { name: 'Discard this visit?' })).toBeInTheDocument();
  });

  it('keeps everything typed after a failed save and retries on Try again (#1446)', async () => {
    (addVisit as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));

    render(<LogVisitModal {...baseProps} />);
    pick('Ama');
    fireEvent.change(screen.getByLabelText('How it went'), { target: { value: 'Talked on the porch.' } });
    fireEvent.click(screen.getByRole('button', { name: /Log the visit/ }));

    expect(await screen.findByText("Couldn't save — you're offline. Nothing was lost.")).toBeInTheDocument();
    expect(screen.getByLabelText('How it went')).toHaveValue('Talked on the porch.');
    expect(baseProps.onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(addVisit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });

  it('offers to start a home when nobody seen has one (#1448)', () => {
    const onAddHome = vi.fn();
    render(<LogVisitModal {...baseProps} homes={[]} onAddHome={onAddHome} />);
    pick('Ama');

    expect(screen.getByText(/Ama has no home yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add one' }));
    expect(onAddHome).toHaveBeenCalledWith(['c1']);
  });

  it('offers no home when the person seen already has one (#1448)', () => {
    const onAddHome = vi.fn();
    render(<LogVisitModal {...baseProps} onAddHome={onAddHome} />);
    pick('Ama');

    expect(screen.queryByText(/has no home yet/)).not.toBeInTheDocument();
    expect(onAddHome).not.toHaveBeenCalled();
  });

  it('shows the home and when it was last visited under the people seen (#1446)', async () => {
    const dated = [
      { id: 'c1', name: 'Ama Osei', location: 'Whitman Hall', lastContactedDate: '2026-08-04' },
    ] as Contact[];
    render(<LogVisitModal {...baseProps} contacts={dated} />);
    pick('Ama');

    expect(await screen.findByText(/last visited/)).toBeInTheDocument();
    expect(screen.getAllByText(/the Oseis/).length).toBeGreaterThan(0);
  });

  describe('on a phone, as a bottom sheet (#1447)', () => {
    beforeEach(() => (useMediaQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true));

    it('opens with a grabber, for both Log and Edit a visit', () => {
      const { unmount } = render(<LogVisitModal {...baseProps} />);
      expect(screen.getByRole('dialog', { name: 'Log a visit' })).toBeInTheDocument();
      expect(screen.getByTestId('popup-sheet-grabber')).toBeInTheDocument();
      unmount();

      const visit = {
        id: 'v1',
        date: '2026-08-10',
        contactIds: ['c1'],
        contactNames: ['Ama Osei'],
        went: ['u1'],
        wentNames: ['Mei Tanaka'],
        where: 'Whitman Hall',
        purpose: '',
        how: 'A chat.',
        followUp: '',
        photos: [],
        createdAt: '',
        createdById: 'u1',
        createdByName: 'Mei Tanaka',
      } as Visit;
      render(<LogVisitModal {...baseProps} visit={visit} />);
      expect(screen.getByRole('dialog', { name: 'Edit a visit' })).toBeInTheDocument();
      expect(screen.getByTestId('popup-sheet-grabber')).toBeInTheDocument();
    });

    it('dismisses at once by swipe when nothing has been typed', () => {
      render(<LogVisitModal {...baseProps} />);
      // The swipe is simulated by invoking the sheet's dismiss path (the
      // grabber), the same path drag-end routes through.
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(baseProps.onClose).toHaveBeenCalled();
    });

    it('asks before discarding on swipe when something has been typed, and keeps it on cancel', () => {
      render(<LogVisitModal {...baseProps} />);
      pick('Ama');

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.getByRole('alertdialog', { name: 'Discard this visit?' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Remove Ama Osei/ })).toBeInTheDocument();
      expect(baseProps.onClose).not.toHaveBeenCalled();
    });
  });
});

