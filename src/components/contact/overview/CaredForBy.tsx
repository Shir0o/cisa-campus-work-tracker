import { Edit3 } from "lucide-react";
import { useLanguage } from "../../LanguageProvider";
import type { Contact } from "../../../types";
import type { ContactTeamMember } from "../types";

export default function CaredForBy({
  carerMembers,
  addedByName,
  sinceBy,
  fmtDate,
  isAdmin,
  isImpersonating,
  reassigningCreator,
  onStartReassign,
  onCancelReassign,
  teamMembers,
  onReassignCreator,
  contact,
}: {
  carerMembers: ContactTeamMember[];
  addedByName: string | null | undefined;
  sinceBy: string | null | undefined;
  fmtDate: (v?: string | null) => string | null;
  isAdmin: boolean;
  isImpersonating: boolean;
  reassigningCreator: boolean;
  onStartReassign: () => void;
  onCancelReassign: () => void;
  teamMembers: ContactTeamMember[];
  onReassignCreator: (staffId: string) => void;
  contact: Contact;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.cared_for_by')}</h3>
      </div>
      {carerMembers.length > 0 ? (
        carerMembers.map((m) => (
          <div className="cd-owner" key={m.id}>
            <div className="w-10 h-10 rounded-full bg-primary/15 text-accent text-sm font-semibold grid place-items-center shrink-0">
              {m.initials || "?"}
            </div>
            <div>
              <div className="cd-owner-name">{m.name}</div>
              {m.role && <div className="cd-owner-role">{m.role}</div>}
            </div>
          </div>
        ))
      ) : (
        <div className="text-xs text-on-surface-variant">
          {t('modals.contactDetails.no_one_cares', 'No one has taken them on yet')}
        </div>
      )}

      {(addedByName || sinceBy) && (
        <div className="cd-whowho">
          {addedByName && (
            <div className="cd-lastby flex-wrap">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-accent text-[10px] font-semibold grid place-items-center shrink-0">
                {(addedByName.match(/\b\w/g) || []).slice(0, 2).join("").toUpperCase() || "?"}
              </div>
              <span>{t('modals.contactDetails.added_by')} <b>{addedByName}</b>{fmtDate(contact.createdAt) ? ` · ${fmtDate(contact.createdAt)}` : ""}</span>
              {isAdmin && !isImpersonating && (
                reassigningCreator ? (
                  <div className="flex items-center gap-1.5 w-full mt-1.5 pl-8">
                    <select
                      className="cd-share-sel text-xs flex-1"
                      autoFocus
                      defaultValue=""
                      aria-label={t('modals.contactDetails.reassign_creator', 'Reassign creator')}
                      onChange={(e) => e.target.value && onReassignCreator(e.target.value)}
                    >
                      <option value="" disabled>{t('modals.contactDetails.select_creator', 'Select new creator...')}</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} · {m.role}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={onCancelReassign}
                      className="px-2 py-0.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onStartReassign}
                    aria-label={t('modals.contactDetails.change_creator', 'Change creator')}
                    title={t('modals.contactDetails.change_creator', 'Change creator')}
                    className="ml-1 text-on-surface-variant hover:text-primary transition-colors p-0.5 rounded inline-flex items-center"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )
              )}
            </div>
          )}
          {sinceBy && (
            <div className="cd-lastby">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-accent text-[10px] font-semibold grid place-items-center shrink-0">
                {(sinceBy.match(/\b\w/g) || []).slice(0, 2).join("").toUpperCase() || "?"}
              </div>
              <span>{t('modals.contactDetails.last_contacted_by')} <b>{sinceBy}</b>{fmtDate(contact.lastContactedDate) ? ` · ${fmtDate(contact.lastContactedDate)}` : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
