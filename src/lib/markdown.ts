// Tiny Markdown string helpers for The Board's Pages list.
//
// The editor itself (TipTap + tiptap-markdown) owns rich editing and the
// Markdown round-trip; these operate on the stored markdown string only, to
// render each page's one-line preview and its open-task count. Ported from the
// design's `mdPreview` / `mdOpenTasks` (docs/design/project/views/board.jsx).

import TurndownService from 'turndown';

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

// ── Rich-paste normalization (The Board editor) ───────────────────────────────
// When the user pastes rich text (Google Docs, Notion, a webpage, a rendered AI
// reply), the clipboard carries HTML. We convert it to clean Markdown so the
// editor's own Markdown parser can re-render it into the page's formatting
// vocabulary — headings, bold/italic, lists, links, code, blockquote — instead
// of importing the source's foreign markup and inline styles.
//
// The turndown options are chosen so the output round-trips through markdown-it
// (the parser tiptap-markdown uses): ATX headings (`# `), fenced code blocks,
// and `-` bullets are all what that parser expects.
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Google Docs (and other style-driven sources) don't use semantic <strong>/<em>;
// they encode bold/italic as `font-weight`/`font-style` on <span>s, and wrap the
// whole copied selection in a fake <b style="font-weight:normal">. Without these
// rules turndown would bold the entire paste and drop real emphasis.
const styleOf = (node: Node, prop: 'fontWeight' | 'fontStyle'): string =>
  (node as HTMLElement).style?.[prop]?.toLowerCase() ?? '';

turndown.addRule('fakeBoldWrapper', {
  // A <b>/<strong> explicitly set to non-bold is just a container — unwrap it.
  filter: (node) =>
    (node.nodeName === 'B' || node.nodeName === 'STRONG') && styleOf(node, 'fontWeight') === 'normal',
  replacement: (content) => content,
});

turndown.addRule('styledBold', {
  filter: (node) => {
    if (node.nodeName !== 'SPAN') return false;
    const fw = styleOf(node, 'fontWeight');
    return fw === 'bold' || (/^\d+$/.test(fw) && Number(fw) >= 600);
  },
  replacement: (content) => (content.trim() ? `**${content}**` : content),
});

turndown.addRule('styledItalic', {
  filter: (node) => node.nodeName === 'SPAN' && styleOf(node, 'fontStyle') === 'italic',
  replacement: (content) => (content.trim() ? `_${content}_` : content),
});

export const htmlToBoardMarkdown = (html: string): string => turndown.turndown(html || '');
