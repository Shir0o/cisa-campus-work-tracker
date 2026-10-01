import { Trash2 } from "lucide-react";
import { useLanguage } from "../../LanguageProvider";

export default function DeleteContact({
  onDelete,
  loading,
}: {
  onDelete: () => void;
  loading: boolean;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="rounded-2xl border border-error/30 p-5 bg-error/5">
        <h3 className="cd-sec-title text-error">{t('modals.contactDetails.delete_contact')}</h3>
        <p className="text-sm text-on-surface-variant mt-1">
          {t('modals.contactDetails.delete_contact_help')}
        </p>
        <button
          onClick={onDelete}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 px-4 h-10 rounded-full text-error font-semibold text-sm border border-error/30 hover:bg-error/10 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {loading ? (
            <span className="animate-pulse">{t('modals.contactDetails.deleting')}</span>
          ) : (
            t('modals.contactDetails.delete_contact')
          )}
        </button>
      </div>
    </div>
  );
}
