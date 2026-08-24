import React, { useState } from 'react';
import { ChevronLeft, Edit3, Check, Plus, Search, X, CheckSquare, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { BoardDoc, Audience, BOARD_AUDIENCE, docGroup } from '../lib/board';
import { mdPreview, mdSummary, mdOpenTasks } from '../lib/markdown';
import { Contact } from '../types';
import { useLanguage } from '../components/LanguageProvider';
import { Translate } from '../components/Translate';

interface TeamMember {
  uid: string;
  name: string;
  photoURL?: string;
  role?: string;
}

interface CoordinationNotesMobileProps {
  canEdit: boolean;
  canSeeNotes: boolean;
  docs: BoardDoc[];
  active: BoardDoc | null;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  newDoc: () => void;
  promoteDoc: (d: BoardDoc) => void;
  heading: string;
  intro: React.ReactNode;
  
  // DocEditor / ReadOnlyDoc props
  uid: string;
  meName: string;
  pagesCollapsed: boolean;
  togglePages: () => void;
  setLiveActiveMd: (md: string | null) => void;
  saveMarkdown: (id: string, md: string) => void;
  saveTitle: (id: string, title: string) => void;
  saveAudience: (id: string, audience: Audience) => void;
  deleteBoardDoc: (d: BoardDoc) => void;
  team: TeamMember[];
  showToast: (msg: string) => void;
  contacts: Contact[];
  setSelectedContact: (c: Contact | null) => void;
  setIsDetailsModalOpen: (open: boolean) => void;

  // Render components from parent to avoid duplication
  DocEditorComponent: any;
  ReadOnlyDocComponent: any;
  TodoSectionComponent: React.ReactNode;
  NotesSectionComponent: React.ReactNode;
  SearchBarComponent?: React.ReactNode;
}

export default function CoordinationNotesMobile({
  canEdit,
  canSeeNotes,
  docs,
  active,
  activeId,
  setActiveId,
  newDoc,
  promoteDoc,
  heading,
  intro,
  
  uid,
  meName,
  pagesCollapsed,
  togglePages,
  setLiveActiveMd,
  saveMarkdown,
  saveTitle,
  saveAudience,
  deleteBoardDoc,
  team,
  showToast,
  contacts,
  setSelectedContact,
  setIsDetailsModalOpen,

  DocEditorComponent: DocEditor,
  ReadOnlyDocComponent: ReadOnlyDoc,
  TodoSectionComponent,
  NotesSectionComponent,
  SearchBarComponent,
}: CoordinationNotesMobileProps) {
  const { t } = useLanguage();
  const [mReading, setMReading] = useState(false);
  const [mEditing, setMEditing] = useState(false);

  const openMobileDoc = (id: string) => {
    setActiveId(id);
    setMReading(true);
    setMEditing(false);
  };

  const closeMobileDoc = () => {
    setMReading(false);
    setMEditing(false);
  };

  // If reading detail view
  if (mReading && active) {
    return (
      <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-24 page dash bd-page bdoc-page bdm bdm-detail" data-role="ft">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-outline-variant/35 bdm-topbar shrink-0">
          <button
            onClick={closeMobileDoc}
            className="inline-flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-on-surface bdm-back"
          >
            <ChevronLeft className="w-5 h-5 bdm-back-ico" />
            <span>{t('coordination.pages')}</span>
          </button>
          {canEdit && (
            <button
              onClick={() => setMEditing((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all bdm-edit",
                mEditing
                  ? "bg-primary text-on-primary border-primary on"
                  : "bg-surface border-outline-variant/80 text-on-surface-variant"
              )}
            >
              {mEditing ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('coordination.done')}</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t('coordination.edit')}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Document view wrapper */}
        <div className="flex-1 overflow-y-auto bdm-docwrap">
          {mEditing && canEdit ? (
            <DocEditor
              key={active.id + "-edit"}
              doc={active}
              meUid={uid}
              meName={meName}
              pagesCollapsed={pagesCollapsed}
              onTogglePages={togglePages}
              onLiveMarkdownChange={setLiveActiveMd}
              onSaveMarkdown={saveMarkdown}
              onSaveTitle={saveTitle}
              onSaveAudience={saveAudience}
              onPromote={promoteDoc}
              onDelete={deleteBoardDoc}
              team={team}
              onToast={showToast}
              contacts={contacts}
              onSelectContact={setSelectedContact}
              onOpenContactModal={setIsDetailsModalOpen}
            />
          ) : (
            <ReadOnlyDoc
              key={active.id + "-read"}
              doc={active}
              pagesCollapsed={pagesCollapsed}
              onTogglePages={togglePages}
            />
          )}
        </div>
      </div>
    );
  }

  // Otherwise, list view


  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 page dash bd-page bdoc-page bdm" data-role="ft">
      {/* Hero */}
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30 mdm-hero bdm-hero">
        <div className="text-xs   text-on-surface-variant/80 font-semibold mb-1 mdm-eyebrow">
          The Board
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface mdm-greet">{heading}</h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2 bdm-state">{intro}</p>
      </header>

      {SearchBarComponent && <div className="px-5 mt-4">{SearchBarComponent}</div>}

      {/* Pages Section */}
      <section className="px-5 mt-5 bdm-pages">
        <div className="flex items-center justify-between mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface font-semibold">{t('coordination.pages')}</h2>
          {canEdit && (
            <button
              onClick={() => {
                newDoc();
                // Set detail editing mode directly after a short delay to let active switch
                setTimeout(() => {
                  setMReading(true);
                  setMEditing(true);
                }, 100);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline dash-sec-link"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('coordination.new_page')}</span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 bdm-list">
          {docs.length === 0 && (
            <div className="py-8 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-2xl border border-dashed border-outline-variant/30 bdm-empty">
              No pages are open to you just yet.
            </div>
          )}

          {docs.map((d) => {
            const openTasksCount = mdOpenTasks(d.md);
            const isToday = docGroup(d) === 'This week';
            
            return (
              <button
                key={d.id}
                onClick={() => openMobileDoc(d.id)}
                className={cn(
                  "flex items-center justify-between p-4 bg-surface border border-outline-variant/40 rounded-3xl text-left active:brightness-95 transition-all bdm-card",
                  isToday && "border-primary/20 bg-stage-accent-soft/30 today"
                )}
              >
                <div className="flex-1 min-w-0 pr-4 bdm-card-main">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5 bdm-card-tags">
                    {d.pinned && (
                      <span className="text-[10px] font-semibold   px-2 py-0.5 rounded-full bg-stage-accent-soft text-stage-accent bdm-pinned">
                        Pinned
                      </span>
                    )}
                    {isToday && (
                      <span className="text-[10px] font-semibold   px-2 py-0.5 rounded-full bg-primary text-on-primary bdm-today">
                        Today
                      </span>
                    )}
                    {d.audience && (canEdit || d.audience !== 'everyone') && (
                      <span className={cn(
                        "text-[10px] font-semibold   px-2 py-0.5 rounded-full bdoc-row-aud",
                        d.audience === 'everyone' ? "bg-surface-variant text-on-surface-variant" : "bg-stage-amber-soft text-stage-amber"
                      )}>
                        {BOARD_AUDIENCE[d.audience]?.label || d.audience}
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-lg text-on-surface font-semibold truncate bdm-card-title">
                    <Translate text={d.title} />
                  </h3>
                  <p className="text-[13px] text-on-surface-variant truncate mt-1 bdm-card-preview">
                    <Translate text={d.summary || mdSummary(d.md)} />
                  </p>
                  {openTasksCount > 0 && canEdit && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-accent font-semibold bdm-card-todo">
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>{t('coordination.to_do_count', '{n} to do').replace('{n}', String(openTasksCount))}</span>
                    </div>
                  )}
                </div>
                <ChevronLeft className="w-5 h-5 text-on-surface-variant/60 rotate-180 shrink-0 bdm-card-chev" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Checklist section */}
      {TodoSectionComponent}

      {/* Notes & learnings section */}
      {NotesSectionComponent}
    </div>
  );
}
