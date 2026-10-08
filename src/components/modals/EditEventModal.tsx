import React, { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import type { Contact, Gathering } from '../../types';
import DatePicker from '../ui/DatePicker';
import { useLanguage } from '../LanguageProvider';
import { PopupField, PopupFrame } from '../ui/PopupFrame';

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Gathering | null;
  contacts?: Contact[];
}

// Edit a one-off Gathering's own fields — name / date / location / expected
// roster / cancel. A Rhythm-linked occasion's own fields (name, cadence,
// location, roster) are edited from the Rhythm drawer instead (issue #957 /
// ADR 0016) — this modal is reached only for Gatherings with no `rhythmId`.
export default function EditEventModal({ isOpen, onClose, event, contacts = [] }: EditEventModalProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formData, setFormData] = useState({ name: '', location: '', date: '' });
  const [selectedRoster, setSelectedRoster] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');

  useEffect(() => {
    if (isOpen && event) {
      setFormData({
        name: event.name ?? '',
        location: event.location ?? '',
        date: event.date ?? '',
      });
      setSelectedRoster(event.roster ?? []);
      setRosterSearch('');
      setDirty(false);
    }
  }, [isOpen, event]);

  const handleSubmit = async () => {
    if (!event || !formData.name.trim() || !formData.date) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'events', event.id), {
        name: formData.name.trim(),
        location: formData.location.trim() || null,
        date: formData.date,
        roster: selectedRoster,
      });

      logActivity({
        action: 'edited the gathering',
        targetId: event.id,
        targetName: formData.name.trim(),
        targetType: 'event',
        type: 'edit',
        description: `Updated "${formData.name.trim()}" — ${formData.date}`,
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${event.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!event) return;
    try {
      await updateDoc(doc(db, 'events', event.id), { cancelled: !event.cancelled });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${event.id}`);
    }
  };

  const inputCls =
    'w-full rounded-sm bg-surface-container-low border border-transparent px-3.5 py-2.5 text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none focus:border-outline transition-colors';

  return (
    <PopupFrame
      open={isOpen && Boolean(event)}
      onClose={onClose}
      size="sm"
      eyebrow={t('nav.attendance')}
      title={t('modals.edit_gathering')}
      subtitle={t('modals.fix_detail')}
      dirty={dirty}
      noun={t('modals.gathering_noun')}
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      destructive={
        event
          ? {
              label: event.cancelled
                ? t('attendance.undo_cancel', 'Un-cancel this gathering')
                : t('attendance.cancel_gathering', 'Cancel this gathering'),
              onClick: () => void handleCancel(),
            }
          : null
      }
      primary={{
        label: t('modals.save_changes'),
        onClick: () => void handleSubmit(),
        disabled: loading || !formData.name.trim() || !formData.date,
        saving: loading,
        savingLabel: t('modals.saving'),
      }}
    >
      <div className="space-y-5 px-7 py-5">
        <PopupField label={t('modals.name')} htmlFor="edit-event-name">
          <input
            id="edit-event-name"
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData((f) => ({ ...f, name: e.target.value }));
              setDirty(true);
            }}
            className={inputCls}
            placeholder={t('modals.event_name_placeholder')}
          />
        </PopupField>

        <DatePicker
          label={t('modals.date')}
          value={formData.date}
          onChange={(val) => {
            setFormData((f) => ({ ...f, date: val }));
            setDirty(true);
          }}
          required
        />

        <PopupField label={t('modals.location')} optional={t('modals.optional')} htmlFor="edit-event-location">
          <input
            id="edit-event-location"
            type="text"
            value={formData.location}
            onChange={(e) => {
              setFormData((f) => ({ ...f, location: e.target.value }));
              setDirty(true);
            }}
            className={inputCls}
            placeholder={t('modals.location_placeholder')}
          />
        </PopupField>

        {contacts.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-on-surface">{t('attendance.expected_roster')}</p>
              <span className="text-[11px] font-medium text-accent">
                {t('modals.selected_count').replace('{n}', String(selectedRoster.length))}
              </span>
            </div>
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder={t('attendance.add_attendee_or_walkin')}
              className={cn(inputCls, 'text-xs')}
            />
            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {contacts
                .filter((c) => !rosterSearch.trim() || c.name.toLowerCase().includes(rosterSearch.toLowerCase()))
                .slice(0, 20)
                .map((c) => {
                  const isSelected = selectedRoster.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedRoster((prev) =>
                          isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                        );
                        setDirty(true);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-[10px] px-2.5 py-1.5 text-left text-xs transition-colors',
                        isSelected
                          ? 'bg-primary/10 font-medium text-accent'
                          : 'text-on-surface-variant hover:bg-surface-container',
                      )}
                    >
                      <span>{c.name}</span>
                      <span className="text-[10px]">{isSelected ? '✓' : '+'}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </PopupFrame>
  );
}
