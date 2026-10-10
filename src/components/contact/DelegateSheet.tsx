import React, { useEffect, useState } from "react";
import { useLanguage } from "../LanguageProvider";
import { PopupFrame, PopupSection } from "../ui/PopupFrame";
import type { ContactTeamMember } from "./types";

// Bringing a teammate onto a contact and asking them to act (ADR 0034). It
// stays a side panel (never a bottom sheet) but takes the shared popup frame's
// header, sections and pinned footer, and asks before it discards typed edits
// (spec #1444).
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

  const title = t('modals.contactDetails.delegate_person').replace('{name}', name);
  const dirty = !!staffId || !!note.trim();
  const fieldCls =
    "w-full rounded-sm bg-surface-container-low border border-transparent px-3.5 py-2.5 text-sm text-on-surface placeholder:text-[var(--text-mute)] focus:outline-none focus:border-outline transition-colors";

  return (
    <PopupFrame
      open={open}
      onClose={onClose}
      placement="side"
      size="sm"
      eyebrow={t('modals.contactDetails.delegate_eyebrow', 'Delegate')}
      title={title}
      subtitle={t('modals.contactDetails.delegate_subtitle', 'Bring a teammate in and ask them to act.')}
      dirty={dirty}
      discardQuestion={t('modals.contactDetails.delegate_discard', 'Discard this delegation?')}
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={{
        label: t('modals.contactDetails.delegate'),
        onClick: () => onDelegate(staffId, note.trim()),
        disabled: !staffId,
        savingLabel: t('modals.saving'),
      }}
    >
      <PopupSection label={t('modals.contactDetails.delegate_choose')}>
        <select
          aria-label={t('modals.contactDetails.delegate_choose')}
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className={fieldCls}
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
      </PopupSection>

      <PopupSection label={t('modals.contactDetails.delegate_note')}>
        <textarea
          aria-label={t('modals.contactDetails.delegate_note')}
          placeholder={t('modals.contactDetails.delegate_note_placeholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className={`${fieldCls} resize-none`}
        />
      </PopupSection>
    </PopupFrame>
  );
}
