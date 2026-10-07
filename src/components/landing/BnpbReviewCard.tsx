import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { isAppOwner } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { subscribePendingSuggestions, type InteractionSuggestion } from '../../lib/bnpb';

/**
 * Home card for the app owner (#1423): how many Interaction suggestions are
 * waiting in the Suggestion queue, with a nudge for the ones still missing a
 * Contact. Hidden when the queue is empty and never shown to anyone else.
 */
export default function BnpbReviewCard({ className }: { className?: string } = {}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const owner = isAppOwner(user?.email);
  const [suggestions, setSuggestions] = useState<InteractionSuggestion[]>([]);

  useEffect(() => {
    if (!owner || !user) return;
    return subscribePendingSuggestions(user.uid, setSuggestions, (e) =>
      console.error('bnpb home card subscription error', e),
    );
  }, [owner, user]);

  if (!owner) return null;

  const pending = suggestions.length;
  if (pending === 0) return null;
  const needName = suggestions.filter((s) => !s.contactId).length;

  const countText = (
    pending === 1 ? t('bnpb.home_review_count') : t('bnpb.home_review_count_plural')
  ).replace('{n}', String(pending));
  const needNameText = t('bnpb.home_review_need_name').replace('{n}', String(needName));

  return (
    <section
      className={cn(
        'rounded-3xl border border-outline-variant/40 bg-surface-container p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-none w-10 h-10 rounded-full bg-accent-soft text-stage-accent flex items-center justify-center">
          <Inbox className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-on-surface">{countText}</div>
          {needName > 0 && (
            <div className="text-[13px] text-on-surface-variant mt-0.5">{needNameText}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/suggestions')}
          className="shrink-0 px-4 py-2 rounded-full bg-primary text-on-primary text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          {t('bnpb.home_review_cta')}
        </button>
      </div>
    </section>
  );
}
