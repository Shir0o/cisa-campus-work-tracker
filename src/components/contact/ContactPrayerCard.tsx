import { cn } from "../../lib/utils";
import type { PrayerRecord } from "../../types";
import { useLanguage } from "../LanguageProvider";

type PrayerStatus = PrayerRecord["status"];

const PRAYER_MARK_ORDER: PrayerStatus[] = ["ongoing", "answered", "unanswered"];
const PRAYER_MARK_ON: Record<PrayerStatus, string> = {
  pending: "",
  ongoing: "bg-stage-accent-soft text-stage-accent border-stage-accent/40",
  answered: "bg-success/10 text-success border-success/40",
  unanswered: "bg-error/10 text-error border-error/40",
};

export default function ContactPrayerCard({
  prayer,
  canUpdatePrayers,
  onUpdateStatus,
}: {
  prayer: PrayerRecord;
  canUpdatePrayers: boolean;
  onUpdateStatus: (prayer: PrayerRecord, status: PrayerStatus) => void;
}) {
  const { t } = useLanguage();
  const p = prayer;
  const answered = p.status === "answered";
  const heldDays = p.date
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(p.date).getTime()) / 86_400_000,
        ),
      )
    : null;
  return (
    <div
      key={p.id}
      className="p-4 rounded-3xl bg-surface-container-high border border-outline-variant/40"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium",
            answered
              ? "bg-stage-teal-soft text-stage-teal"
              : p.status === "unanswered"
                ? "bg-surface-variant text-on-surface-variant"
                : "bg-stage-violet-soft text-stage-violet",
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              answered
                ? "bg-stage-teal"
                : p.status === "unanswered"
                  ? "bg-on-surface-variant"
                  : "bg-stage-violet",
            )}
          />
          {answered
            ? t('modals.contactDetails.answered')
            : p.status === "unanswered"
              ? t('modals.contactDetails.closed')
              : t('modals.contactDetails.open')}
        </span>
        {heldDays != null && (
          <span className="text-xs text-on-surface-variant/60">
            {t('modals.contactDetails.held')} {heldDays} {heldDays === 1 ? t('modals.contactDetails.day') : t('modals.contactDetails.days')}
          </span>
        )}
      </div>
      <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
        {p.burden}
      </p>
      {canUpdatePrayers && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-on-surface-variant mr-0.5">
            {t('modals.contactDetails.mark')}
          </span>
          {PRAYER_MARK_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                onUpdateStatus(
                  p,
                  p.status === s ? "pending" : s,
                )
              }
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                p.status === s
                  ? PRAYER_MARK_ON[s]
                  : "border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline",
              )}
            >
              {t('modals.contactDetails.' + (s === 'pending' ? 'unmarked' : s === 'ongoing' ? 'ongoing' : s === 'answered' ? 'answered' : 'archived'))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
