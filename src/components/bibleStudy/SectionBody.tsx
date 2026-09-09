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
import type { Section, SectionBlock, Blank, ListItem } from '../../lib/bibleStudy';

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
  const renderList = (block: Extract<SectionBlock, { kind: 'bullet-list' | 'number-list' }>): React.ReactNode => {
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
        <li key={path} className="text-[16px] leading-[1.55] text-on-surface-variant">
          {inline}
          {pt.children && pt.children.length > 0 && (
            <Tag className={`flex flex-col gap-3 py-1 ${block.kind === 'number-list' ? 'list-decimal' : 'list-disc'} pl-5 marker:text-on-surface-variant`}>
              {pt.children.map((child, cIdx) => renderPoint(child, `${path}.${cIdx}`))}
            </Tag>
          )}
        </li>
      );
    };
    return (
      <Tag
        data-block-kind={block.kind}
        className={`flex flex-col gap-3 py-1 ${
          block.kind === 'number-list' ? 'list-decimal' : 'list-disc'
        } pl-5 marker:text-on-surface-variant`}
      >
        {block.points.map((pt, pIdx) => renderPoint(pt, `p${pIdx}`))}
      </Tag>
    );
  };

  return (
    <div data-testid="section-body" className="flex flex-col gap-5">
      {section.content.map((block, bIdx) => {
        switch (block.kind) {
          case 'bullet-list':
          case 'number-list':
            return renderList(block);
          case 'passage':
            return (
              <figure key={bIdx} data-block-kind="passage" className="m-0 pt-4 border-t border-outline-variant">
                <p className="m-0 text-[18px] leading-[1.62] text-on-surface">
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

                {block.ref && (
                  <figcaption className="mt-3 text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/70">
                    {block.ref}
                  </figcaption>
                )}
              </figure>
            );
          case 'verse': {
            // A proof-text in the flow (#918): the reference leads, at body
            // size, emphasised in sage; the words follow. No figure, no rule
            // above, no trailing citation — visibly distinct from a Passage.
            const v = block.verse;
            return (
              <p key={bIdx} data-block-kind="verse" className="m-0 text-[16px] leading-[1.55] text-on-surface">
                <strong className="font-semibold text-[var(--t-sage)]">{block.ref}</strong>
                {v && (
                  <>
                    {' '}
                    {typeof v === 'object' && 'word' in v ? (
                      <>
                        {v.before && <InlineMd text={v.before} />}
                        <BlankSpan
                          part={{ kind: 'blank', blank: v, n: 0 }}
                          isOpen={!!openBlanks[`${sectionIndex}:vs`]}
                          onReveal={() => onRevealBlank(`${sectionIndex}:vs`)}
                        />
                        {v.after && <InlineMd text={v.after} />}
                      </>
                    ) : (
                      <InlineMd text={v.before} />
                    )}
                  </>
                )}
              </p>
            );
          }
          case 'prompt': {
            const k = block.prompt.kind;
            return (
              <div
                key={bIdx}
                data-block-kind="prompt"
                className={`bg-surface border border-outline-variant rounded-2xl p-4 sm:p-5 flex flex-col gap-2 ${
                  k === 'discuss' ? 'border-l-4 border-l-[var(--t-sage)]' : k === 'activity' ? 'border-l-4 border-l-[var(--t-clay)]' : k === 'apply' ? 'border-l-4 border-l-[var(--t-ochre)]' : 'border-l-4 border-l-[var(--t-slate)]'
                }`}
              >
                <div
                  className={`text-[11px] font-bold tracking-widest uppercase ${
                    k === 'discuss' ? 'text-[var(--t-sage)]' : k === 'activity' ? 'text-[var(--t-clay)]' : k === 'apply' ? 'text-[var(--t-ochre)]' : 'text-[var(--t-slate)]'
                  }`}
                >
                  {k === 'discuss' ? 'Discuss' : k === 'activity' ? 'Activity' : k === 'apply' ? 'Apply' : 'Question'}
                </div>
                <p className="m-0 text-[15px] leading-relaxed text-on-surface">{block.prompt.text}</p>
              </div>
            );
          }
          case 'prose': {
            const parts = splitInline(block.md);
            return (
              <div key={bIdx} data-block-kind="prose" className="flex flex-col gap-2 text-[16px] leading-[1.55] text-on-surface-variant">
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