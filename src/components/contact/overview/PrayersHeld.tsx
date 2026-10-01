import { Skeleton } from "../../ui/Skeleton";
import { Translate } from "../../Translate";
import { useLanguage } from "../../LanguageProvider";
import type { PrayerRecord } from "../../../types";

function heldDays(date?: string): number | null {
  if (!date) return null;
  const d = new Date(date).getTime();
  return isNaN(d) ? null : Math.max(1, Math.floor((Date.now() - d) / 86_400_000));
}

export default function PrayersHeld({
  loading,
  prayers,
}: {
  loading: boolean;
  prayers: PrayerRecord[];
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.prayers_we_re_holding')}</h3>
      </div>
      {loading ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : prayers.length === 0 ? (
        <div className="cd-empty">{t('modals.contactDetails.nothing_open')}</div>
      ) : (
        <div className="cd-pray">
          {prayers.map((p) => {
            const burden = p.burden || "";
            const title = burden.split("\n\n")[0] || burden;
            const context = burden.includes("\n\n") ? burden.split("\n\n").slice(1).join("\n\n") : null;
            return (
              <div key={p.id} className="cd-pray-card">
                <div className="cd-pray-top">
                  <strong className="cd-pray-title">
                    <Translate showOriginalToggle text={title} />
                  </strong>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stage-violet-soft text-stage-violet">
                    <span className="w-1.5 h-1.5 rounded-full bg-stage-violet" /> {t('modals.contactDetails.open')}
                  </span>
                </div>
                {context && (
                  <div className="cd-pray-body">
                    <Translate showOriginalToggle text={context} />
                  </div>
                )}
                <div className="cd-pray-foot">
                  {heldDays(p.date) != null &&
                    `Held ${heldDays(p.date)} ${heldDays(p.date) === 1 ? "day" : "days"}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
