// The kind of person, as a chip that travels with them (#1152, ADR 0030).
//
// It renders ONLY for a Local saint and for Our own. A Contact carries no
// chip at all: most people in the system are Contacts, and a chip on every row
// teaches the eye to skip all chips, including the ones that mean something.
// Absence is the default, so a chip always says something.
import React from 'react';
import { cn } from '../../lib/utils';
import { contactKind, type ContactKind } from '../../lib/contactKind';
import { useLanguage } from '../LanguageProvider';
import type { Contact } from '../../types';

const TONE: Partial<Record<ContactKind, string>> = {
  'local-saint': 'text-stage-violet bg-stage-violet-soft',
  'our-own': 'text-stage-teal bg-stage-teal-soft',
};

const LABEL_KEY: Partial<Record<ContactKind, string>> = {
  'local-saint': 'contactKind.local_saint',
  'our-own': 'contactKind.our_own',
};

export default function KindChip({
  contact,
  className,
}: {
  contact: Pick<Contact, 'inChurchLife' | 'isStudent'>;
  className?: string;
}) {
  const { t } = useLanguage();
  const kind = contactKind(contact);
  const tone = TONE[kind];
  if (!tone) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap',
        tone,
        className,
      )}
    >
      {t(LABEL_KEY[kind] as string)}
    </span>
  );
}
