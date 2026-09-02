// Log (or edit) a visit — "write it down while you still remember the room".
//
// A visit is written after the fact, so this is a single quiet column rather
// than a capture flow: who you saw, when, where, who went, why, how it went,
// and the two things a visit tends to leave behind — something to chase and
// something to carry.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, House, Image as ImageIcon, Loader2, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { addVisit, attachVisitPhotos, initialsOf, updateVisit, type VisitInput } from '../../lib/visits';
import { db, handleFirestoreError, logActivity, OperationType } from '../../lib/firebase';
import { addPrayerBurden, unhidePrayerContact } from '../../lib/prayers';
import { addTodo, updateTodo } from '../../lib/todos';
import { MAX_PHOTOS_PER_VISIT, uploadVisitPhotos } from '../../lib/visitPhotos';
import type { AppUser, Contact, Visit, VisitPhoto } from '../../types';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { useCommand } from '../../lib/commands';
import { pickableContacts, pickableStaff } from '../../lib/permissions';
import { useSeason } from '../../lib/seasons';

interface LogVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  staff: AppUser[];
  /** Editing an existing visit, rather than logging a new one. */
  visit?: Visit | null;
  /** Person pre-picked from the "haven't been round in a while" strip. */
  initialContactId?: string | null;
}

/** A follow-up lands as a to-do a week out — long enough to be a real intention,
 *  short enough that it doesn't quietly become never. */
const FOLLOW_UP_DAYS = 7;

export default function LogVisitModal({
  isOpen,
  onClose,
  contacts,
  staff,
  visit = null,
  initialContactId = null,
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
  const [addingContact, setAddingContact] = useState(false);
  const [localCreatedContacts, setLocalCreatedContacts] = useState<Contact[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const me = effectiveUserId || user?.uid || '';
  const myName = user?.displayName || 'A full-timer';

  const allContacts = useMemo(
    () => [...contacts, ...localCreatedContacts],
    [contacts, localCreatedContacts],
  );

  // One person, one place — offer it rather than making them type it. Two people
  // in different halls means we genuinely don't know, so we ask.
  const placeFor = (contactIds: string[]): string => {
    const places = Array.from(
      new Set(contactIds.map((id) => allContacts.find((c) => c.id === id)?.location).filter(Boolean)),
    );
    return places.length === 1 ? (places[0] as string) : '';
  };

  /** Change who we saw, keeping the offered `where` in step until it's typed in. */
  const setPeople = (next: string[]) => {
    setIds(next);
    if (!whereTouched) setWhere(placeFor(next));
  };

  // Reset to the visit we're editing (or to a blank one) each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    const startIds = visit ? visit.contactIds.slice() : initialContactId ? [initialContactId] : [];
    setDate(visit ? visit.date : format(new Date(), 'yyyy-MM-dd'));
    setIds(startIds);
    setWent(visit ? visit.went.slice() : me ? [me] : []);
    setWhere(visit ? visit.where : placeFor(startIds));
    setWhereTouched(!!visit?.where);
    setPurpose(visit ? visit.purpose : '');
    setHow(visit ? visit.how : '');
    setFollowUpOn(!!visit?.followUp);
    setFollowUp(visit?.followUp || '');
    setPrayer('');
    setExistingPhotos(visit ? (visit.photos || []).slice() : []);
    setNewPhotos([]);
    setQ('');
  }, [isOpen, visit, initialContactId, me]);

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
        role: 'Contact',
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
        owner: me,
        hasNewActivity: true,
        attendance: {},
      };

      const docRef = await addDoc(collection(db, 'contacts'), contactData);
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
  const newPhotoUrls = useMemo(() => newPhotos.map((f) => URL.createObjectURL(f)), [newPhotos]);
  useEffect(() => () => newPhotoUrls.forEach((u) => URL.revokeObjectURL(u)), [newPhotoUrls]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    setNewPhotos((prev) => [...prev, ...Array.from(files)].slice(0, MAX_PHOTOS_PER_VISIT - existingPhotos.length));
  };

  const submit = async () => {
    if (!ids.length || saving) return;
    setSaving(true);
    try {
      const input: VisitInput = {
        date,
        contactIds: ids,
        contactNames: chosen.map((c) => c.name),
        went,
        wentNames: went.map((uid) => staff.find((s) => s.uid === uid)?.displayName || 'A full-timer'),
        where,
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
      handleFirestoreError(e, OperationType.WRITE, 'visits');
    } finally {
      setSaving(false);
    }
  };

  // Esc closes — the same shortcut the design gives the modal. ⌘↵ save lives
  // in the central shortcut registry (#337) so it both binds and teaches itself.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useCommand({
    id: 'logvisit.save',
    scope: 'overlay',
    description: 'Save the visit',
    shortcut: { key: 'Enter', mod: true },
    minRole: 'admin',
    available: () => isOpen,
    handler: () => void submit(),
  });

  const label = 'block text-[10px] font-semibold text-on-surface-variant   mb-2';
  const input =
    'w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-colors';
  const photoRemove =
    'absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-surface border border-outline-variant text-on-surface-variant hover:text-error transition-colors';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-label={editing ? t('modals.edit_a_visit') : t('modals.log_a_visit')}
            className="relative w-full max-w-2xl max-h-[90vh] bg-surface-container rounded-[2rem] shadow-2xl overflow-hidden border border-outline-variant flex flex-col"
          >
            <div className="p-6 border-b border-outline-variant flex items-center gap-3 bg-surface-container-high/50">
              <div className="w-12 h-12 bg-primary/10 text-accent rounded-2xl flex items-center justify-center shrink-0">
                <House className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-2xl text-on-surface">{editing ? t('modals.edit_a_visit') : t('modals.log_a_visit')}</h2>
                <p className="text-xs text-on-surface-variant">
                  {editing ? t('modals.visit_fix_record') : t('modals.visit_write_down')}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label={t('modals.close')}
                className="ml-auto p-2 rounded-full hover:bg-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Who did you see */}
              <div>
                <label className={label} htmlFor="visit-who">
                  {t('modals.who_did_you_see')}
                </label>
                <div className="flex flex-wrap items-center gap-2 p-2 bg-surface-container-low border border-outline-variant rounded-2xl">
                  {chosen.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-2 pl-1.5 pr-2 py-1 bg-primary/10 text-accent rounded-full text-xs font-medium"
                    >
                      <span className="w-5 h-5 rounded-full bg-primary/15 grid place-items-center text-[9px] font-semibold">
                        {initialsOf(c.name)}
                      </span>
                      {c.name}
                      <button onClick={() => setPeople(ids.filter((i) => i !== c.id))} aria-label={`Remove ${c.name}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="visit-who"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={chosen.length ? t('modals.anyone_else') : t('modals.start_typing_name')}
                    className="flex-1 min-w-[10rem] bg-transparent px-2 py-1 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
                  />
                </div>
                {(matches.length > 0 || canAddNew) && (
                  <div className="mt-2 rounded-2xl border border-outline-variant overflow-hidden">
                    {matches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setPeople([...ids, c.id]);
                          setQ('');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-variant transition-colors"
                      >
                        <span className="w-7 h-7 rounded-full bg-primary/10 text-accent grid place-items-center text-[10px] font-semibold">
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
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-variant transition-colors text-accent font-medium',
                          matches.length > 0 && 'border-t border-outline-variant/60',
                        )}
                      >
                        <span className="w-7 h-7 rounded-full bg-primary/15 text-accent grid place-items-center text-xs">
                          {addingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-sm">
                          {t('modals.add_someone_new').replace('{name}', newName)}
                        </span>
                        <span className="ml-auto text-xs text-on-surface-variant">{t('modals.starts_a_record')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* When / where */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="visit-date">
                    {t('modals.when')}
                  </label>
                  <input
                    id="visit-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={input}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="visit-where">
                    {t('modals.where')}
                  </label>
                  <input
                    id="visit-where"
                    value={where}
                    placeholder={t('modals.where_placeholder')}
                    onChange={(e) => {
                      setWhere(e.target.value);
                      setWhereTouched(true);
                    }}
                    className={input}
                  />
                </div>
              </div>

              {/* Who went */}
              <div>
                <span className={label}>{t('modals.who_went')}</span>
                <div className="flex flex-wrap gap-2">
                  {realStaff.map((s) => (
                    <button
                      key={s.uid}
                      aria-pressed={went.includes(s.uid)}
                      onClick={() =>
                        setWent((w) => (w.includes(s.uid) ? w.filter((x) => x !== s.uid) : [...w, s.uid]))
                      }
                      className={cn(
                        'px-3 py-1.5 rounded-full text-[13px] border transition-colors',
                        went.includes(s.uid)
                          ? 'bg-primary/10 border-accent-line text-accent'
                          : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface',
                      )}
                    >
                      {s.displayName}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-on-surface-variant">{t('modals.most_visits_are_a_pair')}</p>
              </div>

              {/* Why */}
              <div>
                <label className={label} htmlFor="visit-purpose">
                  {t('modals.why_you_went')}{' '}
                  <span className="normal-case tracking-normal font-normal">{t('modals.optional')}</span>
                </label>
                <input
                  id="visit-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={t('modals.why_placeholder')}
                  className={input}
                />
              </div>

              {/* How */}
              <div>
                <label className={label} htmlFor="visit-how">
                  {t('modals.how_it_went')}
                </label>
                <textarea
                  id="visit-how"
                  rows={5}
                  value={how}
                  onChange={(e) => setHow(e.target.value)}
                  placeholder={t('modals.how_placeholder')}
                  className={cn(input, 'resize-y')}
                />
              </div>

              {/* Follow-up */}
              <div>
                <span className={label}>
                  {t('modals.anything_follow_up')}{' '}
                  <span className="normal-case tracking-normal font-normal">{t('modals.optional')}</span>
                </span>
                <button
                  aria-pressed={followUpOn}
                  onClick={() => setFollowUpOn((v) => !v)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[13px] border transition-colors',
                    followUpOn
                      ? 'bg-primary/10 border-accent-line text-accent'
                      : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {followUpOn ? t('modals.yes_put_on_list') : t('modals.nothing_to_chase')}
                </button>
                {followUpOn && (
                  <>
                    <input
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      placeholder={t('modals.follow_up_placeholder')}
                      aria-label={t('modals.what_to_follow_up')}
                      className={cn(input, 'mt-3')}
                    />
                    {!editing && (
                      <p className="mt-2 text-xs text-on-surface-variant">
                        {t('modals.lands_as_todo').replace(
                          '{name}',
                          staff.find((s) => s.uid === (went[0] || me))?.displayName || t('modals.whoever_went'),
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Prayer — only on the way in; an edit shouldn't re-ask for one. */}
              {!editing && (
                <div>
                  <label className={label} htmlFor="visit-prayer">
                    {t('modals.prayer_came_out')}{' '}
                    <span className="normal-case tracking-normal font-normal">{t('modals.optional')}</span>
                  </label>
                  <input
                    id="visit-prayer"
                    value={prayer}
                    onChange={(e) => setPrayer(e.target.value)}
                    placeholder={
                      chosen[0] ? `${t('modals.something_to_carry')} ${chosen[0].name.split(' ')[0]}` : t('modals.something_to_carry')
                    }
                    className={input}
                  />
                  {prayer.trim() && chosen[0] && (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      {t('modals.added_to_prayers').replace('{name}', chosen[0].name.split(' ')[0])}
                    </p>
                  )}
                </div>
              )}

              {/* Photos */}
              <div>
                <span className={label}>
                  {t('modals.photos')}{' '}
                  <span className="normal-case tracking-normal font-normal">{t('modals.optional')}</span>
                </span>
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addPhotos(e.dataTransfer.files);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-6 rounded-2xl border border-dashed border-outline-variant text-sm text-on-surface-variant hover:border-primary hover:text-on-surface transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
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
                          className="w-20 h-20 object-cover rounded-xl border border-outline-variant"
                        />
                        <button
                          onClick={() => setExistingPhotos((x) => x.filter((y) => y.path !== p.path))}
                          aria-label={`Remove ${p.name || 'photo'}`}
                          className={photoRemove}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                    {newPhotos.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="relative">
                        <img
                          src={newPhotoUrls[i]}
                          alt={f.name || 'photo'}
                          className="w-20 h-20 object-cover rounded-xl border border-primary/30"
                        />
                        <button
                          onClick={() => setNewPhotos((x) => x.filter((_, j) => j !== i))}
                          aria-label={`Remove ${f.name}`}
                          className={photoRemove}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-outline-variant flex items-center gap-3 bg-surface-container-high/50">
              <span className="text-xs text-on-surface-variant">
                {ids.length ? t('modals.cmd_save') : t('modals.pick_one_person')}
              </span>
              <button
                onClick={onClose}
                className="ml-auto px-4 py-2 rounded-full text-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t('modals.cancel')}
              </button>
              <button
                onClick={submit}
                disabled={!ids.length || saving}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-on-primary text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? t('modals.saving') : editing ? t('modals.save_changes') : t('modals.log_the_visit')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
