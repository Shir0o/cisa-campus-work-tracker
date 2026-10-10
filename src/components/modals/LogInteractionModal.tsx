// Log an interaction — a call, a message or a coffee, for one person or several.
//
// Opened from On our hearts and elsewhere, so it renders inside the shared popup
// frame (spec #1444): the people picker sits on the left on desktop (a single
// column with picked people as pills on a phone), and the interaction — what
// kind, when, what was said and any follow-ups — sits on the right. Each picked
// person gets their own entry and their Last seen moves to today.
import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Check, Coffee, Loader2, Mail, MessageSquare, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity, sendNotification } from '../../lib/firebase';
import { isTrainee, fullTimerIds } from '../../lib/walking';
import { applyContactActivityToBatch } from '../../lib/contactActivity';
import { Contact, Task } from '../../types';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { contactVisibilityConstraints } from '../../lib/contactQueries';
import { useLanguage } from '../LanguageProvider';
import { UsageStats } from '../../lib/usageStats';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { format } from 'date-fns';
import { PersonPill, PopupFrame, PopupSection, avatarTint } from '../ui/PopupFrame';

interface LogInteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContactId?: string;
}

type InteractionKind = 'chat' | 'email' | 'call' | 'meeting';

/** The form as it opened, so "dirty" means the person changed something rather
 *  than the popup merely being pre-selected from its entry point (#1449). */
interface InteractionSnapshot {
  ids: string[];
  type: InteractionKind;
  date: string;
  notes: string;
  tasks: number;
}

export default function LogInteractionModal({ isOpen, onClose, initialContactId }: LogInteractionModalProps) {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const isPhone = useMediaQuery('(max-width: 768px)');
  const [saveError, setSaveError] = useState<'offline' | 'failed' | null>(null);
  if (role === 'viewer') return null;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [type, setType] = useState<InteractionKind>('chat');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState(false);

  // Tasks State
  const [tasks, setTasks] = useState<Partial<Task>[]>([]);
  const [baseline, setBaseline] = useState<InteractionSnapshot | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTasks([]);
      setNotes('');
      setType('chat');
      setSelectedContactIds(new Set());
      setSearchQuery('');
      setNotesError(false);
      setSaveError(null);
      setBaseline(null);
      return;
    }
    const startIds = initialContactId ? [initialContactId] : [];
    const startDate = format(new Date(), 'yyyy-MM-dd');
    setSelectedContactIds(new Set(startIds));
    setType('chat');
    setDate(startDate);
    setNotes('');
    setTasks([]);
    setSearchQuery('');
    setNotesError(false);
    setSaveError(null);
    setBaseline({ ids: startIds, type: 'chat', date: startDate, notes: '', tasks: 0 });

    const q = query(
      collection(db, 'contacts'),
      ...contactVisibilityConstraints(role, user?.uid),
      orderBy('name', 'asc'),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contact[];
      setContacts(data);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });
    return () => unsubscribe();
  }, [isOpen, initialContactId]);

  const filteredContacts = useMemo(() => {
    const lower = searchQuery.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(lower) ||
      c.email.toLowerCase().includes(lower)
    );
  }, [searchQuery, contacts]);

  const toggleContact = (id: string) => {
    const newSet = new Set(selectedContactIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedContactIds(newSet);
  };

  const selectedContacts = contacts.filter(c => selectedContactIds.has(c.id));

  const removeTask = (index: number) => {
    setTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleTaskChange = (index: number, field: keyof Task, value: any) => {
    setTasks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addTask = () => {
    setTasks(prev => [...prev, { title: '', dueDate: date, priority: 'medium' }]);
  };

  const handleLogInteraction = async () => {
    if (selectedContactIds.size === 0 || isSubmitting) return;
    if (!notes.trim()) {
      setNotesError(true);
      return;
    }
    // Firestore writes don't reject while offline — they wait — so say so up
    // front rather than sit on "Saving…". Nothing typed is lost; Try again re-checks.
    if (navigator.onLine === false) {
      setSaveError('offline');
      return;
    }

    setSaveError(null);
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);

      for (const contactId of selectedContactIds) {
        const contact = contacts.find(c => c.id === contactId);
        const interactionRef = doc(collection(db, `contacts/${contactId}/interactions`));

        batch.set(interactionRef, {
          type,
          dateTime: date,
          content: notes,
          createdAt: serverTimestamp(),
          userId: user?.uid,
          userName: user?.displayName || user?.email?.split('@')[0] || 'Anonymous',
          contactId,
          contactName: contact?.name || 'Unknown'
        });

        // Update contact's derived activity fields (#329)
        const contactRef = doc(db, 'contacts', contactId);
        applyContactActivityToBatch(batch, contactRef, {
          date,
          by: {
            uid: user?.uid || null,
            name: user?.displayName || user?.email?.split('@')[0] || 'Anonymous',
          },
          type: 'interaction',
        });

        // Create tasks
        if (tasks.length > 0) {
          tasks.forEach(task => {
            if (task.title?.trim()) {
              const taskRef = doc(collection(db, 'tasks'));
              batch.set(taskRef, {
                title: task.title,
                dueDate: task.dueDate || date,
                priority: task.priority || 'medium',
                contactId: contactId,
                contactName: contact?.name || 'Unknown',
                assigneeId: user?.uid || null,
                status: 'pending',
                sourceInteractionId: interactionRef.id,
                createdAt: serverTimestamp()
              });
            }
          });
        }
      }

      await batch.commit();

      if (user?.uid) {
        UsageStats.record(user.uid, {
          type: 'create',
          path: typeof window !== 'undefined' ? window.location.pathname : '/',
          role: role || undefined,
          meta: 'interaction',
        });
      }

      // No pairing (#549): when a trainee logs time, the whole full-timer team
      // is pinged, so nothing the team does goes unseen.
      if (isTrainee(user?.uid)) {
        const who = (user?.displayName || 'A trainee').split(' ')[0];
        const snippet = notes.length > 140 ? notes.slice(0, 140).trimEnd() + '…' : notes;
        for (const ftId of fullTimerIds()) {
          for (const contactId of selectedContactIds) {
            const contact = contacts.find(c => c.id === contactId);
            await sendNotification({
              userId: ftId,
              title: `${who} logged time with ${contact?.name || 'someone'}`,
              message: snippet,
              type: 'info',
              targetId: contactId,
              link: `/people/${contactId}`,
            });
          }
        }
      }

      // Log system activity outside batch (helper adds its own doc)
      if (selectedContactIds.size === 1) {
        const contact = contacts.find(c => c.id === Array.from(selectedContactIds)[0]);
        if (contact) {
          logActivity({
            action: 'logged an interaction for',
            targetId: contact.id,
            targetName: contact.name,
            targetType: 'contact',
            type: type === 'meeting' ? 'event' : type === 'chat' ? 'comment' : type,
            description: notes
          });
        }
      } else {
        logActivity({
          action: 'logged a batch interaction for',
          targetId: 'multiple',
          targetName: `${selectedContactIds.size} contacts`,
          targetType: 'interaction',
          type: type === 'meeting' ? 'event' : type === 'chat' ? 'comment' : type,
          description: notes
        });
      }

      onClose();
    } catch (error) {
      console.error('Error logging batch interaction:', error);
      setSaveError('failed');
      // handleFirestoreError records and rethrows; the footer is where the
      // person hears about it, so keep the throw from escaping the handler.
      try {
        handleFirestoreError(error, OperationType.WRITE, 'batch/interactions');
      } catch {
        /* already surfaced above */
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Design A · Log interaction: Message, Email, Call, Meeting, one tap each.
  const interactionTypes = [
    { id: 'chat' as const, label: t('modals.message'), icon: MessageSquare },
    { id: 'email' as const, label: t('directory.email'), icon: Mail },
    { id: 'call' as const, label: t('modals.call'), icon: Phone },
    { id: 'meeting' as const, label: t('modals.meeting'), icon: Coffee },
  ];

  const dirty =
    !!baseline &&
    (selectedContactIds.size !== baseline.ids.length ||
      [...selectedContactIds].some((id) => !baseline.ids.includes(id)) ||
      type !== baseline.type ||
      date !== baseline.date ||
      notes.trim() !== baseline.notes ||
      tasks.length > baseline.tasks);

  const inputCls =
    'w-full rounded-sm bg-surface-container-low border border-transparent px-3.5 py-2.5 text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none focus:border-outline transition-colors';
  const kindCls = (on: boolean) =>
    cn(
      'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] transition-colors',
      on
        ? 'bg-primary border-primary text-on-primary'
        : 'bg-[var(--bg-elev)] border-outline-variant text-on-surface hover:border-outline',
    );

  const searchField = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-mute)]" />
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('modals.search_people')}
        aria-label={t('modals.search_people')}
        className={cn(inputCls, 'pl-10')}
      />
    </div>
  );

  const peopleList = loading ? (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--text-mute)]">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-[12px]">{t('modals.loading_contacts')}</p>
    </div>
  ) : filteredContacts.length === 0 ? (
    <p className="py-6 text-center text-[13px] text-[var(--text-mute)]">
      {t('modals.no_contacts_matching').replace('{q}', searchQuery)}
    </p>
  ) : (
    <div className="flex flex-col gap-0.5">
      {filteredContacts.map((contact) => {
        const isSelected = selectedContactIds.has(contact.id);
        const sub = [[contact.year, contact.major].filter(Boolean).join(' · '), contact.stage]
          .filter(Boolean)
          .join(' • ');
        return (
          <button
            key={contact.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => toggleContact(contact.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors',
              isSelected ? 'bg-surface-container-high' : 'hover:bg-surface-container',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors',
                isSelected ? 'border-primary bg-primary text-on-primary' : 'border-outline',
              )}
            >
              {isSelected && <Check className="h-3 w-3" />}
            </span>
            <span
              style={avatarTint(contact.id)}
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
            >
              {contact.initials || contact.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-sm text-on-surface', isSelected && 'font-semibold')}>
                {contact.name}
              </span>
              {sub && <span className="block truncate text-[12px] text-[var(--text-mute)]">{sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );

  const formSections = (
    <>
      <PopupSection label={t('modals.what_kind')}>
        <div className="flex flex-wrap gap-2">
          {interactionTypes.map((kind) => {
            const Icon = kind.icon;
            const on = type === kind.id;
            return (
              <button
                key={kind.id}
                type="button"
                aria-pressed={on}
                onClick={() => setType(kind.id)}
                className={kindCls(on)}
              >
                <Icon className="h-4 w-4" />
                {kind.label}
              </button>
            );
          })}
        </div>
      </PopupSection>

      <PopupSection label={t('modals.when')}>
        <input
          id="interaction-when"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t('modals.when')}
          className={cn(inputCls, 'max-w-[16rem]')}
        />
      </PopupSection>

      <PopupSection label={t('modals.what_was_said')} hint={t('modals.takeaways_not_transcript')}>
        <textarea
          rows={5}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesError(false);
          }}
          placeholder={t('modals.what_discussed')}
          aria-label={t('modals.what_was_said')}
          className={cn(inputCls, 'resize-y', notesError && 'border-error')}
        />
        {notesError && (
          <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] text-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {t('modals.write_what_was_said')}
          </p>
        )}
      </PopupSection>

      <PopupSection label={t('modals.follow_ups')} hint={t('modals.each_becomes_todo')}>
        <div className="flex flex-col gap-2">
          {tasks.map((task, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-[14px] border border-outline-variant px-3.5 py-2"
            >
              <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-outline" />
              <input
                type="text"
                value={task.title || ''}
                onChange={(e) => handleTaskChange(i, 'title', e.target.value)}
                placeholder={t('modals.task_description')}
                className="min-w-0 flex-1 bg-transparent text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none"
              />
              <input
                type="date"
                value={task.dueDate || ''}
                onChange={(e) => handleTaskChange(i, 'dueDate', e.target.value)}
                aria-label={t('modals.follow_up_due')}
                className="w-32 shrink-0 bg-transparent text-xs text-on-surface-variant focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeTask(i)}
                aria-label={t('modals.remove_follow_up')}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--text-mute)] transition-colors hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addTask}
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full border border-dashed border-outline-variant px-3 text-[13px] text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <Plus className="h-3.5 w-3.5" /> {t('modals.add_a_follow_up')}
          </button>
        </div>
      </PopupSection>
    </>
  );

  const body = isPhone ? (
    <>
      <PopupSection label={t('modals.who')}>
        <div className="flex flex-col gap-3">
          {selectedContacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedContacts.map((c) => (
                <PersonPill
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  initials={c.initials || c.name.slice(0, 2).toUpperCase()}
                  onRemove={() => toggleContact(c.id)}
                  removeLabel={t('modals.remove_person').replace('{name}', c.name)}
                />
              ))}
            </div>
          )}
          {searchField}
          {peopleList}
        </div>
      </PopupSection>
      {formSections}
    </>
  ) : (
    <div className="grid grid-cols-[320px_minmax(0,1fr)]">
      <div className="border-r border-outline-variant bg-surface-container-low/40 p-5">
        {searchField}
        <div className="mt-4">
          {selectedContactIds.size > 0 && (
            <p className="px-1 pb-2 text-[12px] text-[var(--text-mute)]">
              <span className="font-semibold text-on-surface">
                {t('modals.selected_count').replace('{n}', String(selectedContactIds.size))}
              </span>
            </p>
          )}
          {peopleList}
        </div>
      </div>
      <div>{formSections}</div>
    </div>
  );

  return (
    <PopupFrame
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={t('modals.log_interaction')}
      subtitle={t('modals.record_activities_multiple')}
      dirty={dirty}
      noun={t('modals.interaction_noun')}
      footerHint={
        selectedContactIds.size === 0
          ? undefined
          : selectedContactIds.size === 1
            ? t('modals.logged_one_person')
            : t('modals.logged_each_person').replace('{n}', String(selectedContactIds.size))
      }
      error={
        saveError
          ? {
              message: t(saveError === 'offline' ? 'modals.couldnt_save_offline' : 'modals.couldnt_save'),
              retryLabel: t('modals.try_again'),
              onRetry: () => void handleLogInteraction(),
            }
          : null
      }
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={{
        label:
          selectedContactIds.size === 0
            ? t('modals.pick_someone')
            : selectedContactIds.size === 1
              ? t('modals.log_for_one_person')
              : t('modals.log_for_people').replace('{n}', String(selectedContactIds.size)),
        onClick: () => void handleLogInteraction(),
        disabled: selectedContactIds.size === 0,
        saving: isSubmitting,
        savingLabel: t('modals.saving'),
      }}
    >
      {body}
    </PopupFrame>
  );
}
