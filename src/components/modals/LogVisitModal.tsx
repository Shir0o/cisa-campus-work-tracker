// Log (or edit) a visit — "write it down while you still remember the room".
//
// A visit is written after the fact, so this is a single quiet column rather
// than a capture flow: who you saw, when, where, who went, why, how it went,
// and the two things a visit tends to leave behind — something to chase and
// something to carry. It renders inside the shared popup frame (spec #1444).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, House, Image as ImageIcon, Loader2, MapPin, Plus, X } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { addVisit, attachVisitPhotos, initialsOf, updateVisit, type VisitInput } from '../../lib/visits';
import { db, handleFirestoreError, logActivity, OperationType } from '../../lib/firebase';
import { addPrayerBurden, unhidePrayerContact } from '../../lib/prayers';
import { addTodo, updateTodo } from '../../lib/todos';
import { MAX_PHOTOS_PER_VISIT, uploadVisitPhotos } from '../../lib/visitPhotos';
import type { AppUser, Contact, Home, Visit, VisitPhoto } from '../../types';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { useCommand } from '../../lib/commands';
import { pickableContacts, pickableStaff, visibleToOf } from '../../lib/permissions';
import { stampFounders } from '../../lib/partners';
import { useSeason } from '../../lib/seasons';
import { PersonPill, PopupField, PopupFrame, PopupSection } from '../ui/PopupFrame';

interface LogVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  staff: AppUser[];
  homes?: Home[];
  /** Editing an existing visit, rather than logging a new one. */
  visit?: Visit | null;
  /** Person pre-picked from the "haven't been round in a while" strip. */
  initialContactId?: string | null;
  /** Home pre-picked from the "Who we haven't seen" reading — its people and
   *  its place come with it, so a gap and the recording are one motion. */
  initialHomeId?: string | null;
  /** Start a Home for the people seen who have none (spec #1444/#1448). */
  onAddHome?: (memberIds: string[]) => void;
}

/** A follow-up lands as a to-do a week out — long enough to be a real intention,
 *  short enough that it doesn't quietly become never. */
const FOLLOW_UP_DAYS = 7;

/** Stable default so the reset effect's `homes` dep isn't a new array each
 *  render (which would re-run the effect — and the state it resets — forever). */
const NO_HOMES: Home[] = [];

/** The starting shape of the form, captured on open, so "dirty" means the
 *  person changed something rather than the popup merely being pre-filled. */
interface VisitSnapshot {
  date: string;
  ids: string[];
  went: string[];
  where: string;
  whereTouched: boolean;
  purpose: string;
  how: string;
  followUpOn: boolean;
  followUp: string;
  prayer: string;
  photos: number;
}

export default function LogVisitModal({
  isOpen,
  onClose,
  contacts,
  staff,
  homes = NO_HOMES,
  visit = null,
  initialContactId = null,
  initialHomeId = null,
  onAddHome,
}: LogVisitModalProps) {
  const { user, effectiveUserId } = useAuth();
  const { t } = useLanguage();
  const season = useSeason();
  const editing = !!visit;

  const [date, setDate] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [went, setWent] = useState<string[]>([]);
  const [where, setWhere] = useState('');
  const [whereTouched, setWhereTouched] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [how, setHow] = useState('');
  const [followUpOn, setFollowUpOn] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [prayer, setPrayer] = useState('');
  const [existingPhotos, setExistingPhotos] = useState<VisitPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showPeopleError, setShowPeopleError] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [localCreatedContacts, setLocalCreatedContacts] = useState<Contact[]>([]);
  const [baseline, setBaseline] = useState<VisitSnapshot | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);

  const me = effectiveUserId || user?.uid || '';
  const myName = user?.displayName || 'A full-timer';

  const allContacts = useMemo(
    () => [...contacts, ...localCreatedContacts],
    [contacts, localCreatedContacts],
  );

  // A visit is to one house: when everyone on it lives in the same home, the
  // place comes from that home and the visit carries its id. Two people from
  // two households means we genuinely don't know, so we ask. The person's own
  // `location` is no longer read — the Home carries the place now (ADR 0031).
  const homeFor = (contactIds: string[]): Home | null => {
    if (!contactIds.length) return null;
    const containing = homes.filter(
      (h) => h.active && contactIds.every((id) => h.members.includes(id)),
    );
    return containing.length === 1 ? containing[0] : null;
  };

  /** Change who we saw, keeping the offered `where` in step until it's typed in. */
  const setPeople = (next: string[]) => {
    setIds(next);
    if (!whereTouched) {
      setWhere(homeFor(next)?.place ?? '');
    }
  };

  // Reset to the visit we're editing (or to a blank one) each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    const initialHome = homes.find((h) => h.id === initialHomeId) ?? null;
    const startIds = visit
      ? visit.contactIds.slice()
      : initialHome
        ? initialHome.members.filter((id) => allContacts.some((c) => c.id === id))
        : initialContactId
          ? [initialContactId]
          : [];
    const startDate = visit ? visit.date : format(new Date(), 'yyyy-MM-dd');
    const startWent = visit ? visit.went.slice() : me ? [me] : [];
    const startWhere = visit ? visit.where : initialHome?.place ?? homeFor(startIds)?.place ?? '';
    const startWhereTouched = !!visit?.where;
    const startPurpose = visit ? visit.purpose : '';
    const startHow = visit ? visit.how : '';
    const startFollowUpOn = !!visit?.followUp;
    const startFollowUp = visit?.followUp || '';
    const startPhotos = visit ? (visit.photos || []).slice() : [];
    setDate(startDate);
    setIds(startIds);
    setWent(startWent);
    setWhere(startWhere);
    setWhereTouched(startWhereTouched);
    setPurpose(startPurpose);
    setHow(startHow);
    setFollowUpOn(startFollowUpOn);
    setFollowUp(startFollowUp);
    setPrayer('');
    setExistingPhotos(startPhotos);
    setNewPhotos([]);
    setQ('');
    setSaveError(false);
    setShowPeopleError(false);
    setBaseline({
      date: startDate,
      ids: startIds,
      went: startWent,
      where: startWhere,
      whereTouched: startWhereTouched,
      purpose: startPurpose,
      how: startHow,
      followUpOn: startFollowUpOn,
      followUp: startFollowUp,
      prayer: '',
      photos: startPhotos.length,
    });
  }, [isOpen, visit, initialContactId, initialHomeId, homes, me]);

  const chosen = useMemo(
    () => ids.map((id) => allContacts.find((c) => c.id === id)).filter((c): c is Contact => !!c),
    [ids, allContacts],
  );

  const realStaff = useMemo(() => pickableStaff(staff), [staff]);
  const realContacts = useMemo(() => pickableContacts(allContacts), [allContacts]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return realContacts.filter((c) => !ids.includes(c.id) && c.name.toLowerCase().includes(term)).slice(0, 6);
  }, [q, ids, realContacts]);

  const newName = q.trim();
  const canAddNew =
    newName.length > 1 &&
    !matches.some((c) => c.name.toLowerCase() === newName.toLowerCase()) &&
    !ids.some((id) => allContacts.find((c) => c.id === id)?.name.toLowerCase() === newName.toLowerCase());

  const handleAddSomeoneNew = async () => {
    if (!canAddNew || addingContact) return;
    setAddingContact(true);
    try {
      const contactData = {
        name: newName,
        location: '',
        email: '',
        phone: '',
        stage: 'Contact',
        tags: Array.from(new Set([...season.tags, 'visit'])),
        notes: '',
        spiritualBackground: '',
        initials: initialsOf(newName),
        lastSeen: 'Just now',
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
        createdBy: me,
        createdByName: myName,
        hasNewActivity: true,
        attendance: {},
      };
      // Founding set (#1049): whoever logged the person plus everyone they were
      // partnered with at that instant. Written once here and never rewritten.
      stampFounders(contactData, me);

      const docRef = await addDoc(collection(db, 'contacts'), { ...contactData, visibleTo: visibleToOf(contactData) });
      const newContactObj: Contact = {
        id: docRef.id,
        ...contactData,
      };
      setLocalCreatedContacts((prev) => [...prev, newContactObj]);
      setPeople([...ids, docRef.id]);
      setQ('');

      void logActivity({
        action: 'created a new contact',
        targetId: docRef.id,
        targetName: newName,
        targetType: 'contact',
        type: 'create',
        description: 'Added from Log a Visit write-up',
      });
    } catch (e) {
      console.error('Error adding contact from visit modal:', e);
      handleFirestoreError(e, OperationType.WRITE, 'contacts');
    } finally {
      setAddingContact(false);
    }
  };

  const photoCount = existingPhotos.length + newPhotos.length;

  // Previews for the files just picked. Revoked whenever the set changes or the
  // modal goes, so picking and un-picking doesn't leave blobs behind.
  const newPhotoUrls = useMemo(
    () =>
      newPhotos.map((f) => {
        const raw = URL.createObjectURL(f);
        try {
          const parsed = new URL(raw);
          return parsed.protocol === 'blob:' ? parsed.href : '';
        } catch {
          return '';
        }
      }),
    [newPhotos],
  );
  useEffect(() => () => newPhotoUrls.forEach((u) => URL.revokeObjectURL(u)), [newPhotoUrls]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    setNewPhotos((prev) => [...prev, ...Array.from(files)].slice(0, MAX_PHOTOS_PER_VISIT - existingPhotos.length));
  };

  const submit = async () => {
    if (saving) return;
    if (!ids.length) {
      setShowPeopleError(true);
      peopleRef.current?.scrollIntoView({ block: 'center' });
      return;
    }
    setShowPeopleError(false);
    setSaveError(false);
    setSaving(true);
    try {
      const input: VisitInput = {
        date,
        contactIds: ids,
        contactNames: chosen.map((c) => c.name),
        went,
        wentNames: went.map((uid) => staff.find((s) => s.uid === uid)?.displayName || 'A full-timer'),
        where,
        homeId: homeFor(ids)?.id ?? null,
        purpose,
        how,
        followUp: followUpOn ? followUp : '',
        followUpTaskId: visit?.followUpTaskId ?? null,
        prayerId: visit?.prayerId ?? null,
        prayerBurden: visit?.prayerBurden ?? null,
        photos: existingPhotos,
      };
      const by = { uid: me, name: myName, photoURL: user?.photoURL };

      // A prayer and a to-do belong to the visit that produced them, so they're
      // only created the first time round — an edit fixes the record, it doesn't
      // ask the team to carry the same thing twice.
      if (!editing) {
        if (followUpOn && followUp.trim()) {
          const due = new Date();
          due.setDate(due.getDate() + FOLLOW_UP_DAYS);
          input.followUpTaskId = await addTodo(
            {
              title: followUp.trim(),
              assigneeId: went[0] || me,
              dueDate: format(due, 'yyyy-MM-dd'),
              contactId: ids[0],
              contactName: chosen[0]?.name ?? null,
            },
            { uid: me, name: myName },
          );
        }
        if (prayer.trim() && chosen[0]) {
          input.prayerId = await addPrayerBurden(chosen[0].id, prayer.trim(), { uid: me, name: myName });
          // Auto-unhide from the prayer page so the contact appears (#565)
          unhidePrayerContact(chosen[0].id);
          // Kept on the visit too, so the card reads the prayer back in its own
          // words rather than only knowing there was one.
          input.prayerBurden = prayer.trim();
        }
      }

      let visitId: string;
      if (editing) {
        await updateVisit(visit!.id, visit!.contactIds, input, by);
        visitId = visit!.id;
      } else {
        visitId = await addVisit(input, by);
        // Link the follow-up to-do back to the visit it came from, now that the
        // visit has an id to point at — "make the follow-up part of writing the
        // visit up" (issue #336).
        if (input.followUpTaskId) {
          await updateTodo(input.followUpTaskId, {
            source: { interactionId: visitId, interactionTitle: `Visit to ${chosen[0]?.name ?? 'someone'}` },
          });
        }
      }

      if (newPhotos.length) {
        const uploaded = await uploadVisitPhotos(visitId, newPhotos);
        await attachVisitPhotos(visitId, [...existingPhotos, ...uploaded]);
      }

      void logActivity({
        action: editing ? 'edited a visit to' : 'logged a visit to',
        // `targetType` and `type` are closed enums in firestore.rules — a visit
        // rides on the contact it was to.
        targetType: 'contact',
        targetId: ids[0],
        targetName: chosen.map((c) => c.name).join(', '),
        type: 'event',
        description: where.trim() || 'home',
      });

      onClose();
    } catch (e) {
      console.error('Error saving visit:', e);
      setSaveError(true);
      // handleFirestoreError records and rethrows; the footer is where the
      // person hears about it, so keep the throw from escaping the handler.
      try {
        handleFirestoreError(e, OperationType.WRITE, 'visits');
      } catch {
        /* already surfaced above */
      }
    } finally {
      setSaving(false);
    }
  };

  // ⌘↵ save lives in the central shortcut registry (#337) so it both binds and
  // teaches itself. Escape and Close are the frame's job — it asks about dirty
  // state before it closes.
  useCommand({
    id: 'logvisit.save',
    scope: 'overlay',
    description: 'Save the visit',
    shortcut: { key: 'Enter', mod: true },
    minRole: 'admin',
    available: () => isOpen,
    handler: () => void submit(),
  });

  const chosenHome = homeFor(ids);
  // Nobody seen lives in a Home yet — offer to start one from this visit.
  const nobodyHasHome =
    chosen.length > 0 && chosen.every((c) => !homes.some((h) => h.members.includes(c.id)));
  const firstName = chosen[0]?.name.split(' ')[0] ?? '';
  const lastVisitMs = chosen.reduce((max, c) => {
    const ms = Date.parse(c.lastContactedDate || c.lastSeen || '');
    return Number.isFinite(ms) ? Math.max(max, ms) : max;
  }, 0);
  const homeLine = chosenHome
    ? lastVisitMs
      ? t('modals.home_last_visited')
          .replace('{home}', chosenHome.label)
          .replace('{ago}', formatDistanceToNowStrict(new Date(lastVisitMs)))
      : chosenHome.label
    : '';

  const dirty =
    !!baseline &&
    (date !== baseline.date ||
      ids.join('\u0000') !== baseline.ids.join('\u0000') ||
      went.join('\u0000') !== baseline.went.join('\u0000') ||
      where !== baseline.where ||
      whereTouched !== baseline.whereTouched ||
      purpose !== baseline.purpose ||
      how !== baseline.how ||
      followUpOn !== baseline.followUpOn ||
      followUp !== baseline.followUp ||
      prayer !== baseline.prayer ||
      existingPhotos.length !== baseline.photos ||
      newPhotos.length > 0);

  const inputCls =
    'w-full rounded-sm bg-surface-container-low border border-transparent px-3.5 py-2.5 text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none focus:border-outline transition-colors';
  const toggleCls = (on: boolean) =>
    cn(
      'px-3 py-1.5 rounded-full text-[13px] border transition-colors',
      on
        ? 'bg-primary/10 border-accent-line text-accent'
        : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface',
    );
  const photoRemove =
    'absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-surface border border-outline-variant text-on-surface-variant hover:text-error transition-colors';

  return (
    <PopupFrame
      open={isOpen}
      onClose={onClose}
      size="md"
      eyebrow={t('modals.visits_eyebrow')}
      title={editing ? t('modals.edit_a_visit') : t('modals.log_a_visit')}
      subtitle={editing ? t('modals.visit_fix_record') : t('modals.visit_write_down')}
      dirty={dirty}
      noun={t('modals.visit_noun')}
      footerHint={t('modals.cmd_save')}
      error={
        saveError
          ? {
              message: t('modals.couldnt_save_offline'),
              retryLabel: t('modals.try_again'),
              onRetry: () => void submit(),
            }
          : null
      }
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={{
        label: editing ? t('modals.save_changes') : t('modals.log_the_visit'),
        onClick: () => void submit(),
        saving,
        savingLabel: t('modals.saving'),
      }}
    >
      {/* Who you saw */}
      <PopupSection label={t('modals.section_who_you_saw')} hint={t('modals.section_who_hint')}>
        <div ref={peopleRef}>
          <div
            className={cn(
              'flex flex-wrap items-center gap-2 rounded border bg-surface-container-low p-2',
              showPeopleError ? 'border-error' : 'border-outline-variant',
            )}
          >
            {chosen.map((c) => (
              <PersonPill
                key={c.id}
                id={c.id}
                name={c.name}
                initials={initialsOf(c.name)}
                onRemove={() => setPeople(ids.filter((i) => i !== c.id))}
                removeLabel={`Remove ${c.name}`}
              />
            ))}
            <input
              id="visit-who"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={chosen.length ? t('modals.anyone_else') : t('modals.start_typing_name')}
              aria-label={t('modals.who_did_you_see')}
              className="min-w-[10rem] flex-1 bg-transparent px-2 py-1 text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none"
            />
          </div>
          {homeLine && (
            <p className="mt-2.5 inline-flex items-center gap-2 rounded bg-surface-container-low px-3 py-1.5 text-[12px] text-on-surface-variant">
              <House className="h-3.5 w-3.5" />
              {homeLine}
            </p>
          )}
          {!chosenHome && nobodyHasHome && onAddHome && (
            <p className="mt-2.5 inline-flex items-center gap-2 text-[12px] text-on-surface-variant">
              <House className="h-3.5 w-3.5" />
              {t('modals.no_home_yet').replace('{name}', firstName)}
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onAddHome(ids)}
                className="font-medium text-on-surface underline"
              >
                {t('modals.add_one')}
              </button>
            </p>
          )}
          {showPeopleError && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] text-error">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {t('modals.pick_one_person')}
            </p>
          )}
          {(matches.length > 0 || canAddNew) && (
            <div className="mt-2 overflow-hidden rounded border border-outline-variant">
              {matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setPeople([...ids, c.id]);
                    setQ('');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-variant"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-accent"
                  >
                    {initialsOf(c.name)}
                  </span>
                  <span className="text-sm text-on-surface">{c.name}</span>
                </button>
              ))}
              {canAddNew && (
                <button
                  type="button"
                  disabled={addingContact}
                  onClick={handleAddSomeoneNew}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left font-medium text-accent transition-colors hover:bg-surface-variant',
                    matches.length > 0 && 'border-t border-outline-variant/60',
                  )}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-xs text-accent">
                    {addingContact ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-sm">{t('modals.add_someone_new').replace('{name}', newName)}</span>
                  <span className="ml-auto text-xs text-on-surface-variant">{t('modals.starts_a_record')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </PopupSection>

      {/* When and where */}
      <PopupSection label={t('modals.section_when_where')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PopupField label={t('modals.when')} htmlFor="visit-date">
            <input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </PopupField>
          <PopupField
            label={t('modals.where')}
            htmlFor="visit-where"
            hint={chosenHome && !whereTouched ? t('modals.where_from_home').replace('{home}', chosenHome.label) : undefined}
          >
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-mute)]" />
              <input
                id="visit-where"
                value={where}
                placeholder={t('modals.where_placeholder')}
                onChange={(e) => {
                  setWhere(e.target.value);
                  setWhereTouched(true);
                }}
                className={cn(inputCls, 'pl-10')}
              />
            </div>
          </PopupField>
        </div>
      </PopupSection>

      {/* Who went */}
      <PopupSection label={t('modals.who_went')} hint={t('modals.most_visits_are_a_pair')}>
        <div className="flex flex-wrap gap-2">
          {realStaff.map((s) => (
            <button
              key={s.uid}
              type="button"
              aria-pressed={went.includes(s.uid)}
              onClick={() => setWent((w) => (w.includes(s.uid) ? w.filter((x) => x !== s.uid) : [...w, s.uid]))}
              className={toggleCls(went.includes(s.uid))}
            >
              {s.displayName}
            </button>
          ))}
        </div>
      </PopupSection>

      {/* The visit */}
      <PopupSection label={t('modals.section_the_visit')}>
        <div className="flex flex-col gap-4">
          <PopupField label={t('modals.why_you_went')} htmlFor="visit-purpose" optional={t('modals.optional')}>
            <input
              id="visit-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={t('modals.why_placeholder')}
              className={inputCls}
            />
          </PopupField>
          <PopupField label={t('modals.how_it_went')} htmlFor="visit-how">
            <textarea
              id="visit-how"
              rows={5}
              value={how}
              onChange={(e) => setHow(e.target.value)}
              placeholder={t('modals.how_placeholder')}
              className={cn(inputCls, 'resize-y')}
            />
          </PopupField>
          <PopupField label={t('modals.photos')} optional={t('modals.optional')}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addPhotos(e.dataTransfer.files);
              }}
              className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-outline-variant py-6 text-sm text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface"
            >
              <ImageIcon className="h-4 w-4" />
              {photoCount
                ? t('modals.photo_add_more')
                    .replace('{n}', String(photoCount))
                    .replace('{s}', photoCount > 1 ? 's' : '')
                : t('modals.drop_photos')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              data-testid="visit-photo-input"
              onChange={(e) => addPhotos(e.target.files)}
            />
            {photoCount > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {existingPhotos.map((p) => (
                  <li key={p.path} className="relative">
                    <img
                      src={p.url}
                      alt={p.name || 'photo'}
                      className="h-20 w-20 rounded-sm border border-outline-variant object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setExistingPhotos((x) => x.filter((y) => y.path !== p.path))}
                      aria-label={`Remove ${p.name || 'photo'}`}
                      className={photoRemove}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {newPhotos.map((_f, i) => (
                  <li key={i} className="relative">
                    <img
                      src={newPhotoUrls[i] ?? ''}
                      alt={`Photo attachment ${i + 1}`}
                      className="h-20 w-20 rounded-sm border border-primary/30 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setNewPhotos((x) => x.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                      className={photoRemove}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopupField>
        </div>
      </PopupSection>

      {/* Afterwards — only on the way in; an edit shouldn't re-ask. */}
      {!editing && (
        <PopupSection label={t('modals.section_afterwards')} hint={t('modals.section_afterwards_hint')}>
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-[13px] font-medium text-on-surface">{t('modals.something_to_carry')}</span>
                <button type="button" aria-pressed={followUpOn} onClick={() => setFollowUpOn((v) => !v)} className={toggleCls(followUpOn)}>
                  {followUpOn ? t('modals.yes_put_on_list') : t('modals.nothing_to_chase')}
                </button>
              </div>
              {followUpOn && (
                <>
                  <input
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    placeholder={t('modals.follow_up_placeholder')}
                    aria-label={t('modals.what_to_follow_up')}
                    className={cn(inputCls, 'mt-3')}
                  />
                  {!editing && (
                    <p className="mt-2 text-xs text-[var(--text-mute)]">
                      {t('modals.lands_as_todo').replace(
                        '{name}',
                        staff.find((s) => s.uid === (went[0] || me))?.displayName || t('modals.whoever_went'),
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
            <PopupField label={t('modals.prayer_came_out')} htmlFor="visit-prayer" optional={t('modals.optional')}>
              <input
                id="visit-prayer"
                value={prayer}
                onChange={(e) => setPrayer(e.target.value)}
                placeholder={
                  chosen[0] ? `${t('modals.something_to_carry')} ${chosen[0].name.split(' ')[0]}` : t('modals.something_to_carry')
                }
                className={inputCls}
              />
              {prayer.trim() && chosen[0] && (
                <p className="mt-2 text-xs text-[var(--text-mute)]">
                  {t('modals.added_to_prayers').replace('{name}', chosen[0].name.split(' ')[0])}
                </p>
              )}
            </PopupField>
          </div>
        </PopupSection>
      )}
    </PopupFrame>
  );
}
