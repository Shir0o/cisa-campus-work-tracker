import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Heart,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../LanguageProvider";
import KindChip from "../ui/KindChip";
import { StageMenu } from "../ui/StagePicker";
import { getEffectiveContactTags, tagStyle } from "../../lib/tags";
import { stageToneStyle } from "../../lib/stageTones";
import type { Contact, Stage } from "../../types";

export interface ContactTab {
  id: string;
  label: string;
  count?: number;
}

function MoreMenu({
  onLogInteraction,
  onAddPrayer,
  onEdit,
  showEdit,
}: {
  onLogInteraction: () => void;
  onAddPrayer: () => void;
  onEdit: () => void;
  showEdit: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('modals.contactDetails.more_actions', 'More actions')}
        title={t('modals.contactDetails.more_actions', 'More actions')}
        className="w-9 h-9 rounded-full border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors flex items-center justify-center"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 min-w-[200px] bg-surface rounded-xl border border-outline-variant shadow-lg py-1.5">
          <button
            onClick={() => { setOpen(false); onLogInteraction(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-container-high transition-colors"
          >
            <MessageSquare className="w-4 h-4" /> {t('modals.contactDetails.log_interaction')}
          </button>
          <button
            onClick={() => { setOpen(false); onAddPrayer(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-container-high transition-colors"
          >
            <Heart className="w-4 h-4" /> {t('modals.contactDetails.add_prayer')}
          </button>
          {showEdit && (
            <button
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-container-high transition-colors"
            >
              <Edit3 className="w-4 h-4" /> {t('modals.contactDetails.edit_details')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContactHead({
  isMobile,
  isEditing,
  contact,
  currentContact,
  stages,
  canMoveStage,
  currentStageIndex,
  currentStageInfo,
  sinceText,
  carerNames,
  role,
  activeTab,
  tabs,
  onClose,
  onEdit,
  onCancelEdit,
  onCall,
  onText,
  onEmail,
  onLogInteraction,
  onStartPrayer,
  onMoveStage,
  onOpenMoveSheet,
  onChangeTab,
}: {
  isMobile: boolean;
  isEditing: boolean;
  contact: Contact;
  currentContact: Contact;
  stages: Stage[];
  canMoveStage: boolean;
  currentStageIndex: number;
  currentStageInfo: Stage | undefined;
  sinceText: string;
  carerNames: string[];
  role: string;
  activeTab: string;
  tabs: ContactTab[];
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  onLogInteraction: () => void;
  onStartPrayer: () => void;
  onMoveStage: (label: string) => void;
  onOpenMoveSheet: () => void;
  onChangeTab: (tab: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <>
      {isMobile ? (
        isEditing ? (
          /* Mobile Editing Header */
          <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-outline-variant shrink-0">
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-sm font-semibold text-on-surface-variant"
            >
              {t('modals.contactDetails.cancel')}
            </button>
            <h3 className="font-serif text-base text-on-surface font-semibold">{t('modals.contactDetails.edit_details')}</h3>
            <button
              type="submit"
              form="edit-contact-form"
              className="px-3.5 py-1.5 bg-primary text-on-primary rounded-full text-xs font-semibold"
            >
              {t('modals.contactDetails.save')}
            </button>
          </div>
        ) : (
          /* Mobile Profile Header */
          <div className="shrink-0 flex flex-col bg-surface border-b border-outline-variant/30">
            {/* Top back bar */}
            <div className="cdm-top px-5 pt-4 flex items-center justify-between">
              <button
                onClick={onClose}
                className="cdm-back text-on-surface-variant font-medium text-sm inline-flex items-center gap-1"
              >
                <ChevronRight className="w-4.5 h-4.5 rotate-180 cdm-back-ico text-on-surface-variant" />
                <span>{t('modals.contactDetails.people')}</span>
              </button>
              {role !== 'viewer' && (
                <button
                  onClick={onEdit}
                  className="px-3.5 py-1.5 rounded-full border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-variant transition-colors"
                >
                  {t('actions.edit') || 'Edit'}
                </button>
              )}
            </div>

            {/* Hero Block */}
            <div className="cdm-hero px-5 pt-1 pb-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-semibold text-xl shrink-0">
                  {contact.initials}
                </div>
                <div className="cdm-hero-main min-w-0 flex-1">
                  <h2 className="font-serif text-2xl text-on-surface leading-tight truncate cd-name">
                    {contact.name}
                  </h2>
                  <div className="cdm-chip-row flex flex-wrap gap-1 mt-1.5">
                    {getEffectiveContactTags(contact.tags, contact.createdAt).map((t) => (
                      <span
                        key={t}
                        style={tagStyle(t)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--tone-soft)] text-[var(--tone)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {canMoveStage ? (
                    <button
                      onClick={onOpenMoveSheet}
                      style={stageToneStyle(currentStageInfo?.color, currentStageIndex)}
                      aria-label={`${t('modals.contactDetails.move_to_step')}: ${currentContact.stage || t('modals.contactDetails.not_in_step')}`}
                      className={cn(
                        "cdm-stage-btn mt-2.5 inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-full text-sm font-semibold",
                        currentContact.stage
                          ? "bg-[var(--tone-soft)] border border-[var(--tone)]/40 text-[var(--tone)]"
                          : "border border-outline text-on-surface-variant",
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full", currentContact.stage ? "bg-[var(--tone)]" : "bg-outline")} />
                      <span className="truncate max-w-[200px]">{currentContact.stage || t('modals.contactDetails.not_in_step')}</span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                    </button>
                  ) : currentContact.stage ? (
                    <span className="cd-stage-pill mt-2.5">{currentContact.stage}</span>
                  ) : null}
                  <p className="text-xs text-on-surface-variant cdm-meta mt-3">
                    {[contact.role, contact.lastContactedBy ? `contacted by ${contact.lastContactedBy}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            </div>

            {/* Communication Tiles */}
            <div className="cdm-comm px-5 pb-4">
              {contact.phone && (
                <button onClick={onCall}>
                  <span className="cdm-comm-ico"><Phone className="w-4.5 h-4.5" /></span>
                  <span>{t('modals.contactDetails.call')}</span>
                </button>
              )}
              {contact.phone && (
                <button onClick={onText}>
                  <span className="cdm-comm-ico"><MessageSquare className="w-4.5 h-4.5" /></span>
                  <span>{t('modals.contactDetails.text')}</span>
                </button>
              )}
              {contact.email && (
                <button onClick={onEmail}>
                  <span className="cdm-comm-ico"><Mail className="w-4.5 h-4.5" /></span>
                  <span>{t('modals.contactDetails.email')}</span>
                </button>
              )}
            </div>

            {/* Two Primary Actions */}
            <div className="cdm-primary px-5 pb-5 flex gap-2">
              <button onClick={onLogInteraction} className="btn bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 flex-1 min-h-[48px] rounded-xl text-sm">
                <MessageSquare className="w-4 h-4" /> {t('modals.contactDetails.log_interaction')}
              </button>
              <button onClick={onStartPrayer} className="btn bg-stage-violet-soft text-stage-violet font-semibold flex items-center justify-center gap-2 border border-stage-violet/20 flex-1 min-h-[48px] rounded-xl text-sm">
                <Heart className="w-4 h-4" /> {t('modals.contactDetails.prayer')}
              </button>
            </div>
          </div>
        )
      ) : (
        /* Desktop header — single 56px row carrying avatar, name, stage,
         * "Last connected … · Cared for by …", and a compact icon
         * cluster on the right. The aside's "Cared for by" is promoted
         * here so the one glance-level fact stays on screen from every
         * tab (#780). */
        <header className="cd-head">
          <div className="cd-head-avatar">{contact.initials}</div>
          <div className="cd-head-main">
            <div className="cd-name-row">
              <h2 className="cd-name">{isEditing ? t('modals.contactDetails.edit_details') : contact.name}</h2>
              {!isEditing && contact.pronouns && (
                <span className="cd-pronouns">{contact.pronouns}</span>
              )}
              {!isEditing && (canMoveStage ? (
                <StageMenu
                  stages={stages}
                  current={currentContact.stage || ""}
                  onSelect={onMoveStage}
                />
              ) : currentContact.stage ? (
                <span className="cd-stage-pill">{currentContact.stage}</span>
              ) : null)}
              {/* Everyone tied to a person sees who they are, whether or
                * not they may change it (#1152). */}
              {!isEditing && <KindChip contact={currentContact} />}
            </div>
            {!isEditing && (
              <div className="cd-head-sub">
                <span>{sinceText}</span>
                {carerNames.length > 0 && (
                  <>
                    <span className="sep">·</span>
                    <span>{t('modals.contactDetails.cared_for_by')} <b>{carerNames.join(', ')}</b></span>
                  </>
                )}
              </div>
            )}
          </div>
          {!isEditing && (
            <div className="cd-actions">
              {contact.phone && (
                <button
                  onClick={onCall}
                  title={t('modals.contactDetails.call')}
                  aria-label={t('modals.contactDetails.call')}
                  className="w-9 h-9 rounded-full border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors flex items-center justify-center"
                >
                  <Phone className="w-4 h-4" />
                </button>
              )}
              {contact.phone && (
                <button
                  onClick={onText}
                  title={t('modals.contactDetails.text')}
                  aria-label={t('modals.contactDetails.text')}
                  className="w-9 h-9 rounded-full border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors flex items-center justify-center"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              )}
              {contact.email && (
                <button
                  onClick={onEmail}
                  title={t('modals.contactDetails.email')}
                  aria-label={t('modals.contactDetails.email')}
                  className="w-9 h-9 rounded-full border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors flex items-center justify-center"
                >
                  <Mail className="w-4 h-4" />
                </button>
              )}
              <MoreMenu
                onLogInteraction={onLogInteraction}
                onAddPrayer={onStartPrayer}
                onEdit={onEdit}
                showEdit={role !== 'viewer'}
              />
              <button
                onClick={onClose}
                title={t('modals.contactDetails.close')}
                aria-label={t('modals.contactDetails.close')}
                className="w-9 h-9 rounded-full hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>
      )}

      {/* Content Tab Switcher — phones only; desktop is one story page */}
      {!isEditing && isMobile && (
        /* Mobile Dropdown Switcher */
        <div className="cdm-switch sticky top-0 z-10 bg-surface border-t border-b border-outline-variant/35 px-5 py-2.5">
          <div className="relative">
            <select
              value={activeTab}
              onChange={(e) => onChangeTab(e.target.value)}
              className="w-full h-11 pl-4 pr-10 bg-surface-container-low border border-outline rounded-xl text-sm font-semibold appearance-none cursor-pointer text-on-surface cdm-select"
            >
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} {t.count != null ? `(${t.count})` : ""}
                </option>
              ))}
            </select>
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-on-surface-variant/75 cdm-select-caret">
              ▾
            </span>
          </div>
        </div>
      )}
    </>
  );
}
