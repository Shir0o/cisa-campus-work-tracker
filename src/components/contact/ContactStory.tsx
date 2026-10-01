import React from "react";
import { Heart } from "lucide-react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/Skeleton";
import { Translate } from "../Translate";
import { useLanguage } from "../LanguageProvider";
import type { StoryEntry } from "../../lib/contactStory";
import type { Interaction, PrayerRecord } from "../../types";

export default function ContactStory({
  story,
  fmtDate,
  isLoggingInteraction,
  isAddingPrayer,
  onCancelCompose,
  onStartLog,
  onStartPrayer,
  interactionsLoading,
  logInteractionForm,
  addPrayerForm,
  renderInteraction,
  renderPrayerCard,
}: {
  story: StoryEntry[];
  fmtDate: (v?: string | null) => string | null;
  isLoggingInteraction: boolean;
  isAddingPrayer: boolean;
  onCancelCompose: () => void;
  onStartLog: () => void;
  onStartPrayer: () => void;
  interactionsLoading: boolean;
  logInteractionForm: React.ReactNode;
  addPrayerForm: React.ReactNode;
  renderInteraction: (interaction: Interaction) => React.ReactNode;
  renderPrayerCard: (prayer: PrayerRecord) => React.ReactNode;
}) {
  const { t } = useLanguage();

  return (
    <section aria-label={t('modals.contactDetails.story_so_far')} className="cd-story">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.story_so_far')}</h3>
      </div>
      {isLoggingInteraction || isAddingPrayer ? (
        <div className="cd-story-compose-open">
          <button
            type="button"
            onClick={onCancelCompose}
            className="self-end text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {t('modals.contactDetails.cancel')}
          </button>
          {logInteractionForm}
          {addPrayerForm}
        </div>
      ) : (
        <div className="cd-story-compose">
          <button
            type="button"
            onClick={onStartLog}
            className="cd-story-compose-input"
          >
            {t('modals.contactDetails.write_what_happened')}
          </button>
          <button
            type="button"
            onClick={onStartPrayer}
            aria-label={t('modals.contactDetails.add_prayer')}
            title={t('modals.contactDetails.add_prayer')}
            className="cd-story-compose-pray"
          >
            <Heart className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Conversations are the spine; prayers join as their listener lands. */}
      {interactionsLoading ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : (
        <ol className="cd-story-list">
          {story.map((entry) => (
            <li
              key={`${entry.kind}:${entry.id}`}
              id={entry.kind === "conversation" ? `story-${entry.id}` : undefined}
              data-kind={entry.kind}
              className={cn(
                "cd-story-entry",
                (entry.kind === "step" || entry.kind === "added" || entry.kind === "prayer-answered") && "is-milestone",
              )}
            >
              <span className="cd-story-date">{fmtDate(entry.at)}</span>
              <span className="cd-story-dot" aria-hidden="true" />
              <div className="cd-story-body">
                {entry.kind === "conversation" && renderInteraction(entry.interaction)}
                {entry.kind === "prayer" && renderPrayerCard(entry.prayer)}
                {entry.kind === "prayer-answered" && (
                  <div className="cd-story-milestone">
                    <strong>{t('modals.contactDetails.prayer_answered_story')}</strong>
                    <span>{(entry.prayer.burden || "").split("\n\n")[0]}</span>
                    {entry.prayer.answer && (
                      <p className="cd-prose">
                        <Translate showOriginalToggle text={entry.prayer.answer} />
                      </p>
                    )}
                  </div>
                )}
                {entry.kind === "step" && (
                  <div className="cd-story-milestone">
                    <strong>
                      {entry.to
                        ? t('modals.contactDetails.moved_to').replace('{stage}', entry.to)
                        : t('modals.contactDetails.moved_out_of_steps')}
                    </strong>
                    <span>
                      {(entry.from
                        ? t('modals.contactDetails.story_moved_from_by').replace('{stage}', entry.from)
                        : t('modals.contactDetails.story_moved_by')
                      ).replace('{name}', entry.byName)}
                    </span>
                  </div>
                )}
                {entry.kind === "added" && (
                  <div className="cd-story-milestone">
                    <strong>
                      {entry.byName
                        ? t('modals.contactDetails.story_added_by').replace('{name}', entry.byName)
                        : t('modals.contactDetails.story_added')}
                    </strong>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
