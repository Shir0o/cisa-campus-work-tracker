import React from 'react';
import { X, Sparkles, CheckCircle2 } from 'lucide-react';
import type { WhatsNewManifest, PlatformTarget } from '../scripts/compile-whats-new';
import { getWhatsNewForPlatform, markWhatsNewSeen } from '../lib/whatsNew';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: WhatsNewManifest;
  platform?: PlatformTarget;
}

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg bg-surface-container border border-outline-variant/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/40 bg-surface-container-high/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-accent">
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
        <div className="p-6 overflow-y-auto space-y-4">
          {currentNotes.overview && (
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {currentNotes.overview}
            </p>
          )}

          <div className="space-y-3 pt-1">
            {currentNotes.items.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span className="text-sm text-on-surface leading-snug">{item.text}</span>
              </div>
            ))}
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
