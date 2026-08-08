import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

function Harness({ docs, canEdit = true, onNewDoc = vi.fn(), onDelete = vi.fn(), onPromote = vi.fn() }: any) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = docs.find((d: any) => d.id === activeId) ?? null;
  return (
    <CoordinationNotesMobile
      canEdit={canEdit}
      canSeeNotes
      docs={docs}
      active={active}
      activeId={activeId}
      setActiveId={setActiveId}
      newDoc={onNewDoc}
      promoteDoc={onPromote}
      heading="The Board"
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
});
