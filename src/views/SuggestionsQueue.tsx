import { useMemo, useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { CalendarClock, Check, Loader2, Search, Timer, TriangleAlert, UserX, X } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { UndoSnackbar } from '../components/UndoSnackbar';
import { useUndoSnack } from '../hooks/useUndoSnack';
import { isAppOwner } from '../lib/permissions';
import { contactVisibilityConstraints } from '../lib/contactQueries';
import { db } from '../lib/firebase';
import {
  assignContactToSuggestions,
  buildSuggestionQueue,
  confirmSuggestion,
  dismissSuggestion,
  findSameDayInteraction,
  formatDurationMinutes,
  markNotACisaPerson,
  mediumToType,
  subscribeContactInteractions,
  subscribePendingSuggestions,
  subscribeSuggestionLinks,
  undoSuggestionDismiss,
  undoNotACisaPerson,
  type InteractionSuggestion,
  type QueuedSuggestion,
  type SuggestionMatchBasis,
  type WhoIsThisGroup,
} from '../lib/bnpb';
import type { Contact, Interaction } from '../types';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function monthLabel(month: string, isSpanish: boolean): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
    isSpanish ? 'es' : 'en-US',
    { month: 'long', year: 'numeric' },
  );
}

function Badge({ basis }: { basis: SuggestionMatchBasis }) {
  const { t } = useLanguage();
  if (basis === 'remembered') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-medium">
        {t('bnpb.badge_remembered')}
      </span>
    );
  }
  if (basis === 'exact') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-[11px] font-medium">
        {t('bnpb.badge_exact')}
      </span>
    );
  }
  if (basis === 'guess') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-warning-container text-warning text-[11px] font-medium">
        {t('bnpb.badge_guess')}
      </span>
    );
  }
  return null;
}

/** The owner picks a Contact by hand; the picker never creates one. */
function ContactPicker({
  contacts,
  onPick,
}: {
  contacts: Contact[];
  onPick: (contact: Contact) => void;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pool = term
      ? contacts.filter((c) => c.name.toLowerCase().includes(term))
      : contacts.slice().sort((a, b) => a.name.localeCompare(b.name));
    return pool.slice(0, 8);
  }, [contacts, search]);

  return (
    <div className="mt-3">
      <label className="block">
        <span className="text-[12px] font-medium text-on-surface-variant">
          {t('bnpb.queue_pick_contact')}
        </span>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('bnpb.queue_search_contacts')}
            className="w-full pl-9 pr-3 py-2 rounded-2xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary"
          />
        </div>
      </label>
      {matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="px-2.5 py-1 rounded-full text-[12px] border border-outline-variant/50 text-on-surface-variant hover:bg-surface"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[12px] text-on-surface-variant">
        {t('bnpb.queue_pick_people_hint')}{' '}
        <Link to="/directory" className="text-primary underline">
          {t('bnpb.queue_pick_people_link')}
        </Link>
      </p>
    </div>
  );
}

function SuggestionRow({
  item,
  contacts,
  onDismiss,
  onNotACisaPerson,
  onChoose,
}: {
  item: QueuedSuggestion;
  contacts: Contact[];
  onDismiss: (suggestion: InteractionSuggestion) => void;
  onNotACisaPerson: (bnpbContactId: string) => void;
  onChoose: (suggestionIds: string[], contactId: string) => void;
}) {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const { suggestion, basis } = item;
  const [picked, setPicked] = useState<Contact | null>(null);
  const [picking, setPicking] = useState(false);
  const [sameDay, setSameDay] = useState<Interaction | null>(null);
  const [text, setText] = useState(suggestion.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contact = picked ?? item.contact;

  useEffect(() => {
    if (!contact || !user) {
      setSameDay(null);
      return;
    }
    return subscribeContactInteractions(
      contact.id,
      (list) => setSameDay(findSameDayInteraction(list, user.uid, suggestion.occurredAt)),
      (e) => console.error('suggestion same-day subscription error', e),
    );
  }, [contact, user, suggestion.occurredAt]);

  const mappedType = mediumToType(suggestion.medium);
  const duration = formatDurationMinutes(suggestion.durationMinutes);

  const choose = (c: Contact) => {
    setPicked(c);
    setPicking(false);
    onChoose([suggestion.id], c.id);
  };

  const confirm = async () => {
    if (!user || !contact) return;
    setBusy(true);
    setError(null);
    try {
      await confirmSuggestion({
        uid: user.uid,
        user: { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL, email: user.email },
        role,
        suggestion,
        contact,
        text,
      });
    } catch (e) {
      setError(e instanceof Error && /visible/i.test(e.message) ? t('bnpb.queue_not_visible') : t('bnpb.error_generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-on-surface-variant">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="w-3.5 h-3.5" />
          {formatWhen(suggestion.occurredAt)}
        </span>
        {duration && (
          <span className="inline-flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" />
            {duration}
          </span>
        )}
        <span className="px-1.5 py-0.5 rounded bg-surface-container-high">{mappedType}</span>
        <span className="font-medium text-on-surface">{suggestion.bnpbName}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge basis={basis} />
        {contact && <span className="text-[13px] font-medium text-on-surface">{contact.name}</span>}
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          className="px-2.5 py-1 rounded-full text-[12px] border border-outline-variant/50 text-on-surface-variant hover:bg-surface"
        >
          {t('bnpb.queue_change')}
        </button>
      </div>
      {picking && <ContactPicker contacts={contacts} onPick={choose} />}

      <label className="block mt-3">
        <span className="text-[12px] font-medium text-on-surface-variant">{t('bnpb.queue_text_label')}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-2xl border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary resize-none"
        />
      </label>

      {error && <p className="mt-2 text-[13px] text-error">{error}</p>}
      {sameDay && (
        <div className="mt-3 rounded-2xl bg-warning-container text-warning p-3">
          <p className="text-[13px] font-medium inline-flex items-center gap-1.5">
            <TriangleAlert className="w-4 h-4 shrink-0" />
            {t('bnpb.queue_maybe_logged')}
          </p>
          <p className="mt-1 text-[13px]">
            {t('bnpb.queue_maybe_logged_body')
              .replace('{type}', sameDay.type || 'interaction')
              .replace('{text}', sameDay.content)}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={busy || !contact}
          className="min-h-[44px] px-4 py-2 rounded-full bg-primary text-on-primary text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {t(sameDay ? 'bnpb.queue_log_anyway' : 'bnpb.queue_confirm')}
        </button>
        <button
          type="button"
          onClick={() => onDismiss(suggestion)}
          className="min-h-[44px] px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-surface transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          {t('bnpb.queue_dismiss')}
        </button>
        <button
          type="button"
          onClick={() => onNotACisaPerson(suggestion.bnpbContactId)}
          className="min-h-[44px] px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-surface transition-colors"
        >
          <UserX className="w-3.5 h-3.5" />
          {t('bnpb.queue_not_cisa')}
        </button>
      </div>
    </div>
  );
}

function WhoIsThisCard({
  group,
  contacts,
  onDismiss,
  onNotACisaPerson,
  onChoose,
}: {
  group: WhoIsThisGroup;
  contacts: Contact[];
  onDismiss: (suggestion: InteractionSuggestion) => void;
  onNotACisaPerson: (bnpbContactId: string) => void;
  onChoose: (suggestionIds: string[], contactId: string) => void;
}) {
  const { t } = useLanguage();
  const countKey = group.count === 1 ? 'bnpb.queue_who_count_one' : 'bnpb.queue_who_count';

  return (
    <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-on-surface">{group.bnpbName}</span>
        <span className="text-[12px] text-on-surface-variant">
          {t(countKey).replace('{n}', String(group.count))}
        </span>
        <span className="text-[12px] text-on-surface-variant">
          {t('bnpb.queue_who_latest').replace('{date}', formatWhen(group.latestOccurredAt))}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {group.samples.map((suggestion) => (
          <li key={suggestion.id} className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate text-[13px] text-on-surface-variant">
              {suggestion.text || suggestion.summary}
            </span>
            <button
              type="button"
              onClick={() => onDismiss(suggestion)}
              className="shrink-0 px-2 py-1 rounded-full text-[12px] border border-outline-variant/50 text-on-surface-variant hover:bg-surface"
            >
              {t('bnpb.queue_dismiss')}
            </button>
          </li>
        ))}
      </ul>

      <ContactPicker contacts={contacts} onPick={(c) => onChoose(group.suggestions.map((s) => s.id), c.id)} />

      <div className="mt-3">
        <button
          type="button"
          onClick={() => onNotACisaPerson(group.bnpbContactId)}
          className="min-h-[44px] px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-surface transition-colors"
        >
          <UserX className="w-3.5 h-3.5" />
          {t('bnpb.queue_not_cisa')}
        </button>
      </div>
     </div>
   );
 }
 
 /**
  * The Suggestion queue page (#1420, #1424): the app owner works through the
 * pending suggestions BNPB pushed. Matched entries sit in "Ready to confirm",
 * newest first under month dividers; the rest are grouped by BNPB contact under
 * "Who is this?". Anyone else is sent Home.
 */
export default function SuggestionsQueue() {
  const { user, role } = useAuth();
  const { t, isSpanish } = useLanguage();
  const owner = isAppOwner(user?.email);
  const [suggestions, setSuggestions] = useState<InteractionSuggestion[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  useEffect(() => {
    if (!owner || !user) return;
    return subscribePendingSuggestions(
      user.uid,
      (list) => {
        setSuggestions(list);
        setLoading(false);
      },
      (e) => {
        console.error('suggestion queue subscription error', e);
        setLoading(false);
      },
    );
  }, [owner, user]);

  useEffect(() => {
    if (!owner || !user) return;
    const q = query(collection(db, 'contacts'), ...contactVisibilityConstraints(role, user.uid));
    return onSnapshot(
      q,
      (snap) =>
        setContacts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) } as Contact))),
      (e) => console.error('suggestion contact subscription error', e),
    );
  }, [owner, user, role]);

  useEffect(() => {
    if (!owner || !user) return;
    return subscribeSuggestionLinks(user.uid, setLinks, (e) =>
      console.error('suggestion links subscription error', e),
    );
  }, [owner, user]);

  const queue = useMemo(
    () => buildSuggestionQueue({ suggestions, contacts, links, role, uid: user?.uid }),
    [suggestions, contacts, links, role, user?.uid],
  );

  const dismiss = async (suggestion: InteractionSuggestion) => {
    if (!user) return;
    try {
      await dismissSuggestion({ uid: user.uid, suggestion });
      showUndoSnack(t('bnpb.queue_dismissed'), () => {
        void undoSuggestionDismiss({ uid: user.uid, suggestionId: suggestion.id });
      });
    } catch (e) {
      console.error('suggestion dismiss error', e);
    }
  };

  const choose = async (suggestionIds: string[], contactId: string) => {
    if (!user) return;
    try {
      await assignContactToSuggestions({ uid: user.uid, contactId, suggestionIds });
    } catch (e) {
      console.error('suggestion assign error', e);
    }
  };

  const notACisaPerson = async (bnpbContactId: string) => {
    if (!user) return;
    try {
      const dismissedIds = await markNotACisaPerson({ uid: user.uid, bnpbContactId, suggestions });
      showUndoSnack(t('bnpb.queue_not_cisa_done').replace('{count}', String(dismissedIds.length)), () => {
        void undoNotACisaPerson({ uid: user.uid, bnpbContactId, suggestionIds: dismissedIds });
      });
    } catch (e) {
      console.error('suggestion not-a-CISA-person error', e);
    }
  };

  if (!owner) return <Navigate to="/" replace />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-0 pb-16">
      <header className="mb-6">
        <h1 className="font-serif text-3xl sm:text-4xl text-on-surface">{t('bnpb.queue_title')}</h1>
        <p className="text-base text-on-surface-variant mt-2 max-w-2xl">{t('bnpb.queue_sub')}</p>
      </header>

      {loading ? (
        <p className="text-sm text-on-surface-variant">{t('bnpb.loading')}</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t('bnpb.queue_empty')}</p>
      ) : (
        <div className="flex flex-col gap-8">
          {queue.ready.length > 0 && (
            <section>
              <h2 className="font-serif text-xl text-on-surface mb-3">{t('bnpb.queue_ready_title')}</h2>
              <div className="flex flex-col gap-3">
                {queue.ready.map((section) => (
                  <div key={section.month} className="flex flex-col gap-3">
                    <h3 className="text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                      {monthLabel(section.month, isSpanish)}
                    </h3>
                    {section.items.map((item) => (
                      <SuggestionRow
                        key={item.suggestion.id}
                        item={item}
                        contacts={contacts}
                        onDismiss={dismiss}
                        onNotACisaPerson={notACisaPerson}
                        onChoose={choose}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {queue.whoIsThis.length > 0 && (
            <section>
              <h2 className="font-serif text-xl text-on-surface mb-3">{t('bnpb.queue_who_title')}</h2>
              <div className="flex flex-col gap-3">
                {queue.whoIsThis.map((group) => (
                  <WhoIsThisCard
                    key={group.bnpbContactId}
                    group={group}
                    contacts={contacts}
                    onDismiss={dismiss}
                    onNotACisaPerson={notACisaPerson}
                    onChoose={choose}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </div>
  );
}
