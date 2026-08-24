import { useMemo } from 'react';
import { CAT_BY_ID, fmtDate, fmtTime, type CalendarEvent } from "../../lib/calendar/calendar";

interface SearchResultsProps {
  query: string;
  events: CalendarEvent[];
  onPick: (ev: CalendarEvent) => void;
  onClose: () => void;
}

export const SearchResults = ({ query, events, onPick, onClose }: SearchResultsProps) => {
  const q = query.toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const now = new Date().getTime();
    return events
      .filter((e) => e.title.toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q) || (e.loc || '').toLowerCase().includes(q))
      .sort((a, b) => Math.abs(a.start.getTime() - now) - Math.abs(b.start.getTime() - now))
      .slice(0, 12);
  }, [events, q]);
  if (!query) return null;
  return (
    <div className="search-pop">
      <div className="search-pop-head mono">
        {results.length} result{results.length === 1 ? '' : 's'} for "{query}"
      </div>
      <ul className="search-pop-list">
        {results.map((ev) => {
          const cat = CAT_BY_ID[ev.cat];
          return (
            <li key={ev.id}>
              <button
                onClick={() => {
                  onPick(ev);
                  onClose();
                }}
              >
                <span className="catdot" style={{ width: 7, height: 7, background: cat.dot }} />
                <span className="search-title">{ev.title}</span>
                <span className="search-date mono">
                  {fmtDate(ev.start)} · {ev.allDay ? 'All day' : fmtTime(ev.start)}
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="search-empty">No matches.</li>}
      </ul>
    </div>
  );
};
