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
}> = ({ part, isOpen, onReveal }) => (
  <span>
    <span
      className={`inline-block border-b-2 cursor-pointer transition-all duration-200 mx-1 ${
        isOpen
          ? 'border-transparent bg-[var(--t-sage-soft)] text-on-surface px-1.5 rounded-md font-medium'
          : 'min-w-[64px] border-[var(--accent-line)]'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onReveal();
      }}
      role="button"
      tabIndex={0}
      aria-label={isOpen ? part.blank.word : 'Blank, tap to reveal'}
    >
      {isOpen ? part.blank.word : ''}
    </span>
  </span>
);

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
};

const SectionBody: React.FC<SectionBodyProps> = ({ section, sectionIndex, openBlanks, onRevealBlank }) => {
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
      const inline = 'word' in pt ? (
        <BlankSpan
          part={{ kind: 'blank', blank: { before: pt.before, word: pt.word, after: pt.after }, n: 0 }}
          isOpen={!!openBlanks[key]}
          onReveal={() => onRevealBlank(key)}
        />
      ) : (
        // Sections saved before the number strip still carry the literal
        // "1." — the reader renders Firestore's stored copy without
        // re-parsing md, so the renderer owns legacy prefixes too.
        <InlineMd text={block.kind === 'number-list' ? pt.before.replace(/^\d+[.)]\s+/, '') : pt.before} />
      );
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

  // One line of scripture or a Key line: inline markdown around at most one Blank.
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
                  {block.passage && typeof block.passage === 'object' && 'word' in block.passage ? (
                    <BlankSpan
                      part={{ kind: 'blank', blank: block.passage, n: 0 }}
                      isOpen={!!openBlanks[`${sectionIndex}:pg`]}
                      onReveal={() => onRevealBlank(`${sectionIndex}:pg`)}
                    />
                  ) : block.passage && typeof block.passage === 'object' ? (
                    <InlineMd text={block.passage.before} />
                  ) : null}
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
            // no side stripe — and a dot of the full tone leads its label.
            const tone = k === 'discuss' ? 'sage' : k === 'activity' ? 'clay' : k === 'apply' ? 'ochre' : 'slate';
            const toneClass = {
              sage: { bg: 'bg-[var(--t-sage-soft)]', text: 'text-[var(--t-sage)]', dot: 'bg-[var(--t-sage)]' },
              clay: { bg: 'bg-[var(--t-clay-soft)]', text: 'text-[var(--t-clay)]', dot: 'bg-[var(--t-clay)]' },
              ochre: { bg: 'bg-[var(--t-ochre-soft)]', text: 'text-[var(--t-ochre)]', dot: 'bg-[var(--t-ochre)]' },
              slate: { bg: 'bg-[var(--t-slate-soft)]', text: 'text-[var(--t-slate)]', dot: 'bg-[var(--t-slate)]' },
            }[tone];
            return (
              <div
                key={bIdx}
                data-block-kind="prompt"
                className={`${toneClass.bg} rounded-[20px] p-4 sm:p-5 flex flex-col gap-2`}
              >
                <div className={`flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase ${toneClass.text}`}>
                  <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${toneClass.dot}`} />
                  {k === 'discuss' ? 'Discuss' : k === 'activity' ? 'Activity' : k === 'apply' ? 'Apply' : 'Question'}
                </div>
                {block.prompt.points && block.prompt.points.length > 0 ? (
                  <ul className="flex flex-col gap-2 py-1 list-disc pl-5 marker:text-on-surface-variant m-0">
                    {block.prompt.points.map((pt, pIdx) => (
                      <li key={pIdx} className="text-[length:var(--reader-fs)] leading-relaxed text-on-surface">
                        {pt}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[length:var(--reader-fs)] leading-relaxed text-on-surface">{block.prompt.text}</p>
                )}
              </div>
            );
          }
          case 'prose': {
            const parts = splitInline(block.md);
            return (
              <div key={bIdx} data-block-kind="prose" className="flex flex-col gap-2 text-[length:var(--reader-fs)] leading-[1.55] text-on-surface-variant">
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