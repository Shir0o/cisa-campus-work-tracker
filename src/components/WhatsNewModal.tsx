import React from 'react';
import { CheckCircle2, Zap, Palette, Bug, ExternalLink } from 'lucide-react';
import type { WhatsNewManifest, PlatformTarget, WhatsNewItem, WhatsNewCategory } from '../scripts/compile-whats-new';
import { getWhatsNewForPlatform, markWhatsNewSeen } from '../lib/whatsNew';
import { PopupFrame } from './ui/PopupFrame';
import { useLanguage } from './LanguageProvider';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: WhatsNewManifest;
  platform?: PlatformTarget;
  videoUrlOverride?: string | null;
  videoRolesOverride?: string[] | null;
  currentRole?: string | null;
}


const CATEGORY_ORDER: WhatsNewCategory[] = ['feature', 'ui', 'fix'];

/** Turn a Google Drive file URL into an embed preview URL; empty when not Google Drive. */
function toEmbedUrl(videoUrl: string): string {
  const idMatch =
    /(?:drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]+)|open\?id=([a-zA-Z0-9_-]+)))/.exec(
      videoUrl,
    );
  const fileId = idMatch ? (idMatch[1] || idMatch[2]) : '';
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : '';
}

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
  videoUrlOverride,
  videoRolesOverride,
  currentRole,
}: WhatsNewModalProps) {
  const { t } = useLanguage();
  if (!isOpen || !manifest.latestReleaseId) return null;

  const latestRelease = manifest.releases.find((r) => r.id === manifest.latestReleaseId);
  if (!latestRelease) return null;

  const currentNotes = getWhatsNewForPlatform(latestRelease, platform);
  if (!currentNotes) return null;

  const handleDismiss = () => {
    markWhatsNewSeen(localStorage, currentNotes.id);
    onClose();
  };

  const effectiveVideoRoles =
    videoRolesOverride !== undefined ? videoRolesOverride : currentNotes.video_roles;
  const isVideoRoleAllowed =
    !effectiveVideoRoles ||
    effectiveVideoRoles.length === 0 ||
    (!!currentRole && effectiveVideoRoles.includes(currentRole));

  const effectiveVideoUrl = isVideoRoleAllowed
    ? (videoUrlOverride !== undefined ? videoUrlOverride : currentNotes.video_url) || ''
    : '';
  const embedUrl = effectiveVideoUrl ? toEmbedUrl(effectiveVideoUrl) : '';

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
    <PopupFrame
      open
      onClose={handleDismiss}
      size="md"
      eyebrow={t('whatsNewModal.eyebrow')}
      title={t('whatsNewModal.title').replace('{version}', currentNotes.version)}
      subtitle={currentNotes.title}
      cancelLabel={t('actions.cancel')}
      onCancel={handleDismiss}
      primary={{
        label: t('whatsNewModal.got_it'),
        onClick: handleDismiss,
        savingLabel: t('actions.saving'),
      }}
    >
      <div className="space-y-4 px-7 py-5">
        {embedUrl && (
          <div className="space-y-1.5">
            <div className="aspect-video w-full overflow-hidden rounded border border-outline-variant">
              <iframe
                title={t('whatsNewModal.video_title')}
                src={embedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="flex justify-end">
              <a
                href={effectiveVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80 hover:underline"
              >
                <span>{t('whatsNewModal.open_video')}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {currentNotes.overview && (
          <p className="border-b border-outline-variant pb-3 text-sm leading-relaxed text-on-surface-variant">
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
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${conf.badgeClass}`}
                    >
                      <IconComponent className="h-3.5 w-3.5" />
                      {conf.label}
                    </span>
                  </div>
                )}

                <div className="space-y-2.5 pl-0.5">
                  {group.items.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 shrink-0 ${conf ? conf.bulletIconClass : 'text-on-surface-variant'}`}
                      />
                      <span className="text-sm leading-snug text-on-surface">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PopupFrame>
  );
}
