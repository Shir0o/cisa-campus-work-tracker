// Trimmed appearance/calendar tweaks panel, persisted to localStorage (per-user
// preference, not shared). Replaces the design's host-protocol tweaks shell.
import { useEffect, useState, type ReactNode } from 'react';
import type { Tweaks } from "../../lib/calendar/types";
import { Icon } from './ui';

const STORAGE_KEY = 'lattice.tweaks';

export const TWEAK_DEFAULTS: Tweaks = {
  density: 'default',
  theme: 'light',
  accent: '#4f4cdb',
  defaultView: 'month',
  showWeekends: true,
  showConflicts: true,
};

export function useTweaks(): [Tweaks, <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void] {
  const [tweaks, setTweaks] = useState<Tweaks>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return TWEAK_DEFAULTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      /* ignore */
    }
  }, [tweaks]);

  const setTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => setTweaks((t) => ({ ...t, [key]: value }));

  return [tweaks, setTweak];
}

const Section = ({ label }: { label: string }) => <div className="twk-section">{label}</div>;

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="twk-row">
    <span className="twk-label">{label}</span>
    {children}
  </div>
);

const DEFAULT_ACCENTS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626'];

interface TweaksPanelProps {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  accents?: string[];
}

export const TweaksPanel = ({
  tweaks,
  setTweak,
  accents = DEFAULT_ACCENTS,
}: TweaksPanelProps) => {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="twk-fab" onClick={() => setOpen(true)} title="Appearance & calendar settings" aria-label="Settings">
        <Icon name="filter" size={14} />
      </button>
    );
  }
  return (
    <div className="twk-panel">
      <div className="twk-hd">
        <b>Settings</b>
        <button className="iconbtn" onClick={() => setOpen(false)} aria-label="Close settings">
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="twk-body">
        <Section label="Appearance" />
        <Row label="Theme">
          <div className="twk-seg">
            {(['light', 'dark'] as const).map((v) => (
              <button key={v} className={'twk-seg-item' + (tweaks.theme === v ? ' is-active' : '')} onClick={() => setTweak('theme', v)}>
                {v}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Accent">
          <div className="twk-swatches">
            {accents.map((a) => (
              <button
                key={a}
                className={'twk-swatch' + (tweaks.accent === a ? ' is-active' : '')}
                style={{ background: a }}
                onClick={() => setTweak('accent', a)}
                aria-label={a}
              />
            ))}
          </div>
        </Row>
        <Row label="Density">
          <div className="twk-seg">
            {(['compact', 'default', 'spacious'] as const).map((v) => (
              <button key={v} className={'twk-seg-item' + (tweaks.density === v ? ' is-active' : '')} onClick={() => setTweak('density', v)}>
                {v}
              </button>
            ))}
          </div>
        </Row>
        <Section label="Calendar" />
        <Row label="Default view">
          <select className="twk-select" value={tweaks.defaultView} onChange={(e) => setTweak('defaultView', e.target.value as Tweaks['defaultView'])}>
            <option value="month">Month</option>
            <option value="week">Week</option>
            <option value="agenda">Agenda</option>
            <option value="timeline">Timeline</option>
            <option value="year">Year</option>
          </select>
        </Row>
        <Row label="Show weekends">
          <button className={'toggle' + (tweaks.showWeekends ? ' is-on' : '')} onClick={() => setTweak('showWeekends', !tweaks.showWeekends)}>
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </button>
        </Row>
        <Row label="Highlight conflicts">
          <button className={'toggle' + (tweaks.showConflicts ? ' is-on' : '')} onClick={() => setTweak('showConflicts', !tweaks.showConflicts)}>
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </button>
        </Row>
      </div>
    </div>
  );
};
