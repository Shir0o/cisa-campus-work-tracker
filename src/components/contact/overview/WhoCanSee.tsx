import { Plus } from "lucide-react";
import { useLanguage } from "../../LanguageProvider";
import type { ContactTeamMember } from "../types";

export default function WhoCanSee({
  sharedWith,
  founders,
  canRemove,
  onRemoveShare,
  shareOptions,
  canShare,
  sharing,
  onStartShare,
  onCancelShare,
  onAddShare,
  firstName,
}: {
  sharedWith: ContactTeamMember[];
  founders: string[];
  canRemove: (staffId: string) => boolean;
  onRemoveShare: (staffId: string) => void;
  shareOptions: ContactTeamMember[];
  canShare: boolean;
  sharing: boolean;
  onStartShare: () => void;
  onCancelShare: () => void;
  onAddShare: (staffId: string) => void;
  firstName: string;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.who_else_can_see')}</h3>
      </div>
      <div className="cd-share">
        {sharedWith.length === 0 && (
          <span className="text-xs text-on-surface-variant">
            {t('modals.contactDetails.just_owner_for_now').replace('{name}', firstName)}
          </span>
        )}
        {sharedWith.map((s) => {
          const isFounder = founders.includes(s.id);
          return (
            <div key={s.id} className="cd-share-row">
              <div className="w-7 h-7 rounded-full bg-primary/15 text-accent text-xs font-semibold grid place-items-center shrink-0">{s.initials}</div>
              <span className="cd-share-name">{s.name}</span>
              <span className="cd-share-role">{isFounder ? t('modals.contactDetails.founder') : s.role}</span>
              {canRemove(s.id) && (
                <button className="cd-share-x" onClick={() => onRemoveShare(s.id)} title={t('modals.contactDetails.remove_access')}>×</button>
              )}
            </div>
          );
        })}
        {canShare && shareOptions.length > 0 && (
          sharing ? (
            <div className="flex items-center gap-2">
              <select
                className="cd-share-sel flex-1"
                autoFocus
                defaultValue=""
                onChange={(e) => e.target.value && onAddShare(e.target.value)}
              >
                <option value="" disabled>{t('modals.contactDetails.add_someone')}</option>
                {shareOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.role}</option>
                ))}
              </select>
              <button
                onClick={onCancelShare}
                className="px-2.5 py-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
              >
                {t('modals.contactDetails.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={onStartShare}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:border-primary hover:text-accent transition-colors self-start"
            >
              <Plus className="w-3 h-3" /> {t('modals.contactDetails.add_someone_lower')}
            </button>
          )
        )}
      </div>
    </div>
  );
}
