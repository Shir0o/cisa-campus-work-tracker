import { MONTH_NAMES, MONTH_SHORT, startOfWeek, addDays } from "../../lib/calendar/calendar";
import { Icon, IconBtn, SegItem, Kbd } from './ui';
import type { ViewId } from "../../lib/calendar/types";

const VIEWS: { id: ViewId; label: string; icon: 'grid' | 'cal' | 'list' | 'bars' | 'year' }[] = [
  { id: 'month', label: 'Month', icon: 'grid' },
  { id: 'week', label: 'Week', icon: 'cal' },
  { id: 'agenda', label: 'Agenda', icon: 'list' },
  { id: 'year', label: 'Year', icon: 'year' },
];

interface TopBarProps {
  view: ViewId;
  setView: (v: ViewId) => void;
  cursor: Date;
  setCursor: (d: Date) => void;
  query: string;
  setQuery: (q: string) => void;
  conflictCount: number;
  onConflictClick: () => void;
  onToday: () => void;
  onOpenSidebar?: () => void;
}

export const TopBar = ({ view, setView, cursor, setCursor, query, setQuery, conflictCount, onConflictClick, onToday, onOpenSidebar }: TopBarProps) => {
  const stepCursor = (dir: number) => {
    const c = new Date(cursor);
    if (view === 'week') c.setDate(c.getDate() + dir * 7);
    else if (view === 'year') c.setFullYear(c.getFullYear() + dir);
    else c.setMonth(c.getMonth() + dir);
    setCursor(c);
  };

  const headline = () => {
    if (view === 'year') return String(cursor.getFullYear());
    if (view === 'week') {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      const sMo = MONTH_SHORT[s.getMonth()];
      const eMo = MONTH_SHORT[e.getMonth()];
      if (s.getMonth() === e.getMonth()) return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
      return `${sMo} ${s.getDate()} – ${eMo} ${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {onOpenSidebar && <IconBtn icon="list" label="Open menu" onClick={onOpenSidebar} />}
        <div className="date-nav">
          <button className="today-btn mono" onClick={onToday}>
            <Icon name="today" size={11} />
            <span>Today</span>
          </button>
          <span className="date-nav-arrows">
            <IconBtn icon="chevL" label="Previous" onClick={() => stepCursor(-1)} />
            <IconBtn icon="chevR" label="Next" onClick={() => stepCursor(1)} />
          </span>
        </div>
        <h1 className="topbar-title">{headline()}</h1>
      </div>

      <div className="topbar-mid">
        <div className="seg">
          {VIEWS.map((v) => (
            <SegItem key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
              <Icon name={v.icon} size={12} />
              <span>{v.label}</span>
            </SegItem>
          ))}
        </div>
      </div>

      <div className="topbar-right">
        {conflictCount > 0 && (
          <button className="conflict-pill" onClick={onConflictClick} title="Show events with overlapping times">
            <Icon name="warn" size={11} />
            <span className="mono">{conflictCount}</span>
            <span>conflict{conflictCount > 1 ? 's' : ''}</span>
          </button>
        )}
        <div className="search">
          <Icon name="search" size={13} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events…" />
          <Kbd>⌘K</Kbd>
        </div>
      </div>
    </header>
  );
};
