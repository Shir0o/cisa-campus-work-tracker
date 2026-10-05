import { CheckSquare, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Contact } from '../../types';
import { Avatar } from '../landing/primitives';
import { useLanguage } from '../LanguageProvider';

interface GatheringMemberChipProps {
  contact: Contact;
  /** In the "Came" group (true) or "We missed" (false). */
  came: boolean;
  /** On the Gathering's resolved roster; anyone else gets the walk-in tag. */
  onRoster: boolean;
  onToggle: () => void;
  /** Missed chip's trailing action. */
  onMakeTodo?: () => void;
  /** Walk-in chip's trailing action — pass only for Full-timers. */
  onAddToRoster?: () => void;
}

/** One person in a Gathering, shared by the desktop and mobile web views:
 *  a neutral pill that toggles Came / We missed, a quiet walk-in tag for
 *  anyone off the roster, and at most one trailing action. */
export default function GatheringMemberChip({
  contact,
  came,
  onRoster,
  onToggle,
  onMakeTodo,
  onAddToRoster,
}: GatheringMemberChipProps) {
  const { t } = useLanguage();
  const name = contact.name;

  let action: { label: string; title: string; icon: React.ReactNode; onClick: () => void } | null = null;
  if (!came && onMakeTodo) {
    action = {
      label: t('attendance.make_a_todo_for').replace('{name}', name),
      title: t('attendance.make_a_todo_check_on').replace('{name}', name),
      icon: <CheckSquare className="w-3.5 h-3.5" />,
      onClick: onMakeTodo,
    };
  } else if (came && !onRoster && onAddToRoster) {
    const label = t('attendance.add_name_to_roster').replace('{name}', name);
    action = { label, title: label, icon: <Plus className="w-3.5 h-3.5" />, onClick: onAddToRoster };
  }

  return (
    <span
      className={cn(
        'group inline-flex items-center gap-1 min-h-[36px] max-w-full pl-1 pr-2.5 rounded-full border border-outline-variant bg-surface transition-colors',
        came ? 'text-on-surface' : 'text-on-surface-variant',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        title={came ? undefined : t('attendance.tap_to_mark_present')}
        className="inline-flex items-center gap-2 min-w-0 text-left"
      >
        <Avatar contact={contact} size="sm" muted={!came} />
        <span className="text-sm truncate">{name}</span>
        {!onRoster && (
          <span className="text-[11px] text-on-surface-variant/70 shrink-0">{t('attendance.walk_in_tag')}</span>
        )}
      </button>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          title={action.title}
          aria-label={action.label}
          className="p-1.5 rounded-full shrink-0 text-on-surface-variant hover:bg-surface-variant hover:text-accent transition-colors [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
        >
          {action.icon}
        </button>
      )}
    </span>
  );
}
