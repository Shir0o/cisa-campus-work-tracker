import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Loader2, MessageSquare, Send } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export interface NewInteraction {
  content: string;
  dateTime: string;
  duration: string;
  type: string;
}

export default function ContactInteractionForm({
  open,
  value,
  onChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  value: NewInteraction;
  onChange: React.Dispatch<React.SetStateAction<NewInteraction>>;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
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
          <div className="grid grid-cols-2 gap-3 pb-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-on-surface-variant   flex items-center gap-1.5 px-1">
                <Calendar className="w-3 h-3" /> {t('modals.contactDetails.date_time')}
              </label>
              <input
                required
                type="datetime-local"
                value={value.dateTime}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    dateTime: e.target.value,
                  }))
                }
                className="w-full h-9 px-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-on-surface-variant   flex items-center gap-1.5 px-1">
                <MessageSquare className="w-3 h-3" /> {t('modals.contactDetails.type')}
              </label>
              <select
                value={value.type}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    type: e.target.value,
                  }))
                }
                className="w-full h-9 px-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs"
              >
                <option value="chat">{t('modals.contactDetails.chat_message')}</option>
                <option value="call">{t('modals.contactDetails.phone_call')}</option>
                <option value="meeting">{t('modals.contactDetails.meeting')}</option>
                <option value="email">{t('modals.contactDetails.email')}</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-on-surface-variant   flex items-center gap-1.5 px-1">
              <MessageSquare className="w-3 h-3" /> {t('modals.contactDetails.content')}
            </label>
            <textarea
              required
              placeholder={t('modals.contactDetails.interaction_placeholder')}
              value={value.content}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  content: e.target.value,
                }))
              }
              className="w-full min-h-[80px] p-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || !value.content.trim()}
              className="px-4 h-9 rounded-full bg-primary text-on-primary font-semibold   hover: active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 text-xs"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {t('modals.contactDetails.log_interaction_submit', 'Log Interaction')}
            </button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
