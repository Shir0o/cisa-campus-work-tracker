import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
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
  confirmSuggestion,
  dismissSuggestion,
  findSameDayInteraction,
  formatDurationMinutes,
  markNotACisaPerson,
  mediumToType,
  subscribeContactInteractions,
  subscribePendingSuggestions,
  undoSuggestionDismiss,
  undoNotACisaPerson,
  type InteractionSuggestion,
} from '../lib/bnpb';
import type { Contact, Interaction } from '../types';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function SuggestionRow({
  suggestion,
  onDismiss,
  onNotACisaPerson,
}: {
  suggestion: InteractionSuggestion;
  onDismiss: (suggestion: InteractionSuggestion) => void;
  onNotACisaPerson: (suggestion: InteractionSuggestion) => void;
}) {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [contact, setContact] = useState<Contact | null>(null);
  const [sameDay, setSameDay] = useState<Interaction | null>(null);
  const [text, setText] = useState(suggestion.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'contacts'), ...contactVisibilityConstraints(role, user?.uid));
    return onSnapshot(
      q,
      (snap) =>
        setContacts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) } as Contact))),
      (e) => console.error('suggestion contact subscription error', e),
    );
  }, [role, user?.uid]);

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

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term === '') return contact ? [contact] : [];
    return contacts.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 8);
  }, [contacts, search, contact]);

  const confirmed = suggestion.status !== 'pending';
  const mappedType = mediumToType(suggestion.medium);
  const duration = formatDurationMinutes(suggestion.durationMinutes);

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

      <label className="block mt-3">
        <span className="text-[12px] font-medium text-on-surface-variant">{t('bnpb.queue_text_label')}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          disabled={confirmed}
          className="mt-1 w-full rounded-2xl border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary resize-none disabled:opacity-60"
        />
      </label>

      {confirmed ? (
        <p className="mt-3 text-[13px] text-on-surface-variant inline-flex items-center gap-1.5">
          <Check className="w-4 h-4" /> {t('bnpb.queue_confirmed')}
        </p>
      ) : (
        <>
          <label className="block mt-3">
            <span className="text-[12px] font-medium text-on-surface-variant">{t('bnpb.queue_pick_contact')}</span>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setContact(null);
                }}
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
                  onClick={() => {
                    setContact(c);
                    setSearch(c.name);
                  }}
                  className={
                    contact?.id === c.id
                      ? 'px-2.5 py-1 rounded-full text-[12px] border border-primary bg-primary/10 text-on-surface'
                      : 'px-2.5 py-1 rounded-full text-[12px] border border-outline-variant/50 text-on-surface-variant hover:bg-surface'
                  }
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
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
              onClick={() => onNotACisaPerson(suggestion)}
              className="min-h-[44px] px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-surface transition-colors"
            >
              <UserX className="w-3.5 h-3.5" />
              {t('bnpb.queue_not_cisa')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The Suggestion queue page (#1420): the app owner works through the pending
 * suggestions BNPB pushed, one person at a time. Anyone else is sent Home.
 */
export default function SuggestionsQueue() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const owner = isAppOwner(user?.email);
  const [suggestions, setSuggestions] = useState<InteractionSuggestion[]>([]);
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

  const notACisaPerson = async (suggestion: InteractionSuggestion) => {
    if (!user) return;
    try {
      const dismissedIds = await markNotACisaPerson({
        uid: user.uid,
        bnpbContactId: suggestion.bnpbContactId,
        suggestions,
      });
      showUndoSnack(t('bnpb.queue_not_cisa_done').replace('{count}', String(dismissedIds.length)), () => {
        void undoNotACisaPerson({
          uid: user.uid,
          bnpbContactId: suggestion.bnpbContactId,
          suggestionIds: dismissedIds,
        });
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
        <div className="flex flex-col gap-3">
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              onDismiss={dismiss}
              onNotACisaPerson={notACisaPerson}
            />
          ))}
        </div>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </div>
  );
}
