// Tiny Markdown string helpers for The Board's Pages list.
//
// The editor itself (TipTap + tiptap-markdown) owns rich editing and the
// Markdown round-trip; these operate on the stored markdown string only, to
// render each page's one-line preview and its open-task count. Ported from the
// design's `mdPreview` / `mdOpenTasks` (docs/design/project/views/board.jsx).

// First readable, de-marked-up line of a doc — for the Pages list preview.
export const mdPreview = (md: string | undefined): string => {
  const lines = (md || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const l of lines) {
    if (/^#{1,3}\s/.test(l)) continue; // skip headings
    if (/^\*\*.*\*\*$/.test(l)) continue; // skip a bold-only meta line
    let t = l
      .replace(/^\s*[-*]\s+\[( |x|X)\]\s+/, '') // task marker
      .replace(/^\s*[-*]\s+/, '') // bullet
      .replace(/^\s*\d+\.\s+/, '') // ordered
      .replace(/^>\s?/, ''); // quote
    t = t
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (t) return t;
  }
  return 'Empty page';
};

// Count of open ("[ ]") checklist items — for the "x to do" hint.
export const mdOpenTasks = (md: string | undefined): number =>
  ((md || '').match(/^\s*[-*]\s+\[ \]\s+/gm) || []).length;
