import { useState } from "react";
import { Megaphone } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";
import { markGotIt, useOpenAnnouncements } from "../../lib/announcements";
import { cn, relTime } from "../../lib/utils";

// One card per announcement the reader has not marked "Got it", newest first, on
// My Day and the Trainee landing. Marking it Got it takes the card away for them
// alone; the poster's own list (AnnouncementComposer) counts who has.
export default function AnnouncementCards({ className }: { className?: string }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const open = useOpenAnnouncements(user?.uid);
  const [failedId, setFailedId] = useState<string | null>(null);

  if (open.length === 0) return null;

  const gotIt = async (id: string) => {
    setFailedId(null);
    try {
      await markGotIt(id);
    } catch {
      setFailedId(id);
    }
  };

  return (
    <section aria-label={t("announcements.cards_label")} className={cn("flex flex-col gap-3", className)}>
      {open.map((a) => (
        <article
          key={a.id}
          data-testid="announcement-card"
          className="bg-surface rounded-xl border border-outline-variant/60 border-l-4 border-l-accent p-4 sm:p-5"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
            <Megaphone className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
            <span>{t("announcements.card_from").replace("{name}", a.authorName)}</span>
            {a.createdAt && <span aria-hidden="true">· {relTime(a.createdAt)}</span>}
          </div>
          <p className="mt-2 text-base text-on-surface leading-relaxed whitespace-pre-wrap break-words">{a.body}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void gotIt(a.id)}
              className="inline-flex items-center px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              {t("announcements.got_it")}
            </button>
            {failedId === a.id && (
              <span role="alert" className="text-xs text-error">
                {t("announcements.mark_failed")}
              </span>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
