import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../LanguageProvider";
import type { ContactTeamMember } from "./types";

export default function DelegateSheet({
  open,
  name,
  members,
  onClose,
  onDelegate,
}: {
  open: boolean;
  name: string;
  members: ContactTeamMember[];
  onClose: () => void;
  onDelegate: (staffId: string, note: string) => void;
}) {
  const { t } = useLanguage();
  const [staffId, setStaffId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setStaffId("");
      setNote("");
    }
  }, [open]);

  if (!open) return null;

  const title = t('modals.contactDetails.delegate_person').replace('{name}', name);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md bg-surface rounded-[24px] border border-outline-variant shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-semibold text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modals.contactDetails.close')}
            title={t('modals.contactDetails.close')}
            className="w-9 h-9 rounded-full hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
          {t('modals.contactDetails.delegate_choose')}
        </label>
        <select
          aria-label={t('modals.contactDetails.delegate_choose')}
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="w-full h-11 px-3 mb-4 bg-surface-container-low border border-outline rounded-xl text-sm text-on-surface"
        >
          <option value="" disabled>
            {t('modals.contactDetails.delegate_choose')}
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.role}
            </option>
          ))}
        </select>

        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
          {t('modals.contactDetails.delegate_note')}
        </label>
        <textarea
          aria-label={t('modals.contactDetails.delegate_note')}
          placeholder={t('modals.contactDetails.delegate_note_placeholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 mb-4 bg-surface-container-low border border-outline rounded-xl text-sm text-on-surface resize-none"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-10 rounded-full text-sm font-semibold text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            {t('modals.contactDetails.cancel')}
          </button>
          <button
            type="button"
            disabled={!staffId}
            onClick={() => onDelegate(staffId, note.trim())}
            className="px-5 h-10 rounded-full bg-primary text-on-primary text-sm font-semibold disabled:opacity-50"
          >
            {t('modals.contactDetails.delegate')}
          </button>
        </div>
      </div>
    </div>
  );
}
