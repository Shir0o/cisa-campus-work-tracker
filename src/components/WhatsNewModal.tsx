import React from 'react';
import { X, Sparkles, CheckCircle2, Zap, Palette, Bug } from 'lucide-react';
import type { WhatsNewManifest, PlatformTarget, WhatsNewItem, WhatsNewCategory } from '../scripts/compile-whats-new';
import { getWhatsNewForPlatform, markWhatsNewSeen } from '../lib/whatsNew';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: WhatsNewManifest;
  platform?: PlatformTarget;
}

const CATEGORY_ORDER: WhatsNewCategory[] = ['feature', 'ui', 'fix'];

const CATEGORY_CONFIG: Record<
  WhatsNewCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
    bulletIconClass: string;
  }
> = {
  feature: {
    label: 'New Features',
    icon: Zap,
    badgeClass: 'bg-primary/15 text-primary border-primary/30 font-semibold',
    bulletIconClass: 'text-primary',
  },
  ui: {
    label: 'UI/UX Updates',
    icon: Palette,
    badgeClass: 'bg-stage-accent-soft/40 text-stage-accent border-stage-accent/30 font-semibold',
    bulletIconClass: 'text-stage-accent',
  },
  fix: {
    label: 'Bug Fixes',
    icon: Bug,
    badgeClass: 'bg-stage-teal-soft/40 text-stage-teal border-stage-teal/30 font-semibold',
    bulletIconClass: 'text-stage-teal',
  },
};

export default function WhatsNewModal({
  isOpen,
  onClose,
  manifest,
  platform = 'web',
}: WhatsNewModalProps) {
  if (!isOpen || !manifest.latestReleaseId) return null;

  const latestRelease = manifest.releases.find((r) => r.id === manifest.latestReleaseId);
  if (!latestRelease) return null;

  const currentNotes = getWhatsNewForPlatform(latestRelease, platform);
  if (!currentNotes) return null;

  const handleDismiss = () => {
    markWhatsNewSeen(localStorage, currentNotes.id);
    onClose();
  };

  // Group items by category if any category is present, otherwise display as general highlights
  const hasCategories = currentNotes.items.some((item) => item.category);

  // Categorized groups: New Features -> UI/UX -> Bug Fixes -> Uncategorized
  const categorizedGroups: { category?: WhatsNewCategory; items: WhatsNewItem[] }[] = [];

  if (hasCategories) {
    for (const cat of CATEGORY_ORDER) {
      const items = currentNotes.items.filter((i) => i.category === cat);
      if (items.length > 0) {
        categorizedGroups.push({ category: cat, items });
      }
    }
    const uncategorized = currentNotes.items.filter((i) => !i.category);
    if (uncategorized.length > 0) {
      categorizedGroups.push({ items: uncategorized });
    }
  } else {
    categorizedGroups.push({ items: currentNotes.items });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg bg-surface-container border border-outline-variant/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-outline-variant/30 bg-surface-container-high/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-base font-semibold text-on-surface leading-tight">
                What's New in v{currentNotes.version}
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">{currentNotes.title}</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pt-3.5 pb-5 overflow-y-auto space-y-4">
          {currentNotes.overview && (
            <p className="text-sm text-on-surface-variant leading-relaxed pb-3 border-b border-outline-variant/20">
              {currentNotes.overview}
            </p>
          )}

          <div className="space-y-4">
            {categorizedGroups.map((group, gIdx) => {
              const conf = group.category ? CATEGORY_CONFIG[group.category] : null;
              const IconComponent = conf?.icon || CheckCircle2;

              return (
                <div key={gIdx} className="space-y-2">
                  {conf && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${conf.badgeClass}`}
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                        {conf.label}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2.5 pl-0.5">
                    {group.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-0.5 ${conf ? conf.bulletIconClass : 'text-on-surface-variant'}`}
                        />
                        <span className="text-sm text-on-surface leading-snug">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/40 bg-surface-container-high/20 flex justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-5 py-2 text-sm font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-colors shadow-xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
