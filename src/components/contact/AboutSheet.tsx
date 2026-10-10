import React from "react";
import { useLanguage } from "../LanguageProvider";
import { PopupFrame } from "../ui/PopupFrame";

// The person's profile sections, read in a side panel beside the story. It
// stays a side panel (never a bottom sheet) but takes the shared popup frame's
// header — and, being read-only, carries no footer (spec #1444).
export default function AboutSheet({
  open,
  name,
  onClose,
  children,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();

  const title = t('modals.contactDetails.about_person').replace('{name}', name);

  return (
    <PopupFrame
      open={open}
      onClose={onClose}
      placement="side"
      size="sm"
      eyebrow={t('modals.contactDetails.about_eyebrow', 'About')}
      title={title}
    >
      <div className="space-y-2 px-7 pb-6 pt-1">{children}</div>
    </PopupFrame>
  );
}
