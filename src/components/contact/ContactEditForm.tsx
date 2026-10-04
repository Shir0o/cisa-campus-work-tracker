import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../LanguageProvider";
import KindFields from "../ui/KindFields";
import { tagStyle, TAG_SUGGESTIONS, normalizeTagList } from "../../lib/tags";
import type { Stage } from "../../types";

export interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  stage: string;
  gender: string;
  tags: string[];
  notes: string;
  spiritualBackground: string;
  inChurchLife: boolean;
  isStudent: boolean;
}

const capitalize = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export default function ContactEditForm({
  formData,
  onChange,
  stages,
  isAdmin,
  phoneError,
  onPhoneBlur,
  onClearPhoneError,
  editTagInput,
  onEditTagInputChange,
  onSubmit,
  isMobile,
  onDelete,
  loading,
}: {
  formData: ContactFormData;
  onChange: React.Dispatch<React.SetStateAction<ContactFormData>>;
  stages: Stage[];
  isAdmin: boolean;
  phoneError: string | null;
  onPhoneBlur: () => void;
  onClearPhoneError: () => void;
  editTagInput: string;
  onEditTagInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isMobile: boolean;
  onDelete: () => void;
  loading: boolean;
}) {
  const { t } = useLanguage();

  return (
    <form
      id="edit-contact-form"
      onSubmit={onSubmit}
      className={cn("space-y-6", !isMobile && "px-7 py-6")}
    >
      <div className="cd-form-grid grid grid-cols-1 gap-6">
        {/* First Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <User className="w-3.5 h-3.5" /> {t('modals.contactDetails.first_name')}
          </label>
          <input
            required
            type="text"
            value={formData.firstName}
            onChange={(e) =>
              onChange((f) => ({
                ...f,
                firstName: capitalize(e.target.value),
              }))
            }
            className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
            placeholder={t('modals.contactDetails.first_name_placeholder')}
          />
        </div>
        {/* Last Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <User className="w-3.5 h-3.5" /> {t('modals.contactDetails.last_name')}
          </label>
          <input
            type="text"
            value={formData.lastName}
            onChange={(e) =>
              onChange((f) => ({
                ...f,
                lastName: capitalize(e.target.value),
              }))
            }
            className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
            placeholder={t('modals.contactDetails.last_name_placeholder')}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <User className="w-3.5 h-3.5" /> {t('modals.contactDetails.gender')}
          </label>
          <select
            value={formData.gender}
            onChange={(e) =>
              onChange((f) => ({ ...f, gender: e.target.value }))
            }
            className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm appearance-none cursor-pointer"
          >
            <option value="">{t('modals.contactDetails.gender_placeholder')}</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <Mail className="w-3.5 h-3.5" /> {t('modals.contactDetails.email_label')}
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) =>
              onChange((f) => ({ ...f, email: e.target.value }))
            }
            className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
            placeholder={t('modals.contactDetails.email_placeholder')}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <Phone className="w-3.5 h-3.5" /> {t('modals.contactDetails.phone')}
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => {
              onChange((f) => ({ ...f, phone: e.target.value }));
              if (phoneError) onClearPhoneError();
            }}
            onBlur={onPhoneBlur}
            className={cn(
              "w-full h-11 px-4 rounded-xl bg-surface-container-high border outline-none transition-all text-sm",
              phoneError
                ? "border-error focus:border-error focus:ring-1 focus:ring-error"
                : "border-outline focus:border-primary focus:ring-1 focus:ring-primary",
            )}
            placeholder="(555) 000-0000"
          />
          <AnimatePresence>
            {phoneError && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-[10px] font-semibold text-error px-1  "
              >
                {phoneError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1   text-accent">
            <Calendar className="w-3.5 h-3.5" /> {t('modals.contactDetails.pipeline_stage')}
          </label>
          <select
            aria-label={t('modals.contactDetails.pipeline_stage')}
            value={stages.some(s => s.label === formData.stage) ? formData.stage : t('modals.contactDetails.unassigned')}
            onChange={(e) =>
              onChange((f) => ({ ...f, stage: e.target.value }))
            }
            className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm appearance-none"
          >
            <option value="Unassigned">{t('modals.contactDetails.unassigned')}</option>
            {stages.map((s) => (
              <option key={s.id} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <Tag className="w-3.5 h-3.5" /> {t('modals.contactDetails.tags_comma_separated')}
          </label>
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  style={tagStyle(tag)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--tone-soft)] text-[var(--tone)] text-xs font-medium border border-outline-variant/40"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      onChange((f) => ({
                        ...f,
                        tags: f.tags.filter((t) => t !== tag),
                      }))
                    }
                    className="hover:opacity-75 cursor-pointer ml-0.5 text-xs font-bold leading-none"
                    title={t('modals.contactDetails.remove_tag')}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={editTagInput}
            onChange={(e) => onEditTagInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const raw = editTagInput.trim();
                if (raw) {
                  const newTags = raw.split(",").map((t) => t.trim()).filter(Boolean);
                  onChange((f) => ({
                    ...f,
                    tags: normalizeTagList([...f.tags, ...newTags]),
                  }));
                  onEditTagInputChange("");
                }
              }
            }}
            placeholder={t('modals.contactDetails.tags_placeholder_gospel', 'e.g. Gospel, Fall2023')}
            className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
          />
          {(() => {
            const availableSuggestions = TAG_SUGGESTIONS.filter(
              (s) => !formData.tags.some((t) => t.toLowerCase() === s.toLowerCase())
            );
            if (availableSuggestions.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1 mt-1.5 pt-0.5">
                {availableSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (!formData.tags.some((t) => t.toLowerCase() === s.toLowerCase())) {
                        onChange((f) => ({ ...f, tags: [...f.tags, s] }));
                      }
                    }}
                    style={tagStyle(s)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--tone-soft)] text-[var(--tone)] hover:opacity-80 transition-opacity border border-outline-variant/30 cursor-pointer"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
        {/* The kind of person (#1152) — Full-timers only, and
            written on its own rules branch when saved. */}
        {isAdmin && (
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
              <Sparkles className="w-3.5 h-3.5" /> {t('contactKind.who_they_are')}
            </label>
            <KindFields
              inChurchLife={formData.inChurchLife}
              isStudent={formData.isStudent}
              onChange={(next) => onChange((f) => ({ ...f, ...next }))}
            />
          </div>
        )}

        {/* Spiritual Background Field */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <Sparkles className="w-3.5 h-3.5" /> {t('modals.contactDetails.spiritual_background')}
          </label>
          <select
            value={formData.spiritualBackground}
            onChange={(e) =>
              onChange((f) => ({ ...f, spiritualBackground: e.target.value }))
            }
            className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm appearance-none"
          >
            <option value="">{t('modals.contactDetails.spiritual_background_placeholder')}</option>
            <option value="Exploring">{t('modals.contactDetails.spiritual_exploring')}</option>
            <option value="Christian">{t('modals.contactDetails.christian')}</option>
            <option value="Catholic">{t('modals.contactDetails.catholic')}</option>
            <option value="Other">{t('modals.contactDetails.other_religion')}</option>
            <option value="None">{t('modals.contactDetails.none')}</option>
          </select>
        </div>
        {/* Notes Field */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
            <MessageSquare className="w-3.5 h-3.5" /> {t('modals.contactDetails.notes')}
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) =>
              onChange((f) => ({ ...f, notes: e.target.value }))
            }
            className="w-full min-h-[120px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm resize-none"
            placeholder={t('modals.contactDetails.notes_placeholder')}
          />
        </div>
        {isMobile && (
          <div className="pt-4 border-t border-outline-variant/30 md:col-span-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 h-11 rounded-xl text-error font-semibold text-sm border border-error/20 hover:bg-error/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {loading ? (
                <span className="animate-pulse">{t('modals.contactDetails.deleting')}</span>
              ) : (
                t('modals.contactDetails.delete_contact')
              )}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
