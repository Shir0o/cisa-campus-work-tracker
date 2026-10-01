import { Plus } from "lucide-react";
import { useLanguage } from "../../LanguageProvider";
import { tagStyle, TAG_SUGGESTIONS } from "../../../lib/tags";

export default function TagsSection({
  tags,
  addingTag,
  tagInput,
  onTagInputChange,
  onStartAdd,
  onCancelAdd,
  onCommitTag,
  onRemoveTag,
  onAddTag,
}: {
  tags: string[];
  addingTag: boolean;
  tagInput: string;
  onTagInputChange: (value: string) => void;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onCommitTag: () => void;
  onRemoveTag: (tag: string) => void;
  onAddTag: (tag: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.tags')}</h3>
      </div>
      <div className="cd-tags">
        {tags.length === 0 && !addingTag && (
          <span className="text-xs text-on-surface-variant">{t('modals.contactDetails.none_yet')}</span>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            style={tagStyle(tag)}
            className="cd-tag-item inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--tone-soft)] text-[var(--tone)] text-xs font-medium border border-outline-variant/40"
          >
            {tag}
            <button onClick={() => onRemoveTag(tag)} className="cd-tag-x" title={t('modals.contactDetails.remove_tag')}>×</button>
          </span>
        ))}
        {addingTag ? (
          <div className="flex flex-col gap-2 w-full">
            <span className="cd-tag-input-wrap">
              <input
                className="cd-tag-input w-full"
                autoFocus
                value={tagInput}
                onChange={(e) => onTagInputChange(e.target.value)}
                placeholder={t('modals.contactDetails.new_tag_placeholder')}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCommitTag();
                  if (e.key === "Escape") { onTagInputChange(""); onCancelAdd(); }
                }}
                onBlur={() => {
                  if (tagInput.trim()) onCommitTag();
                  else setTimeout(() => onCancelAdd(), 200);
                }}
              />
            </span>
            {(() => {
              const available = TAG_SUGGESTIONS.filter(
                (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())
              );
              if (available.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1 mt-1">
                  {available.slice(0, 4).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onAddTag(s);
                        onTagInputChange("");
                        onCancelAdd();
                      }}
                      style={tagStyle(s)}
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--tone-soft)] text-[var(--tone)] hover:opacity-80 transition-opacity"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : (
          <button
            onClick={onStartAdd}
            className="cd-tag-add inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:border-primary hover:text-accent transition-colors"
          >
            <Plus className="w-3 h-3" /> {t('modals.contactDetails.add')}
          </button>
        )}
      </div>
    </div>
  );
}
