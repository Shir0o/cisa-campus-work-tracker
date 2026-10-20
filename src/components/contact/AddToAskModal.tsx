import React, { useEffect, useState } from "react";
import { useLanguage } from "../LanguageProvider";
import { PopupFrame, PopupSection } from "../ui/PopupFrame";
import { useAuth } from "../AuthProvider";
import { appendToAskLine, GENERAL_GROUP } from "../../lib/toAsk";
// "Add to To ask" (#1649) — from a contact's overflow menu, a Full-timer notes
// a question to ask in person. When more than one Trainee is tied to the
// person, they pick which one; with none tied the line lands under General,
// linked to the contact. Only the Full-timer ever sees it.

export interface AddToAskTrainee {
  id: string;
  name: string;
}

export default function AddToAskModal({
  open,
  contactId,
  contactName,
  trainees,
  onClose,
  onAdded,
}: {
  open: boolean;
  contactId: string;
  contactName: string;
  trainees: AddToAskTrainee[];
  onClose: () => void;
  onAdded?: () => void;
}) {
  const { t } = useLanguage();
  const { user, effectiveUserId } = useAuth();
  const uid = effectiveUserId || user?.uid || "";
  const [groupId, setGroupId] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) {
      setGroupId(trainees.length === 1 ? trainees[0].id : "");
      setText("");
    }
  }, [open, trainees]);

  const effectiveGroup = trainees.length === 0 ? GENERAL_GROUP : groupId;
  const canAdd = !!effectiveGroup && !!text.trim() && !!uid;

  const handleAdd = () => {
    if (!canAdd) return;
    const line = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: text.trim(),
      group: effectiveGroup,
      contactId,
      createdAt: new Date().toISOString(),
    };
    void appendToAskLine(uid, line).then(() => onAdded?.());
    onClose();
  };

  return (
    <PopupFrame
      open={open}
      onClose={onClose}
      placement="side"
      size="sm"
      eyebrow={t("toAsk.menu_item", "Add to To ask")}
      title={t("toAsk.picker_title", "Add to To ask")}
      subtitle={t("toAsk.linked_to", "Linked to {name}. Only you see it.").replace("{name}", contactName)}
      dirty={!!text.trim()}
      discardQuestion={t("modals.contactDetails.delegate_discard", "Discard this?")}
      cancelLabel={t("modals.cancel")}
      onCancel={onClose}
      primary={{
        label: t("toAsk.add", "Add"),
        onClick: handleAdd,
        disabled: !canAdd,
        savingLabel: t("modals.saving"),
      }}
    >
      {trainees.length > 0 && (
        <PopupSection
          label={
            trainees.length === 1
              ? t("toAsk.picker_legend_one", "Ask {name}").replace("{name}", trainees[0].name)
              : t("toAsk.picker_legend_multi", "Ask who? {name} has {count} Trainees tied.")
                  .replace("{name}", contactName)
                  .replace("{count}", String(trainees.length))
          }
        >
          <div className="flex flex-col gap-1.5">
            {trainees.map((tr) => (
              <label
                key={tr.id}
                className="flex items-center gap-2.5 min-h-11 px-3 rounded-lg border border-outline-variant cursor-pointer text-sm"
              >
                <input
                  type="radio"
                  name="to-ask-trainee"
                  checked={groupId === tr.id}
                  onChange={() => setGroupId(tr.id)}
                />
                {tr.name}
              </label>
            ))}
          </div>
        </PopupSection>
      )}
      {trainees.length === 0 && (
        <PopupSection label={t("toAsk.no_trainees", "No Trainee tied to {name} yet.").replace("{name}", contactName)}>
          <p className="text-xs text-on-surface-variant m-0">
            {t("toAsk.no_trainee_hint")}
          </p>
        </PopupSection>
      )}
      <PopupSection label={t("toAsk.line_label", "Line")}>
        <textarea
          aria-label={t("toAsk.line_label", "Line")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoFocus
          className="w-full rounded-sm bg-surface-container-low border border-transparent px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-outline transition-colors resize-none"
        />
      </PopupSection>
    </PopupFrame>
  );
}
