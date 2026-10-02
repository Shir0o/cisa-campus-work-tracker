import React from "react";
import { Clock, Footprints, Loader2, UserCircle } from "lucide-react";
import { interactionAdapter, interactionThreadSummary } from "../stream/interactionAdapter";

type InteractionStreamAdapter = ReturnType<typeof interactionAdapter>;
import { ThreadChip } from "../stream/Stream";
import type { StreamViewer } from "../../lib/stream";
import type { Interaction } from "../../types";
import { Translate } from "../Translate";
import { useLanguage } from "../LanguageProvider";

export interface EditInteractionData {
  content: string;
  dateTime: string;
  type: string;
}

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
}: {
  interaction: Interaction;
  canEdit: boolean;
  canRemove: boolean;
  editing: boolean;
  editData: EditInteractionData;
  onEditDataChange: React.Dispatch<React.SetStateAction<EditInteractionData>>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (e: React.FormEvent) => void;
  updating: boolean;
  onRemove: () => void;
  adapterFor: (interaction: Interaction) => InteractionStreamAdapter;
  viewer: StreamViewer;
  threadOpen: boolean;
  onOpenThread: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div
      key={interaction.id}
      className="flex gap-3 group"
    >
      <div className="shrink-0 mt-0.5">
        {interaction.userPhoto ? (
          <img
            src={interaction.userPhoto}
            alt={interaction.userName}
            className="w-8 h-8 rounded-full border border-outline-variant"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
            <UserCircle className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <form
            onSubmit={onUpdate}
            className="space-y-3 p-3 rounded-3xl bg-surface-container-high border border-primary/20"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-on-surface-variant   px-1">
                  {t('modals.contactDetails.date')}
                </label>
                <input
                  type="datetime-local"
                  required
                  value={editData.dateTime}
                  onChange={(e) =>
                    onEditDataChange((prev) => ({
                      ...prev,
                      dateTime: e.target.value,
                    }))
                  }
                  className="w-full h-8 px-2 rounded-md bg-surface border border-outline-variant focus:border-primary outline-none text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-on-surface-variant   px-1">
                  {t('modals.contactDetails.type')}
                </label>
                <select
                  value={editData.type}
                  onChange={(e) =>
                    onEditDataChange((prev) => ({
                      ...prev,
                      type: e.target.value,
                    }))
                  }
                  className="w-full h-8 px-2 rounded-md bg-surface border border-outline-variant focus:border-primary outline-none text-xs"
                >
                  <option value="chat">
                    {t('modals.contactDetails.chat_message')}
                  </option>
                  <option value="call">
                    {t('modals.contactDetails.phone_call')}
                  </option>
                  <option value="meeting">
                    {t('modals.contactDetails.meeting')}
                  </option>
                  <option value="email">{t('modals.contactDetails.email')}</option>
                  <option value="interaction">
                    {t('modals.contactDetails.other')}
                  </option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-on-surface-variant   px-1">
                {t('modals.contactDetails.content')}
              </label>
              <textarea
                required
                value={editData.content}
                onChange={(e) =>
                  onEditDataChange((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
                className="w-full min-h-[60px] p-2 rounded-md bg-surface border border-outline-variant focus:border-primary outline-none text-xs resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1 border-t border-outline-variant/30">
              <button
                type="button"
                onClick={onCancelEdit}
                className="h-7 px-3 text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none"
              >
                {t('modals.contactDetails.cancel')}
              </button>
              <button
                type="submit"
                disabled={updating || !editData.content.trim()}
                className="h-7 px-3 bg-primary text-on-primary rounded text-[11px] font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 focus:outline-none"
              >
                {updating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  t('modals.contactDetails.save')
                )}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-on-surface  tracking-tight">
                  {interaction.reachedByName || interaction.userName}
                </span>
                {interaction.reachedByName &&
                  interaction.reachedByName !== interaction.userName && (
                    <span className="text-[10px] font-medium text-on-surface-variant">
                      {t('modals.contactDetails.logged_by').replace('{name}', interaction.userName || '')}
                    </span>
                  )}
                <span className="text-[10px] font-semibold text-accent bg-primary/10 px-2 py-0.5 rounded-full  ">
                  {new Date(
                    interaction.dateTime,
                  ).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 transition-opacity">
                {canEdit && (
                  <button
                    onClick={onStartEdit}
                    className="text-[10px] font-semibold text-accent hover:text-accent-variant   focus:outline-none"
                  >
                    {t('actions.edit')}
                  </button>
                )}
                {canRemove && (
                  <button
                    onClick={onRemove}
                    className="text-[10px] font-semibold text-error hover:opacity-80 focus:outline-none"
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
              <span className="text-[10px] font-semibold text-on-surface-variant/40  ">
                {interaction.createdAt
                  ? t('modals.contactDetails.logged_at').replace('{date}', new Date(interaction.createdAt).toLocaleDateString()).replace('{time}', new Date(interaction.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
                  : t('modals.contactDetails.logging')}
              </span>
              {(interaction.duration ||
                interaction.type) && (
                <span className="text-[10px] font-semibold text-on-surface-variant/40   flex items-center gap-1">
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
