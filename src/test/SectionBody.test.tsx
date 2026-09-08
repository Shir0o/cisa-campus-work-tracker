// The shared Section-body renderer (ADR 0013 — the one rendering seam):
// both the public reader (/s/:slug) and the editor's live preview consume
// this component, so the preview cannot lie. These tests assert what a
// reader SEES for a Section's ordered content — authored order, real
// formatting, Blanks that tap to reveal — never the block internals.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Section } from '../lib/bibleStudy';
import SectionBody from '../components/bibleStudy/SectionBody';

function section(over: Partial<Section>): Section {
  return { id: 'sec', title: 'Section', content: [], points: [], ...over };
}

describe('SectionBody (ordered content, read as written)', () => {
  it('renders blocks in authored order, not points-then-passage-then-prompt', () => {
    const s = section({
      content: [
        { kind: 'prose', md: 'Opening prose.' },
        { kind: 'bullet-list', points: [{ before: 'A bullet' }] },
        { kind: 'passage', passage: { before: 'Thus says the Lord' }, ref: 'Isaiah 1:1' },
        { kind: 'prose', md: 'More prose after the passage.' },
        { kind: 'prompt', prompt: { kind: 'question', text: 'What did we just read?' } },
      ],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);

    const body = screen.getByTestId('section-body');
    const order = Array.from(body.children).map((el) => el.getAttribute('data-block-kind'));
    expect(order).toEqual(['prose', 'bullet-list', 'passage', 'prose', 'prompt']);
    expect(screen.getByText('Opening prose.')).toBeInTheDocument();
    expect(screen.getByText('More prose after the passage.')).toBeInTheDocument();
  });

  it('renders inline markdown as formatting, never literal asterisks', () => {
    const s = section({
      content: [{ kind: 'prose', md: 'This is **bold** and *italic* and a [link](https://example.com).' }],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);

    expect(screen.queryByText(/\*\*bold\*\*/)).not.toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    const link = screen.getByRole('link', { name: 'link' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('renders raw HTML as inert text, never executes it', () => {
    const s = section({
      content: [{ kind: 'prose', md: 'Safe <script>alert(1)</script> text' }],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);

    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/alert\(1\)/)).toBeInTheDocument();
  });

  it('renders a bullet list with visible disc markers', () => {
    const s = section({
      content: [{ kind: 'bullet-list', points: [{ before: 'Main point' }, { before: 'Second point' }] }],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(list.className).toContain('list-disc');
    expect(list.className).toContain('pl-5');
    expect(list.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders a numbered list with visible decimal markers and no re-parsed numbers', () => {
    const s = section({
      content: [{ kind: 'number-list', points: [{ before: 'First step' }, { before: 'Second step' }] }],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(list.className).toContain('list-decimal');
    expect(list.className).toContain('pl-5');
    expect(list.querySelectorAll('li')).toHaveLength(2);
  });

  it('strips a literal "1." prefix a legacy stored section still carries, so the ol marker is the only number', () => {
    // Sections saved before the strip render from Firestore's stored copy —
    // the reader never re-parses md — so the renderer owns legacy prefixes.
    const s = section({
      content: [{ kind: 'number-list', points: [{ before: '1. First step' }, { before: '2) Second step' }] }],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);
    const list = screen.getByRole('list');
    expect(list.textContent).toContain('First step');
    expect(list.textContent).toContain('Second step');
    // ReactMarkdown would turn "1. …" text into a nested list and double the
    // numbering — the marker must come from the <ol> alone.
    expect(document.querySelector('ol ol')).toBeNull();
    expect(document.querySelector('ul')).toBeNull();
  });

  it('renders indented sub-points as a nested ul inside the parent li (the reader shows the outline)', () => {
    const s = section({
      content: [
        {
          kind: 'bullet-list',
          points: [
            { before: 'Main point', children: [{ before: 'Sub point A' }, { before: 'Sub point B' }] },
          ],
        },
      ],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);
    const nested = document.querySelector('ul ul');
    expect(nested).not.toBeNull();
    expect(nested?.querySelectorAll(':scope > li')).toHaveLength(2);
    expect(nested?.textContent).toContain('Sub point A');
    expect(nested?.textContent).toContain('Sub point B');
  });

  it('keeps flat legacy points rendering without a nested list', () => {
    const s = section({
      content: [{ kind: 'bullet-list', points: [{ before: 'Main point' }, { before: 'Second point' }] }],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);
    expect(document.querySelector('ul ul')).toBeNull();
    expect(screen.getByRole('list').querySelectorAll(':scope > li')).toHaveLength(2);
  });

  it('keys nested Blanks with a deterministic path that extends the legacy scheme', () => {
    const onRevealBlank = vi.fn();
    const s = section({
      content: [
        {
          kind: 'bullet-list',
          points: [
            { before: 'Top ', word: 'one', after: '', children: [{ before: 'Nested ', word: 'two', after: '' }] },
          ],
        },
      ],
    });
    render(<SectionBody section={s} sectionIndex={1} openBlanks={{}} onRevealBlank={onRevealBlank} />);
    const buttons = screen.getAllByRole('button', { name: /Blank, tap to reveal/i });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(onRevealBlank).toHaveBeenCalledWith('1:p0');
    fireEvent.click(buttons[1]);
    expect(onRevealBlank).toHaveBeenCalledWith('1:p0.0');
  });

  it('renders a Blank as a tap target that reveals its word via the reveal callback', () => {
    const onRevealBlank = vi.fn();
    const s = section({
      content: [{ kind: 'prose', md: 'Grace is [[free]], truly.' }],
    });
    render(<SectionBody section={s} sectionIndex={2} openBlanks={{}} onRevealBlank={onRevealBlank} />);

    expect(screen.queryByText('free')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Blank, tap to reveal/i }));
    expect(onRevealBlank).toHaveBeenCalledWith('2:b0');
  });

  it('shows a revealed Blank word from openBlanks state', () => {
    const s = section({
      content: [{ kind: 'prose', md: 'Grace is [[free]], truly.' }],
    });
    render(<SectionBody section={s} sectionIndex={2} openBlanks={{ '2:b0': true }} onRevealBlank={() => {}} />);
    expect(screen.getByText('free')).toBeInTheDocument();
  });

  it('a revealed Blank renders its word unstyled by surrounding emphasis (Blank wins its run)', () => {
    const s = section({
      content: [{ kind: 'prose', md: 'Grace is **[[free]] indeed**.' }],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{ '0:b0': true }} onRevealBlank={() => {}} />);
    const word = screen.getByText('free');
    expect(word.closest('strong')).toBeNull();
  });

  it('renders a Passage with its citation and a Prompt with its kind label', () => {
    const s = section({
      content: [
        { kind: 'passage', passage: { before: 'In the beginning' }, ref: 'Genesis 1:1' },
        { kind: 'prompt', prompt: { kind: 'activity', text: 'Turn to your neighbor' } },
      ],
    });
    render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);
    expect(screen.getByText('In the beginning')).toBeInTheDocument();
    expect(screen.getByText('Genesis 1:1')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Turn to your neighbor')).toBeInTheDocument();
  });

  it('keeps the legacy keying invariant: blanks in different blocks get distinct keys', () => {
    const onRevealBlank = vi.fn();
    const s = section({
      content: [
        { kind: 'bullet-list', points: [{ before: 'A ', word: 'one', after: '' }] },
        { kind: 'prose', md: 'B [[two]]' },
      ],
    });
    render(<SectionBody section={s} sectionIndex={1} openBlanks={{}} onRevealBlank={onRevealBlank} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Blank, tap to reveal/i })[0]);
    expect(onRevealBlank).toHaveBeenCalledWith('1:p0');
    fireEvent.click(screen.getAllByRole('button', { name: /Blank, tap to reveal/i })[1]);
    expect(onRevealBlank).toHaveBeenCalledWith('1:b0');
  });

  it('an empty-content Section renders nothing in the body', () => {
    const s = section({ content: [] });
    const { container } = render(<SectionBody section={s} sectionIndex={0} openBlanks={{}} onRevealBlank={() => {}} />);
    expect(container.querySelector('[data-testid="section-body"]')?.children).toHaveLength(0);
  });
});