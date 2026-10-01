import { Footprints, MessageSquare } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export default function ContactThreadLinks({
  firstName,
  walkLabel,
  walkCount,
  teamCount,
  canSeeTeamThread,
  onOpenThread,
  onOpenDiscussion,
}: {
  firstName: string;
  walkLabel: string;
  walkCount: number;
  teamCount: number;
  canSeeTeamThread: boolean;
  onOpenThread: () => void;
  onOpenDiscussion: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.talk_about').replace('{name}', firstName)}</h3>
      </div>
      <div className="cd-thread-links">
        <button type="button" className="cd-thread-link" onClick={onOpenThread}>
          <Footprints className="w-4 h-4" />
          {walkLabel}
          <span className="count">{walkCount}</span>
        </button>
        {canSeeTeamThread && (
          <button type="button" className="cd-thread-link" onClick={onOpenDiscussion}>
            <MessageSquare className="w-4 h-4" />
            {t('modals.contactDetails.discussion')}
            <span className="count">{teamCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}
