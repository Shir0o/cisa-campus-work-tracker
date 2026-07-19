import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { remove as dbRemove } from 'firebase/database';
import { signInWithCustomToken } from 'firebase/auth';
import EmbedCoordinationDoc from '../views/EmbedCoordinationDoc';
import { useAuth } from '../components/AuthProvider';
import { logActivity } from '../lib/firebase';

const mockUseParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => mockUseParams(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_rtdb: unknown, path: string) => ({ path })),
  remove: vi.fn(() => Promise.resolve()),
}));

let docSnapshotCallback: ((snap: any) => void) | null = null;
let usersSnapshotCallback: ((snap: any) => void) | null = null;
let contactsSnapshotCallback: ((snap: any) => void) | null = null;

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: any[]) => {
    // The 1-arg overload (auto-id within a collection) — used by addNote.
    if (args.length === 1 && args[0]?.__type === 'collRef') {
      return { __type: 'docRef', path: `${args[0].path}/auto-id`, id: 'auto-id' };
    }
    const [, coll, id] = args;
    return { __type: 'docRef', path: `${coll}/${id}`, id };
  }),
  collection: vi.fn((_db: unknown, path: string) => ({ __type: 'collRef', path })),
  onSnapshot: vi.fn((ref: any, onNext: (snap: any) => void) => {
    if (ref.__type === 'docRef') {
      docSnapshotCallback = onNext;
    } else if (ref.path === 'contacts') {
      contactsSnapshotCallback = onNext;
    } else {
      usersSnapshotCallback = onNext;
    }
    return vi.fn();
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
  rtdb: {},
  handleFirestoreError: vi.fn(),
  OperationType: { GET: 'GET', LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE', CREATE: 'CREATE' },
  logActivity: vi.fn(),
}));

vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: (props: any) =>
    props.isOpen ? <div data-testid="contact-modal">{props.contact?.name}</div> : null,
}));

vi.mock('../views/CoordinationNotes', () => ({
  DocEditor: (props: any) => (
    <div data-testid="doc-editor">
      <div data-testid="doc-title">{props.doc.title}</div>
      <div data-testid="me-uid">{props.meUid}</div>
      <div data-testid="team-count">{props.team.length}</div>
      <div data-testid="contacts-count">{props.contacts.length}</div>
      <button onClick={() => props.onSaveMarkdown(props.doc.id, 'new markdown')}>save-markdown</button>
      <button onClick={() => props.onSaveTitle(props.doc.id, 'new title')}>save-title</button>
      <button onClick={() => props.onSaveAudience(props.doc.id, 'everyone')}>save-audience</button>
      <button onClick={() => props.onDelete(props.doc)}>delete-doc</button>
      <button onClick={() => props.onPromote(props.doc)}>promote-doc</button>
      <button
        onClick={() => {
          props.onSelectContact({ id: 'c1', name: 'Test Contact' });
          props.onOpenContactModal(true);
        }}
      >
        select-contact
      </button>
    </div>
  ),
  NoteForm: (props: any) => (
    <div data-testid="note-form">
      <div data-testid="note-form-series">{props.initial?.series}</div>
      <div data-testid="note-form-title">{props.initial?.title}</div>
      <button onClick={props.onCancel}>cancel-note</button>
      <button
        onClick={() => props.onSave({ type: 'record', series: 'Team', title: 'Saved title', body: 'Saved body', tags: [] })}
      >
        save-note
      </button>
    </div>
  ),
  guessSeries: vi.fn(() => 'mock-series'),
  mdExcerpt: vi.fn(() => 'mock-excerpt'),
}));

function mockAuthState(overrides: Partial<{ user: any; isAdmin: boolean; loading: boolean }>) {
  (useAuth as any).mockReturnValue({
    user: null,
    isAdmin: false,
    loading: false,
    ...overrides,
  });
}

const openDoc = () =>
  act(() =>
    docSnapshotCallback!({
      exists: () => true,
      id: 'demo-board-team',
      data: () => ({ title: 'Wednesday care', md: '# hi' }),
    }),
  );

describe('EmbedCoordinationDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docSnapshotCallback = null;
    usersSnapshotCallback = null;
    contactsSnapshotCallback = null;
    mockUseParams.mockReturnValue({ docId: 'demo-board-team' });
    delete (window as any).__CISA_CUSTOM_TOKEN__;
  });

  afterEach(() => {
    delete (window as any).__CISA_CUSTOM_TOKEN__;
  });

  it('shows "Missing doc id." when no docId param is present', () => {
    mockUseParams.mockReturnValue({});
    mockAuthState({ loading: true });
    render(<EmbedCoordinationDoc />);
    expect(screen.getByText('Missing doc id.')).toBeInTheDocument();
  });

  it('shows "Signing in…" while unauthenticated and no token has been injected', () => {
    mockAuthState({ user: null, loading: false });
    render(<EmbedCoordinationDoc />);
    expect(screen.getByText('Signing in…')).toBeInTheDocument();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('exchanges an injected custom token via signInWithCustomToken', async () => {
    window.__CISA_CUSTOM_TOKEN__ = 'fake-custom-token';
    mockAuthState({ user: null, loading: false });
    render(<EmbedCoordinationDoc />);
    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledWith({}, 'fake-custom-token'));
  });

  it('shows a sign-in failure message when the custom token exchange rejects', async () => {
    window.__CISA_CUSTOM_TOKEN__ = 'bad-token';
    (signInWithCustomToken as any).mockReturnValueOnce(Promise.reject(new Error('invalid-custom-token')));
    mockAuthState({ user: null, loading: false });
    render(<EmbedCoordinationDoc />);
    expect(await screen.findByText('Sign-in failed: invalid-custom-token')).toBeInTheDocument();
  });

  it('shows "Admin access required." for a signed-in non-admin user', () => {
    mockAuthState({ user: { uid: 'u1' }, isAdmin: false, loading: false });
    render(<EmbedCoordinationDoc />);
    expect(screen.getByText('Admin access required.')).toBeInTheDocument();
  });

  it('does not subscribe to contacts for a non-admin', () => {
    mockAuthState({ user: { uid: 'u1' }, isAdmin: false, loading: false });
    render(<EmbedCoordinationDoc />);
    expect(contactsSnapshotCallback).toBeNull();
  });

  it('shows "Loading document…" for an admin before the doc snapshot resolves', () => {
    mockAuthState({ user: { uid: 'u1' }, isAdmin: true, loading: false });
    render(<EmbedCoordinationDoc />);
    expect(screen.getByText('Loading document…')).toBeInTheDocument();
  });

  it('shows "Document not found." when the board_docs snapshot reports no doc', () => {
    mockAuthState({ user: { uid: 'u1' }, isAdmin: true, loading: false });
    render(<EmbedCoordinationDoc />);
    act(() => docSnapshotCallback!({ exists: () => false }));
    expect(screen.getByText('Document not found.')).toBeInTheDocument();
  });

  it('renders DocEditor with the live doc + team once both snapshots resolve', () => {
    mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
    render(<EmbedCoordinationDoc />);

    openDoc();
    act(() =>
      usersSnapshotCallback!({
        docs: [
          { id: 'u1', data: () => ({ displayName: 'Tony Wang', approved: true }) },
          { id: 'u2', data: () => ({ displayName: 'Ana', approved: false }) },
        ],
      }),
    );

    expect(screen.getByTestId('doc-title')).toHaveTextContent('Wednesday care');
    expect(screen.getByTestId('me-uid')).toHaveTextContent('u1');
    // The unapproved teammate (u2) is filtered out.
    expect(screen.getByTestId('team-count')).toHaveTextContent('1');
  });

  it('passes live contacts to DocEditor (admin-only subscription)', () => {
    mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
    render(<EmbedCoordinationDoc />);
    openDoc();

    act(() => contactsSnapshotCallback!({ docs: [{ id: 'c1', data: () => ({ name: 'Ana' }) }] }));

    expect(screen.getByTestId('contacts-count')).toHaveTextContent('1');
  });

  it('wires onSaveMarkdown/onSaveTitle/onSaveAudience to updateDoc', () => {
    mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
    render(<EmbedCoordinationDoc />);
    openDoc();

    fireEvent.click(screen.getByText('save-markdown'));
    fireEvent.click(screen.getByText('save-title'));
    fireEvent.click(screen.getByText('save-audience'));

    expect(updateDoc).toHaveBeenCalledTimes(3);
    const [, markdownPatch] = (updateDoc as any).mock.calls[0];
    expect(markdownPatch).toMatchObject({ md: 'new markdown', updatedBy: 'u1', updatedByName: 'Tony Wang' });
    const [, titlePatch] = (updateDoc as any).mock.calls[1];
    expect(titlePatch).toMatchObject({ title: 'new title' });
    const [, audiencePatch] = (updateDoc as any).mock.calls[2];
    expect(audiencePatch).toMatchObject({ audience: 'everyone' });
  });

  it('wires onSelectContact/onOpenContactModal to ContactDetailsModal', () => {
    mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
    render(<EmbedCoordinationDoc />);
    openDoc();

    expect(screen.queryByTestId('contact-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('select-contact'));
    expect(screen.getByTestId('contact-modal')).toHaveTextContent('Test Contact');
  });

  describe('delete', () => {
    it('deletes the doc and best-effort cleans up its RTDB node when confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
      render(<EmbedCoordinationDoc />);
      openDoc();

      fireEvent.click(screen.getByText('delete-doc'));

      await waitFor(() => expect(deleteDoc).toHaveBeenCalled());
      expect(dbRemove).toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('does nothing when the confirm dialog is dismissed', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
      render(<EmbedCoordinationDoc />);
      openDoc();

      fireEvent.click(screen.getByText('delete-doc'));

      expect(deleteDoc).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe('promote to archive', () => {
    it('opens the note form prefilled via guessSeries/mdExcerpt, and saving writes board_notes + logs activity', async () => {
      mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
      render(<EmbedCoordinationDoc />);
      openDoc();

      expect(screen.queryByTestId('note-form')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('promote-doc'));
      expect(screen.getByTestId('note-form-series')).toHaveTextContent('mock-series');
      expect(screen.getByTestId('note-form-title')).toHaveTextContent('Wednesday care');

      fireEvent.click(screen.getByText('save-note'));

      await waitFor(() => expect(setDoc).toHaveBeenCalled());
      const [, notePayload] = (setDoc as any).mock.calls[0];
      expect(notePayload).toMatchObject({
        title: 'Saved title',
        body: 'Saved body',
        sessionId: 'demo-board-team',
        contributorIds: ['u1'],
      });
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'saved a record' }));
      expect(screen.queryByTestId('note-form')).not.toBeInTheDocument();
    });

    it('closes the note form on cancel without writing', () => {
      mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
      render(<EmbedCoordinationDoc />);
      openDoc();

      fireEvent.click(screen.getByText('promote-doc'));
      fireEvent.click(screen.getByText('cancel-note'));

      expect(screen.queryByTestId('note-form')).not.toBeInTheDocument();
      expect(setDoc).not.toHaveBeenCalled();
    });
  });
});
