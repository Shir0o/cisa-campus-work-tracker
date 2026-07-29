// Tiny Markdown string helpers for The Board's Pages list.
//
// The editor itself (TipTap + tiptap-markdown) owns rich editing and the
// Markdown round-trip; these operate on the stored markdown string only, to
// render each page's one-line preview and its open-task count. Ported from the
// design's `mdPreview` / `mdOpenTasks`.

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
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (t) return t;
  }
  return 'Empty page';
};

// Clean, concise 1-2 sentence summary of a doc — for under the title in the sidebar.
export const mdSummary = (md: string | undefined): string => {
  if (!md) return 'Empty page';
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const textParts: string[] = [];
  for (const l of lines) {
    if (/^#{1,3}\s/.test(l)) continue; // skip headings
    if (/^\*\*.*\*\*$/.test(l)) continue; // skip bold-only meta line
    let t = l
      .replace(/^\s*[-*]\s+\[( |x|X)\]\s+/, '') // task marker
      .replace(/^\s*[-*]\s+/, '') // bullet
      .replace(/^\s*\d+\.\s+/, '') // ordered
      .replace(/^>\s?/, ''); // quote
    t = t
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<!--.*?-->/g, '') // strip HTML comments
      .trim();
    if (t) {
      textParts.push(t);
      if (textParts.join(' ').length >= 120) break;
    }
  }
  if (textParts.length === 0) return 'Empty page';
  const full = textParts.join(' ');
  if (full.length <= 130) return full;
  return full.slice(0, 127).trim() + '…';
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

turndown.addRule('styledStrikethrough', {
  filter: (node) => {
    if (['DEL', 'S', 'STRIKE'].includes(node.nodeName)) return true;
    if (node.nodeName === 'SPAN') {
      const dec = (node as HTMLElement).style?.textDecoration?.toLowerCase() ?? '';
      return dec.includes('line-through');
    }
    return false;
  },
  replacement: (content) => (content.trim() ? `~~${content}~~` : content),
});

turndown.addRule('tableSection', {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement: (content) => content,
});

turndown.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement: (content) => {
    const cleanContent = content.replace(/\|/g, '\\|').trim();
    return `| ${cleanContent} `;
  },
});

turndown.addRule('tableRow', {
  filter: 'tr',
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const trimmed = content.trim();
    if (!trimmed) return '';
    const rowStr = trimmed + ' |';

    const parentNodeName = el.parentNode?.nodeName;
    const isHeader =
      parentNodeName === 'THEAD' ||
      (parentNodeName === 'TABLE' && (!el.previousSibling || el.previousSibling.nodeName !== 'TR'));

    let suffix = '';
    if (isHeader) {
      const cells = el.querySelectorAll('th, td');
      const separator = '| ' + Array.from({ length: cells.length }).map(() => '---').join(' | ') + ' |';
      suffix = '\n' + separator;
    }
    return rowStr + suffix + '\n';
  },
});

turndown.addRule('table', {
  filter: 'table',
  replacement: (content) => {
    return '\n\n' + content.trim() + '\n\n';
  },
});

export const htmlToBoardMarkdown = (html: string): string => turndown.turndown(html || '');

