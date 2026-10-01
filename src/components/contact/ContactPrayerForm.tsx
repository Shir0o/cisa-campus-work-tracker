import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Heart, Loader2 } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export interface NewPrayer {
  burden: string;
  context: string;
}

export default function ContactPrayerForm({
  open,
  value,
  onChange,
  submitting,
  onSubmit,
  firstName,
}: {
  open: boolean;
  value: NewPrayer;
  onChange: React.Dispatch<React.SetStateAction<NewPrayer>>;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  firstName: string;
}) {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {open && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          onSubmit={onSubmit}
          className="space-y-3 p-4 rounded-3xl bg-surface-container-high border border-primary/20 overflow-hidden"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-on-surface-variant px-1">
              {t('modals.contactDetails.prayer_burden_label')}
            </label>
            <input
              required
              autoFocus
              type="text"
              placeholder={`e.g. ${firstName}'s family back home`}
              value={value.burden}
              onChange={(e) =>
                onChange((p) => ({ ...p, burden: e.target.value }))
              }
              className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-on-surface-variant px-1">
              {t('modals.contactDetails.prayer_context_label')} <span className="text-on-surface-variant/60">{t('modals.contactDetails.optional')}</span>
            </label>
            <textarea
              placeholder={t('modals.contactDetails.prayer_context_placeholder')}
              value={value.context}
              onChange={(e) =>
                onChange((p) => ({ ...p, context: e.target.value }))
              }
              className="w-full min-h-[70px] p-3 rounded-lg bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm resize-none"
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting || !value.burden.trim()}
              className="inline-flex items-center gap-2 px-4 h-9 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Heart className="w-3.5 h-3.5" />
              )}
              {t('modals.contactDetails.add_prayer')}
            </button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
