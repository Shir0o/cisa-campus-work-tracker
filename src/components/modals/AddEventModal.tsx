import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

import DatePicker from '../ui/DatePicker';
import { useLanguage } from '../LanguageProvider';
import { PopupField, PopupFrame } from '../ui/PopupFrame';
import type { Contact } from '../../types';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEventCount: number;
  contacts?: Contact[];
}

// "Log a gathering" — a one-off Gathering. Cadence/roster-as-a-standing-thing
// lives on a Rhythm now (issue #957 / ADR 0016); "Start a Rhythm" (a separate
// entry point, CreateRhythmModal) is where those fields belong. This modal
// only ever creates a single `events` doc with no `rhythmId`.
export default function AddEventModal({ isOpen, onClose, currentEventCount, contacts = [] }: AddEventModalProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (isOpen) {
      setDirty(false);
      setSelectedRoster([]);
      setRosterSearch('');
      setFormData({ name: '', location: '', date: format(new Date(), 'yyyy-MM-dd') });
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.date) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'events'), {
        name: formData.name.trim(),
        location: formData.location.trim() || null,
        date: formData.date,
        order: currentEventCount,
        createdAt: new Date().toISOString(),
        roster: selectedRoster,
      });

      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full rounded-sm bg-surface-container-low border border-transparent px-3.5 py-2.5 text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none focus:border-outline transition-colors';

  return (
    <PopupFrame
      open={isOpen}
      onClose={onClose}
      size="sm"
      eyebrow={t('nav.attendance')}
      title={t('modals.log_a_gathering')}
      subtitle={t('modals.add_to_record')}
      dirty={dirty}
      noun={t('modals.gathering_noun')}
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={{
        label: t('modals.log_gathering'),
        onClick: () => void handleSubmit(),
        disabled: loading || !formData.name || !formData.date,
        saving: loading,
        savingLabel: t('modals.saving'),
      }}
    >
      <div className="space-y-5 px-7 py-5">
        <PopupField label={t('modals.name')} htmlFor="event-name">
          <input
            id="event-name"
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData((f) => ({ ...f, name: e.target.value }));
              setDirty(true);
            }}
            className={inputCls}
            placeholder={t('modals.example_gathering_name', 'e.g. Welcome BBQ')}
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

        <PopupField label={t('modals.location')} optional={t('modals.optional')} htmlFor="event-location">
          <input
            id="event-location"
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
                      <span className="text-[10px]">{isSelected ? <Plus className="h-3 w-3" /> : '+'}</span>
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
