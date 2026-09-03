import { Heart, ListTodo, Share2, UserRound } from 'lucide-react';
import type { Contact } from '../types';
import type { RowActionItem } from '../components/ui/RowActions';

const firstName = (name?: string) => {
  const first = (name || '').trim().split(/\s+/)[0];
  return first || 'this person';
};

export interface ContactRowActionsOptions {
  contact: Contact;
  onOpen?: () => void;
  onMakeTodo?: () => void;
  onShare?: () => void;
  onFollowUp?: () => void;
  canShare?: boolean;
  hide?: string[];
}

/**
 * The shared person-row action vocabulary (#332):
 * open · make a to-do · share · I followed up.
 * Consumers can hide actions they don't have the data/handlers for yet.
 *
 * These four are the shared vocabulary. A surface with its own destructive
 * action — the prayer page's "Remove from prayer list" (#715) — appends a
 * `separated` item of its own, so its wording stays translatable on the page
 * that owns it.
 */
export function buildContactRowActions({
  contact,
  onOpen,
  onMakeTodo,
  onShare,
  onFollowUp,
  canShare = false,
  hide = [],
}: ContactRowActionsOptions): RowActionItem[] {
  const hidden = new Set(hide);
  const items: RowActionItem[] = [];

  if (!hidden.has('open') && onOpen) {
    items.push({
      id: 'open',
      label: `Open ${firstName(contact.name)}'s page`,
      icon: UserRound,
      onSelect: onOpen,
    });
  }

  if (!hidden.has('todo') && onMakeTodo) {
    items.push({
      id: 'todo',
      label: 'Make a to-do',
      icon: ListTodo,
      onSelect: onMakeTodo,
    });
  }

  if (!hidden.has('share') && onShare && canShare) {
    items.push({
      id: 'share',
      label: 'Share with a teammate',
      icon: Share2,
      onSelect: onShare,
    });
  }

  if (!hidden.has('followed') && onFollowUp) {
    items.push({
      id: 'followed',
      label: 'I followed up',
      icon: Heart,
      onSelect: onFollowUp,
    });
  }

  return items;
}
