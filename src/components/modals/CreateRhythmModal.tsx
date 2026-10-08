import React, { useState, useEffect } from 'react';
import { format, addMonths, getDay } from 'date-fns';
import { cn } from '../../lib/utils';
import { createRhythm } from '../../lib/rhythms';
import { useLanguage } from '../LanguageProvider';
import { useAuth } from '../AuthProvider';
import { PopupField, PopupFrame } from '../ui/PopupFrame';
import type { Contact, Rhythm } from '../../types';

interface CreateRhythmModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts?: Contact[];
}

const DAYS = [
  { label: 'S', value: 0 },
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
];

const blankForm = () => ({
  name: '',
  location: '',
  cadenceType: 'weekly' as Rhythm['cadence']['type'],
  days: [] as number[],
  termStart: format(new Date(), 'yyyy-MM-dd'),
  termEnd: format(addMonths(new Date(), 4), 'yyyy-MM-dd'),
});

// "Start a Rhythm" — a standing gathering (name/cadence/location/roster/term)
// as its own Firestore record (issue #957 / ADR 0016). A separate entry point
// from "Log a gathering" (AddEventModal), chosen before any form fields
// render — not a toggle inside one modal.
export default function CreateRhythmModal({ isOpen, onClose, contacts = [] }: CreateRhythmModalProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [formData, setFormData] = useState(blankForm);

  useEffect(() => {
    if (isOpen) {
      setFormData(blankForm());
      setSelectedRoster([]);
      setRosterSearch('');
      setDirty(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (formData.termStart && formData.days.length === 0) {
      const day = getDay(new Date(`${formData.termStart}T00:00:00`));
      setFormData((f) => ({ ...f, days: [day] }));
    }
  }, [formData.termStart, formData.days.length]);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.termStart || !formData.termEnd) return;
    setLoading(true);
    try {
      await createRhythm({
        name: formData.name.trim(),
        cadence: { type: formData.cadenceType, days: formData.days },
        location: formData.location.trim() || undefined,
        roster: selectedRoster,
        termStart: formData.termStart,
        termEnd: formData.termEnd,
        createdById: user?.uid || 'unknown',
      });
      onClose();
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
      title={t('modals.start_a_rhythm', 'Start a Rhythm')}
      subtitle={t('modals.rhythm_sub', 'A standing gathering, term-long.')}
      dirty={dirty}
      noun={t('modals.rhythm_noun')}
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={{
        label: t('modals.create_schedule'),
        onClick: () => void handleSubmit(),
        disabled: loading || !formData.name.trim(),
        saving: loading,
        savingLabel: t('modals.saving'),
      }}
    >
      <div className="space-y-5 px-7 py-5">
        <PopupField label={t('modals.name')} htmlFor="rhythm-name">
          <input
            id="rhythm-name"
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData((f) => ({ ...f, name: e.target.value }));
              setDirty(true);
            }}
            className={inputCls}
            placeholder={t('modals.example_rhythm_name', 'e.g. Wednesday Bible Study')}
          />
        </PopupField>

        <PopupField label={t('modals.frequency')}>
          <div className="flex gap-2">
            {(['weekly', 'monthly'] as const).map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => {
                  setFormData((f) => ({ ...f, cadenceType: ct }));
                  setDirty(true);
                }}
                className={cn(
                  'h-9 flex-1 rounded-full border text-xs font-medium capitalize transition-colors',
                  formData.cadenceType === ct
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant bg-surface-container-low text-on-surface-variant',
                )}
              >
                {ct}
              </button>
            ))}
          </div>
        </PopupField>

        {formData.cadenceType === 'weekly' && (
          <PopupField label={t('modals.repeat_on')}>
            <div className="flex justify-between gap-1">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => {
                    setFormData((f) => {
                      const days = f.days.includes(day.value)
                        ? f.days.filter((d) => d !== day.value)
                        : [...f.days, day.value];
                      return days.length > 0 ? { ...f, days } : f;
                    });
                    setDirty(true);
                  }}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-[10px] text-[10px] font-semibold transition-colors',
                    formData.days.includes(day.value)
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant bg-surface-container-low text-on-surface-variant',
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </PopupField>
        )}

        <div className="grid grid-cols-2 gap-3">
          <PopupField label={t('modals.date')} htmlFor="rhythm-term-start">
            <input
              id="rhythm-term-start"
              type="date"
              value={formData.termStart}
              onChange={(e) => {
                setFormData((f) => ({ ...f, termStart: e.target.value }));
                setDirty(true);
              }}
              className={inputCls}
            />
          </PopupField>
          <PopupField label={t('modals.end_by')} htmlFor="rhythm-term-end">
            <input
              id="rhythm-term-end"
              type="date"
              value={formData.termEnd}
              onChange={(e) => {
                setFormData((f) => ({ ...f, termEnd: e.target.value }));
                setDirty(true);
              }}
              className={inputCls}
            />
          </PopupField>
        </div>

        <PopupField label={t('modals.location', 'Location')} optional={t('common.optional', '(optional)')} htmlFor="rhythm-location">
          <input
            id="rhythm-location"
            type="text"
            value={formData.location}
            onChange={(e) => {
              setFormData((f) => ({ ...f, location: e.target.value }));
              setDirty(true);
            }}
            className={inputCls}
            placeholder={t('modals.example_location', 'e.g. Lower Common Room')}
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
