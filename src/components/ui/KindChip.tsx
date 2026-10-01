// The kind of person, as a chip that travels with them (#1152, ADR 0030).
//
// By default it renders ONLY for a Local saint and for Our own. A Contact
// carries no chip at all: most people in the system are Contacts, and a chip on
// every row teaches the eye to skip all chips, including the ones that mean
// something. Surfaces that want a chip on every row — the Directory, which
// segments by kind (#1296) — opt in with `showAll`.
import React from 'react';
import { cn } from '../../lib/utils';
import { contactKind, type ContactKind } from '../../lib/contactKind';
import { useLanguage } from '../LanguageProvider';
import type { Contact } from '../../types';

const TONE: Record<ContactKind, string> = {
  'local-saint': 'text-stage-violet bg-stage-violet-soft',
  'our-own': 'text-stage-teal bg-stage-teal-soft',
  'contact': 'text-on-surface-variant bg-surface-variant',
};

const LABEL_KEY: Record<ContactKind, string> = {
  'local-saint': 'contactKind.local_saint',
  'our-own': 'contactKind.our_own',
  'contact': 'contactKind.contact',
};

export default function KindChip({
  contact,
  className,
  showAll,
}: {
  contact: Pick<Contact, 'inChurchLife' | 'isStudent'>;
  className?: string;
  showAll?: boolean;
}) {
  const { t } = useLanguage();
  const kind = contactKind(contact);
  if (!showAll && kind === 'contact') return null;
  return (
    <span
      data-testid="kind-chip"
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap',
        TONE[kind],
        className,
      )}
    >
      {t(LABEL_KEY[kind])}
    </span>
  );
}
