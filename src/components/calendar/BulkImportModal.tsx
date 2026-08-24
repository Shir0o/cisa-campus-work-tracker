import { useMemo, useRef, useState } from 'react';
import {
  CATEGORIES,
  conflictsForEvent,
  fmtDate,
  fmtTime,
  rruleSummary,
  type CalendarEvent,
  type CategoryId,
} from "../../lib/calendar/calendar";
import { parseDelimited, parseICS, type ImportCandidate } from "../../lib/calendar/import";
import { removeCalendarEventsBatch, saveCalendarEventsBatch } from "../../lib/calendar/events";
import { pushUndo } from "../../lib/calendar/undo";
import { Btn, CatDot, Icon } from './ui';

export interface BulkImportProps {
  existing?: CalendarEvent[]; // expanded events, for the conflict heads-up
  onClose: () => void;
  onCommit?: () => void;
  canUndo?: boolean;
}

const PASTE_HINT =
  'Paste rows (one event per line). Columns: Title, Date, Start, End/Duration, Category, Location, Notes.\nA header row is optional. Tab- or comma-separated (a Google Sheet copy works directly).';

function whenLabel(ev: CalendarEvent): string {
  if (ev.allDay) return `${fmtDate(ev.start)} · all-day`;
  return `${fmtDate(ev.start)} · ${fmtTime(ev.start)}`;
}

export const BulkImport = ({ existing = [], onClose, onCommit, canUndo = false }: BulkImportProps) => {
  const [tab, setTab] = useState<'file' | 'paste'>('file');
  const [text, setText] = useState('');
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const runICS = (content: string) => {
    try {
      const cands = parseICS(content);
      setParseError(cands.length ? null : 'No events found in that file.');
      setCandidates(cands);
    } catch {
      setParseError('Could not parse that file — is it a valid .ics calendar?');
      setCandidates(null);
    }
  };

  const onFile = async (file: File) => {
    setParseError(null);
    runICS(await file.text());
  };

  const runPaste = () => {
    setParseError(null);
    const cands = parseDelimited(text);
    setParseError(cands.length ? null : 'Nothing to import — paste some rows first.');
    setCandidates(cands);
  };

  // Conflict heads-up: check each included candidate against existing events
  // plus the other included candidates.
  const conflictIdx = useMemo(() => {
    if (!candidates) return new Set<number>();
    const includedEvents = candidates.filter((c) => c.include).map((c) => c.event);
    const pool = [...existing, ...includedEvents];
    const hits = new Set<number>();
    candidates.forEach((c, i) => {
      if (c.include && conflictsForEvent(c.event, pool).length > 0) hits.add(i);
    });
    return hits;
  }, [candidates, existing]);

  const update = (i: number, patch: Partial<ImportCandidate>) => {
    setCandidates((prev) => prev && prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const patchEvent = (i: number, patch: Partial<CalendarEvent>) => {
    setCandidates((prev) => prev && prev.map((c, idx) => (idx === i ? { ...c, event: { ...c.event, ...patch } } : c)));
  };

  const importable = candidates?.filter((c) => c.include && c.errors.length === 0) ?? [];

  const commit = async () => {
    if (!importable.length) return;
    setSaving(true);
    try {
      const importedEvents = importable.map((c) => c.event);
      await saveCalendarEventsBatch(importedEvents);
      if (canUndo) {
        const ids = importedEvents.map((e) => e.id);
        pushUndo({
          label: `Imported ${ids.length} event${ids.length === 1 ? '' : 's'}`,
          apply: () => removeCalendarEventsBatch(ids),
        });
      }
      onCommit?.();
      onClose();
    } catch (e) {
      setParseError(`Import failed: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Import events</h3>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={12} />
          </button>
        </header>

        <div className="modal-body">
          <div className="seg import-seg">
            <button className={'seg-item' + (tab === 'file' ? ' is-active' : '')} onClick={() => setTab('file')}>
              Upload .ics
            </button>
            <button className={'seg-item' + (tab === 'paste' ? ' is-active' : '')} onClick={() => setTab('paste')}>
              Paste text
            </button>
          </div>

          {tab === 'file' && (
            <div
              className="import-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void onFile(f);
              }}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="cal" size={20} />
              <span>Drop a .ics file here, or click to choose</span>
              <input
                ref={fileRef}
                type="file"
                accept=".ics,text/calendar"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </div>
          )}

          {tab === 'paste' && (
            <div className="modal-row">
              <textarea
                className="modal-input mono"
                rows={6}
                value={text}
                placeholder={PASTE_HINT}
                onChange={(e) => setText(e.target.value)}
              />
              <Btn variant="ghost" onClick={runPaste}>
                Preview rows
              </Btn>
            </div>
          )}

          {parseError && (
            <div className="conflict-banner is-inline">
              <Icon name="warn" size={13} />
              <div className="conflict-banner-body">
                <div className="conflict-banner-head mono">{parseError}</div>
              </div>
            </div>
          )}

          {candidates && candidates.length > 0 && (
            <div className="import-preview">
              <table className="import-table">
                <thead>
                  <tr>
                    <th />
                    <th>Title</th>
                    <th>When</th>
                    <th>Category</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => {
                    const blocked = c.errors.length > 0;
                    return (
                      <tr key={c.event.id} className={blocked ? 'is-error' : c.include ? '' : 'is-skipped'}>
                        <td>
                          <input
                            type="checkbox"
                            checked={c.include}
                            disabled={blocked}
                            onChange={(e) => update(i, { include: e.target.checked })}
                            aria-label="Include event"
                          />
                        </td>
                        <td>
                          <input
                            className="import-title-input"
                            value={c.event.title}
                            onChange={(e) => patchEvent(i, { title: e.target.value })}
                          />
                        </td>
                        <td className="mono import-when">
                          {whenLabel(c.event)}
                          {c.event.rrule && <span className="import-rrule"> · {rruleSummary(c.event.rrule)}</span>}
                        </td>
                        <td>
                          <span className="import-cat">
                            <CatDot cat={c.event.cat} size={7} />
                            <select
                              value={c.event.cat}
                              onChange={(e) => patchEvent(i, { cat: e.target.value as CategoryId })}
                            >
                              {CATEGORIES.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.label}
                                </option>
                              ))}
                            </select>
                          </span>
                        </td>
                        <td className="import-status">
                          {blocked && <span className="import-badge is-error" title={c.errors.join('\n')}>Error</span>}
                          {!blocked && conflictIdx.has(i) && (
                            <span className="import-badge is-warn" title="Overlaps an existing event">Conflict</span>
                          )}
                          {!blocked && c.warnings.length > 0 && (
                            <span className="import-badge is-warn" title={c.warnings.join('\n')}>Note</span>
                          )}
                          {!blocked && !conflictIdx.has(i) && c.warnings.length === 0 && (
                            <span className="import-badge is-ok">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          <span className="mono import-count">
            {candidates ? `${importable.length} of ${candidates.length} selected` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={commit} disabled={saving || importable.length === 0}>
            {saving ? 'Importing…' : `Import ${importable.length} event${importable.length === 1 ? '' : 's'}`}
          </Btn>
        </footer>
      </div>
    </div>
  );
};

export const BulkImportModal = BulkImport;

