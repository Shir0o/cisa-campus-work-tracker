// The guest surface for a coordination doc (issue #1023). Reached at
// /c/:docId?key=... with no account and no app install, and deliberately
// outside the authenticated shell: it renders the one shared page and nothing
// else - no nav rail, no contacts, no threads. The server is the only source of
// the page payload, and the key in the URL is checked against the doc's stored
// capability on every read and write.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Check, Globe, Link2, Loader2, Lock, Pencil, Users } from 'lucide-react';
import { RtdbYjsProvider } from '../lib/yjsRtdbProvider';
import { connectGuestRtdb } from '../lib/guestCollab';
import { colorFor } from '../lib/presence';
import { useLanguage } from '../components/LanguageProvider';
import { BOARD_AUDIENCE, dateLabelOf, weekdayOf, type Audience, type GuestPermission } from '../lib/board';

interface GuestDocPayload {
  doc: { id: string; title: string; date: string; audience: Audience; md: string };
  permission: GuestPermission;
  collabToken?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; payload: GuestDocPayload };

const GUEST_NAME_KEY = 'cisa_guest_name';
const AUDIENCE_ICON = { team: Lock, trainees: Users, everyone: Globe } as const;
type Translate = (key: string, fallback?: string) => string;

export default function GuestCoordinationDoc() {
  const { docId } = useParams<{ docId: string }>();
  const [searchParams] = useSearchParams();
  const guestKey = searchParams.get('key') || '';
  const { t } = useLanguage();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState<string>(() => {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(GUEST_NAME_KEY) || '';
  });

  useEffect(() => {
    if (!docId) return;
    let alive = true;
    fetch(`/api/guest-doc/${encodeURIComponent(docId)}?key=${encodeURIComponent(guestKey)}`)
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) {
          setState({ status: 'unavailable' });
          return;
        }
        const payload = (await res.json()) as GuestDocPayload;
        if (alive) setState({ status: 'ready', payload });
      })
      .catch(() => {
        if (alive) setState({ status: 'unavailable' });
      });
    return () => {
      alive = false;
    };
  }, [docId, guestKey]);

  const join = (chosen: string) => {
    const trimmed = chosen.trim().slice(0, 80);
    if (!trimmed) return;
    try {
      localStorage.setItem(GUEST_NAME_KEY, trimmed);
    } catch {
      // Private mode: keep the name for this session only.
    }
    setName(trimmed);
  };

  if (!docId) return <GuestStatus t={t} kind="unavailable" />;
  if (state.status === 'loading') return <GuestStatus t={t} kind="loading" />;
  if (state.status === 'unavailable') return <GuestStatus t={t} kind="unavailable" />;

  const { doc, permission, collabToken } = state.payload;
  if (permission === 'edit' && !name) {
    return <GuestNameGate t={t} doc={doc} onJoin={join} />;
  }
  if (permission === 'edit') {
    return <GuestEditor t={t} docId={docId} guestKey={guestKey} doc={doc} name={name} collabToken={collabToken} />;
  }
  return <GuestReader doc={doc} t={t} />;
}

function GuestStatus({ t, kind }: { t: Translate; kind: 'loading' | 'unavailable' }) {
  return (
    <div className="min-h-screen bg-background text-on-surface flex items-center justify-center px-6 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface p-6 text-center">
        {kind === 'loading' ? (
          <>
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-on-surface-variant" aria-hidden />
            <p className="mt-3 text-sm text-on-surface-variant">{t('guest.loading', 'Loading the shared page...')}</p>
          </>
        ) : (
          <>
            <Lock className="w-6 h-6 mx-auto text-on-surface-variant" aria-hidden />
            <h1 className="mt-3 font-serif text-xl text-on-surface">{t('guest.unavailable_title', 'Link expired or access revoked')}</h1>
            <p className="mt-2 text-sm text-on-surface-variant">{t('guest.unavailable_body', 'Ask the person who shared the link for a new one.')}</p>
          </>
        )}
      </div>
    </div>
  );
}

function GuestHeader({ t, doc, mode }: { t: Translate; doc: GuestDocPayload['doc']; mode: 'view' | 'edit' }) {
  const Icon = AUDIENCE_ICON[doc.audience];
  const audienceLabel = t(`coordination.audience_${doc.audience}`, BOARD_AUDIENCE[doc.audience].label);
  const when = doc.date ? `${weekdayOf(doc.date)}, ${dateLabelOf(doc.date)}` : '';
  return (
    <header className="border-b border-outline-variant/60 bg-surface">
      <div className="mx-auto max-w-3xl px-5 py-5">
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" aria-hidden />
            {t('guest.shared_page', 'Shared page')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {mode === 'edit' ? <Pencil className="w-3.5 h-3.5" aria-hidden /> : <Lock className="w-3.5 h-3.5" aria-hidden />}
            {mode === 'edit' ? t('guest.can_edit', 'Can edit') : t('guest.can_view', 'Can view')}
          </span>
        </div>
        <h1 className="mt-2 font-serif text-2xl sm:text-3xl font-medium tracking-tight text-on-surface leading-tight">
          {doc.title || t('guest.untitled', 'Untitled page')}
        </h1>
        <div className="mt-2 flex items-center gap-3 text-[13px] text-on-surface-variant">
          {when && <span>{when}</span>}
          <span className="inline-flex items-center gap-1">
            <Icon className="w-3.5 h-3.5" aria-hidden />
            {audienceLabel}
          </span>
        </div>
      </div>
    </header>
  );
}

// Read-only markdown. Checkbox inputs are forced disabled so a viewer cannot
// tick off the team's tasks by clicking the rendered list.
const GUEST_MD: Components = {
  h1: ({ children }) => <h2 className="font-serif text-2xl text-on-surface mt-6 mb-2 first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="font-serif text-xl text-on-surface mt-5 mb-2">{children}</h3>,
  h3: ({ children }) => <h4 className="font-semibold text-on-surface mt-4 mb-1.5">{children}</h4>,
  p: ({ children }) => <p className="text-[15px] text-on-surface-variant leading-relaxed my-2">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={className?.includes('contains-task-list') ? 'my-2 space-y-1 list-none pl-1' : 'my-2 space-y-1 pl-5 text-[15px] text-on-surface-variant'}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="pl-5 my-2 space-y-1 text-[15px] text-on-surface-variant">{children}</ol>,
  li: ({ children, className }) => <li className={className?.includes('task-list-item') ? 'list-none flex items-start gap-2' : 'leading-relaxed'}>{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-stage-accent underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-on-surface">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-stage-accent/40 pl-3 my-3 text-on-surface-variant/90 italic">{children}</blockquote>,
  code: ({ children }) => <code className="bg-surface-variant rounded px-1 py-0.5 text-[13px]">{children}</code>,
  input: ({ checked }) => <input type="checkbox" checked={checked === true} disabled readOnly className="mt-0.5 accent-stage-accent" />,
};

function GuestReader({ doc, t }: { doc: GuestDocPayload['doc']; t: Translate }) {
  return (
    <div className="min-h-screen bg-background text-on-surface font-sans">
      <GuestHeader t={t} doc={doc} mode="view" />
      <main className="mx-auto max-w-3xl px-5 py-6 pb-24">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={GUEST_MD}>
          {doc.md || t('guest.empty_page', 'This page is empty.')}
        </ReactMarkdown>
      </main>
    </div>
  );
}

function GuestNameGate({ t, doc, onJoin }: { t: Translate; doc: GuestDocPayload['doc']; onJoin: (name: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="min-h-screen bg-background text-on-surface font-sans">
      <GuestHeader t={t} doc={doc} mode="edit" />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onJoin(value);
          }}
          className="rounded-2xl border border-outline-variant bg-surface p-6"
        >
          <h2 className="font-serif text-xl text-on-surface">{t('guest.name_title', 'What should we call you?')}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{t('guest.name_body', 'Your name appears next to your cursor while you edit.')}</p>
          <div className="mt-4 flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('guest.name_placeholder', 'Your name')}
              aria-label={t('guest.name_placeholder', 'Your name')}
              autoFocus
              className="flex-1 rounded-lg border border-outline-variant bg-background px-3 py-2 text-sm outline-none focus:border-stage-accent"
            />
            <button type="submit" className="rounded-lg bg-stage-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50" disabled={!value.trim()}>
              {t('guest.name_join', 'Join')}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function GuestEditor({
  t,
  docId,
  guestKey,
  doc,
  name,
  collabToken,
}: {
  t: Translate;
  docId: string;
  guestKey: string;
  doc: GuestDocPayload['doc'];
  name: string;
  collabToken?: string;
}) {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const meColor = useMemo(() => colorFor(name), [name]);
  // One uid per guest tab so two guests (both 'guest' to the server) do not
  // collapse into one presence face in the Full-timer's editor. Yjs mints a
  // random clientID per session, so it is already the tab's identity.
  const guestUid = `guest_${awareness.clientID}`;
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSeed = useRef(false);
  const [revoked, setRevoked] = useState(false);

  const persist = (md: string) => {
    setSaveState('saving');
    fetch(`/api/guest-doc/${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: guestKey, md, name }),
    })
      .then((res) => setSaveState(res.ok ? 'saved' : 'error'))
      .catch(() => setSaveState('error'));
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Markdown.configure({ html: false, tightLists: true, linkify: true, transformPastedText: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: t('guest.placeholder', 'Write the page...') }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider: { awareness }, user: { uid: guestUid, name, color: meColor } }),
    ],
    editorProps: { attributes: { class: 'bdoc-prose outline-none min-h-[40vh]', spellcheck: 'false' } },
    onUpdate: ({ editor: ed, transaction }) => {
      if (!transaction.docChanged) return;
      const md = (ed.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(md), 800);
    },
  });

  // Join the live Yjs session when the server handed us a scoped token. With no
  // token (or no RTDB) the guest still edits, just without live sync.
  useEffect(() => {
    if (!editor || revoked) return;
    const seed = () => {
      if (editor.isEmpty && doc.md) editor.commands.setContent(doc.md);
    };
    if (!collabToken) {
      seed();
      return;
    }
    let destroyed = false;
    let provider: RtdbYjsProvider | null = null;
    connectGuestRtdb(collabToken)
      .then((db) => {
        if (destroyed) return;
        if (!db) {
          seed();
          return;
        }
        provider = new RtdbYjsProvider(db, docId, ydoc, {
          awareness,
          onSynced: async (degraded) => {
            if (degraded) {
              seed();
              return;
            }
            if (didSeed.current) return;
            didSeed.current = true;
            const mine = await provider?.claimSeed();
            if (mine) seed();
          },
        });
      })
      .catch(() => {
        if (!destroyed) seed();
      });
    return () => {
      destroyed = true;
      provider?.destroy();
    };
  }, [editor, collabToken, docId, ydoc, awareness, doc.md, revoked]);

  // A live edit session outlives the request that started it, and RTDB rules
  // cannot see a Firestore revocation. Re-check the key on focus and on a slow
  // timer, and tear the session down as soon as the server says it is gone.
  useEffect(() => {
    let alive = true;
    const check = () => {
      fetch(`/api/guest-doc/${encodeURIComponent(docId)}?key=${encodeURIComponent(guestKey)}`)
        .then((res) => {
          if (alive && res.ok === false) setRevoked(true);
        })
        .catch(() => {});
    };
    const timer = setInterval(check, 45000);
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [docId, guestKey]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (revoked) return <GuestStatus t={t} kind="unavailable" />;

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans">
      <GuestHeader t={t} doc={doc} mode="edit" />
      <div className="mx-auto max-w-3xl px-5 pt-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" aria-hidden />
            {t('guest.collaborating_as', 'Collaborating as: {name}').replace('{name}', name)}
          </span>
          <span aria-live="polite" className="inline-flex items-center gap-1">
            {saveState === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
            {saveState === 'saved' && <Check className="w-3.5 h-3.5 text-stage-teal" aria-hidden />}
            {saveState === 'saving' && t('guest.saving', 'Saving...')}
            {saveState === 'saved' && t('guest.saved', 'Saved')}
            {saveState === 'error' && t('guest.save_failed', 'Could not save')}
          </span>
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-5 py-4 pb-24">
        <EditorContent editor={editor} />
      </main>
    </div>
  );
}
