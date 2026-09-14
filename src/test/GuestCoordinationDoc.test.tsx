import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import GuestCoordinationDoc from '../views/GuestCoordinationDoc';
import { connectGuestRtdb } from '../lib/guestCollab';

const h = vi.hoisted(() => ({
  params: { docId: 'doc-1' } as { docId?: string },
  key: 'sec_live_key' as string | null,
  config: null as any,
  editor: null as any,
  nullEditor: false,
  provider: null as any,
}));

vi.mock('react-router-dom', () => ({
  useParams: () => h.params,
  useSearchParams: () => [new URLSearchParams(h.key ? { key: h.key } : {})],
}));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ t: (_k: string, f?: string) => f ?? _k, language: 'en', isSpanish: false }),
}));

vi.mock('@tiptap/react', () => ({
  useEditor: (config: any) => {
    if (h.nullEditor) return null;
    h.config = config;
    h.editor = {
      isEmpty: true,
      isEditable: true,
      commands: { setContent: vi.fn() },
      storage: { markdown: { getMarkdown: () => '# live markdown' } },
      on: vi.fn(),
      off: vi.fn(),
    };
    return h.editor;
  },
  EditorContent: ({ editor }: { editor: any }) => (
    <div data-testid="editor-content" data-editable={editor?.isEditable ? 'true' : 'false'} />
  ),
}));

vi.mock('../lib/guestCollab', () => ({ connectGuestRtdb: vi.fn() }));

vi.mock('../lib/yjsRtdbProvider', () => ({
  RtdbYjsProvider: class {
    claimSeed = vi.fn().mockResolvedValue(true);
    destroy = vi.fn();
    constructor(args: any, docId: string, ydoc: any, opts: any) {
      h.provider = { args, docId, ydoc, opts, claimSeed: this.claimSeed, destroy: this.destroy };
    }
  },
}));

const viewPayload = () => ({
  doc: { id: 'doc-1', title: 'Wednesday care', date: '2026-09-14', audience: 'team', md: '# Agenda\n\n- [ ] Prayer\n- [x] Done' },
  permission: 'view',
});

const editPayload = (collabToken?: string) => ({
  doc: { id: 'doc-1', title: 'Wednesday care', date: '2026-09-14', audience: 'team', md: '# Agenda' },
  permission: 'edit',
  collabToken,
});

function stubFetch(body: any, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('GuestCoordinationDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.params = { docId: 'doc-1' };
    h.key = 'sec_live_key';
    h.config = null;
    h.editor = null;
    h.nullEditor = false;
    h.provider = null;
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading state while the key is being checked', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<GuestCoordinationDoc />);
    expect(screen.getByText('Loading the shared page...')).toBeTruthy();
  });

  it('renders a read-only page with locked checkboxes and no editor', async () => {
    const fetchMock = stubFetch(viewPayload());
    render(<GuestCoordinationDoc />);

    expect(await screen.findByText('Wednesday care')).toBeTruthy();
    expect(screen.getByText('Agenda')).toBeTruthy();
    expect(screen.getByText('Can view')).toBeTruthy();
    expect(screen.queryByTestId('editor-content')).toBeNull();

    const boxes = document.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    boxes.forEach((box) => expect((box as HTMLInputElement).disabled).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/guest-doc/doc-1?key=sec_live_key');
  });

  it('shows an empty-page message when the document has no markdown', async () => {
    stubFetch({ ...viewPayload(), doc: { ...viewPayload().doc, md: '' } });
    render(<GuestCoordinationDoc />);
    expect(await screen.findByText('This page is empty.')).toBeTruthy();
  });

  it('shows the revoked screen for a 404 and for a network failure', async () => {
    stubFetch({ error: 'unavailable' }, false);
    render(<GuestCoordinationDoc />);
    expect(await screen.findByText('Link expired or access revoked')).toBeTruthy();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<GuestCoordinationDoc />);
    expect(await screen.findAllByText('Link expired or access revoked')).toBeTruthy();
  });

  it('shows the revoked screen when the route has no doc id', async () => {
    h.params = {};
    stubFetch(viewPayload());
    render(<GuestCoordinationDoc />);
    expect(await screen.findByText('Link expired or access revoked')).toBeTruthy();
  });

  it('prompts for a name before an edit session starts', async () => {
    stubFetch(editPayload());
    render(<GuestCoordinationDoc />);

    expect(await screen.findByText('What should we call you?')).toBeTruthy();
    expect(screen.queryByTestId('editor-content')).toBeNull();

    const join = screen.getByRole('button', { name: 'Join' });
    expect((join as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Pastor John' } });
    fireEvent.click(join);

    expect(screen.getByText('Collaborating as: Pastor John')).toBeTruthy();
    expect(screen.getByTestId('editor-content').getAttribute('data-editable')).toBe('true');
    expect(localStorage.getItem('cisa_guest_name')).toBe('Pastor John');
  });

  it('remembers a previously chosen display name', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    stubFetch(editPayload());
    render(<GuestCoordinationDoc />);
    expect(await screen.findByText('Collaborating as: Ana')).toBeTruthy();
  });

  it('seeds the local editor from the page when there is no live session', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    stubFetch(editPayload());
    render(<GuestCoordinationDoc />);
    await screen.findByTestId('editor-content');
    await waitFor(() => expect(h.editor.commands.setContent).toHaveBeenCalledWith('# Agenda'));
    expect(connectGuestRtdb).not.toHaveBeenCalled();
  });

  it('joins the live RTDB session and seeds once it owns the seed', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    stubFetch(editPayload('collab-token'));
    (connectGuestRtdb as any).mockResolvedValue({ __db: true });
    render(<GuestCoordinationDoc />);
    await screen.findByTestId('editor-content');

    await waitFor(() => expect(h.provider).toBeTruthy());
    expect(connectGuestRtdb).toHaveBeenCalledWith('collab-token');
    expect(h.provider.docId).toBe('doc-1');
    expect(h.provider.opts.awareness).toBeTruthy();

    await act(async () => {
      await h.provider.opts.onSynced(false);
    });
    expect(h.provider.claimSeed).toHaveBeenCalled();
    expect(h.editor.commands.setContent).toHaveBeenCalledWith('# Agenda');
  });

  it('seeds locally when the live session is degraded or cannot connect', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    stubFetch(editPayload('collab-token'));
    (connectGuestRtdb as any).mockResolvedValueOnce({ __db: true });
    const first = render(<GuestCoordinationDoc />);
    await screen.findByTestId('editor-content');
    await waitFor(() => expect(h.provider).toBeTruthy());
    await act(async () => {
      await h.provider.opts.onSynced(true);
    });
    expect(h.editor.commands.setContent).toHaveBeenCalledWith('# Agenda');
    first.unmount();

    h.provider = null;
    h.editor = null;
    h.config = null;
    (connectGuestRtdb as any).mockRejectedValueOnce(new Error('no rtdb'));
    render(<GuestCoordinationDoc />);
    await screen.findByTestId('editor-content');
    await waitFor(() => expect(h.editor.commands.setContent).toHaveBeenCalledWith('# Agenda'));
  });

  it('saves edits back to the server with the key and display name', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    const fetchMock = stubFetch(editPayload());
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => editPayload() });
    render(<GuestCoordinationDoc />);
    await screen.findByTestId('editor-content');

    await act(async () => {
      h.config.onUpdate({ editor: h.editor, transaction: { docChanged: true } });
    });
    await waitFor(
      () => {
        const post = fetchMock.mock.calls.find((c: any[]) => (c[1] as RequestInit | undefined)?.method === 'POST');
        expect(post).toBeTruthy();
        const init = (post as any[])[1] as RequestInit;
        expect(JSON.parse(init.body as string)).toEqual({
          key: 'sec_live_key',
          md: '# live markdown',
          name: 'Ana',
        });
      },
      { timeout: 2000 },
    );
  });

  it('ignores updates that did not change the document', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    const fetchMock = stubFetch(editPayload());
    render(<GuestCoordinationDoc />);
    await screen.findByTestId('editor-content');
    act(() => {
      h.config.onUpdate({ editor: h.editor, transaction: { docChanged: false } });
    });
    await new Promise((r) => setTimeout(r, 900));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders nothing fatal if the editor has not mounted yet', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    h.nullEditor = true;
    stubFetch(editPayload('collab-token'));
    render(<GuestCoordinationDoc />);
    expect(await screen.findByTestId('editor-content')).toBeTruthy();
    expect(h.provider).toBeNull();
  });

  it('drops a live edit session when the link is revoked', async () => {
    localStorage.setItem('cisa_guest_name', 'Ana');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => editPayload('collab-token') })
      .mockResolvedValue({ ok: false, json: async () => ({ error: 'unavailable' }) });
    vi.stubGlobal('fetch', fetchMock);
    (connectGuestRtdb as any).mockResolvedValue({ __db: true });
    render(<GuestCoordinationDoc />);
    await screen.findByTestId('editor-content');
    await waitFor(() => expect(h.provider).toBeTruthy());

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Link expired or access revoked')).toBeTruthy();
    expect(h.provider.destroy).toHaveBeenCalled();
  });

});
