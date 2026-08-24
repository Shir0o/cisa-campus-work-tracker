import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  conflictMap,
  expandEvents,
  startOfDay,
  type CalendarEvent,
  type CategoryId,
  type HoverPayload,
  type MorePayload,
  type ViewId,
} from '../lib/calendar/calendar';
import {
  subscribeCalendarEvents,
  saveCalendarEvent,
  removeCalendarEvent,
} from '../lib/calendar/events';
import { subscribeCategoryOverrides, useCategoryVersion } from '../lib/calendar/categories';
import { popAndApply, pushUndo } from '../lib/calendar/undo';
import { UndoToast } from '../components/calendar/UndoToast';
import { MonthView } from '../components/calendar/MonthView';
import { WeekView } from '../components/calendar/WeekView';
import { AgendaView } from '../components/calendar/AgendaView';
import { TimelineView } from '../components/calendar/TimelineView';
import { YearView } from '../components/calendar/YearView';
import { EventDetailsModal } from '../components/calendar/EventDetailsModal';
import { EventEditorModal, type EditorInitial } from '../components/calendar/EventEditorModal';
import { BulkImportModal } from '../components/calendar/BulkImportModal';
import { MorePopover } from '../components/calendar/MorePopover';
import { HoverPreview } from '../components/calendar/HoverPreview';
import { SearchResults } from '../components/calendar/SearchResults';
import { TopBar } from '../components/calendar/TopBar';
import { Sidebar } from '../components/calendar/Sidebar';
import { useAuth } from '../components/AuthProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import PageContainer from '../components/layout/PageContainer';
import '../styles/lattice.css';

const ACCENT = { c: 'oklch(0.5 0.18 265)', soft: 'oklch(0.95 0.04 265)', h: 265 };

export default function CalendarView() {
  const { user, role, isAdmin, isOwner, logOut } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [view, setView] = useState<ViewId>(() => (isMobile ? 'agenda' : 'month'));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pickedEvent, setPickedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<EditorInitial | null>(null);
  const [hoverEvent, setHoverEvent] = useState<HoverPayload | null>(null);
  const [morePayload, setMorePayload] = useState<MorePayload | null>(null);
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<CategoryId[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  // Can edit: admins/managers in CISA or owners
  const canEdit = isOwner || isAdmin || role === 'admin' || role === 'manager';
  const canCreate = Boolean(user);

  useEffect(() => {
    return subscribeCalendarEvents(setEvents, (e) =>
      console.error('calendar subscription error', e),
    );
  }, []);

  useEffect(() => {
    return subscribeCategoryOverrides((e) =>
      console.error('categories subscription error', e),
    );
  }, []);

  useCategoryVersion();

  const expanded = useMemo(() => {
    const s = new Date(cursor.getFullYear(), 0, 1);
    const e = new Date(cursor.getFullYear() + 1, 0, 1);
    return expandEvents(events, addDays(s, -42), addDays(e, 42));
  }, [events, cursor]);

  const filtered = useMemo(
    () => expanded.filter((e) => !catFilter.includes(e.cat)),
    [expanded, catFilter],
  );

  const conflicts = useMemo(() => conflictMap(filtered), [filtered]);

  const monthConflictCount = useMemo(() => {
    const mo = cursor.getMonth(),
      yr = cursor.getFullYear();
    let n = 0;
    conflicts.forEach((_, id) => {
      const ev = filtered.find((e) => e.id === id);
      if (ev && ev.start.getMonth() === mo && ev.start.getFullYear() === yr) n++;
    });
    return n;
  }, [conflicts, filtered, cursor]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return events
      .filter((e) => e.title.toLowerCase().includes(q) || (e.notes && e.notes.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [events, query]);

  const handleSave = async (ev: CalendarEvent) => {
    const prior = events.find((e) => e.id === ev.id);
    await saveCalendarEvent(ev);
    pushUndo({
      label: prior ? `Edited "${ev.title}"` : `Created "${ev.title}"`,
      apply: async () => {
        if (prior) await saveCalendarEvent(prior);
        else await removeCalendarEvent(ev.id);
      },
    });
  };

  const handleDelete = async (id: string) => {
    const target = events.find((e) => e.id === id);
    if (!target) return;
    await removeCalendarEvent(id);
    setPickedEvent(null);
    setEditingEvent(null);
    pushUndo({
      label: `Deleted "${target.title}"`,
      apply: async () => {
        await saveCalendarEvent(target);
      },
    });
  };

  const handleMoveEvent = async (id: string, newStart: Date) => {
    const target = events.find((e) => e.id === id);
    if (!target) return;
    const durMins = target.dur || (target.allDay ? 0 : 30);
    const updated: CalendarEvent = {
      ...target,
      start: newStart,
      dur: target.allDay ? 0 : durMins,
      end: target.allDay ? addDays(newStart, 1) : undefined,
    };
    await saveCalendarEvent(updated);
    pushUndo({
      label: `Rescheduled "${target.title}"`,
      apply: async () => {
        await saveCalendarEvent(target);
      },
    });
  };

  const handleCreateAt = (d: Date) => {
    if (!canCreate) return;
    setEditingEvent({ start: d });
  };

  const handleNewEvent = () => {
    if (!canCreate) return;
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    setEditingEvent({ start: nextHour });
  };

  return (
    <PageContainer className="p-0 h-[calc(100vh-4rem)] flex flex-col overflow-hidden max-w-none">
      <div className="theme-light app density-default flex-1 min-h-0 w-full relative">
        <div className={`sidebar-wrap ${sidebarOpen ? 'open' : ''}`}>
          <Sidebar
            cursor={cursor}
            setCursor={setCursor}
            rawEvents={events}
            expandedEvents={expanded}
            catFilter={catFilter}
            setCatFilter={setCatFilter}
            accent={ACCENT}
            role={isOwner ? 'owner' : isAdmin ? 'admin' : 'member'}
            canCreate={canCreate}
            onCreate={handleNewEvent}
            onOpenImport={() => setImportOpen(true)}
            onPickEvent={(ev) => setPickedEvent(ev)}
            onSignOut={logOut}
          />
        </div>

        {sidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        )}

        <div className="main flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <TopBar
            view={view}
            setView={setView}
            cursor={cursor}
            setCursor={setCursor}
            query={query}
            setQuery={setQuery}
            conflictCount={monthConflictCount}
            onConflictClick={() => setView('month')}
            onToday={() => setCursor(new Date())}
            onOpenSidebar={() => setSidebarOpen((o) => !o)}
          />

          <div className="view flex-1 min-h-0 relative overflow-hidden">
            {view === 'month' && (
              <MonthView
                cursor={cursor}
                events={filtered}
                conflicts={conflicts}
                onPickEvent={(ev) => setPickedEvent(ev)}
                onPickMore={(p) => setMorePayload(p)}
                onMoveEvent={handleMoveEvent}
                onCreateAt={handleCreateAt}
                density="default"
                showWeekends={true}
                canDrag={canEdit}
                setHoverEvent={setHoverEvent}
              />
            )}
            {view === 'week' && (
              <WeekView
                cursor={cursor}
                events={filtered}
                conflicts={conflicts}
                density="default"
                onPickEvent={(ev) => setPickedEvent(ev)}
                onMoveEvent={handleMoveEvent}
                onCreateAt={handleCreateAt}
                showWeekends={true}
                canDrag={canEdit}
                setHoverEvent={setHoverEvent}
              />
            )}
            {view === 'agenda' && (
              <AgendaView
                cursor={cursor}
                events={filtered}
                conflicts={conflicts}
                onPickEvent={(ev) => setPickedEvent(ev)}
              />
            )}
            {view === 'timeline' && (
              <TimelineView
                cursor={cursor}
                events={filtered}
                conflicts={conflicts}
                onPickEvent={(ev) => setPickedEvent(ev)}
                setHoverEvent={setHoverEvent}
              />
            )}
            {view === 'year' && (
              <YearView
                cursor={cursor}
                events={filtered}
                onPickEvent={(ev) => setPickedEvent(ev)}
                onPickMonth={(m) => {
                  setCursor(m);
                  setView('month');
                }}
              />
            )}

            {query.trim() && (
              <SearchResults
                query={query}
                events={events}
                onPick={(ev) => {
                  setPickedEvent(ev);
                  setQuery('');
                }}
                onClose={() => setQuery('')}
              />
            )}
          </div>
        </div>

        {hoverEvent && <HoverPreview hover={hoverEvent} />}

        {morePayload && (
          <MorePopover
            payload={morePayload}
            onClose={() => setMorePayload(null)}
            onPickEvent={(ev) => {
              setMorePayload(null);
              setPickedEvent(ev);
            }}
          />
        )}

        {pickedEvent && (
          <EventDetailsModal
            event={pickedEvent}
            allEvents={expanded}
            onClose={() => setPickedEvent(null)}
            onEdit={(ev) => {
              setPickedEvent(null);
              setEditingEvent(ev);
            }}
            onDelete={handleDelete}
            canEdit={canEdit}
            onPickConflictEvent={(ev) => setPickedEvent(ev)}
          />
        )}

        {editingEvent && (
          <EventEditorModal
            initial={editingEvent}
            allEvents={expanded}
            onClose={() => setEditingEvent(null)}
            onSave={async (ev) => {
              await handleSave(ev);
              setEditingEvent(null);
            }}
            onDelete={editingEvent.id ? () => handleDelete(editingEvent.id!) : undefined}
          />
        )}

        {importOpen && (
          <BulkImportModal
            onClose={() => setImportOpen(false)}
            onCommit={() => setImportOpen(false)}
          />
        )}

        <UndoToast />
      </div>
    </PageContainer>
  );
}
