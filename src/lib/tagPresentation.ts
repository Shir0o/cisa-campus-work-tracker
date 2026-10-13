import type React from 'react';

// Presentation-only helper for tag visual badge styling and color tone mapping.

export type TagToneKey = 'slate' | 'clay' | 'ochre' | 'sage' | 'teal' | 'indigo' | 'plum' | 'rose';

export const ALL_TAG_TONES: TagToneKey[] = ['slate', 'clay', 'ochre', 'sage', 'teal', 'indigo', 'plum', 'rose'];

export function tagToneKey(tag: string): TagToneKey {
  const t = (tag ?? '').toLowerCase().trim();
  if (t === 'new') return 'teal';
  if (t === 'saved' || t === 'baptized') return 'sage';
  if (t.includes('interested') || t.includes('open')) return 'teal';
  if (t.includes('freshman') || t.includes('1st')) return 'teal';
  if (t.includes('sophomore') || t.includes('2nd')) return 'indigo';
  if (t.includes('junior') || t.includes('3rd')) return 'plum';
  if (t.includes('senior') || t.includes('4th') || t.includes('grad')) return 'ochre';
  if (t.includes('lead') || t.includes('trainee') || t.includes('staff')) return 'rose';
  if (t.includes('club') || t.includes('rush') || t.includes('outreach') || t === 'bfa') return 'clay';

  let hash = 0;
  for (let i = 0; i < t.length; i++) {
    hash = (hash << 5) - hash + t.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % ALL_TAG_TONES.length;
  return ALL_TAG_TONES[idx];
}

export function tagStyle(tag: string): React.CSSProperties {
  const k = tagToneKey(tag);
  return {
    '--tone': `var(--t-${k})`,
    '--tone-soft': `var(--t-${k}-soft)`,
  } as React.CSSProperties;
}
