import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import CoordinationNotesMobile from '../views/CoordinationNotesMobile';

vi.mock('../lib/board', () => ({
  BOARD_AUDIENCE: {
    team: { label: 'Team' },
    trainees: { label: 'Trainees' },
    everyone: { label: 'Everyone' },
  },
  docGroup: vi.fn(() => 'This week'),
}));

vi.mock('../lib/markdown', () => ({
  mdPreview: vi.fn(() => 'preview'),
  mdSummary: vi.fn(() => 'a summary'),
  mdOpenTasks: vi.fn(() => 0),
}));

const DocEditorStub = ({ doc, meName }: any) => (
  <div data-testid="doc-editor">{doc?.title} — {meName}</div>
);
const ReadOnlyDocStub = ({ doc }: any) => <div data-testid="readonly-doc">{doc?.title}</div>;

const doc = (over: any = {}) => ({
  id: 'd1',
  title: 'Weekly Coordination',
  md: '# notes',
  summary: '',
  audience: 'team',
  pinned: false,
  ...over,
} as any);

function Harness({ docs, canEdit = true, onNewDoc = vi.fn(), onDelete = vi.fn(), onPromote = vi.fn(), heading = 'The Board' }: any) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extraDocs, setExtraDocs] = useState<any[]>([]);
  const allDocs = [...docs, ...extraDocs];
  const active = allDocs.find((d: any) => d.id === activeId) ?? null;
  const handleNewDoc = () => {
    onNewDoc();
    setExtraDocs((e) => [...e, { ...doc(), id: 'd-new', title: 'New Page Draft' }]);
    setActiveId('d-new');
  };
  return (
    <CoordinationNotesMobile
      canEdit={canEdit}
      canSeeNotes
      docs={allDocs}
      active={active}
      activeId={activeId}
      setActiveId={setActiveId}
      newDoc={handleNewDoc}
      promoteDoc={onPromote}
      heading={heading}
      intro="A shared coordination space."
      uid="u1"
      meName="Sarah"
      pagesCollapsed={false}
      togglePages={vi.fn()}
      setLiveActiveMd={vi.fn()}
      saveMarkdown={vi.fn()}
      saveTitle={vi.fn()}
      saveAudience={vi.fn()}
      deleteBoardDoc={onDelete}
      team={[]}
      showToast={vi.fn()}
      contacts={[]}
      setSelectedContact={vi.fn()}
      setIsDetailsModalOpen={vi.fn()}
      DocEditorComponent={DocEditorStub}
      ReadOnlyDocComponent={ReadOnlyDocStub}
      TodoSectionComponent={<div>todo section</div>}
      NotesSectionComponent={<div>notes section</div>}
      SearchBarComponent={<div data-testid="mobile-search-bar">Search Bar</div>}
    />
  );
}

describe('CoordinationNotesMobile', () => {
  it('renders the list view with heading, intro and doc cards', () => {
    render(<Harness docs={[doc()]} />);
    expect(screen.getAllByText('The Board').length).toBeGreaterThan(0);
    expect(screen.getByText('A shared coordination space.')).toBeInTheDocument();
    expect(screen.getByText('Weekly Coordination')).toBeInTheDocument();
    expect(screen.getByText('todo section')).toBeInTheDocument();
    expect(screen.getByText('notes section')).toBeInTheDocument();
  });

  it('shows the empty state when no docs are open', () => {
    render(<Harness docs={[]} />);
    expect(screen.getByText('No pages are open to you just yet.')).toBeInTheDocument();
  });

  it('shows a New page button only for editors and calls newDoc on click', () => {
    const onNewDoc = vi.fn();
    const { rerender } = render(<Harness docs={[]} onNewDoc={onNewDoc} canEdit />);
    fireEvent.click(screen.getByText('New page'));
    expect(onNewDoc).toHaveBeenCalled();

    rerender(<Harness docs={[]} canEdit={false} />);
    expect(screen.queryByText('New page')).not.toBeInTheDocument();
  });

  it('opens the reading view when a doc card is tapped, and backs out to the list', () => {
    render(<Harness docs={[doc()]} />);
    fireEvent.click(screen.getByText('Weekly Coordination'));
    expect(screen.getByTestId('readonly-doc')).toHaveTextContent('Weekly Coordination');

    fireEvent.click(screen.getByText('Pages'));
    expect(screen.getByText('Weekly Coordination')).toBeInTheDocument();
  });

  it('toggles between read-only and editor when the user can edit', () => {
    render(<Harness docs={[doc()]} />);
    fireEvent.click(screen.getByText('Weekly Coordination'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByTestId('doc-editor')).toHaveTextContent('Weekly Coordination — Sarah');
    fireEvent.click(screen.getByText('Done'));
    expect(screen.getByTestId('readonly-doc')).toHaveTextContent('Weekly Coordination');
  });

  it('hides the edit button for non-editors', () => {
    render(<Harness docs={[doc()]} canEdit={false} />);
    fireEvent.click(screen.getByText('Weekly Coordination'));
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('renders Pinned and audience badges on cards', () => {
    render(<Harness docs={[doc({ pinned: true, audience: 'trainees' })]} />);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Trainees')).toBeInTheDocument();
  });

  it('opens the editor shortly after creating a new page', () => {
    vi.useFakeTimers();
    try {
      render(<Harness docs={[]} />);
      fireEvent.click(screen.getByText('New page'));
      act(() => vi.advanceTimersByTime(100));
      expect(screen.getByTestId('doc-editor')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // #1851 — at 375×812 the hero spent 229px before the search field (eyebrow,
  // a 3-line intro) and the "New page" text-link sat in a section head below
  // it, so the first page card started 436px down. The phone hero now drops
  // the eyebrow, keeps the intro to a single line, and carries the same
  // "New page" action as a 44px control; the list keeps its name for
  // assistive tech without spending a visible heading band.
  it('gives the phone hero one line of copy and a 44px New page target (#1851)', () => {
    const { container } = render(<Harness docs={[doc()]} heading="Coordination Notes" />);

    // The eyebrow ("The Board") is gone. The heading and intro copy stay.
    expect(screen.queryByText('The Board')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coordination Notes' })).toBeInTheDocument();
    expect(screen.getByText('A shared coordination space.')).toHaveClass('bdm-state');

    // The action lives in the hero, once, at the 44px phone floor.
    const newPage = screen.getByRole('button', { name: 'New page' });
    expect(newPage.closest('header')).not.toBeNull();
    expect(newPage).toHaveClass('min-h-11');
    expect(screen.getAllByRole('button', { name: 'New page' })).toHaveLength(1);

    // The pages list is still named for screen readers, without a visible
    // heading band above the first card.
    const list = container.querySelector('.bdm-pages');
    expect(list?.querySelector('h2')).toHaveClass('sr-only');

    // The intro is clamped by the phone stylesheet: the copy stays complete
    // in the DOM and only renders as one line.
    const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');
    const rule = css.match(/\.bdm-state\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/-webkit-line-clamp:\s*1/);
  });
});
