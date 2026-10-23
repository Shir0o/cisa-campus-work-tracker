import React from "react";
import { Clock, Footprints, UserCircle } from "lucide-react";
import { interactionAdapter, interactionThreadSummary } from "../stream/interactionAdapter";

type InteractionStreamAdapter = ReturnType<typeof interactionAdapter>;
import { ThreadChip } from "../stream/Stream";
import type { StreamViewer } from "../../lib/stream";
import type { Interaction } from "../../types";
import { Translate } from "../Translate";
import { useLanguage } from "../LanguageProvider";
import ContactComposer from "./ContactComposer";
import type { ComposerValue } from "../../lib/contactComposer";
import type { ContactTeamMember } from "./types";
import { getUserInitials } from "../../lib/utils";

export default function ContactInteractionItem({
  interaction,
  canEdit,
  canRemove,
  editing,
  editData,
  onEditDataChange,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  updating,
  onRemove,
  adapterFor,
  viewer,
  threadOpen,
  onOpenThread,
  firstName = "",
  teamMembers,
}: {
  interaction: Interaction;
  canEdit: boolean;
  canRemove: boolean;
  editing: boolean;
  editData: ComposerValue;
  onEditDataChange: React.Dispatch<React.SetStateAction<ComposerValue>>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (e: React.FormEvent) => void;
  updating: boolean;
  onRemove: () => void;
  adapterFor: (interaction: Interaction) => InteractionStreamAdapter;
  viewer: StreamViewer;
  threadOpen: boolean;
  onOpenThread: () => void;
  firstName?: string;
  /** The roster the reacher's portrait is resolved from (#1669). */
  teamMembers: ContactTeamMember[];
}) {
  const { t } = useLanguage();

  // An interaction logged on someone else's behalf belongs to the reacher, so
  // the avatar follows them — never the logger's face (#1669). Their photo
  // comes from the roster the page already subscribes to; without one, their
  // initials. Only a row with no on-behalf-of shows the logger.
  const reacherId = interaction.reachedById || "";
  const reacher = reacherId ? teamMembers.find((m) => m.id === reacherId) : undefined;
  const avatarName = reacherId
    ? reacher?.name || interaction.reachedByName || ""
    : interaction.userName || "";
  const avatarPhoto = reacherId ? reacher?.photoURL || "" : interaction.userPhoto || "";
  const avatarInitials =
    reacherId && avatarName ? reacher?.initials || getUserInitials(avatarName) : "";

  return (
    <div
      key={interaction.id}
      className="flex gap-3 group"
    >
      <div
        className="shrink-0 mt-0.5"
        data-testid="story-avatar"
        data-avatar-name={avatarName}
      >
        {avatarPhoto ? (
          <img
            src={avatarPhoto}
            alt={avatarName}
            className="w-8 h-8 rounded-full border border-outline-variant"
            referrerPolicy="no-referrer"
          />
        ) : avatarInitials ? (
          <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-semibold flex items-center justify-center">
            {avatarInitials}
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
            <UserCircle className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          // The story's composer reopens in place (#1673).
          <ContactComposer
            open
            variant="edit"
            value={editData}
            onChange={onEditDataChange}
            onOpen={() => {}}
            onCancel={onCancelEdit}
            onSubmit={onUpdate}
            submitting={updating}
            firstName={firstName}
          />
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-on-surface  tracking-tight">
                  {interaction.reachedByName || interaction.userName}
                </span>
                {interaction.reachedByName &&
                  interaction.reachedByName !== interaction.userName && (
                    <span className="text-[11px] font-medium text-on-surface-variant">
                      {t('modals.contactDetails.logged_by').replace('{name}', interaction.userName || '')}
                    </span>
                  )}
                <span className="text-[11px] font-semibold text-accent bg-primary/10 px-2 py-0.5 rounded-full  ">
                  {new Date(
                    interaction.dateTime,
                  ).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-1 -my-3">
                {canEdit && (
                  <button
                    onClick={onStartEdit}
                    className="min-h-11 px-2 text-[11px] font-semibold text-accent hover:text-accent-variant   focus:outline-none"
                  >
                    {t('actions.edit')}
                  </button>
                )}
                {canRemove && (
                  <button
                    onClick={onRemove}
                    className="min-h-11 px-2 text-[11px] font-semibold text-error hover:opacity-80 focus:outline-none"
                  >
                    {t('modals.contactDetails.remove_interaction')}
                  </button>
                )}
              </div>
            </div>
            <div className="p-3 rounded-2xl rounded-tl-none bg-surface-container-high text-on-surface text-sm leading-relaxed border border-outline-variant/30 group-hover:border-outline-variant transition-colors whitespace-pre-wrap">
              <Translate showOriginalToggle text={interaction.content} />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-on-surface-variant  ">
                {interaction.createdAt
                  ? t('modals.contactDetails.logged_at').replace('{date}', new Date(interaction.createdAt).toLocaleDateString()).replace('{time}', new Date(interaction.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
                  : t('modals.contactDetails.logging')}
              </span>
              {(interaction.duration ||
                interaction.type) && (
                <span className="text-[11px] font-semibold text-on-surface-variant   flex items-center gap-1">
                  {interaction.type && (
                    <span className="px-1.5 py-0.5 rounded bg-surface-container-high">
                      {interaction.type}
                    </span>
                  )}
                  {interaction.duration && (
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {interaction.duration}
                    </span>
                  )}
                </span>
              )}
            </div>
            {/* The team's Thread on this interaction: a replies chip, or an
                invitation to start one. Either opens the Thread in the drawer. */}
            <div className="mt-2">
              {(() => {
                const summary = interactionThreadSummary(adapterFor(interaction), viewer, Date.now());
                return summary ? (
                  <ThreadChip summary={summary} open={threadOpen} onClick={onOpenThread} />
                ) : (
                  <button
                    type="button"
                    onClick={onOpenThread}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/60 hover:text-accent transition-colors"
                  >
                    <Footprints className="w-3.5 h-3.5" />
                    {t('stream.think_together')}
                  </button>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
