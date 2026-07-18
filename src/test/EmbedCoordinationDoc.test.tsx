import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateDoc } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import EmbedCoordinationDoc from '../views/EmbedCoordinationDoc';
import { useAuth } from '../components/AuthProvider';

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

let docSnapshotCallback: ((snap: any) => void) | null = null;
let usersSnapshotCallback: ((snap: any) => void) | null = null;

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ __type: 'docRef', path: `${coll}/${id}`, id })),
  collection: vi.fn((_db: unknown, path: string) => ({ __type: 'collRef', path })),
  onSnapshot: vi.fn((ref: any, onNext: (snap: any) => void) => {
    if (ref.__type === 'docRef') {
      docSnapshotCallback = onNext;
    } else {
      usersSnapshotCallback = onNext;
    }
    return vi.fn();
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { GET: 'GET', LIST: 'LIST', UPDATE: 'UPDATE' },
}));

vi.mock('../views/CoordinationNotes', () => ({
  DocEditor: (props: any) => (
    <div data-testid="doc-editor">
      <div data-testid="doc-title">{props.doc.title}</div>
      <div data-testid="me-uid">{props.meUid}</div>
      <div data-testid="team-count">{props.team.length}</div>
      <button onClick={() => props.onSaveMarkdown(props.doc.id, 'new markdown')}>save-markdown</button>
      <button onClick={() => props.onSaveTitle(props.doc.id, 'new title')}>save-title</button>
      <button onClick={() => props.onSaveAudience(props.doc.id, 'everyone')}>save-audience</button>
    </div>
  ),
}));

function mockAuthState(overrides: Partial<{ user: any; isAdmin: boolean; loading: boolean }>) {
  (useAuth as any).mockReturnValue({
    user: null,
    isAdmin: false,
    loading: false,
    ...overrides,
  });
}

describe('EmbedCoordinationDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docSnapshotCallback = null;
    usersSnapshotCallback = null;
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

    act(() =>
      docSnapshotCallback!({
        exists: () => true,
        id: 'demo-board-team',
        data: () => ({ title: 'Wednesday care', md: '# hi' }),
      }),
    );
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

  it('wires onSaveMarkdown/onSaveTitle/onSaveAudience to updateDoc', () => {
    mockAuthState({ user: { uid: 'u1', displayName: 'Tony Wang' }, isAdmin: true, loading: false });
    render(<EmbedCoordinationDoc />);
    act(() =>
      docSnapshotCallback!({
        exists: () => true,
        id: 'demo-board-team',
        data: () => ({ title: 'Wednesday care', md: '# hi' }),
      }),
    );

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
});
