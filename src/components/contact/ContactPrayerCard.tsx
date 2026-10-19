import { Heart } from "lucide-react";
import { cn } from "../../lib/utils";
import { splitPrayerBurden } from "../../lib/contactComposer";
import type { PrayerRecord } from "../../types";
import { useLanguage } from "../LanguageProvider";

type PrayerStatus = PrayerRecord["status"];

// Open is "pending"; the others keep the labels the old Mark pills used.
const PRAYER_STATUSES: { status: PrayerStatus; label: string }[] = [
  { status: "pending", label: "status_open" },
  { status: "ongoing", label: "ongoing" },
  { status: "answered", label: "answered" },
  { status: "unanswered", label: "archived" },
];

// A prayer on the story, in the prayer tone (#1672): the request leads, its
// context sits under it, and status is one control.
export default function ContactPrayerCard({
  prayer,
  canUpdatePrayers,
  onUpdateStatus,
  onEdit,
}: {
  prayer: PrayerRecord;
  canUpdatePrayers: boolean;
  onUpdateStatus: (prayer: PrayerRecord, status: PrayerStatus) => void;
  onEdit?: () => void;
}) {
  const { t } = useLanguage();
  const p = prayer;
  const { text, context } = splitPrayerBurden(p.burden);
  const heldDays = p.date
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(p.date).getTime()) / 86_400_000,
        ),
      )
    : null;
  const held =
    heldDays != null && !isNaN(heldDays)
      ? `${t('modals.contactDetails.held')} ${heldDays} ${heldDays === 1 ? t('modals.contactDetails.day') : t('modals.contactDetails.days')}`
      : null;

  return (
    <article aria-label={t('modals.contactDetails.prayer_request')} className="cd-prayer">
      <div className="cd-prayer-head">
        <span className="cd-prayer-badge" aria-hidden="true">
          <Heart className="w-3 h-3" />
        </span>
        <span className="cd-prayer-kind">{t('modals.contactDetails.prayer_request')}</span>
        <span className="cd-composer-spacer" />
        {canUpdatePrayers && onEdit && (
          <button
            type="button"
            className="cd-prayer-edit"
            aria-label={t('modals.contactDetails.edit_prayer')}
            onClick={onEdit}
          >
            {t('actions.edit')}
          </button>
        )}
      </div>
      <p className="cd-prayer-text">{text}</p>
      {context && <p className="cd-prayer-context">{context}</p>}
      {(canUpdatePrayers || held) && (
        <div className="cd-prayer-foot">
          {canUpdatePrayers && (
            <div
              role="group"
              aria-label={t('modals.contactDetails.prayer_status')}
              className="cd-prayer-status"
            >
              {PRAYER_STATUSES.map(({ status, label }) => {
                const on = (p.status || "pending") === status;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    className={cn(on && "on")}
                    onClick={() => onUpdateStatus(p, on ? "pending" : status)}
                  >
                    {t(`modals.contactDetails.${label}`)}
                  </button>
                );
              })}
            </div>
          )}
          <span className="cd-composer-spacer" />
          {held && <span className="cd-prayer-held">{held}</span>}
        </div>
      )}
    </article>
  );
}
