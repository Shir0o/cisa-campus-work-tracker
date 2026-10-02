import React, { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/Skeleton";
import { Translate } from "../Translate";
import { useLanguage } from "../LanguageProvider";
import type { StoryChange, StoryEntry } from "../../lib/contactStory";
import type { Interaction, PrayerRecord } from "../../types";

type TranslateFn = (key: string, fallback?: string) => string;

function changePhrases(change: StoryChange, t: TranslateFn): string[] {
  switch (change.type) {
    case "step":
      return [t('modals.contactDetails.story_change_step').replace('{from}', change.from).replace('{to}', change.to)];
    case "kind":
      return [t('modals.contactDetails.story_change_kind').replace('{from}', change.from).replace('{to}', change.to)];
    case "tags":
      return [
        ...change.added.map((tag) => t('modals.contactDetails.story_change_tag_added').replace('{tag}', tag)),
        ...change.removed.map((tag) => t('modals.contactDetails.story_change_tag_removed').replace('{tag}', tag)),
      ];
    case "field": {
      const label = t(`modals.contactDetails.story_field_${change.field}`, change.field);
      return [
        t('modals.contactDetails.story_change_field')
          .replace('{field}', label)
          .replace('{from}', change.from)
          .replace('{to}', change.to),
      ];
    }
    case "notes":
      return [t('modals.contactDetails.story_change_notes')];
    case "share":
      return [
        t(
          change.added
            ? 'modals.contactDetails.story_change_shared'
            : 'modals.contactDetails.story_change_unshared',
        ).replace('{name}', change.person),
      ];
    case "creator":
      return [
        t('modals.contactDetails.story_change_creator')
          .replace('{from}', change.from)
          .replace('{to}', change.to),
      ];
  }
}

function ChangeEntry({
  entry,
  t,
}: {
  entry: Extract<StoryEntry, { kind: 'change' }>;
  t: TranslateFn;
}) {
  const [expanded, setExpanded] = useState(false);
  const phrases = entry.changes.flatMap((change) => changePhrases(change, t));
  const visible = expanded ? phrases : phrases.slice(0, 1);
  const hidden = phrases.length - 1;

  return (
    <div className="cd-story-change">
      <strong>{entry.byName}</strong>
      {visible.map((phrase, index) => (
        <React.Fragment key={index}>
          <span className="cd-story-change-sep" aria-hidden="true">
            ·
          </span>
          <span>{phrase}</span>
        </React.Fragment>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="cd-story-change-more"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t('modals.contactDetails.story_show_less')
            : t('modals.contactDetails.story_more_changes').replace('{count}', String(hidden))}
        </button>
      )}
    </div>
  );
}

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
  onOpenStoryMessage,
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
  /** A message added to the story links back to its place in the Conversation. */
  onOpenStoryMessage?: (messageId: string) => void;
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
                (entry.kind === "added" || entry.kind === "prayer-answered" || entry.kind === "attendance") && "is-milestone",
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
                {entry.kind === "change" && <ChangeEntry entry={entry} t={t} />}
                {entry.kind === "story-message" && (
                  <div className="cd-story-quote">
                    <p className="cd-prose">{entry.body}</p>
                    <div className="cd-story-quote-foot">
                      <span>
                        {t('modals.contactDetails.story_message_said').replace('{name}', entry.fromName)}
                      </span>
                      {onOpenStoryMessage && (
                        <button
                          type="button"
                          className="cd-story-quote-link"
                          onClick={() => onOpenStoryMessage(entry.messageId)}
                        >
                          {t('modals.contactDetails.story_message_link')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {entry.kind === "attendance" && (
                  <div className="cd-story-milestone">
                    <strong>
                      {(entry.count > 1
                        ? t('modals.contactDetails.story_attended_weeks')
                        : t('modals.contactDetails.story_attended')
                      )
                        .replace('{name}', entry.name)
                        .replace('{count}', String(entry.count))}
                    </strong>
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
