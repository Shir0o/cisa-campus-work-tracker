// The shared Section-body renderer (ADR 0013). The one rendering seam for
// Meeting content: both PublicStudyReader and the editor's live preview
// consume this component, so the preview cannot lie about what a student
// sees. Blocks render in the author's order; prose runs through
// ReactMarkdown (no rehype-raw — raw HTML renders as inert text, which is
// the sanitization posture for the public, anonymous reader); Blanks are
// extracted before markdown runs and win their run (emphasis around a Blank
// is not styled — the tap target owns the word).
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Section, SectionBlock, Blank, Text, ListItem } from '../../lib/bibleStudy';
import { useLanguage } from '../LanguageProvider';

type BlankPart = { kind: 'blank'; blank: Blank; n: number };
type MdPart = { kind: 'md'; text: string };
type InlinePart = BlankPart | MdPart;

/**
 * Splits a markdown run into alternating Blank and markdown parts, numbering
 * each Blank's inline index. The Blank marker is reserved: its contents are
 * plain text (never markdown), and emphasis markers around it are left as
 * literal text — the Blank wins its run (ADR 0013 §3).
 */
function splitInline(md: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let rest = md;
  let n = 0;
  while (true) {
    const match = rest.match(/^(.*?)\[\[(.*?)\]\](.*)$/s);
    if (!match) break;
    const [, before, word, after] = match;
    if (before) parts.push({ kind: 'md', text: before });
    const last = parts[parts.length - 1];
    if (last && last.kind === 'md') {
      // Strip emphasis markers hugging the blank; they belong to the run the
      // Blank wins. `**[[free]]**` renders the blank plain, no asterisks.
      parts[parts.length - 1] = { kind: 'md', text: last.text.replace(/\*+$/, '') };
    }
    parts.push({ kind: 'blank', blank: { before: '', word, after: '' }, n });
    rest = after.replace(/^\*+/, '');
    n += 1;
    if (n > 500) break; // grammar bounds runaway input; 500 blanks is not a document
  }
  if (rest) parts.push({ kind: 'md', text: rest });
  return parts;
}

const InlineMd: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <>{children}</>,
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {children}
        </a>
      ),
    }}
  >
    {text}
  </ReactMarkdown>
);

const BlankSpan: React.FC<{
  part: BlankPart;
  isOpen: boolean;
  onReveal: () => void;
}> = ({ part, isOpen, onReveal }) => {
  const { t } = useLanguage();
  const reveal = () => {
    if (!isOpen) onReveal();
  };
  return (
    <span>
      <span
        // The blank's own box is only as tall as its 2px underline, so the
        // `after:` layer is what a thumb actually hits: it extends the target
        // to the whole line box (#1777 — the measured box was 64×2 inside a
        // 34px line). `-0.6em` clears WCAG 2.5.8's 24px floor — 24px tall at
        // the 20px default, 26.4px at 22px (#1837; `-0.45em` was 20.7px and
        // left a dead band where a thumb aiming at the word lands). It is a
        // pseudo-element so the underline and the line box never reflow, and
        // the focus ring rides the same layer because a 2px-tall ring is no
        // ring.
        className={`relative inline-block border-b-2 cursor-pointer transition-all duration-200 mx-1 after:absolute after:inset-x-0 after:-inset-y-[0.6em] after:content-[''] focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--t-sage)] ${
          isOpen
            ? 'border-transparent bg-[var(--t-sage-soft)] text-on-surface px-1.5 rounded-md font-medium'
            : 'min-w-[64px] border-[var(--accent-line)]'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          reveal();
        }}
        onKeyDown={(e) => {
          // A span with role=button gets no Enter/Space activation from the
          // browser; without this the study could be reached by keyboard but
          // never answered (#1777).
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            reveal();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={isOpen ? part.blank.word : t('reader.blank_reveal')}
      >
        {isOpen ? part.blank.word : ''}
      </span>
    </span>
  );
};

/**
 * The first verse number of a reference, e.g. 24 for `mark 3:24-27`,
 * `mark 3:24`, and 1 for a multi-chapter range like `John 1:1-2:25`.
 * The range renderer numbers each following verse from it.
 */
function verseStart(ref: string): number {
  const m = ref.match(/:(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

export type SectionBodyProps = {
  section: Section;
  sectionIndex: number;
  openBlanks: Record<string, boolean>;
  onRevealBlank: (key: string) => void;
  /**
   * Renders only the Passage blocks, or only everything else — the paged
   * deck sets the Passage beside the notes (#1590). Skipped blocks keep their
   * place in the Section, so Blank keys built from a block's position are the
   * same in either layout and a revealed Blank survives a layout change.
   */
  only?: 'passage' | 'notes';
};

const SectionBody: React.FC<SectionBodyProps> = ({ section, sectionIndex, openBlanks, onRevealBlank, only }) => {
  const { t } = useLanguage();
  // Nested sub-points (ADR 0013 §Decision 2) render a nested <ul>/<ol>
  // inside the parent <li>, so the reader and the editor preview — one
  // rendering path — show the author's outline. Blank reveal keys extend
  // the legacy `${sectionIndex}:p${pIdx}` scheme with the child path
  // (`p0.1`), keeping flat legacy keys byte-identical and nested keys
  // deterministic across mixed depths.
  const renderList = (
    block: Extract<SectionBlock, { kind: 'bullet-list' | 'number-list' }>,
    bIdx: number,
  ): React.ReactNode => {
    const Tag = block.kind === 'number-list' ? 'ol' : 'ul';
    const renderPoint = (pt: ListItem, path: string): React.ReactNode => {
      if (!pt || typeof pt !== 'object') return null;
      const key = `${sectionIndex}:${path}`;
      // Sections saved before the number strip still carry the literal
      // "1." — the reader renders Firestore's stored copy without
      // re-parsing md, so the renderer owns legacy prefixes too.
      const before = block.kind === 'number-list' ? pt.before.replace(/^\d+[.)]\s+/, '') : pt.before;
      const inline = renderLine({ ...pt, before }, key);
      return (
        <li key={path} className="text-[length:var(--reader-fs)] leading-[1.55] text-on-surface-variant">
          {inline}
          {pt.children && pt.children.length > 0 && (
            <Tag className={`flex flex-col gap-1.5 py-1 ${block.kind === 'number-list' ? 'list-decimal' : 'list-disc'} pl-5 marker:text-on-surface-variant`}>
              {pt.children.map((child, cIdx) => renderPoint(child, `${path}.${cIdx}`))}
            </Tag>
          )}
        </li>
      );
    };
    return (
      <Tag
        key={bIdx}
        data-block-kind={block.kind}
        start={block.kind === 'number-list' ? block.start : undefined}
        className={`flex flex-col gap-1.5 py-1 ${
          block.kind === 'number-list' ? 'list-decimal' : 'list-disc'
        } pl-5 marker:text-on-surface-variant`}
      >
        {block.points.map((pt, pIdx) => renderPoint(pt, `p${pIdx}`))}
      </Tag>
    );
  };

  // One line of scripture, a Key line, a Passage or a list point: inline markdown around at most one Blank.
  const renderLine = (v: Blank | Text, blankKey: string): React.ReactNode =>
    'word' in v ? (
      <>
        {v.before && <InlineMd text={v.before} />}
        <BlankSpan
          part={{ kind: 'blank', blank: v, n: 0 }}
          isOpen={!!openBlanks[blankKey]}
          onReveal={() => onRevealBlank(blankKey)}
        />
        {v.after && <InlineMd text={v.after} />}
      </>
    ) : (
      <InlineMd text={v.before} />
    );

  return (
    <div data-testid="section-body" className="flex flex-col gap-5">
      {section.content.map((block, bIdx) => {
        if (only && (block.kind === 'passage') !== (only === 'passage')) return null;
        switch (block.kind) {
          case 'bullet-list':
          case 'number-list':
            return renderList(block, bIdx);
          case 'passage':
            // The reading, set large in the scripture face. The citation line
            // is retired: a stored Section's legacy `ref` is deliberately not
            // shown, so old and new Meetings read the same.
            return (
              <figure key={bIdx} data-block-kind="passage" className="m-0">
                <p className="m-0 font-scripture text-[length:calc(var(--reader-fs)+3px)] leading-[1.6] text-on-surface">
                  {block.passage && typeof block.passage === 'object'
                    ? renderLine(block.passage, `${sectionIndex}:pg`)
                    : null}
                </p>
              </figure>
            );
          case 'keyline':
            // The one sentence a Section turns on, set apart and centred. Its
            // reference is optional — absent when it is the author's own words.
            return (
              <figure key={bIdx} data-block-kind="keyline" className="m-0 py-2 text-center">
                <span aria-hidden="true" className="block font-scripture text-[44px] leading-[0.6] text-on-surface-variant">
                  “
                </span>
                <blockquote className="m-0 mt-2 font-scripture font-medium text-[length:calc(var(--reader-fs)*1.3)] leading-[1.35] text-on-surface text-balance">
                  {renderLine(block.line, `${sectionIndex}:k${bIdx}`)}
                </blockquote>
                {block.ref && (
                  <figcaption className="mt-2 text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant">
                    {block.ref}
                  </figcaption>
                )}
              </figure>
            );
          case 'verse': {
            // A proof-text in the flow (#918): the reference leads as a small
            // sage label, the words follow at body size in the body face — no
            // figure, no scripture face, visibly distinct from a Passage. A
            // range (#1187) runs on as one paragraph, like a printed Bible,
            // each verse led by its number as a small superscript.
            const refLabel = (
              <cite
                data-verse-ref
                className="block not-italic text-[11px] font-semibold tracking-wider uppercase text-[var(--t-sage)]"
              >
                {block.ref}
              </cite>
            );
            const words =
              block.verses && block.verses.length > 0 ? (
                <p className="m-0">
                  {block.verses.map((v, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && ' '}
                      <sup className="mr-0.5 text-[0.62em] font-semibold leading-[0] text-on-surface-variant">
                        {verseStart(block.ref) + i}
                      </sup>
                      {renderLine(v, `${sectionIndex}:vr${i}`)}
                    </React.Fragment>
                  ))}
                </p>
              ) : block.verse ? (
                <p className="m-0">{renderLine(block.verse, `${sectionIndex}:vs`)}</p>
              ) : null;
            return (
              <div
                key={bIdx}
                data-block-kind="verse"
                className="flex flex-col gap-1 text-[length:var(--reader-fs)] leading-[1.55] text-on-surface"
              >
                {refLabel}
                {words}
              </div>
            );
          }
          case 'prompt': {
            const k = block.prompt.kind;
            // A soft tint of the kind's tone carries the Prompt — no border,
            // no side stripe.
            const tone = k === 'discuss' ? 'sage' : k === 'activity' ? 'clay' : k === 'apply' ? 'ochre' : 'slate';
            const toneClass = {
              sage: { bg: 'bg-[var(--t-sage-soft)]', text: 'text-[var(--t-sage)]' },
              clay: { bg: 'bg-[var(--t-clay-soft)]', text: 'text-[var(--t-clay)]' },
              ochre: { bg: 'bg-[var(--t-ochre-soft)]', text: 'text-[var(--t-ochre)]' },
              slate: { bg: 'bg-[var(--t-slate-soft)]', text: 'text-[var(--t-slate)]' },
            }[tone];
            return (
              <div
                key={bIdx}
                data-block-kind="prompt"
                className={`${toneClass.bg} rounded-[20px] p-4 sm:p-5 flex flex-col gap-2`}
              >
                <div className={`text-[11px] font-bold tracking-widest uppercase ${toneClass.text}`}>
                  {/* The four kind labels follow the session language (#1770):
                      a Spanish reader used to get "DISCUSS" over every prompt
                      while the rest of the chrome was in Spanish. */}
                  {k === 'discuss'
                    ? t('reader.prompt_discuss')
                    : k === 'activity'
                      ? t('reader.prompt_activity')
                      : k === 'apply'
                        ? t('reader.prompt_apply')
                        : t('reader.prompt_question')}
                </div>
                {block.prompt.text && (
                  <p className="m-0 text-[length:var(--reader-fs)] leading-relaxed text-on-surface">{block.prompt.text}</p>
                )}
                {block.prompt.points && block.prompt.points.length > 0 && (
                  <ul className="flex flex-col gap-2 py-1 list-disc pl-5 marker:text-on-surface-variant m-0">
                    {block.prompt.points.map((pt, pIdx) => (
                      <li key={pIdx} className="text-[length:var(--reader-fs)] leading-relaxed text-on-surface">
                        {pt}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }
          case 'prose': {
            const parts = splitInline(block.md);
            // A block, never a column flex container: in `display:flex` every
            // contiguous inline run (a text node, a <strong>, a Blank) becomes
            // an anonymous flex item and therefore a block, so a sentence with
            // a Blank fell apart one fragment per line (#1777 — 149 characters
            // rendered as 10 line boxes). Keeping it a block keeps the Blank
            // inside the sentence the author wrote.
            return (
              <div key={bIdx} data-block-kind="prose" className="text-[length:var(--reader-fs)] leading-[1.55] text-on-surface-variant">
                {parts.map((part, pIdx) => {
                  if (part.kind === 'blank') {
                    const key = `${sectionIndex}:b${part.n}`;
                    return (
                      <BlankSpan
                        key={pIdx}
                        part={part}
                        isOpen={!!openBlanks[key]}
                        onReveal={() => onRevealBlank(key)}
                      />
                    );
                  }
                  return <InlineMd key={pIdx} text={part.text} />;
                })}
              </div>
            );
          }
        }
      })}
    </div>
  );
};

export default SectionBody;